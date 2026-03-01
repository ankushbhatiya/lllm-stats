#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "🚀 Installing LLLM-Stats..."

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm could not be found. Please install Node.js and npm first."
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🔗 Linking executable globally..."
npm link

echo "✅ Installation complete!"
echo ""
echo "You can now run LLLM-Stats from anywhere:"
echo "  - Run 'lllm-stats' to start the interactive TUI."
echo "  - Run 'lllm-stats -s' to see a quick summary of your stats."