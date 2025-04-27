/**
 * Simple data proxy server for the AirVisual Dashboard
 * This helps solve CORS issues when accessing data from different origins
 */

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Configuration
const PORT = 8080; // Use 8080 for the proxy
const DATA_URL = 'http://localhost:8000/data'; // The actual data source

// Create HTTP server
const server = http.createServer((req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // Handle preflight request
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    
    // Handle /data requests
    if (req.url === '/data' || req.url === '/api/data') {
        console.log(`Proxying request to ${DATA_URL}`);
        
        // Proxy the request to the actual data source
        const dataReq = http.get(DATA_URL, (dataRes) => {
            res.writeHead(dataRes.statusCode, dataRes.headers);
            dataRes.pipe(res);
        });
        
        dataReq.on('error', (err) => {
            console.error('Error fetching data:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch data from source' }));
        });
        
        return;
    }
    
    // Serve static files
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error loading index.html');
                return;
            }
            
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
        return;
    }
    
    // Handle unknown requests
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
});

// Start the server
server.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
    console.log(`Proxying data requests to ${DATA_URL}`);
    console.log('');
    console.log('URLs:');
    console.log(`  Main dashboard: http://localhost:${PORT}/`);
    console.log(`  Data endpoint: http://localhost:${PORT}/data`);
});

// Handle errors
server.on('error', (err) => {
    console.error('Server error:', err);
});

console.log('Starting data proxy server...'); 