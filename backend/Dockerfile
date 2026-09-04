# Build context is the monorepo root (see docker-compose.yml), because npm
# workspaces need the root package.json/lockfile and every workspace's
# package.json to resolve dependencies correctly.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
# backend's postinstall runs `prisma generate`, which needs the schema/config
# present -- copied here (ahead of the rest of backend/src) so this layer
# only invalidates on an actual schema/config change, not on every source edit.
COPY backend/prisma backend/prisma
COPY backend/prisma7.config.ts backend/prisma7.config.ts
COPY frontend/package.json frontend/package.json
RUN npm ci

FROM deps AS build
COPY backend backend
# The generated Prisma client (backend/src/generated/prisma) is gitignored
# build output, not checked in -- it must be (re)generated here so the image
# doesn't depend on it already existing on the host.
RUN npm run prisma:generate --workspace=backend
RUN npm run build --workspace=backend

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
# --ignore-scripts: this prod-only install omits devDependencies, so the
# `prisma` CLI backend's postinstall needs isn't even present here -- and it
# isn't needed anyway, since the compiled generated client is already baked
# into dist/, copied from the build stage below.
RUN npm ci --omit=dev --workspace=backend --ignore-scripts
COPY --from=build /app/backend/dist backend/dist
EXPOSE 3001
CMD ["node", "backend/dist/main.js"]
