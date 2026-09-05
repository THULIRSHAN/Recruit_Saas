# Build context is the monorepo root (see docker-compose.yml), because npm
# workspaces need the root package.json/lockfile and every workspace's
# package.json to resolve dependencies correctly.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
# --ignore-scripts: installing the whole workspace tree (required for npm
# workspaces to resolve/hoist correctly) would otherwise run backend's
# postinstall (`prisma generate`), which this image never needs and whose
# schema isn't even copied into this build context.
RUN npm ci --ignore-scripts

FROM deps AS build
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not
# read at container start -- must be a build ARG, not just a runtime
# environment: entry in docker-compose.yml (which the build stage never
# sees).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
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
