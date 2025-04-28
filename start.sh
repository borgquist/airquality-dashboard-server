#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR"

# Log file for startup information
LOGFILE="startup.log"

# Redirect output to log file
exec > >(tee -a "$LOGFILE") 2>&1

echo "Starting Air Quality Dashboard server at $(date)"
echo "Current directory: $(pwd)"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js to run this server."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "npm is not installed. Please install npm to run this server."
    exit 1
fi

# Check if node_modules directory exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the server
echo "Starting Air Quality Dashboard Server..."
node server.js

# Handle server exit
exit_code=$?
if [ $exit_code -ne 0 ]; then
    echo "Server exited with error code $exit_code"
    exit $exit_code
else
    echo "Server stopped"
fi 