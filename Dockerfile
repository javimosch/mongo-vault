FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Install build dependencies for native modules (node-pty)
RUN apk add --no-cache python3 make g++ \
    && npm ci --omit=dev \
    && apk del python3 make g++

COPY src ./src

RUN mkdir -p /app/data

EXPOSE 3011

CMD ["node", "src/server.js"]
