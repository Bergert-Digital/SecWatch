FROM node:22.4.0-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci

FROM node:22.4.0-alpine
COPY --from=builder /app/dist /app
CMD ["node", "/app/main.js"]
