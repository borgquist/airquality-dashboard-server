// Event source module for handling server-sent events

import { debugPrint } from './utils.js';
import { config } from './shared-state.js';
import { fetchAirQualityData } from './air-quality.js'; // Import necessary fetch functions
import { fetchUvIndexData } from './uv-index.js';

let eventSource = null; // Keep eventSource local to this module
let connectionMonitor = null;
let reconnectionTimer = null;
let consecutiveFailures = 0; // Track consecutive health check failures
const MAX_CONSECUTIVE_FAILURES = 3; // Number of failures before marking as disconnected
const HEALTH_CHECK_INTERVAL = 5000; // Check every 5 seconds
const HEALTH_CHECK_TIMEOUT = 3000; // 3 second timeout

// Add styling for the disconnected state
const disconnectedStyle = document.createElement('style');
disconnectedStyle.textContent = `
  .server-disconnected-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(255, 0, 0, 0.4);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  
  .server-disconnected-message {
    background-color: #f44336;
    color: white;
    padding: 30px 40px;
    margin: 0;
    border-radius: 8px;
    font-weight: bold;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    text-align: center;
    font-size: 32px;
    max-width: 90%;
    width: 600px;
    border: 4px solid white;
  }
  
  .server-disconnected-message small {
    display: block;
    font-size: 18px;
    margin-top: 15px;
    opacity: 0.9;
  }
  
  /* Flashing animation */
  @keyframes flashBorder {
    0% { border-color: white; }
    50% { border-color: yellow; }
    100% { border-color: white; }
  }
  
  .server-disconnected-message {
    animation: flashBorder 2s infinite;
  }
`;
document.head.appendChild(disconnectedStyle);

// Check server connection periodically
function startConnectionMonitoring() {
  // Clear any existing monitoring
  if (connectionMonitor) {
    clearInterval(connectionMonitor);
  }
  
  // Monitor connection state
  connectionMonitor = setInterval(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT); // Use configured timeout
    
    fetch('/api/health', { 
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal
    })
    .then(response => {
      clearTimeout(timeoutId);
      if (response.ok) {
        markServerConnected(); // Reset failures on success
      } else {
        // Increment failure count, mark disconnected only if threshold reached
        consecutiveFailures++;
        console.warn(`Server health check failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          markServerDisconnected();
        }
      }
    })
    .catch(error => {
      clearTimeout(timeoutId);
      // Increment failure count, mark disconnected only if threshold reached
      consecutiveFailures++;
      console.error(`Server connection check failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error.message);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        markServerDisconnected();
      }
    });
  }, HEALTH_CHECK_INTERVAL); // Use configured interval
}

// Mark the server as disconnected
function markServerDisconnected() {
  console.log('Server disconnected');
  
  // Update the live indicator
  const liveIndicator = document.querySelector('.live-indicator');
  if (liveIndicator) {
    liveIndicator.classList.add('disconnected');
    liveIndicator.innerHTML = '<span class="pulse"></span>Connection lost';
  }
  
  // Add the overlay if it doesn't exist
  if (!document.querySelector('.server-disconnected-overlay')) {
    const overlay = document.createElement('div');
    overlay.className = 'server-disconnected-overlay';
    overlay.innerHTML = `
      <div class="server-disconnected-message">
        SERVER CONNECTION LOST
        <small>Data is stale. Attempting to reconnect...</small>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  
  // Close any existing EventSource connection
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  
  // Start reconnection if not already trying
  startReconnection();
}

// Mark the server as connected
function markServerConnected() {
  // Only act if we were previously marked disconnected or had failures
  const wasDisconnected = consecutiveFailures > 0;
  consecutiveFailures = 0; // Reset failure count on successful connection

  const liveIndicator = document.querySelector('.live-indicator');
  if (liveIndicator && liveIndicator.classList.contains('disconnected')) {
    liveIndicator.classList.remove('disconnected');
    liveIndicator.innerHTML = '<span class="pulse"></span>Live Updates';
    
    // Remove the overlay if it exists
    const overlay = document.querySelector('.server-disconnected-overlay');
    if (overlay) {
      overlay.remove();
    }
    
    console.log('Server connection restored.');
    
    // Restart EventSource if needed
    if (!eventSource) {
      setupEventSource(true); // Pass flag indicating reconnection
    }
  } else if (wasDisconnected) {
      // If we had failures but didn't show the overlay, log restoration
      console.log('Server connection check successful after previous failures.');
  }
}

// Start reconnection process
function startReconnection() {
  if (!reconnectionTimer) {
    reconnectionTimer = setInterval(() => {
      fetch('/api/health', {
        method: 'HEAD',
        cache: 'no-store'
      })
      .then(response => {
        if (response.ok) {
          clearInterval(reconnectionTimer);
          reconnectionTimer = null;
          console.log('Server back online, reconnecting...');
          
          // Reload the page to get fresh data after a brief delay
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
      })
      .catch(() => {
        // Keep trying
      });
    }, 2000);
  }
}

// Set up server-sent events for real-time updates
export function setupEventSource(isReconnection = false) { // Add flag parameter
  if (!config?.sseEnabled) {
    debugPrint('SSE disabled in config, skipping setup.');
    return;
  }
  
  // Start connection monitoring regardless of SSE state
  // Only start monitoring if it hasn't been started already
  if (!connectionMonitor) {
      startConnectionMonitoring();
  }
  
  // Don't set up a new connection if one exists
  if (eventSource) {
    return;
  }
  
  try {
    eventSource = new EventSource('/api/events');
    
    // Connection opened
    eventSource.addEventListener('open', () => {
      console.log(`✅ SSE connection established successfully ${isReconnection ? '(reconnected)' : ''}`);
      debugPrint(`SSE connection established ${isReconnection ? '(reconnected)' : ''}`);
      // If this was a reconnection, force a data refresh
      if (isReconnection) {
          console.log('Forcing data refresh after SSE reconnection.');
          fetchAirQualityData(true); // Force refresh AQI
          fetchUvIndexData(true, true); // Force refresh UV
      }
    });
    
    // Listen for AQI updates
    eventSource.addEventListener('aqi-update', (event) => {
      const data = JSON.parse(event.data);
      debugPrint(`Received AQI update from server: ${data.timestamp}`);
      fetchAirQualityData(true);
    });
    
    // Listen for server restart notifications
    eventSource.addEventListener('server-started', (event) => {
      const data = JSON.parse(event.data);
      debugPrint(`Server has started/restarted at: ${data.timestamp}`);
      
      // Reload the page to get fresh code
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    });
    
    // Listen for UV updates
    eventSource.addEventListener('uv-update', (event) => {
      const data = JSON.parse(event.data);
      debugPrint(`Received UV update from server: ${data.timestamp}`);
      fetchUvIndexData(true, true);
    });
    
    // Connection error handling - keep it simple, our monitoring will handle this
    eventSource.addEventListener('error', () => {
      // Let the connection monitor handle the state
    });
  } catch (error) {
    console.error('Failed to create EventSource:', error);
  }
}

// Clean up when the page is unloaded
window.addEventListener('beforeunload', () => {
  if (eventSource) {
    eventSource.close();
  }
  
  if (connectionMonitor) {
    clearInterval(connectionMonitor);
  }
  
  if (reconnectionTimer) {
    clearInterval(reconnectionTimer);
  }
});

// Start monitoring as soon as this module is loaded
document.addEventListener('DOMContentLoaded', startConnectionMonitoring); 