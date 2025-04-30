// Event source module for handling server-sent events

import { debugPrint } from './utils.js';
import { config } from './shared-state.js';
import { fetchAirQualityData } from './air-quality.js'; // Import necessary fetch functions
import { fetchUvIndexData } from './uv-index.js';

let eventSource = null; // Keep eventSource local to this module
let connectionMonitor = null;
let reconnectionTimer = null;

// Add styling for the disconnected state
const disconnectedStyle = document.createElement('style');
disconnectedStyle.textContent = `
  .server-disconnected-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(255, 0, 0, 0.2);
    z-index: 9999;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    pointer-events: none;
  }
  
  .server-disconnected-message {
    background-color: #f44336;
    color: white;
    padding: 15px 20px;
    margin-top: 15px;
    border-radius: 4px;
    font-weight: bold;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    text-align: center;
  }
`;
document.head.appendChild(disconnectedStyle);

// Check server connection every second
function startConnectionMonitoring() {
  // Clear any existing monitoring
  if (connectionMonitor) {
    clearInterval(connectionMonitor);
  }
  
  // Monitor connection state every second
  connectionMonitor = setInterval(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout
    
    fetch('/api/health', { 
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal
    })
    .then(response => {
      clearTimeout(timeoutId);
      if (response.ok) {
        markServerConnected();
      } else {
        markServerDisconnected();
      }
    })
    .catch(error => {
      clearTimeout(timeoutId);
      console.error('Server connection check failed:', error.message);
      markServerDisconnected();
    });
  }, 1000);
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
    overlay.innerHTML = '<div class="server-disconnected-message">SERVER CONNECTION LOST - DATA IS STALE</div>';
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
  // Remove the disconnected class from the live indicator
  const liveIndicator = document.querySelector('.live-indicator');
  if (liveIndicator && liveIndicator.classList.contains('disconnected')) {
    liveIndicator.classList.remove('disconnected');
    liveIndicator.innerHTML = '<span class="pulse"></span>Live Updates';
    
    // Remove the overlay if it exists
    const overlay = document.querySelector('.server-disconnected-overlay');
    if (overlay) {
      overlay.remove();
    }
    
    // Restart EventSource if needed
    if (!eventSource) {
      setupEventSource();
    }
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
export function setupEventSource() {
  if (!config?.sseEnabled) {
    debugPrint('SSE disabled in config, skipping setup.');
    return;
  }
  
  // Start connection monitoring regardless of SSE state
  startConnectionMonitoring();
  
  // Don't set up a new connection if one exists
  if (eventSource) {
    return;
  }
  
  try {
    eventSource = new EventSource('/api/events');
    
    // Connection opened
    eventSource.addEventListener('open', () => {
      console.log('✅ SSE connection established successfully');
      debugPrint('SSE connection established');
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