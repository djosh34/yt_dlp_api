FROM oven/bun:1 as base

WORKDIR /app

RUN apt-get update && apt-get install -y curl 

COPY package.json tsconfig.json ./

RUN bun install

COPY src ./src


CMD ["bun", "src/index.ts"]
