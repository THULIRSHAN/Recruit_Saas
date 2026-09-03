# Authentication Architecture

Status: DRAFT v1.0

## 1. What & Why

Authentication answers "who is this?" — it is deliberately kept separate from authorization ("what can they do?", see `authorization.md`). Mixing the two is a common student mistake that leads to permission checks scattered through login code. This project uses **JWT access tokens + rotating refresh tokens**, which is the standard pattern for a stateless API that also needs the ability to revoke sessions.

## 2. Token Design

| Token | Lifetime | Storage (client) | Contents |
|---|---|---|---|
| Access token | 15 minutes | In memory (JS variable), **not** localStorage | `sub` (userId), `roles` (org-scoped role keys for the org in context), `orgId` (null for candidate-only sessions), `isSuperAdmin`, `iat`, `exp` |
| Refresh token | 7–30 days (configurable) | httpOnly, Secure, SameSite=Strict cookie | Opaque random string; the server stores only its **hash** (`RefreshToken.tokenHash`), never the raw value |

**Why not localStorage for either token:** localStorage is readable by any JS on the page, so it's directly exploitable by XSS. The access token lives only in memory (lost on refresh, recovered via the refresh flow on app load); the refresh token lives in an httpOnly cookie the frontend JS can never read, which is what actually blocks token theft via XSS.

**Why rotate refresh tokens:** every time a refresh token is used, it is invalidated and a new one issued. If an attacker ever steals a refresh token and uses it, the legitimate user's next refresh attempt will fail (because their token was already rotated away) — this is a detectable, reactable signal, whereas a static long-lived refresh token that's stolen just works forever silently.

## 3. Core Flows

**Login:** `POST /api/auth/login` (email, password) → verify against `passwordHash` (bcrypt) → issue access token (signed, `JWT_ACCESS_SECRET`) + refresh token (random, hashed + stored) → refresh token set as httpOnly cookie, access token returned in response body for the client to hold in memory.

**Refresh:** `POST /api/auth/refresh` (cookie auto-sent) → look up `RefreshToken` by hash of the presented value → check not expired/not revoked → issue new pair, revoke old row → respond.

**Logout:** `POST /api/auth/logout` → revoke the presented refresh token (`revokedAt = now()`) → clear cookie. Note: outstanding access tokens remain valid until natural expiry (15 min) — this is an accepted trade-off for a stateless access token; document it, don't "fix" it with a token blacklist unless the team has capacity (would reintroduce state we're trying to avoid).

**Password reset:** `POST /api/auth/forgot-password` (email) → always respond 200 regardless of whether the email exists (prevents user enumeration) → if it exists, generate a single-use, short-lived reset token, email a link → `POST /api/auth/reset-password` (token, newPassword) → validate token, update `passwordHash`, revoke all existing refresh tokens for that user (force re-login everywhere, since the old password may have been compromised).

**Email verification:** verification token emailed on registration; `GET /api/auth/verify-email?token=...` marks `emailVerified=true`. Whether verification gates job applications is an open question (`open-questions.md` Q2).

## 4. Password Handling

- Hash with **bcrypt** (cost factor 12) or **argon2id** — either is acceptable; pick one and be consistent (`argon2id` is the more modern recommendation if the team wants to learn it).
- Minimum policy: ≥ 8 characters, at least one letter and one number. Do not implement arcane composition rules (uppercase+symbol+etc.) — modern guidance (NIST 800-63B) favors length over complexity; this is worth explaining to the team as a mentoring point.
- Never log passwords, even hashed ones, in application logs.
- Rate-limit login attempts per (IP, email) pair to blunt credential-stuffing — see `security.md`.

## 5. Multi-Org Sessions

Because a `User` can belong to multiple organizations (`UserOrganizationRole`), the access token's `orgId`/`roles` reflect the **organization currently in context**, chosen at login (if the user has exactly one org, auto-selected; if more than one, the frontend prompts an org switcher). Switching orgs calls `POST /api/auth/switch-org` which re-issues an access token scoped to the new org — it does not require a full re-login. This keeps every downstream authorization check a simple "does this token's org/roles satisfy the guard," with no need to re-derive org context per request.

## 6. Common Mistakes to Avoid (mentoring note)

- Putting the JWT secret in source control or a committed `.env` — always `.env.example` only, real secret via environment/deployment config.
- Trusting a `roles` claim from an old, still-valid access token after an admin changes that user's role — this is an accepted 15-minute staleness window given short access-token life; if the team needs instant revocation for role changes, that's a deliberate trade-off to discuss, not a bug to silently patch.
- Implementing "remember me" by extending the *access* token lifetime instead of the refresh token's — always extend the refresh token, keep the access token short.
