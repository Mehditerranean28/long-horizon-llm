# syntax=docker/dockerfile:1.5

##############################################################################
# 1. Base - pinned, slim Debian for deterministic builds
##############################################################################
FROM node:22-bullseye-slim AS base
WORKDIR /app

RUN apt-get update && \
    apt-get install --no-install-recommends -y ca-certificates && \
    rm -rf /var/lib/apt/lists/*

##############################################################################
# 2. Dependencies - cached, production-only install
##############################################################################
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev && \
    npm cache clean --force

##############################################################################
# 3. Build - isolate source, produce optimized artifacts
##############################################################################
FROM deps AS build
ENV NODE_ENV=development
COPY . .

RUN npm run build

##############################################################################
# 4. Runner - minimal final image, non-root, healthcheck
##############################################################################
FROM node:22-bullseye-slim AS runner
WORKDIR /app

RUN groupadd --system app && useradd --system --gid app app
USER app

ENV NODE_ENV=production

COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/public ./public
COPY --from=deps  --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app server ./server
COPY --chown=app:app next.config.js ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/_next/health || exit 1

VOLUME [ "/tmp" ]
ENTRYPOINT ["npm", "start"]
