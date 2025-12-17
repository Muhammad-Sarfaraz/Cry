package handlers

import (
	"encoding/json"
	"net/http"
	"sync"

	"cry-engine/internal/models"
	"cry-engine/internal/test"
)

var (
	currentTest *test.Test
	testLock    sync.Mutex
)

func HandleStartTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var cfg models.TestConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	testLock.Lock()
	if currentTest != nil && currentTest.IsRunning() {
		testLock.Unlock()
		http.Error(w, "Test already in progress", http.StatusConflict)
		return
	}

	currentTest = test.New(cfg)
	testLock.Unlock()

	go func() {
		currentTest.Start()
		testLock.Lock()
		currentTest = nil
		testLock.Unlock()
	}()

	w.WriteHeader(http.StatusAccepted)
}

func HandleMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	testLock.Lock()
	t := currentTest
	testLock.Unlock()

	if t == nil || !t.IsRunning() {
		http.Error(w, "No active test", http.StatusNotFound)
		return
	}

	metrics := t.GetMetrics()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

func HandleStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	testLock.Lock()
	t := currentTest
	testLock.Unlock()

	if t == nil || !t.IsRunning() {
		http.Error(w, "No active test", http.StatusNotFound)
		return
	}

	t.Stop()
	testLock.Lock()
	currentTest = nil
	testLock.Unlock()

	w.WriteHeader(http.StatusOK)
}

