# syntax=docker/dockerfile:1
# Image unique : l'API sert aussi le front (PWA) -> un seul service à déployer sur Dokploy.

FROM node:22-alpine AS web
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
COPY shared ./shared
COPY brand/logo-data.json brand/icons.json ./brand/
RUN npx vite build

FROM node:22-alpine AS api
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
COPY shared ../shared
COPY brand/logo-data.json ../brand/logo-data.json
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8787 STATIC_DIR=/app/public MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=api /build/server/dist ./dist
COPY server/migrations ./migrations
COPY --from=web /build/dist ./public
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s CMD wget -qO- http://127.0.0.1:8787/api/health/ready || exit 1
CMD ["node", "dist/index.js"]
