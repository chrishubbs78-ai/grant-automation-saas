# SyncStage render worker: Node + Chrome (for Remotion) + ffmpeg
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    chromium \
    fonts-liberation \
    libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    REMOTION_CHROME_MODE=chrome-for-testing

WORKDIR /app
# Build context must be the syncstage/ monorepo root:
#   docker build -f workers/render/Dockerfile .
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY workers/render ./workers/render
RUN npm install --workspaces --include-workspace-root

WORKDIR /app/workers/render
EXPOSE 8787
CMD ["node", "server.mjs"]
