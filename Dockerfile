# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Production Stage
FROM node:20-alpine

WORKDIR /app

# Install backend dependencies
COPY package*.json ./
RUN npm list sqlite3 || npm install sqlite3 --save
RUN npm list canvas || echo "Canvas not required by default" # Optional check
RUN npm install --production

# Copy backend files
COPY . .

# Copy built frontend from builder stage
COPY --from=builder /app/frontend/dist ./frontend/dist

# Create uploads directory
RUN mkdir -p uploads

# Environment variables (Can be overridden by docker-compose)
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
