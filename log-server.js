// Simple log server for AirVisual Dashboard
// This script provides a local server to save logs directly to the file system

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Configuration
const PORT = 8088; // Use 8088 to avoid conflicts with other services
const LOG_DIR = path.join(__dirname, 'logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  console.log(`Created log directory: ${LOG_DIR}`);
}

// HTML templates
const indexHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>AirVisual Dashboard Log Server</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
      background-color: #f5f5f5;
      color: #333;
    }
    h1 {
      color: #2c3e50;
    }
    .container {
      background-color: white;
      border-radius: 5px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #f2f2f2;
    }
    tr:hover {
      background-color: #f5f5f5;
    }
    .button {
      display: inline-block;
      padding: 8px 16px;
      background-color: #3498db;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      cursor: pointer;
      margin: 5px 0;
    }
    textarea {
      width: 100%;
      height: 200px;
      padding: 10px;
      margin-top: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: monospace;
    }
    .status {
      padding: 10px;
      margin-top: 10px;
      border-radius: 4px;
    }
    .success {
      background-color: #d4edda;
      color: #155724;
    }
    .error {
      background-color: #f8d7da;
      color: #721c24;
    }
  </style>
</head>
<body>
  <h1>AirVisual Dashboard Log Server</h1>
  
  <div class="container">
    <h2>Configuration</h2>
    <p>Edit your dashboard configuration below:</p>
    <textarea id="config-editor"></textarea>
    <div>
      <button class="button" onclick="saveConfig()">Save Configuration</button>
      <button class="button" onclick="loadConfig()">Reload from File</button>
    </div>
    <div id="config-status"></div>
  </div>
  
  <div class="container">
    <h2>Logs</h2>
    <p>Recent log files:</p>
    <table id="logs-table">
      <thead>
        <tr>
          <th>Filename</th>
          <th>Size</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="logs-body">
        <tr>
          <td colspan="4">Loading logs...</td>
        </tr>
      </tbody>
    </table>
  </div>
  
  <div class="container">
    <h2>Server Info</h2>
    <p>Log directory: <code>${LOG_DIR}</code></p>
    <p>Server running on port: <code>${PORT}</code></p>
  </div>
  
  <script>
    // Load config
    async function loadConfig() {
      try {
        const response = await fetch('/get-config');
        const configStatus = document.getElementById('config-status');
        
        if (response.ok) {
          const config = await response.json();
          document.getElementById('config-editor').value = JSON.stringify(config, null, 2);
          configStatus.className = 'status success';
          configStatus.textContent = 'Configuration loaded successfully';
        } else {
          const error = await response.json();
          document.getElementById('config-editor').value = '{\n  "apiUrl": "https://device.iqair.com/v2/YOUR_DEVICE_ID",\n  "location": "My Location",\n  "refreshIntervalSec": 600\n}';
          configStatus.className = 'status error';
          configStatus.textContent = error.message || 'Failed to load configuration';
        }
      } catch (err) {
        const configStatus = document.getElementById('config-status');
        configStatus.className = 'status error';
        configStatus.textContent = 'Error: ' + err.message;
      }
    }
    
    // Save config
    async function saveConfig() {
      try {
        const configText = document.getElementById('config-editor').value;
        const configStatus = document.getElementById('config-status');
        
        // Validate JSON
        try {
          JSON.parse(configText);
        } catch (err) {
          configStatus.className = 'status error';
          configStatus.textContent = 'Invalid JSON: ' + err.message;
          return;
        }
        
        const response = await fetch('/save-config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: configText
        });
        
        if (response.ok) {
          const result = await response.json();
          configStatus.className = 'status success';
          configStatus.textContent = result.message || 'Configuration saved successfully';
        } else {
          const error = await response.json();
          configStatus.className = 'status error';
          configStatus.textContent = error.message || 'Failed to save configuration';
        }
      } catch (err) {
        const configStatus = document.getElementById('config-status');
        configStatus.className = 'status error';
        configStatus.textContent = 'Error: ' + err.message;
      }
    }
    
    // Load logs
    async function loadLogs() {
      try {
        const response = await fetch('/list-logs');
        if (response.ok) {
          const data = await response.json();
          const logsBody = document.getElementById('logs-body');
          
          if (data.files && data.files.length > 0) {
            logsBody.innerHTML = '';
            data.files.forEach(file => {
              const row = document.createElement('tr');
              
              const nameCell = document.createElement('td');
              nameCell.textContent = file.name;
              row.appendChild(nameCell);
              
              const sizeCell = document.createElement('td');
              sizeCell.textContent = formatSize(file.size);
              row.appendChild(sizeCell);
              
              const dateCell = document.createElement('td');
              dateCell.textContent = new Date(file.created).toLocaleString();
              row.appendChild(dateCell);
              
              const actionsCell = document.createElement('td');
              const viewLink = document.createElement('a');
              viewLink.href = '/view-log?file=' + encodeURIComponent(file.name);
              viewLink.className = 'button';
              viewLink.textContent = 'View';
              viewLink.target = '_blank';
              actionsCell.appendChild(viewLink);
              
              const downloadLink = document.createElement('a');
              downloadLink.href = '/download-log?file=' + encodeURIComponent(file.name);
              downloadLink.className = 'button';
              downloadLink.style.marginLeft = '5px';
              downloadLink.textContent = 'Download';
              actionsCell.appendChild(downloadLink);
              
              row.appendChild(actionsCell);
              logsBody.appendChild(row);
            });
          } else {
            logsBody.innerHTML = '<tr><td colspan="4">No log files found</td></tr>';
          }
        } else {
          const logsBody = document.getElementById('logs-body');
          logsBody.innerHTML = '<tr><td colspan="4">Failed to load logs</td></tr>';
        }
      } catch (err) {
        const logsBody = document.getElementById('logs-body');
        logsBody.innerHTML = '<tr><td colspan="4">Error: ' + err.message + '</td></tr>';
      }
    }
    
    // Format file size
    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    
    // Load data on page load
    window.onload = function() {
      loadConfig();
      loadLogs();
    };
  </script>
