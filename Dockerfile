FROM node:20-bookworm-slim

# Install system dependencies: ffmpeg, python3, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install the latest standalone yt-dlp binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /usr/src/app

# Install project dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy source code and set ownership to non-root node user
COPY . .
RUN mkdir -p data && chown -R node:node /usr/src/app

# Switch to non-root user
USER node

# Expose HTTP health-check keep-alive port
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Docker healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

CMD ["npm", "start"]
