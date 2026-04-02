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

EXPOSE 4000

# migrate deploy applies any pending migrations then starts the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
