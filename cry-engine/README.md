# Cry Engine

High-performance HTTP load testing engine written in Go. Provides a REST API for executing load tests and collecting metrics.

## Features

- HTTP load testing with configurable rate and duration
- Real-time metrics collection (requests, success, errors, latencies)
- RESTful API with CORS support
- Concurrent request handling

## API Endpoints

- `POST /attack` - Start a load test
- `GET /metrics` - Get current test metrics
- `POST /stop` - Stop the current test

## Configuration

The server runs on port 9632 by default. Set the `PORT` environment variable to change it.

Create a `.env` file to configure:
```
PORT=9632
```

## Build

```bash
go build -o build/cry-engine main.go
```

## Run

```bash
go run main.go
```

Or use the compiled binary:
```bash
./build/cry-engine
```

## Attack Configuration

Send a POST request to `/attack` with JSON body:
```json
{
  "target": "https://example.com",
  "rate": 10,
  "duration": 30000000000,
  "timeout": 5000000000
}
```

- `target`: URL to test
- `rate`: Requests per second
- `duration`: Test duration in nanoseconds
- `timeout`: Request timeout in nanoseconds

## Metrics Response

The `/metrics` endpoint returns:
```json
{
  "requests": 1000,
  "success": 982,
  "error_count": 18,
  "total_latency": 47100000000,
  "start_time": "2024-01-01T00:00:00Z",
  "end_time": "2024-01-01T00:00:10Z"
}
```
