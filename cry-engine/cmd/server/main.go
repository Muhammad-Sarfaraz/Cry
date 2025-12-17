package main

import (
	"cry-engine/internal/server"
	"log"
)

func main() {
	if err := server.Start(); err != nil {
		log.Fatal(err)
	}
}

