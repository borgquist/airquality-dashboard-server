#!/bin/bash

# Log file for startup information
LOGFILE="startup.log"

# Redirect output to log file
exec > >(tee -a "$LOGFILE") 2>&1

echo "Starting Air Quality Dashboard server at $(date)"
echo "Current directory: $(pwd)"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js to run this server."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed. Please install npm to run this server."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the server
echo "Starting server..."
node server.js 