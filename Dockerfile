# Multi-stage build for Trello API Backend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies including devDependencies for Babel build
RUN npm ci

# Copy source code
COPY . .

# Build with Babel
RUN npm run build

# Production runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV BUILD_MODE=production
ENV PORT=1900

# Copy package manifests and install production-only dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled build output from builder stage
COPY --from=builder /app/build ./build

EXPOSE 1900

CMD ["node", "./build/src/server.js"]
