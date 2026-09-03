# Security Strategy

Status: DRAFT v1.0 — security is a first-class requirement per the working agreement; every feature's design must consider this checklist before coding, not after.

## 1. Threat Model Summary

Primary assets to protect: candidate PII (contact info, CVs, work history), organization business data (jobs, pipelines, evaluations — competitively sensitive), payment/subscription data, and platform integrity (org approval process, Super Admin capability). Primary threats: cross-tenant data leakage (see `multi-tenancy.md` — the top risk for this system's architecture), account takeover, IDOR, malicious file upload, and injection.

## 2. Authentication & Session Security

Covered in depth in `authentication.md`. Summary controls: bcrypt/argon2 password hashing, short-lived access tokens kept out of localStorage, httpOnly refresh cookies with rotation, rate-limited login/register/forgot-password endpoints, generic error messages on login/registration to prevent user enumeration.

## 3. Authorization & Tenant Isolation

Covered in depth in `authorization.md` and `multi-tenancy.md`. Summary controls: centralized permission guard (no scattered role checks), server-side tenant filtering on every query (never trust a client-supplied `organizationId`), ownership checks for row-level permissions (interviewer sees only assigned interviews), 404-not-403 on cross-tenant access to avoid confirming resource existence.

## 4. Input Validation

- Every write endpoint validated via `class-validator` DTOs — required fields, types, string length limits, enum membership, email format.
- Business-rule validation (e.g., "job must have ≥1 stage to publish", "candidate can't double-apply") enforced in the service layer, not just the DTO layer, since these depend on database state.
- Never trust frontend validation as the actual control — it exists for UX only (see `api.md` §Forms).

## 5. Injection Prevention

- **SQL injection:** Prisma's parameterized query builder is used exclusively; raw SQL (`$queryRaw`) is avoided unless strictly necessary, and if ever used, must use tagged-template parameterization, never string concatenation.
- **XSS:** React escapes output by default — the specific danger zone is any `dangerouslySetInnerHTML` (should not be needed anywhere in this app) and any place user-supplied text (job descriptions, cover notes) is rendered — treat as plain text/markdown-sanitized, never raw HTML.
- **NoSQL/command injection:** N/A (no shell-outs to user input planned); flag in review if introduced later (e.g., a future file-processing step).

## 6. CSRF

Because the refresh token lives in an httpOnly cookie, CSRF is a relevant concern for cookie-authenticated requests. Mitigations: `SameSite=Strict` (or `Lax` if cross-subdomain flows are needed) on the refresh cookie, and the access token (the credential actually used to authorize API calls) is sent as an `Authorization: Bearer` header, not a cookie — which is itself immune to CSRF since browsers don't auto-attach it. This means CSRF risk is effectively confined to the `/auth/refresh` endpoint itself, which is low-value to forge (it just yields a token pair, not a state-changing action) — documented trade-off, revisit if the team wants a CSRF token on top for defense in depth.

## 7. Rate Limiting

Apply per-IP and per-account limits (e.g., NestJS `@nestjs/throttler`) on: login, registration, forgot-password, refresh, and any public unauthenticated endpoint (job search, org registration) to blunt scraping/abuse and brute force.

## 8. CORS & Security Headers

- CORS allowlist restricted to the deployed frontend origin(s) per environment (never `*` with credentials enabled).
- Standard security headers via middleware (e.g., `helmet`): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (or CSP `frame-ancestors`), `Strict-Transport-Security` in production, a baseline Content-Security-Policy.

## 9. Secrets Management

Never hardcoded: DB connection string, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`, Stripe keys, AWS/Cloudinary credentials, SMTP credentials. All via environment variables, documented (names + purpose, not values) in `.env.example`. Real `.env` files are gitignored. Separate secrets per environment (dev/staging/prod) — a production Stripe key must never appear in a developer's local `.env` or in CI logs.

## 10. Error Handling — What Never Reaches the Client

A global NestJS exception filter ensures: no stack traces, no raw database error messages (Prisma errors get mapped to generic messages, e.g., a unique-constraint violation becomes `409 { code: "DUPLICATE" }`, not the raw Postgres error text), no internal file paths, no leaked JWTs/Authorization headers in logs or error bodies, no indication of *why* a cross-tenant 404 occurred. Full server-side detail is logged (server-side only) for debugging; the client gets the structured error format from `api.md` §1.

## 11. File Upload Security

CVs and onboarding documents are the most sensitive file class in the system. Controls:

- **Allowed types:** allowlist, not denylist — PDF, DOC, DOCX for CVs; PDF, PNG, JPG for onboarding documents. Validate by inspecting file content/magic bytes, not just the extension or client-reported MIME type (a renamed `.exe` claiming to be a PDF must be rejected).
- **Size limits:** e.g., 5MB per CV, 10MB per onboarding document (tune with team) — enforced both client-side (UX) and server-side (actual control).
- **Filename sanitization:** never use the client-supplied filename as the storage key; generate a server-side key (e.g., `cuid + extension`) and store the original name only as metadata for display.
- **Malware scanning strategy:** MVP-acceptable minimum is strict type/content validation as above; if the team has capacity, integrate a scanning step (e.g., ClamAV or a cloud scanning API) before a file is marked available — documented as a P2 enhancement, not a blocker, but noted here so it isn't forgotten.
- **Private storage, signed URLs:** files are **never** stored in a publicly readable bucket/path. Access is always via a short-lived signed URL generated per request, after an authorization check (candidate owns it, or staff at an org with an active application from that candidate — see `multi-tenancy.md` §6).
- **Access authorization on every download:** re-check ownership/tenant on the signed-URL-issuing endpoint itself, every time — never assume "if you have the URL you're allowed to have it" (URLs can leak via logs, browser history, etc., so short expiry matters too, e.g., 5–15 minutes).

## 12. Audit Logging

Sensitive actions are written to `AuditLog` (see `database.md`): organization approval/rejection, role/permission changes, hiring decisions, offer sends, payment events, Super Admin reads of tenant business data. Audit logs are append-only (no update/delete API), queryable only by Super Admin (platform-wide) or a Company Owner (their own org only, tenant-filtered like everything else).

## 13. Security Review Checklist for Every New Feature

Before writing code for any feature: who can call this endpoint (auth)? What permission does it need (authorization)? Is it tenant-scoped, and is the filter server-side? What's the worst input a malicious user could send, and is it validated? Does it touch files — if so, apply §11 in full? Does it need to be logged to the audit trail? This checklist is intentionally short enough to run through for every PR.
