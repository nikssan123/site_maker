FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
# pnpm for generated-app installs + build tools for native modules
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache python3 make g++
# PM2 for persistent hosting of full-stack generated apps
RUN npm install -g pm2 node-gyp

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

# Seed package.json — used at startup to pre-warm the pnpm store
# so the first real project install hits the cache instead of the network.
COPY seed /seed

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4001
CMD ["/entrypoint.sh"]
