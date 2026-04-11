FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json ./
RUN npm install --omit=dev

# Copy prisma schema + migrations (needed for migrate deploy + generate)
COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/dist ./dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 4000

# Clears any failed migration rows, applies pending migrations, starts server.
CMD ["./docker-entrypoint.sh"]
