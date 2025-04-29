// Event source module for handling server-sent events

// Set up server-sent events for real-time updates
function setupEventSource() {
  // Close existing connection if there is one
  if (eventSource) {
    eventSource.close();
  }
  
  console.log('Setting up SSE connection to server...');
  
  // Update status indicator to show connecting state
  const indicator = document.querySelector('.live-indicator');
  if (indicator) {
    indicator.classList.add('disconnected');
    indicator.innerHTML = '<span class="pulse"></span>Connecting...';
  }
  
  // Create a new event source
  eventSource = new EventSource('/api/events');
  
  // Connection opened
  eventSource.addEventListener('open', () => {
    console.log('✅ SSE connection established successfully');
    debugPrint('SSE connection established');
    
    // Clear any reconnection attempts if we're reconnecting after a server restart
    if (window.serverReconnectAttempt) {
      clearInterval(window.serverReconnectAttempt);
      window.serverReconnectAttempt = null;
      
      // If this is a reconnection after a server restart, reload the page to get fresh code
      if (window.serverWasDown) {
        debugPrint('Reconnected after server restart, reloading page to get fresh code');
        window.location.reload();
      }
    }
    
    // Update status indicator
    if (indicator) {
      indicator.classList.remove('disconnected');
      indicator.innerHTML = '<span class="pulse"></span>Live Updates';
    }
    
    // Set up a heartbeat to detect stale connections
    if (window.heartbeatTimer) {
      clearInterval(window.heartbeatTimer);
    }
    
    window.lastHeartbeat = Date.now();
    window.heartbeatTimer = setInterval(() => {
      // If we haven't received a ping in over 30 seconds, consider the connection dead
      const timeSinceLastHeartbeat = Date.now() - window.lastHeartbeat;
      if (timeSinceLastHeartbeat > 30000) {
        console.error('❌ SSE connection appears to be stale (no heartbeat for 30s)');
        
        // Force close and reconnect
        if (eventSource) {
          eventSource.close();
          
          // Update status indicator
          if (indicator) {
            indicator.classList.add('disconnected');
            indicator.innerHTML = '<span class="pulse"></span>Connection lost, reconnecting...';
          }
          
          // Try to reconnect
          setTimeout(setupEventSource, 1000);
        }
      }
    }, 5000); // Check every 5 seconds
  });
  
  // Listen for AQI updates
  eventSource.addEventListener('aqi-update', (event) => {
    const data = JSON.parse(event.data);
    console.log(`🔄 Received AQI update via SSE: ${data.timestamp}`);
    debugPrint(`Received AQI update from server: ${data.timestamp}`);
    // Force a fresh fetch of AQI data when we receive an update event
    // Add cache-busting parameter and force refresh
    console.log('SSE event received - forcing fresh AQI data fetch');
    fetchAirQualityData(true);
  });
  
  // Listen for server restart notifications
  eventSource.addEventListener('server-started', (event) => {
    const data = JSON.parse(event.data);
    console.log(`🔄 Server has started/restarted: ${data.timestamp}`);
    debugPrint(`Server has started/restarted at: ${data.timestamp}`);
    
    // Reload the page to get fresh code
    debugPrint('Reloading page to get fresh code after server restart');
    
    // Brief delay to allow server to fully initialize
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  });
  
  // Listen for UV updates
  eventSource.addEventListener('uv-update', (event) => {
    const data = JSON.parse(event.data);
    console.log(`🔄 Received UV update via SSE: ${data.timestamp}`);
    debugPrint(`Received UV update from server: ${data.timestamp}`);
    // Force a fresh fetch of UV data when we receive an update event
    // Add _sse=1 to mark this request as initiated by an SSE event
    fetchUvIndexData(true, true);
  });
  
  // Connection error handling
  eventSource.addEventListener('error', (error) => {
    console.error('❌ SSE connection error:', error);
    debugPrint('SSE connection error, attempting to reconnect...');
    
    // Close the connection
    eventSource.close();
    
    // Update status indicator
    const indicator = document.querySelector('.live-indicator');
    if (indicator) {
      indicator.classList.add('disconnected');
      indicator.innerHTML = '<span class="pulse"></span>Connection lost, reconnecting...';
    }
    
    // If we're not already attempting to reconnect
    if (!window.serverReconnectAttempt) {
      window.serverWasDown = true;
      
      // Try to reconnect every 2 seconds
      window.serverReconnectAttempt = setInterval(() => {
        console.log('🔄 Attempting to reconnect to SSE...');
        debugPrint('Attempting to reconnect to server...');
        
        // Send a ping to check if server is back
        fetch('/api/version?_=' + new Date().getTime())
          .then(response => {
            if (response.ok) {
              console.log('✅ Server is back online, reestablishing SSE connection');
              debugPrint('Server is back online, reestablishing SSE connection');
              clearInterval(window.serverReconnectAttempt);
              window.serverReconnectAttempt = null;
              setupEventSource();
            }
          })
          .catch(err => {
            console.error('❌ Server still offline:', err.message);
            debugPrint('Server still offline: ' + err.message);
          });
      }, 2000);
    }
  });
  
  // Ping to keep connection alive
  eventSource.addEventListener('ping', () => {
    console.log('🔄 SSE ping received');
    debugPrint('SSE ping received');
    window.lastHeartbeat = Date.now();
  });
}

// Cleanup event source on page unload
window.addEventListener('beforeunload', () => {
  if (eventSource) {
    eventSource.close();
  }
}); 