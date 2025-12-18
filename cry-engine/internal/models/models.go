package models

import "time"

type TestConfig struct {
	Target   string        `json:"target"`
	Rate     int           `json:"rate"`
	Duration time.Duration `json:"duration"`
	Timeout  time.Duration `json:"timeout"`
}

type Metrics struct {
	Requests     int64     `json:"requests"`
	Success      int64     `json:"success"`
	TotalLatency int64     `json:"total_latency"`
	ErrorCount   int64     `json:"error_count"`
	StartTime    time.Time `json:"start_time"`
	EndTime      time.Time `json:"end_time"`
}

