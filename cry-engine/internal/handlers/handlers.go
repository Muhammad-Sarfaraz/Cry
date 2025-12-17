package handlers

import (
	"encoding/json"
	"net/http"
	"sync"

	"cry-engine/internal/attack"
	"cry-engine/internal/models"
)

var (
	currentAttack *attack.Attack
	attackLock    sync.Mutex
)

func HandleAttack(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var cfg models.AttackConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	attackLock.Lock()
	if currentAttack != nil && currentAttack.IsRunning() {
		attackLock.Unlock()
		http.Error(w, "Attack already in progress", http.StatusConflict)
		return
	}

	currentAttack = attack.New(cfg)
	attackLock.Unlock()

	go func() {
		currentAttack.Start()
		attackLock.Lock()
		currentAttack = nil
		attackLock.Unlock()
	}()

	w.WriteHeader(http.StatusAccepted)
}

func HandleMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	attackLock.Lock()
	atk := currentAttack
	attackLock.Unlock()

	if atk == nil || !atk.IsRunning() {
		http.Error(w, "No active attack", http.StatusNotFound)
		return
	}

	metrics := atk.GetMetrics()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

func HandleStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	attackLock.Lock()
	atk := currentAttack
	attackLock.Unlock()

	if atk == nil || !atk.IsRunning() {
		http.Error(w, "No active attack", http.StatusNotFound)
		return
	}

	atk.Stop()
	attackLock.Lock()
	currentAttack = nil
	attackLock.Unlock()

	w.WriteHeader(http.StatusOK)
}