</body>
</html>
`;

// Create HTTP server
const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Filename');
  
  // Handle OPTIONS request (preflight CORS)
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Parse URL
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // Log request
  console.log(`${new Date().toISOString()} - ${req.method} ${pathname}`);
  
  // Serve index page
  if (pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(indexHtml);
    return;
  }
  
  // Handle log saving endpoint
  if (pathname === '/save-log' && req.method === 'POST') {
    let body = '';
    
    // Get data from request
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    // Process the complete request
    req.on('end', () => {
      try {
        // Generate filename with timestamp
        const date = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `dashboard-log-${date}.log`;
        const filepath = path.join(LOG_DIR, filename);
        
        // Write log to file
        fs.writeFileSync(filepath, body);
        console.log(`Log saved to ${filepath}`);
        
        // Send success response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'success', 
          message: `Log saved to ${filepath}`,
          filepath: filepath
        }));
      } catch (err) {
        console.error('Error saving log:', err);
        
        // Send error response
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'error', 
          message: `Failed to save log: ${err.message}`
        }));
      }
    });
    return;
  }
  
  // Handle config serving endpoint
  if (pathname === '/get-config' && req.method === 'GET') {
    try {
      const configPath = path.join(__dirname, 'config.json');
      
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(configData);
        console.log('Config served successfully');
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'error', 
          message: 'Config file not found'
        }));
      }
    } catch (err) {
      console.error('Error serving config:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'error', 
        message: `Failed to serve config: ${err.message}`
      }));
    }
    return;
  }

  // Handle config saving endpoint
  if (pathname === '/save-config' && req.method === 'POST') {
    let body = '';
    
    // Get data from request
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    // Process the complete request
    req.on('end', () => {
      try {
        // Verify it's valid JSON
        JSON.parse(body);
        
        // Save to config.json
        const configPath = path.join(__dirname, 'config.json');
        fs.writeFileSync(configPath, body);
        console.log(`Config saved to ${configPath}`);
        
        // Send success response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'success', 
          message: `Configuration saved successfully to ${configPath}`
        }));
      } catch (err) {
        console.error('Error saving config:', err);
        
        // Send error response
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          status: 'error', 
          message: `Failed to save config: ${err.message}`
        }));
      }
    });
    return;
  }
  
  // Handle get logs endpoint
  if (pathname === '/list-logs' && req.method === 'GET') {
    try {
      const files = fs.readdirSync(LOG_DIR)
        .filter(file => file.endsWith('.log'))
        .map(file => {
          const fullPath = path.join(LOG_DIR, file);
          const stats = fs.statSync(fullPath);
          return {
            name: file,
            size: stats.size,
            created: stats.birthtime
          };
        })
        .sort((a, b) => b.created - a.created); // Sort newest first
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ files }));
    } catch (err) {
      console.error('Error listing logs:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'error', 
        message: `Failed to list logs: ${err.message}`
      }));
    }
    return;
  }
  
  // Handle view log endpoint
  if (pathname === '/view-log' && req.method === 'GET') {
    try {
      const filename = parsedUrl.query.file;
      if (!filename) throw new Error('Filename is required');
      
      // Validate filename to prevent path traversal
      if (filename.includes('..') || filename.includes('/')) {
        throw new Error('Invalid filename');
      }
      
      const filepath = path.join(LOG_DIR, filename);
      if (!fs.existsSync(filepath)) throw new Error('Log file not found');
      
      const logContent = fs.readFileSync(filepath, 'utf8');
      
      // Serve HTML view of log
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Log Viewer - ${filename}</title>
          <style>
            body {
              font-family: monospace;
              margin: 20px;
              background-color: #f5f5f5;
            }
            h1 {
              color: #2c3e50;
            }
            pre {
              background-color: white;
              padding: 15px;
              border-radius: 5px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              overflow-x: auto;
              white-space: pre-wrap;
            }
            .back {
              display: inline-block;
              margin-bottom: 10px;
              padding: 8px 16px;
              background-color: #3498db;
              color: white;
              text-decoration: none;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <a href="/" class="back">← Back to Log Server</a>
          <h1>Log File: ${filename}</h1>
          <pre>${logContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </body>
        </html>
      `);
    } catch (err) {
      console.error('Error viewing log:', err);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Error</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              background-color: #f5f5f5;
            }
            h1 {
              color: #721c24;
            }
            .error {
              background-color: #f8d7da;
              padding: 15px;
              border-radius: 5px;
              color: #721c24;
            }
            .back {
              display: inline-block;
              margin-top: 20px;
              padding: 8px 16px;
              background-color: #3498db;
              color: white;
              text-decoration: none;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <h1>Error</h1>
          <div class="error">${err.message}</div>
          <a href="/" class="back">← Back to Log Server</a>
        </body>
        </html>
      `);
    }
    return;
  }
  
  // Handle download log endpoint
  if (pathname === '/download-log' && req.method === 'GET') {
    try {
      const filename = parsedUrl.query.file;
      if (!filename) throw new Error('Filename is required');
      
      // Validate filename to prevent path traversal
      if (filename.includes('..') || filename.includes('/')) {
        throw new Error('Invalid filename');
      }
      
      const filepath = path.join(LOG_DIR, filename);
      if (!fs.existsSync(filepath)) throw new Error('Log file not found');
      
      const fileStream = fs.createReadStream(filepath);
      
      res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      
      fileStream.pipe(res);
    } catch (err) {
      console.error('Error downloading log:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'error', 
        message: `Failed to download log: ${err.message}`
      }));
    }
    return;
  }
  
  // Default response for unknown endpoints
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    status: 'error', 
    message: 'Endpoint not found' 
  }));
});

// Start the server
server.listen(PORT, () => {
  console.log(`AirVisual log server running at http://localhost:${PORT}`);
  console.log(`Saving logs to: ${LOG_DIR}`);
}); 