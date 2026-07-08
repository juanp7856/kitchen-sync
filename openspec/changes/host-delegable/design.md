# Design: Host Delegation in KitchenSync

## Technical Approach

Replace hardcoded host email + Magic Link with a DB singleton (`app_settings`) and a Realtime hook (`useHostManager`). Role is DERIVED at runtime by comparing `session.email` against `currentHostEmail`. AuthScreen becomes a single direct-email + profile flow for everyone. Host transfer is done via a modal that lists active chefs from Supabase Presence and updates the singleton.

## Architecture Decisions

| Decision | Options | Tradeoffs | Choice |
|---|---|---|---|
| Host role storage | A) Hardcoded constant (current) | Zero infra, requires deploy to rotate | Rejected |
| | B) LocalStorage/session object | Fast, but stale on transfer | Rejected |
| | C) DB singleton + Realtime | Requires migration, instant sync | **Chosen** |
| Role derivation | A) Chosen at login (current) | Simple, needs re-auth on transfer | Rejected |
| | B) Derived from DB at runtime | Slightly more queries, zero re-auth | **Chosen** |
| Chef list in modal | A) Query `profiles` table | Needs new table/schema | Rejected |
| | B) Reuse Presence state (`online-chefs`) | Already populated, no extra query | **Chosen** |
| Optimistic update | A) Wait for Realtime event | ~1-2s UI lag for sender | Rejected |
| | B) Optimistically set `currentHostEmail` in hook | Risk of false positive on error, instant UX | **Chosen** |
| RLS on `app_settings` | A) Enable RLS | Safer, but out of scope / breaks existing pattern | Rejected |
| | B) No RLS (accept risk) | Any authenticated client can write; mitigated by UI gating | **Chosen** |

## Data Flow

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│  AuthScreen  │────→│  page.tsx        │────→│ useHostManager│
│  (email)     │     │  (session.email) │     │ (supabase)  │
└──────────────┘     └──────────────────┘     └──────┬──────┘
                                                      │
                              ┌───────────────────────┼───────────────────────┐
                              │                       │                       │
                              ▼                       ▼                       ▼
                        ┌──────────┐           ┌──────────┐           ┌──────────────┐
                        │ DB query │           │ Realtime │           │ HostTransferModal│
                        │ id=1     │           │ sub      │           │ (Presence list) │
                        └──────────┘           └──────────┘           └──────────────┘
```

## File Changes

| File | Action | Description |
|---|---|---|
| `hooks/useHostManager.ts` | Create | Query + Realtime sub for `app_settings`; exposes `isHost(email)`, `transferHost`, optimistic update |
| `components/host/HostTransferModal.tsx` | Create | Lists chefs from presence; confirmation flow; calls `transferHost`; only renderable if `isHost` |
| `lib/auth.ts` | Delete | Replaced by `useHostManager` |
| `components/auth/AuthScreen.tsx` | Modify | Remove Magic Link, CHEF123, hostCode, hardcoded email, role state; `onEntry` emits `{name, avatar, email}` only |
| `app/page.tsx` | Modify | Integrate `useHostManager(session.email)`; remove `lib/auth.ts`; drop `role` from `UserSession`; pass `isHost` prop to children |
| `lib/types.ts` | Modify | Add `AppSettings` interface |
| `tests/auth/host.test.ts` | Modify | Test `useHostManager` hook against mock Supabase instead of `isHost` from `lib/auth.ts` |
| `sql/migrations/001_app_settings.sql` | Create | Singleton table with default host email |

## Interfaces / Contracts

```typescript
// lib/types.ts
export interface AppSettings {
  id: 1;
  current_host_email: string;
}

// hooks/useHostManager.ts
export interface UseHostManagerResult {
  currentHostEmail: string | null;
  isHost: (email: string) => boolean;
  transferHost: (newEmail: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

// components/auth/AuthScreen.tsx
interface AuthScreenProps {
  onEntry: (userData: { name: string; avatar: string; email: string }) => void;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `useHostManager` | Mock Supabase client: assert initial query, subscription callback updates state, `transferHost` performs optimistic update + DB update |
| Unit | `AuthScreen` | RTL: assert no Magic Link button, no CHEF123 input, `onEntry` called without `role`, profile skip on known email |
| Integration | Host transfer e2e | Render page with mocked Supabase + presence; simulate modal selection; assert DB update call and UI re-render |

## Migration / Rollout

1. Run SQL migration to create `app_settings` and seed default row.
2. Deploy code changes (additive hook/modal, then remove `lib/auth.ts`).
3. Verify `app_settings` row exists and Realtime subscription works.
4. Rollback: drop table `app_settings`; revert commit to restore `lib/auth.ts` and old `AuthScreen`.

## Open Questions

- None.
