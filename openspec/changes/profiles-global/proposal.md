# Proposal: Global Profiles with UUIDs in KitchenSync

## Intent

Chef identity is currently keyed by `chef_id` (a free-text name) on `projects`. Entering the same email from a second device with a different name breaks ownership attribution — "mis platos" filter (`p.chef_id === session.name`) misses dishes, and renaming a chef detaches their history. There is no canonical, device-independent identity. This change introduces a Supabase-backed `profiles` table (UUID PK + UNIQUE email) and a soft `projects.profile_id` FK so new dishes carry a stable identity while legacy data keeps working untouched.

## Scope

### In Scope
- `profiles(id uuid PK DEFAULT gen_random_uuid(), email text UNIQUE, name text, avatar text, created_at)` table — already created in Supabase by the user; formalized via migration
- `projects.profile_id uuid NULLABLE REFERENCES profiles(id)` — soft FK (no NOT NULL, no backfill)
- `AuthScreen.tsx`: query `profiles` by email on entry — existing profile returns `{name, avatar, id}` and enters directly; missing profile prompts name/avatar → INSERT → enters
- `Project` type gain `profile_id?: string`; new dishes set `profile_id` to session profile UUID; `chef_id` keeps the display name
- "Mis platos" filter: `profile_id === session.profileId || chef_id === session.name` (dual filter while legacy dishes live)
- Chef display in `MasterKitchenView` / `EvaluationRounds`: JOIN `profiles` for UUID dishes, fallback `chef_id` for legacy dishes
- Session profile carries `profileId` (UUID) alongside `name`/`email`/`avatar`

### Out of Scope
- Backfill / migration of legacy `projects.profile_id` from name → UUID
- Renaming a chef and auto-rewriting `chef_id` on historical dishes
- RLS / `profiles` write policies, avatar upload/storage, profile editing UI
- Removing `chef_id` column entirely (deferred until legacy dishes fully archived)

## Capabilities

### New
- `profile-management`: Supabase `profiles` table with UUID identity, email-based lookup at login, cross-device persistence consumed by dish attribution

### Modified
- `unified-auth`: session profile now resolved against `profiles` table (UUID carries into session), not localStorage-only; spec gains a "profile lookup at entry" requirement

## Approach

1. **SQL**: formalize `profiles` DDL + add nullable `projects.profile_id` FK (additive, non-breaking)
2. **AuthScreen**: `SELECT * FROM profiles WHERE email = ?` on email submit → hit: enter direct; miss: prompt name/avatar → `INSERT` → enter. Session object carries `profileId`
3. **Dish creation** (`AddDishForm`): set `profile_id = session.profileId` (keep `chef_id = session.name` for display)
4. **Ownership filter**: dual predicate `profile_id === session.profileId || chef_id === session.name` — strangler-fig: legacy dishes naturally served/archived away over time
5. **Display**: prefer JOIN'd `profiles.name`/`avatar` for UUID dishes, fall back to `chef_id` text when `profile_id IS NULL`

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `sql/migrations/002_profiles.sql` | New | `profiles` DDL + `projects.profile_id` FK |
| `lib/types.ts` | Modified | `Project.profile_id?` + `Session.profileId` |
| `components/auth/AuthScreen.tsx` | Modified | `profiles` lookup-by-email workflow |
| `app/page.tsx` | Modified | "mis platos" dual filter, pass `profileId` |
| `components/AddDishForm.tsx` | Modified | set `profile_id = session.profileId` |
| `components/MasterKitchenView.tsx` / `EvaluationRounds.tsx` | Modified | display resolves UUID → profiles JOIN, fallback `chef_id` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Email collision / case-sensitivity breaks lookup | Medium | Normalize email to lowercased-trimmed before SELECT and INSERT (matches existing `unified-auth` spec) |
| Dual-filter window serves wrong dishes to a renamed chef | Low | Legacy dishes are historical; new identity owns ALL new dishes; legacy fades as dishes flow through the kitchen |
| No RLS — chef can INSERT arbitrary `profile_id` | Medium | Accept (matches project's no-RLS arch); client sets own `session.profileId` |
| `profiles.email` UNIQUE race on first login from 2 devices | Low | DB UNIQUE constraint rejects dup; client retries SELECT then enters |

## Rollback Plan

1. `ALTER TABLE projects DROP COLUMN profile_id; DROP TABLE profiles;` (additive only)
2. Git-revert client code — `AuthScreen.tsx`, `page.tsx`, `AddDishForm.tsx`, `MasterKitchenView.tsx`, `EvaluationRounds.tsx`, `lib/types.ts`
3. Legacy `chef_id`-only behavior unchanged — no data migration was applied

**No commits / pushes / PRs until user approves.**

## Dependencies

- Supabase PostgreSQL migration access — `profiles` table already created by user (formalize DDL in repo)
- Post-merge `host-delegable` state (app_settings singleton, useHostManager, unified direct-email auth) — prerequisite

## Success Criteria

- [ ] Same email on two devices → same `profile_id`, all my new dishes visible on both
- [ ] Legacy dishes (profile_id NULL) still filter as "mine" when `chef_id === session.name`
- [ ] Chef display shows `profiles.name`/`avatar` for UUID dishes, falls back to `chef_id` for legacy
- [ ] First-time email prompts name/avatar; returning email enters directly from `profiles` lookup
- [ ] `npm test` / `tsc --noEmit` / `lint` pass; NO commits/PRs until user approves