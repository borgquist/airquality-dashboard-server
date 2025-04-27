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

// Create HTTP server
const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
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
  
  // Simplified HTML interface for viewing logs
  if (pathname === '/' && req.method === 'GET') {
    // List log files
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
    
    // Generate HTML
    const fileList = files.map(file => {
      const size = file.size < 1024 ? 
        `${file.size} B` : 
        file.size < 1024 * 1024 ? 
          `${(file.size / 1024).toFixed(2)} KB` : 
          `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
          
      return `
        <tr>
          <td>${file.name}</td>
          <td>${size}</td>
          <td>${new Date(file.created).toLocaleString()}</td>
          <td>
            <a href="/view-log?file=${encodeURIComponent(file.name)}" class="button">View</a>
            <a href="/download-log?file=${encodeURIComponent(file.name)}" class="button">Download</a>
          </td>
        </tr>
      `;
    }).join('');
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>AirVisual Dashboard Logs</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
          h1 { color: #2c3e50; }
          .container { background-color: white; border-radius: 5px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f2f2f2; }
          tr:hover { background-color: #f5f5f5; }
          .button { display: inline-block; padding: 5px 10px; background-color: #3498db; color: white; text-decoration: none; border-radius: 4px; margin-right: 5px; }
        </style>
      </head>
      <body>
        <h1>AirVisual Dashboard Logs</h1>
        
        <div class="container">
          <h2>Log Files</h2>
          <table>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Size</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${files.length > 0 ? fileList : '<tr><td colspan="4">No log files found</td></tr>'}
            </tbody>
          </table>
        </div>
        
        <div class="container">
          <h2>Server Info</h2>
          <p>Log directory: <code>${LOG_DIR}</code></p>
          <p>Server running on port: <code>${PORT}</code></p>
        </div>
      </body>
      </html>
    `;
    
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }
  
  // Simple endpoint for saving logs
  if (pathname === '/save-log' && req.method === 'POST') {
    let data = '';
    
    // Get data from request
    req.on('data', chunk => {
      data += chunk.toString();
    });
    
    // Process the complete request
    req.on('end', () => {
      try {
        // Generate filename with date (not full timestamp to avoid too many files)
        const date = new Date().toISOString().split('T')[0];
        const logFile = path.join(LOG_DIR, `dashboard-${date}.log`);
        
        // Append log to file
        fs.appendFileSync(logFile, data);
        
        // Send success response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('Error saving log:', err);
        
        // Send error response
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to save log' }));
      }
    });
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
          <a href="/" class="back">← Back to Logs</a>
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
          <a href="/" class="back">← Back to Logs</a>
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
      res.end(JSON.stringify({ error: 'Failed to download log' }));
    }
    return;
  }
  
  // Default response for unknown endpoints
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

// Start the server
server.listen(PORT, () => {
  console.log(`AirVisual log server running at http://localhost:${PORT}`);
  console.log(`Saving logs to: ${LOG_DIR}`);
}); 