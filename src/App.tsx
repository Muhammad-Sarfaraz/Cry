import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

// Sample data for testing
const sampleData = {
  requests: 1000,
  success: 982,
  error_count: 18,
  total_latency: 47100000000, // 47.1ms in nanoseconds
};

const App: React.FC = () => {
  const [isChartIsVisible, setIsChartIsVisible] = useState(false);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [metrics, setMetrics] = useState({
    requests: 0,
    success: 0,
    error_count: 0,
    total_latency: 0,
  });
  const [targetError, setTargetError] = useState(false);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);
  const metricsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const validateUrl = (url: string): boolean => {
    const urlPattern = /^(https?:\/\/)?([\w.-]+)\.([a-z]{2,})(\/\S*)?$/i;
    return urlPattern.test(url.trim());
  };

  const startTest = async () => {
    const targetInput = document.getElementById("target") as HTMLInputElement;
    const rateInput = document.getElementById("rate") as HTMLInputElement;
    const durationInput = document.getElementById(
      "duration"
    ) as HTMLInputElement;

    const target = targetInput.value.trim();
    if (!validateUrl(target)) {
      setTargetError(true);
      return;
    }
    setTargetError(false);

    const config = {
      target: target,
      rate: parseInt(rateInput.value),
      duration: parseInt(durationInput.value),
    };

    try {
      setIsTestRunning(true);
      await axios.post("http://localhost:9632/attack", {
        ...config,
        duration: config.duration * 1000000000,
        timeout: 5000000000,
      });

      startMetricsPolling();
    } catch (error) {
      console.error("Error starting test:", error);
      setIsTestRunning(false);
    }
  };

  const stopTest = async () => {
    try {
      await axios.post("http://localhost:9632/stop");
      setIsTestRunning(false);
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
      }
    } catch (error) {
      console.error("Error stopping test:", error);
    }
  };

  const startMetricsPolling = () => {
    metricsIntervalRef.current = setInterval(async () => {
      try {
        const response = await axios.get("http://localhost:9632/metrics");
        const fetchedMetrics = response.data;
        setMetrics(fetchedMetrics);
        updateChart(fetchedMetrics);
      } catch (error) {
        if (metricsIntervalRef.current) {
          clearInterval(metricsIntervalRef.current);
        }
        setIsTestRunning(false);
        console.error("Error fetching metrics:", error);
      }
    }, 1000);
  };

  const downloadSnapshot = () => {
    if (chartRef.current) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const link = document.createElement("a");
      link.download = `load-test-snapshot-${timestamp}.png`;
      link.href = chartRef.current.toDataURL("image/png");
      link.click();
    }
  };

  useEffect(() => {
    const sampleMetrics = {
      requests: 0,
      success: 0,
      error_count: 0,
      total_latency: 0,
    };
    updateChart(sampleMetrics);
  }, []);

  const updateChart = (fetchedMetrics?: any) => {
    if (chartRef.current) {
      const ctx = chartRef.current.getContext("2d");
      if (!ctx) return;

      const initialData = Array(10)
        .fill(0)
        .map((_, i) => ({
          timestamp: new Date(Date.now() - (9 - i) * 1000).toLocaleTimeString(),
          successRate: 0,
          errorRate: 0,
          latency: 0,
        }));

      if (!chartInstanceRef.current) {
        chartInstanceRef.current = new Chart(ctx, {
          type: "line",
          data: {
            labels: initialData.map((d) => d.timestamp),
            datasets: [
              {
                label: "Success Rate (%)", 
                data: initialData.map((d) => d.successRate),
                borderColor: "#029093",
                tension: 0.4,
              },
              {
                label: "Error Rate (%)",
                data: initialData.map((d) => d.errorRate),
                borderColor: "#DC2626",
                tension: 0.4,
              },
              {
                label: "Avg Latency (ms)",
                data: initialData.map((d) => d.latency),
                borderColor: "#2563EB",
                tension: 0.4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
              y: {
                beginAtZero: true,
                suggestedMax: 100,
              },
              x: {},
            },
            plugins: {
              legend: {
                position: "top",
                labels: {
                  boxWidth: 12,
                  font: {
                    size: 11,
                  },
                },
              },
            },
            animation: {
              duration: 750,
            },
          },
        });
      }

      if (fetchedMetrics && chartInstanceRef.current) {
        const timestamp = new Date().toLocaleTimeString();
        const successRate = fetchedMetrics.requests
          ? (fetchedMetrics.success / fetchedMetrics.requests) * 100
          : 0;
        const errorRate = fetchedMetrics.requests
          ? (fetchedMetrics.error_count / fetchedMetrics.requests) * 100
          : 0;
        const avgLatency = fetchedMetrics.requests
          ? fetchedMetrics.total_latency / fetchedMetrics.requests / 1000000
          : 0;

        if (
          chartInstanceRef?.current?.data?.labels &&
          chartInstanceRef.current.data.datasets
        ) {
          chartInstanceRef.current.data.labels.push(timestamp);

          if (chartInstanceRef.current.data.datasets[0]?.data) {
            chartInstanceRef.current.data.datasets[0].data.push(successRate);
          }

          if (chartInstanceRef.current.data.datasets[1]?.data) {
            chartInstanceRef.current.data.datasets[1].data.push(errorRate);
          }

          if (chartInstanceRef.current.data.datasets[2]?.data) {
            chartInstanceRef.current.data.datasets[2].data.push(avgLatency);
          }

          if (chartInstanceRef.current.data.labels.length > 20) {
            chartInstanceRef.current.data.labels.shift();
            chartInstanceRef.current.data.datasets.forEach((dataset) =>
              dataset.data?.shift()
            );
          }
        }

        chartInstanceRef.current.update();
      }
    }
  };

  useEffect(() => {
    return () => {
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="bg-gray-50 h-screen max-h-[750px] max-w-[1200px]  pr-4 pl-4">
      <div className="grid grid-cols-12 gap-4 pt-4">
        <div className="col-span-3">
          <div className="bg-white rounded-lg shadow-sm p-6 space-y-3">
            <div className="text-center">
              <img
                width={64}
                src="data:image/png;base64,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"
              />
              <h1 className="text-lg font-bold text-gray-900 mb-4">Cry - High Performance Load Testing Tool</h1>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">
                Target URL
              </label>
              <input
                type="text"
                id="target"
                placeholder="http://example.com"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
              />
              {targetError && (
                <span className="text-xs text-center text-red-600 font-medium">
                  Please, enter a valid URL
                </span>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Requests/Second
              </label>
              <input
                type="number"
                id="rate"
                defaultValue={10}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Duration (seconds)
              </label>
              <input
                type="number"
                id="duration"
                defaultValue={10}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={startTest}
                disabled={isTestRunning}
                className="flex-1 px-3 py-1 text-sm bg-[#029093] text-white rounded-md hover:bg-[#027c7f] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>{isTestRunning ? "Running" : "Start"}</span>
                {isTestRunning && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
              </button>
              <button
                onClick={stopTest}
                className="flex-1 px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Stop
              </button>
            </div>
          </div>
        </div>

        <div className="col-span-9">
          <div className="bg-white rounded-lg shadow-sm p-4 h-full flex flex-col">
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <h3 className="text-xs font-medium text-gray-500">
                  Total Requests
                </h3>
                <div className="text-lg font-bold text-gray-900">
                  {metrics.requests}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <h3 className="text-xs font-medium text-gray-500">
                  Success Rate
                </h3>
                <div className="text-lg font-bold text-[#029093]">
                  {metrics.requests
                    ? `${((metrics.success / metrics.requests) * 100).toFixed(
                        1
                      )}%`
                    : "0%"}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <h3 className="text-xs font-medium text-gray-500">
                  Error Rate
                </h3>
                <div className="text-lg font-bold text-red-600">
                  {metrics.requests
                    ? `${(
                        (metrics.error_count / metrics.requests) *
                        100
                      ).toFixed(1)}%`
                    : "0%"}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <h3 className="text-xs font-medium text-gray-500">
                  Avg Latency
                </h3>
                <div className="text-lg font-bold text-blue-600">
                  {metrics.requests
                    ? `${(
                        metrics.total_latency /
                        metrics.requests /
                        1000000
                      ).toFixed(1)}ms`
                    : "0ms"}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-gray-700">
                Performance Metrics
              </h3>
              <button
                onClick={downloadSnapshot}
                className="px-3 py-1 text-xs bg-gray-600 text-white rounded-md hover:bg-gray-700 flex items-center gap-1"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Export Snapshot
              </button>
            </div>

            <div className="flex-grow relative">
              <canvas ref={chartRef}></canvas>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
