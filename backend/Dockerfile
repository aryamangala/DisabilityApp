FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json* ./
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
