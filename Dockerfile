FROM oven/bun:latest AS base

WORKDIR /app

RUN apt-get update && apt-get install -y curl \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
        -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package.json tsconfig.json ./

RUN bun install

COPY src ./src


CMD ["bun", "src/index.ts"]
