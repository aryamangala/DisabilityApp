# Debian bookworm: build sqlite3 in-image so the native addon matches this glibc (avoids
# prebuilt binaries that expect a newer GLIBC than PaaS runtimes like Railway).
FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
ENV npm_config_build_from_source=true
RUN npm ci --omit=dev

COPY . .

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

COPY --from=build /app/node_modules ./node_modules
COPY . .

EXPOSE 4000

CMD ["node", "server.mjs"]
