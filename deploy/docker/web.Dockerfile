FROM node:24-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build -w @kaspi/web

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app .
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@kaspi/web"]
