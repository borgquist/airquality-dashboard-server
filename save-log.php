<?php
// Log saving script for AirVisual Dashboard
// This script writes log data to a file

// Allow from any origin
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: X-Filename, Content-Type");

// Create logs directory if it doesn't exist
$logsDir = __DIR__ . '/logs';
if (!file_exists($logsDir)) {
    mkdir($logsDir, 0755, true);
}

// Get filename from header or use default
$filename = isset($_SERVER['HTTP_X_FILENAME']) ? 
    basename($_SERVER['HTTP_X_FILENAME']) : 
    'airvisual-' . date('Y-m-d-H-i-s') . '.log';

// Make sure the filename is safe (no directory traversal)
$filename = preg_replace('/[^a-zA-Z0-9_.-]/', '', $filename);

// Get the file path
$filepath = $logsDir . '/' . $filename;

// Get the raw POST data
$logData = file_get_contents('php://input');

// Limit log size to prevent huge files
$maxSize = 1024 * 1024; // 1MB
if (strlen($logData) > $maxSize) {
    $logData = substr($logData, -$maxSize);
}

// Write data to file
$success = file_put_contents($filepath, $logData);

// Return response
header('Content-Type: application/json');
if ($success !== false) {
    echo json_encode(['status' => 'success', 'message' => 'Log saved to ' . $filepath]);
} else {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Failed to save log']);
} 