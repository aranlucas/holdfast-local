FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server.mjs ./
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
