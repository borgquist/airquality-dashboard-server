<?php
// Create logs directory if it doesn't exist
$logsDir = __DIR__ . '/logs';
if (!file_exists($logsDir)) {
    $success = mkdir($logsDir, 0755, true);
    
    header('Content-Type: application/json');
    if ($success) {
        echo json_encode(['status' => 'success', 'message' => 'Logs directory created']);
    } else {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Failed to create logs directory']);
    }
} else {
    header('Content-Type: application/json');
    echo json_encode(['status' => 'success', 'message' => 'Logs directory already exists']);
} 