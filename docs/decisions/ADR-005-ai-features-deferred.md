# ADR-005: AI Features Are Extension Points Only, Not MVP Work

Status: Accepted
Date: 2026-09-03

## Context

The brief lists AI-powered CV screening, candidate-job matching, and candidate recommendations as future capabilities, and explicitly instructs that they "should NOT be implemented as core functionality unless explicitly requested later."

## Decision

No AI service, queue, model integration, or scoring pipeline is built in the phases covered by `team-plan.md`. The only obligation on the current design is to **not preclude** these features later:

- `Application` and `CandidateProfile` schemas leave room for an eventual `matchScore`/`aiSummary`-type field without restructuring (additive migration, not a redesign).
- `Skill` is kept as simple free-text in MVP specifically so it can be promoted to a normalized catalog later if matching needs it (`database.md` §3), rather than over-engineering a skills taxonomy now for a feature that doesn't exist yet.
- The modular monolith boundary (ADR-001) means a future AI module/service can be added or even extracted as its own service without restructuring existing modules.

## Consequences

The team should resist the temptation to "prep" for AI features beyond the light touches above — building speculative infrastructure for a feature not yet requested is scope creep that competes with actually finishing the MVP lifecycle. Revisit only when explicitly requested.
