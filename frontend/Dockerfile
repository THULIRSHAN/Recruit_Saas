# Build context is the monorepo root (see docker-compose.yml), because npm
# workspaces need the root package.json/lockfile and every workspace's
# package.json to resolve dependencies correctly.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

FROM deps AS build
COPY frontend frontend
RUN npm run build --workspace=frontend

# outputFileTracingRoot is the monorepo root, so the standalone bundle
# preserves that path: .next/standalone/frontend/server.js, not
# .next/standalone/server.js.
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static ./frontend/.next/static
COPY --from=build /app/frontend/public ./frontend/public
EXPOSE 3000
CMD ["node", "frontend/server.js"]
