FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ARG VITE_PREVIEW_USE_HOST_PORT=false
ARG VITE_PREVIEW_HOST=
ENV VITE_PREVIEW_USE_HOST_PORT=$VITE_PREVIEW_USE_HOST_PORT
ENV VITE_PREVIEW_HOST=$VITE_PREVIEW_HOST
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
