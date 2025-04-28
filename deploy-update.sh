#!/bin/bash

# Script to ensure CSS changes are applied
echo "Applying CSS updates for Raspberry Pi..."

# Add a timestamp to force cache refresh
TIMESTAMP=$(date +%s)
echo -e "\n/* Last updated: $TIMESTAMP */\n" >> public/style.css

# Restart the service if needed
echo "Please run the following on your Raspberry Pi to apply changes:"
echo "1. Ensure you've copied the updated style.css file to your Pi"
echo "2. Add ?v=$TIMESTAMP to your URL or clear your browser cache"
echo "3. Restart your server with: node server.js"

echo "Done!" 