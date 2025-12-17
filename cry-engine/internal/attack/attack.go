package attack

import (
	"io"
	"net/http"
	"sync"
	"time"

	"cry-engine/internal/models"
)

type Attack struct {
	target      string
	rate        int
	duration    time.Duration
	timeout     time.Duration
	stopChan    chan struct{}
	metrics     *models.Metrics
	metricsLock sync.Mutex
	running     bool
	runningLock sync.Mutex
}

func New(cfg models.AttackConfig) *Attack {
	return &Attack{
		target:   cfg.Target,
		rate:     cfg.Rate,
		duration: cfg.Duration,
		timeout:  cfg.Timeout,
		stopChan: make(chan struct{}),
		metrics: &models.Metrics{
			StartTime: time.Now(),
		},
	}
}

func (a *Attack) Start() {
	a.runningLock.Lock()
	a.running = true
	a.runningLock.Unlock()

	ticker := time.NewTicker(time.Second / time.Duration(a.rate))
	defer ticker.Stop()

	timeout := time.After(a.duration)
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
	client := http.Client{Timeout: a.timeout}

	resp, err := client.Get(a.target)
	duration := time.Since(start)

	a.metricsLock.Lock()
	defer a.metricsLock.Unlock()

	a.metrics.Requests++
	a.metrics.TotalLatency += int64(duration)

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
	a.runningLock.Lock()
	a.running = false
	a.runningLock.Unlock()

	select {
	case <-a.stopChan:
	default:
		close(a.stopChan)
	}
	a.metrics.EndTime = time.Now()
}

func (a *Attack) GetMetrics() models.Metrics {
	a.metricsLock.Lock()
	defer a.metricsLock.Unlock()
	return *a.metrics
}

func (a *Attack) IsRunning() bool {
	a.runningLock.Lock()
	defer a.runningLock.Unlock()
	return a.running
}

