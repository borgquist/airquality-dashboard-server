/**
 * AirVisual Dashboard Debug Script
 * Add this to your HTML to get detailed information about dashboard loading
 */

(function() {
    // Create a debug window
    const debugWindow = document.createElement('div');
    debugWindow.style.position = 'fixed';
    debugWindow.style.bottom = '10px';
    debugWindow.style.right = '10px';
    debugWindow.style.width = '350px';
    debugWindow.style.maxHeight = '300px';
    debugWindow.style.overflow = 'auto';
    debugWindow.style.backgroundColor = 'rgba(0,0,0,0.8)';
    debugWindow.style.color = '#0f0';
    debugWindow.style.fontFamily = 'monospace';
    debugWindow.style.fontSize = '12px';
    debugWindow.style.padding = '10px';
    debugWindow.style.borderRadius = '5px';
    debugWindow.style.zIndex = '9999';
    debugWindow.id = 'debug-window';
    
    document.body.appendChild(debugWindow);
    
    function log(message, data) {
        const entry = document.createElement('div');
        entry.style.marginBottom = '5px';
        
        const timestamp = new Date().toISOString().split('T')[1].substring(0, 8);
        entry.innerHTML = `<span style="color:#aaa">[${timestamp}]</span> ${message}`;
        
        if (data) {
            const dataText = typeof data === 'object' ? JSON.stringify(data) : data;
            const details = document.createElement('div');
            details.style.marginLeft = '20px';
            details.style.color = '#7f7';
            details.style.whiteSpace = 'pre-wrap';
            details.style.wordBreak = 'break-word';
            details.textContent = dataText;
            entry.appendChild(details);
        }
        
        debugWindow.appendChild(entry);
        debugWindow.scrollTop = debugWindow.scrollHeight;
        
        // Also log to console
        console.log(`[DEBUG] ${message}`, data || '');
    }
    
    // Show debug window
    debugWindow.style.display = 'block';
    
    // Add a clear button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.position = 'absolute';
    clearBtn.style.top = '5px';
    clearBtn.style.right = '5px';
    clearBtn.style.padding = '2px 5px';
    clearBtn.style.fontSize = '10px';
    clearBtn.style.backgroundColor = '#333';
    clearBtn.style.color = '#fff';
    clearBtn.style.border = 'none';
    clearBtn.style.borderRadius = '3px';
    clearBtn.onclick = function() {
        debugWindow.innerHTML = '';
        debugWindow.appendChild(clearBtn);
    };
    
    debugWindow.appendChild(clearBtn);
    
    // Log initial information
    log('Debug started');
    log('User agent', navigator.userAgent);
    log('URL', window.location.href);
    
    // Test network connectivity to different endpoints
    const testEndpoints = [
        'http://localhost:8000/data',
        'http://localhost:8080/data',
        'http://localhost:8088'
    ];
    
    log('Testing endpoints...');
    testEndpoints.forEach(endpoint => {
        fetch(endpoint)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.text();
            })
            .then(data => {
                let preview = data;
                if (data.length > 100) {
                    preview = data.substring(0, 100) + '...';
                }
                log(`✅ ${endpoint}`, preview);
            })
            .catch(error => {
                log(`❌ ${endpoint}`, error.message);
            });
    });
    
    // Check for 'config.json'
    fetch('config.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            return response.json();
        })
        .then(config => {
            log('✅ Config loaded', config);
        })
        .catch(error => {
            log('❌ Failed to load config.json', error.message);
        });
    
    // Expose globally
    window.debugLog = log;
})(); 