# Tek servis görüntüsü: API + derlenmiş web uygulaması aynı kökenden (docs/YAYINLAMA.md).
# Derleme (havuz/uygulama klasöründen):   docker build -t uygulama .
# Çalıştırma:   docker run -p 8310:8310 -v uygulama-veri:/data -e APP_URL=https://ornek.com uygulama
# Veritabanı /data birimindedir: birimi (volume) bağlamazsanız konteyner silinince veriler de gider.

ARG NODE_IMAGE=node:22-bookworm-slim

# ── 1. aşama: web uygulamasını derle (geliştirme bağımlılıklarıyla) ─────────────────────────────
FROM ${NODE_IMAGE} AS web
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY shared shared
COPY web web
RUN npm run build -w @uygulama/web

# ── 2. aşama: çalışma görüntüsü (yalnız API'nin çalışma bağımlılıkları: hono, @hono/node-server, zod) ──
FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    PORT=8310 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/uygulama.db \
    WEB_DIST=/app/web/dist
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund -w @uygulama/api && npm cache clean --force
COPY shared/src shared/src
COPY api/src api/src
COPY api/migrations api/migrations
COPY api/scripts api/scripts
COPY --from=web /app/web/dist web/dist
RUN mkdir -p /data && chown node:node /data
USER node
# Betikler (npm run backup / seed / create-admin) api/ klasöründen çalışır: docker exec -it <ad> npm run backup
WORKDIR /app/api
EXPOSE 8310
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8310)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
