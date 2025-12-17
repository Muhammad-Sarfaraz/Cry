package server

import (
	"fmt"
	"net/http"
	"os"

	"cry-engine/internal/handlers"
	"cry-engine/internal/middleware"

	"github.com/joho/godotenv"
)

func Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/attack", handlers.HandleAttack)
	mux.HandleFunc("/metrics", handlers.HandleMetrics)
	mux.HandleFunc("/stop", handlers.HandleStop)

	handler := middleware.EnableCORS(mux)

	if err := godotenv.Load(); err != nil {
		fmt.Println("Warning: No .env file found, using default port")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "9632"
	}

	fmt.Println("Cry engine running on port : " + port)
	return http.ListenAndServe(":"+port, handler)
}

