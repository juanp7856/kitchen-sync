# Proposal: Host Delegation in KitchenSync

## Intent

Host role is hardcoded by email in `lib/auth.ts` (dead code, only tests import it) and `AuthScreen.tsx` (three `jduarte@intercorp.com.pe` strings + `HOST_SECRET='CHEF123'`). Rotation needs code/SQL edits. Goal: DB-driven, UI-delegable, Realtime-synced host with unified direct-email auth (no Magic Link, due to Supabase rate limits).

## Scope

### In Scope
- `app_settings` singleton (CHECK `id=1`), `current_host_email` defaulting to `jduarte@intercorp.com.pe`
- `hooks/useHostManager.ts`: subscribe Realtime; expose `currentHostEmail` / `isHost(email)` / `transferHost(newEmail)`
- Remove `CHEF123` + hardcoded email detection; ALL users auth via direct email entry (no Magic Link, no passwords)
- Remove `lib/auth.ts`; update `tests/auth/host.test.ts`
- `components/host/HostTransferModal.tsx`: chef list, confirmation, `transferHost`
- `app/page.tsx`: `useHostManager(session.email)` replaces `session.role === 'host'`; role DERIVED, not chosen at login

### Out of Scope
- Multiple hosts / RBAC; audit log; server-side routes / RLS; `EvaluationRounds`/`KitchenTimer` interface (keep `isHost` prop)

## Capabilities

### New
- `host-management`: DB-backed host detection, Realtime sync, delegation transfer from UI
- `unified-auth`: single Magic Link flow for all users, no secret codes/hardcoded emails

### Modified
None — no existing specs.

## Approach

1. **SQL**: `app_settings` singleton, `current_host_email DEFAULT 'jduarte@intercorp.com.pe'`
2. **Hook**: Supabase query + `postgres_changes` subscription; `transferHost` = `UPDATE` singleton
3. **Auth**: delete `handleMagicLink`, HOST_SECRET, hostCode, and Magic Link flow; ALL users enter via direct email → name → avatar; role DERIVED from `currentHostEmail === userEmail`
4. **Modal**: triggered when `isHost === true`; lists chefs from session presence
5. `page.tsx`: `const { isHost } = useHostManager(session.email)`

## Affected Areas

| Area | Impact |
|------|--------|
| `lib/auth.ts` + `tests/auth/host.test.ts` | Removed / Modified |
| `components/auth/AuthScreen.tsx` | Modified (unconditional Magic Link, no CHEF123/hardcode) |
| `app/page.tsx` | Modified (consume `useHostManager`, render modal) |
| `components/host/HostTransferModal.tsx` / `hooks/useHostManager.ts` | New |
| SQL migration (`app_settings`) | New |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Realtime sync >2s / old host keeps privileges | Medium | Optimistic update in hook; role from hook not localStorage; force re-eval on change |
| No RLS — any chef can write `app_settings` | High | Accept (matches no-RLS arch); consider WITH CHECK policy/Postgres function (follow-up) |
| Email spoofing — any user can claim any email (including host's) | Medium | Acceptable for internal/trusted team; no RLS needed for this threat model |

## Rollback Plan

1. Delete migration (`DROP TABLE app_settings`)
2. Git-revert additive hook + modal; restore `lib/auth.ts` + tests + `AuthScreen.tsx` + `page.tsx`

Git-reversible — **NO commits/pushes/PRs until user approves.**

## Dependencies

- Supabase Realtime + Auth (`signInWithOtp`), PostgreSQL migration access — already configured

## Success Criteria

- [ ] `app_settings` singleton exists with correct default email
- [ ] Host can transfer to another active chef via modal, reflected on both sides within 2s WITHOUT reload
- [ ] No `CHEF123`/hardcoded email in source (`rg`-verified); no Magic Link anywhere; all users direct email entry
- [ ] `npm test` / `tsc --noEmit` / `lint` pass; NO commits/PRs until user approves