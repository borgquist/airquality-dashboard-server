// Main entry point for Air Quality Dashboard
document.addEventListener('DOMContentLoaded', loadConfig);

// Load configuration
let config;
let eventSource;
let lastAqiData = null; // Store the last AQI data received
let lastUvData = null; // Store the last UV data received
let uvChart = null; // Reference for UV chart

// Fetch configuration and initialize
async function loadConfig() {
  try {
    const response = await fetch('/config.json');
    config = await response.json();
    
    // Load Chart.js before initializing dashboard
    await loadChartJsIfNeeded();
    
    initDashboard();
    setupEventSource();
  } catch (error) {
    console.error('Failed to load configuration:', error);
  }
}

// Initialize the dashboard
function initDashboard() {
  fetchAirQualityData();
  fetchUvIndexData();
  fetchVersionInfo();
  
  // Set up auto-refresh based on config
  const refreshIntervalAqi = (config.refreshIntervalSec || 600) * 1000;
  const refreshIntervalUv = (config.uvRefreshIntervalSec || 1800) * 1000;
  
  setInterval(fetchAirQualityData, refreshIntervalAqi);
  setInterval(fetchUvIndexData, refreshIntervalUv);
}

// Load Chart.js from CDN if not already loaded
function loadChartJsIfNeeded() {
  if (window.Chart) {
    return Promise.resolve();
  }
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Helper function for safe logging
function debugPrint(message) {
  console.log(message);
} 