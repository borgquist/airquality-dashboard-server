/**
 * AirVisual Dashboard Debug Script
 * Add this to your HTML to get detailed information about dashboard loading
 * and send logs to the log server
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
    
    // Log server configuration
    const LOG_SERVER = 'http://localhost:8088';
    
    // Function to send logs to the server
    async function sendLogToServer(level, message, data) {
        try {
            const logData = {
                timestamp: new Date().toISOString(),
                level: level,
                message: message,
                data: data || null,
                source: window.location.href,
                userAgent: navigator.userAgent
            };
            
            await fetch(`${LOG_SERVER}/log`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(logData)
            });
        } catch (error) {
            console.error('Failed to send log to server:', error);
        }
    }
    
    function log(message, data, level = 'info') {
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
        
        // Send to log server
        sendLogToServer(level, message, data);
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
                log(`❌ ${endpoint}`, error.message, 'error');
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
            log('❌ Failed to load config.json', error.message, 'error');
        });
    
    // Create a function to save a log file on the server
    async function saveLogFile(content, filename = 'dashboard-log.txt') {
        try {
            const formData = new FormData();
            formData.append('log', new Blob([content], { type: 'text/plain' }));
            formData.append('filename', filename);
            
            const response = await fetch(`${LOG_SERVER}/save-log`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            
            const result = await response.json();
            log('✅ Log saved to server', result);
        } catch (error) {
            log('❌ Failed to save log', error.message, 'error');
        }
    }
    
    // Add a save button to save logs to the server
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save Logs';
    saveBtn.style.position = 'absolute';
    saveBtn.style.top = '5px';
    saveBtn.style.right = '60px';
    saveBtn.style.padding = '2px 5px';
    saveBtn.style.fontSize = '10px';
    saveBtn.style.backgroundColor = '#333';
    saveBtn.style.color = '#fff';
    saveBtn.style.border = 'none';
    saveBtn.style.borderRadius = '3px';
    saveBtn.onclick = function() {
        // Collect all log entries from the debug window
        const logEntries = Array.from(debugWindow.querySelectorAll('div'))
            .map(div => div.textContent)
            .filter(text => text !== 'ClearSave Logs');
        
        const logContent = logEntries.join('\n');
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        saveLogFile(logContent, `dashboard-log-${timestamp}.txt`);
    };
    
    debugWindow.appendChild(saveBtn);
    
    // Override the console.log and other console methods to also send to the log server
    const originalConsole = {
        log: console.log,
        error: console.error,
        warn: console.warn,
        info: console.info
    };
    
    console.log = function() {
        originalConsole.log.apply(console, arguments);
        sendLogToServer('info', Array.from(arguments).join(' '));
    };
    
    console.error = function() {
        originalConsole.error.apply(console, arguments);
        sendLogToServer('error', Array.from(arguments).join(' '));
    };
    
    console.warn = function() {
        originalConsole.warn.apply(console, arguments);
        sendLogToServer('warn', Array.from(arguments).join(' '));
    };
    
    console.info = function() {
        originalConsole.info.apply(console, arguments);
        sendLogToServer('info', Array.from(arguments).join(' '));
    };
    
    // Expose globally
    window.debugLog = log;
    window.saveLogToFile = saveLogFile;
})(); 