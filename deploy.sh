#!/bin/bash

# Configuration
REPO_TAR_URL="https://github.com/gondhijagapathi/globalClipboard/archive/refs/heads/main.tar.gz"
APP_DIR="globalClipboard"

echo "🚀 Starting Git-Free Deployment..."

# 1. Check Prerequisites
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed. Please install docker."
    exit 1
fi

# 2. Setup Project Directory
mkdir -p "$APP_DIR"
echo "⬇️  Downloading latest code..."
# Download and extract tarball directly into APP_DIR, stripping the root folder 'globalClipboard-main'
curl -L "$REPO_TAR_URL" | tar xz -C "$APP_DIR" --strip-components=1

cd "$APP_DIR"

# 3. Cleanup Git traces if any
if [ -d ".git" ]; then
    echo "🗑️  Removing existing .git directory..."
    rm -rf .git
fi

# 4. Create .env if missing (Template)
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating default..."
    echo "PORT=3000" > .env
    echo "API_KEY=change-me-please" >> .env
    echo "BASE_URL=http://localhost:3000" >> .env
fi

# 5. Deploy
echo "🐳 Building and starting containers..."
docker-compose up -d --build

# 6. Cleanup Source Files (Transient Build)
echo "🧹 Cleaning up source files..."
# Remove everything except data, config, and deployment definition
find . -maxdepth 1 \
    ! -name '.' \
    ! -name '..' \
    ! -name 'uploads' \
    ! -name 'globalClipboard.db' \
    ! -name '.env' \
    ! -name 'docker-compose.yml' \
    ! -name 'deploy.sh' \
    -exec rm -rf {} + 2>/dev/null

# 7. Cleanup Docker images
docker image prune -f

echo "✅ App deployed successfully!"
echo "📂 Location: $(pwd)"
echo "   (Source files removed. Only data and config remain.)"
echo "🚀 Access at http://<your-server-ip>:3000"
