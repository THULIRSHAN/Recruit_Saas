# Deployment & CI/CD Architecture

Status: DRAFT v1.0

## 1. Environments

| Environment | Purpose | Secrets | Data |
|---|---|---|---|
| **Development** | Local dev, per-developer | Local `.env` (never committed), dummy/test Stripe keys | Local/dockerized Postgres, freely resettable |
| **Staging** | Team integration testing, demo-ready | Staging secrets (separate from prod), Stripe **test mode** | Seeded demo data, resettable |
| **Production** | Final deployed demo/deliverable | Production secrets, Stripe test mode is acceptable to keep for an academic project (no real charges) — confirm with team whether "production" needs live Stripe at all | Real-ish data, treated carefully |

Production secrets are never mixed into development configuration, and CI never has access to production secrets except the minimum needed for a deploy step (and only on `main`, not on PRs — see §3).

## 2. Containerization

- **Backend (NestJS):** multi-stage `Dockerfile` — build stage installs deps + compiles TypeScript, runtime stage copies only the compiled output + production `node_modules` (smaller image, no dev tooling/secrets baked in).
- **Frontend (Next.js):** built as a standalone Next.js output, containerized similarly, or deployed to a static/edge host if the team prefers (Next.js supports both — decision left to the team once Phase 2 setup begins, see `open-questions.md` Q8).
- **docker-compose.yml (dev):** Postgres + backend + frontend, for one-command local spin-up (`docker compose up`), so no developer needs to hand-install Postgres.
- **Nginx:** reverse proxy in front of the backend (and optionally the frontend if not using a platform that handles this) — TLS termination, routing `/api` to the NestJS service, security headers as a second layer alongside `helmet` (`security.md` §8).

## 3. CI Pipeline (GitHub Actions)

**On every pull request:**

1. Checkout
2. Install dependencies (cached)
3. Lint (ESLint) — backend and frontend
4. Type check (`tsc --noEmit`) — backend and frontend
5. Run unit + integration tests (spin up a throwaway Postgres service container for integration tests)
6. Build (backend `nest build`, frontend `next build`)

A red step blocks merge (branch protection rule on `main`/`develop` requiring the check to pass).

**On merge to `main` (or a release tag):**

1. All of the above, plus:
2. Build & push Docker image(s) (tagged with commit SHA)
3. Deploy to the target environment (staging automatically; production via manual approval gate — a student project doesn't need continuous production deploys, and a manual gate is a good habit to practice)

## 4. Suggested Hosting (student-project-friendly, low/no cost)

Exact choice is left to the team based on what's available (many cloud providers offer student credits) — this is a recommendation, not a mandate:

- **Frontend:** Vercel (native Next.js support) or containerized alongside the backend.
- **Backend + Postgres:** Railway, Render, Fly.io, or a single VM running the docker-compose stack behind Nginx — any of these are reasonable for a student SaaS demo.
- **File storage:** S3 (AWS free tier) or Cloudinary (generous free tier, simpler setup for a student team) — see `decisions/ADR-004-file-storage-provider.md` for the recommendation and trade-off.

## 5. Database Migrations in CI/CD

Prisma migrations (`prisma migrate deploy`) run as an explicit, separate step in the deploy pipeline — never automatically on app boot in production (a container restart should not silently attempt a schema migration). Migrations are reviewed in PRs like any other code change; a migration that could lock a large table or drop a column needs a callout in the PR description.

## 6. Observability (MVP-minimal)

Structured request logging (method, path, status, duration, requestId, userId if authenticated — never tokens/passwords, per `security.md` §10), and basic error tracking (even a simple centralized log aggregation is enough for a student project — a dedicated APM tool is a nice-to-have, not a requirement).
