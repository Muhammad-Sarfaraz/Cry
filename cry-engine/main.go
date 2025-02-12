package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
	"os"

    "github.com/joho/godotenv"
)

type Attack struct {
	Target      string
	Rate        int
	Duration    time.Duration
	Timeout     time.Duration
	stopChan    chan struct{}
	metrics     *Metrics
	metricsLock sync.Mutex
}

type Metrics struct {
	Requests      int64           `json:"requests"`
	Success       int64           `json:"success"`
	Latencies     []time.Duration `json:"-"`
	TotalLatency  time.Duration   `json:"total_latency"`
	ErrorCount    int64           `json:"error_count"`
	StartTime     time.Time       `json:"start_time"`
	EndTime       time.Time       `json:"end_time"`
}

type AttackConfig struct {
	Target   string        `json:"target"`
	Rate     int           `json:"rate"`
	Duration time.Duration `json:"duration"`
	Timeout  time.Duration `json:"timeout"`
}

func NewAttack(cfg AttackConfig) *Attack {
	return &Attack{
		Target:   cfg.Target,
		Rate:     cfg.Rate,
		Duration: cfg.Duration,
		Timeout:  cfg.Timeout,
		stopChan: make(chan struct{}),
		metrics: &Metrics{
			Latencies: make([]time.Duration, 0),
		},
	}
}

func (a *Attack) Start() {
	ticker := time.NewTicker(time.Second / time.Duration(a.Rate))
	defer ticker.Stop()

	timeout := time.After(a.Duration)
	a.metrics.StartTime = time.Now()

	var wg sync.WaitGroup

	for {
		select {
		case <-ticker.C:
			wg.Add(1)
			go func() {
				defer wg.Done()
				a.makeRequest()
			}()
		case <-timeout:
			a.Stop()
			return
		case <-a.stopChan:
			return
		}
	}
}

func (a *Attack) makeRequest() {
	start := time.Now()
	client := http.Client{Timeout: a.Timeout}

	resp, err := client.Get(a.Target)
	duration := time.Since(start)

	a.metricsLock.Lock()
	defer a.metricsLock.Unlock()

	a.metrics.Requests++
	a.metrics.Latencies = append(a.metrics.Latencies, duration)
	a.metrics.TotalLatency += duration

	if err != nil || resp.StatusCode >= 400 {
		a.metrics.ErrorCount++
	} else {
		a.metrics.Success++
	}
	if resp != nil {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
}

func (a *Attack) Stop() {
	close(a.stopChan)
	a.metrics.EndTime = time.Now()
}

func (a *Attack) Metrics() Metrics {
	a.metricsLock.Lock()
	defer a.metricsLock.Unlock()
	return *a.metrics
}

// Global variable for current attack
var currentAttack *Attack

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/attack", handleAttack)
	mux.HandleFunc("/metrics", handleMetrics)
	mux.HandleFunc("/stop", handleStop)

	// Wrap handlers with CORS middleware
	handler := enableCORS(mux)

	err := godotenv.Load()

    if err != nil {
		fmt.Println("Warning: No .env file found, using default port")
    }

	port := os.Getenv("PORT")

    if port == "" {
        port = "9632"
    }

	fmt.Println("Cry engine running on port : "+port)
	http.ListenAndServe(":"+port, handler)
}

// CORS Middleware
func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func handleAttack(w http.ResponseWriter, r *http.Request) {
	var cfg AttackConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if currentAttack != nil {
		http.Error(w, "Attack already in progress", http.StatusConflict)
		return
	}

	currentAttack = NewAttack(cfg)
	go func() {
		currentAttack.Start()
		currentAttack = nil
	}()

	w.WriteHeader(http.StatusAccepted)
}

func handleMetrics(w http.ResponseWriter, r *http.Request) {
	if currentAttack == nil {
		http.Error(w, "No active attack", http.StatusNotFound)
		return
	}

	metrics := currentAttack.Metrics()
	json.NewEncoder(w).Encode(metrics)
}

func handleStop(w http.ResponseWriter, r *http.Request) {
	if currentAttack == nil {
		http.Error(w, "No active attack", http.StatusNotFound)
		return
	}

	currentAttack.Stop()
	currentAttack = nil
	w.WriteHeader(http.StatusOK)
}
