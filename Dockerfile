FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ sqlite-dev
COPY package.json pnpm-lock.yaml* package-lock.json* ./
RUN corepack enable && \
    if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \
    else npm ci; fi

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ sqlite-dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && \
    if [ -f pnpm-lock.yaml ]; then pnpm build; else npm run build; fi

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache sqlite tini
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/migrations ./src/db/migrations
COPY services.yaml ./services.yaml
ENV NODE_ENV=production
ENV TZ=Europe/Berlin
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
