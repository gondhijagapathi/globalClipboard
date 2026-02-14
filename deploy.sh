#!/bin/bash

# One-Click Deploy Script
# Run this on your server inside the project directory

echo "🔄 Starting deployment..."

# 1. Pull latest changes
echo "⬇️  Pulling latest code..."
git pull origin main

# 2. Rebuild and restart containers
echo "🐳 Rebuilding and restarting containers..."
docker-compose up -d --build

# 3. Cleanup unused images (optional, saves space)
docker image prune -f

echo "✅ Deployment complete! Server is running."
