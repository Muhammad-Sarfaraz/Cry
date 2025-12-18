package test

import (
	"io"
	"net/http"
	"sync"
	"time"

	"cry-engine/internal/models"
)

type Test struct {
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

func New(cfg models.TestConfig) *Test {
	return &Test{
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

func (t *Test) Start() {
	t.runningLock.Lock()
	t.running = true
	t.runningLock.Unlock()

	ticker := time.NewTicker(time.Second / time.Duration(t.rate))
	defer ticker.Stop()

	timeout := time.After(t.duration)
	t.metrics.StartTime = time.Now()

	var wg sync.WaitGroup

	for {
		select {
		case <-ticker.C:
			wg.Add(1)
			go func() {
				defer wg.Done()
				t.makeRequest()
			}()
		case <-timeout:
			t.Stop()
			return
		case <-t.stopChan:
			return
		}
	}
}

func (t *Test) makeRequest() {
	start := time.Now()
	client := http.Client{Timeout: t.timeout}

	resp, err := client.Get(t.target)
	duration := time.Since(start)

	t.metricsLock.Lock()
	defer t.metricsLock.Unlock()

	t.metrics.Requests++
	t.metrics.TotalLatency += int64(duration)

	if err != nil || resp.StatusCode >= 400 {
		t.metrics.ErrorCount++
	} else {
		t.metrics.Success++
	}
	if resp != nil {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}
}

func (t *Test) Stop() {
	t.runningLock.Lock()
	t.running = false
	t.runningLock.Unlock()

	select {
	case <-t.stopChan:
	default:
		close(t.stopChan)
	}
	t.metrics.EndTime = time.Now()
}

func (t *Test) GetMetrics() models.Metrics {
	t.metricsLock.Lock()
	defer t.metricsLock.Unlock()
	return *t.metrics
}

func (t *Test) IsRunning() bool {
	t.runningLock.Lock()
	defer t.runningLock.Unlock()
	return t.running
}

