# Multi-Tenancy Architecture

Status: DRAFT v1.0 — treat every rule in this document as mandatory, not advisory. Tenant isolation failures are the single most damaging bug class this project can ship (a demo where Org A sees Org B's candidates is a failed project, not a minor bug).

## 1. What & Why

The platform hosts many independent recruiting organizations in one shared database. "Multi-tenancy" is the guarantee that Organization A can never read, write, or infer the existence of Organization B's data — jobs, applications, candidates' relationship to that org, interviews, evaluations, offers, documents, analytics, or billing. This has to be true even if a frontend developer forgets a filter, even if someone tampers with a request, even if an ID is guessed.

## 2. Isolation Strategy: Shared DB, Row-Level Isolation

Chosen over schema-per-tenant or database-per-tenant because: the team is small, the number of tenants will be small-to-moderate for a student project/demo, and row-level isolation is the industry-standard approach at this scale (it's also simply what Prisma + a single Postgres instance supports cleanly without per-tenant migration overhead). Full trade-off discussion in `decisions/ADR-002-multi-tenancy-strategy.md`.

**The rule:** every table that represents org-owned data carries an `organizationId` column (see `database.md` §1 for the full list — Job, Application, Interview, Offer, TalentPool, Subscription, AuditLog, etc.), and **every single query against those tables is filtered by the requesting user's active `organizationId`, with no exceptions and no code path that skips it.**

## 3. Where Enforcement Happens (defense in depth, but with ONE authoritative layer)

1. **Authoritative layer — the service layer.** Every service method that reads/writes a tenant-owned entity takes the `organizationId` from the authenticated request context (never from the request body/params — a client could put any org ID there) and includes it in the Prisma `where` clause. This is the layer that is actually trusted.
2. **Guard layer — `TenantGuard` (defense in depth, not a substitute for #1).** For endpoints operating on a specific resource by ID (e.g., `GET /api/jobs/:id`), a guard pre-fetches the resource's `organizationId` and compares it to the requester's active org **before** the controller/service even runs, returning 404 (not 403 — see §5) on mismatch. This catches the case where a service method's `where` clause was written incorrectly, as an extra safety net — it must never be the *only* check.
3. **Frontend — UI convenience only, zero trust.** The frontend never sees another tenant's data to begin with (API responses are already filtered), so there's nothing to "hide" — this is the correct mental model: the frontend isn't a security boundary, it just never receives what it shouldn't show.

## 4. The Pattern Every Developer Must Follow

```ts
// CORRECT — organizationId comes from the authenticated context, and is always in the where clause
async getJob(jobId: string, ctx: RequestContext) {
  const job = await this.prisma.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
  });
  if (!job) throw new NotFoundException(); // see §5 on why NotFound, not Forbidden
  return job;
}

// WRONG — trusts the ID alone; a Recruiter at Org A can read Org B's job by guessing/enumerating IDs
async getJob(jobId: string) {
  return this.prisma.job.findUnique({ where: { id: jobId } });
}
```

To make the "WRONG" version hard to write by accident, the recommended implementation is a **base repository/service pattern**: a `TenantScopedService<T>` base class whose `findOne`/`findMany`/`update`/`delete` methods *require* an `organizationId` argument at the type level, so a developer physically cannot call `prisma.job.findUnique` without going through a path that demands the tenant filter. This is worth the up-front setup cost in Phase 3/4 — it turns "please remember to filter by org" (a policy) into "the code won't compile if you forget" (a mechanism), which is far more reliable with 5 developers of varying experience.

## 5. IDOR Prevention & Response Codes

Returning **404 Not Found** (not 403 Forbidden) when a resource exists but belongs to another tenant is deliberate: a 403 confirms to an attacker that the resource *exists*, just isn't accessible — that's an information leak (they now know a job with ID `X` exists somewhere on the platform). A 404 gives no such confirmation. This applies specifically to **cross-tenant** access attempts; a 403 is still correct and appropriate for **same-tenant** permission failures (e.g., an Interviewer at the *correct* org hitting an endpoint their role doesn't allow at all) — there, revealing "you don't have permission" isn't a cross-tenant leak.

## 6. Special Cases

- **Candidates are not tenant-scoped.** A `User` with role Candidate has no `organizationId` — they belong to the platform and interact with many orgs through their `Application`s. Tenant filtering for candidate-visible endpoints instead filters by `candidateId = currentUser.id` (their own data only), which is a different but equally strict form of row-level isolation.
- **Public job search** intentionally spans all organizations — but only returns `PUBLISHED` jobs from `ACTIVE` orgs (see `requirements.md` REQ-JOB-005); this is the one endpoint class that's deliberately cross-tenant by design, and it must be the *only* one.
- **File access (CVs, documents)** must enforce the same isolation for signed URL generation: before issuing a signed URL for a CV, verify the requester is either the candidate who owns it, or staff at an org the candidate has an active application with — see `security.md` §File Upload Security.
- **Super Admin** intentionally crosses tenant boundaries (that's the role's purpose) but every cross-tenant read/write it performs on business data is written to `AuditLog` (see `authorization.md` §5).

## 7. Verification Checklist (apply to every new endpoint during code review)

For every endpoint touching org-owned data, the reviewer confirms all of the following before approving a PR:

1. Is the endpoint behind authentication? 2. Does it require the correct permission (`authorization.md`)? 3. Is `organizationId` taken from the authenticated context, never from client input? 4. Is `organizationId` present in every Prisma `where` clause that reads/writes tenant data, including nested/related lookups? 5. Does a cross-tenant access attempt return 404, not 403 or (worse) the data? 6. Is there an automated test asserting cross-tenant access fails (see `testing.md`)?

A PR that touches a tenant-owned resource without an accompanying "wrong tenant returns 404" test should not be merged — this is written into the Definition of Done.
