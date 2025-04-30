import { fetchAirQualityData } from './modules/air-quality.js';
import { fetchUvIndexData } from './modules/uv-index.js';
import { setupEventSource } from './modules/event-source.js';
import { fetchVersionInfo } from './modules/version.js';
import { config, setConfig } from './modules/shared-state.js'; // Import shared state

// Main entry point for Air Quality Dashboard
document.addEventListener('DOMContentLoaded', loadConfig);

// REMOVE: Definitions moved to shared-state.js
// let config;
// let eventSource; // Keep eventSource local to main.js for now
// let lastAqiData = null;
// let lastUvData = null;

let eventSource = null; // Keep eventSource scoped here
let uvChart = null; // Reference for UV chart (still needed? uv-chart.js manages its own instance)

// Fetch configuration and initialize
async function loadConfig() {
  try {
    const response = await fetch('/config.json');
    const fetchedConfig = await response.json();
    setConfig(fetchedConfig); // Update shared state
    
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