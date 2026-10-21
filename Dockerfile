FROM node:24.22.1-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
FROM node:24.22.1-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.mjs ./
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
