# Общий образ для api, worker и bot: docker build --build-arg APP=api -f deploy/docker/service.Dockerfile .
FROM node:24-slim

# Prisma нужен OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm ci

ARG APP
ENV APP=${APP}
ENV NODE_ENV=production
USER node

CMD ["sh", "-c", "npx tsx apps/${APP}/src/index.ts"]
