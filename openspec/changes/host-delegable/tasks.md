# Tasks: Host Delegation in KitchenSync

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300-350 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-always |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Foundation + Hook + Auth + Kitchen + Verify | Single PR | ~300-350 lines; one cohesive change |

## Phase 1: Foundation

- [x] 1.1 Add `AppSettings` interface to `lib/types.ts` — `{ id: 1; current_host_email: string }`
- [x] 1.2 Create `sql/migrations/001_app_settings.sql` — singleton table, `INSERT` default row `jduarte@intercorp.com.pe`

## Phase 2: Hook — useHostManager (TDD)

- [x] 2.1 [RED] Rewrite `tests/auth/host.test.ts` — mock Supabase client; test `isHost(email)` case-insensitive match, `transferHost(newEmail)` optimistic update + DB call, loading/error states
- [x] 2.2 [GREEN] Create `hooks/useHostManager.ts` — query `app_settings` WHERE id=1, `postgres_changes` subscription on UPDATE, expose `isHost(email)`, `transferHost(newEmail)` with optimistic `setState`, loading/error
- [x] 2.3 Delete `lib/auth.ts`

## Phase 3: Auth Simplification

- [x] 3.1 Modify `components/auth/AuthScreen.tsx` — remove Magic Link (`handleMagicLink`, `signInWithOtp`), remove `CHEF123`/`HOST_SECRET`, remove `showMaîtreLogin`/`hostCode`, remove hardcoded `jduarte@intercorp.com.pe` checks, remove Supabase `onAuthStateChange`/`getSession` listener
- [x] 3.2 Implement direct-email flow: email input → profile step (name + avatar) → `onEntry({ name, avatar, email })`; `AuthScreenProps.onEntry` drops `role` field; returning users load profile from localStorage, skip profile step
- [x] 3.3 Verify spec compliance: `rg 'jduarte@intercorp\.com\.pe'` = 0 matches in src; `rg 'CHEF123'` = 0; `rg 'signInWithOtp'` = 0; `onEntry` callback excludes `role`

## Phase 4: Kitchen Integration

- [x] 4.1 Remove `role` from `UserSession` interface in `app/page.tsx`; add `import { useHostManager }`; replace `session.role === 'host'` checks with `const { isHost } = useHostManager(session.email)`
- [x] 4.2 Create `components/host/HostTransferModal.tsx` — receives `isHost`, `transferHost`, Presence chef list; chef selection + confirm button; close on transfer
- [x] 4.3 Render `HostTransferModal` in `page.tsx` header (alongside host-only controls); trigger via "Transferir" button visible only when `isHost`

## Phase 5: Verification

- [x] 5.1 Run full suite: `npm test` — all passing (vitest + RTL); `npx tsc --noEmit` — clean; `npm run lint` — no warnings
- [x] 5.2 Verify spec scenarios: host detection matches DB value, transfer propagates via Realtime, non-host cannot trigger modal, case-insensitive comparison, no Magic Link UI remains
