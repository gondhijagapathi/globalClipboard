#!/bin/bash

# Configuration
REPO_URL="https://github.com/gondhijagapathi/globalClipboard.git"
APP_DIR="globalClipboard"

echo "🚀 Starting One-Click Deployment..."

# 1. Check Prerequisites
if ! command -v git &> /dev/null; then
    echo "❌ Error: Git is not installed. Please install git."
    exit 1
fi
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed. Please install docker."
    exit 1
fi

# 2. Setup Project Directory
if [ -d "$APP_DIR" ]; then
    echo "� Directory '$APP_DIR' found. Updating code..."
    cd "$APP_DIR"
    git pull origin main
else
    echo "⬇️  Cloning repository..."
    git clone "$REPO_URL"
    cd "$APP_DIR"
fi

# 3. Create .env if missing (Template)
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating default..."
    echo "PORT=3000" > .env
    echo "API_KEY=change-me-please" >> .env
    echo "BASE_URL=http://localhost:3000" >> .env
fi

# 4. Deploy
echo "🐳 Building and starting containers..."
docker-compose up -d --build

# 5. Cleanup
docker image prune -f

echo "✅ App deployed! Access it at http://<your-server-ip>:3000"
echo "🔑 NOTE: A default .env was created if missing. Please edit '$APP_DIR/.env' to set your secure API_KEY."
