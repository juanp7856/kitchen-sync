# Tasks: Global Profiles with UUIDs in KitchenSync

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300 (production ~200 + tests ~100) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-always |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Migration + types + auth + dish + wiring + tests | PR 1 | Single atomic PR; tests included with behavior |

## Phase 1: Foundation (migration + types)

- [ ] 1.1 Create `sql/migrations/002_profiles.sql` — `CREATE TABLE profiles` (id UUID PK DEFAULT gen_random_uuid(), email TEXT UNIQUE, name TEXT, avatar TEXT, created_at TIMESTAMPTZ DEFAULT now()) + `ALTER TABLE projects ADD COLUMN profile_id UUID REFERENCES profiles(id)`
- [ ] 1.2 Extend `Project` in `lib/types.ts` — add `profile_id?: string \| null` and `profiles?: { name: string; avatar: string } \| null`

## Phase 2: Core implementation

- [ ] 2.1 Rework `AuthScreen.tsx` email flow — normalize email → `supabase.from('profiles').select('*').eq('email', normalized)` on submit; hit → `onEntry({ name, avatar, email, profileId })`; miss → profile step → `INSERT INTO profiles` → `onEntry` with new `profileId`. Catch `23505` (UNIQUE race) → retry SELECT
- [ ] 2.2 Update `AddDishForm.tsx` — accept `profileId: string` prop; include `profile_id: profileId` in the `projects` INSERT alongside existing `chef_id`

## Phase 3: Wiring (page.tsx)

- [ ] 3.1 Enrich `UserSession` in `app/page.tsx` with `profileId: string`; update `handleEntry` to persist it; modify `fetchProjects` to `.select('*, profiles(name, avatar)')` with a JOIN; replace `p.chef_id === session.name` filter with dual predicate `p.profile_id === session.profileId || p.chef_id === session.name`; pass `profileId={session.profileId}` to `AddDishForm`

## Phase 4: Testing

- [ ] 4.1 Unit test AuthScreen profile lookup — returning chef hits SELECT and enters directly; new chef hits INSERT then enters; `23505` race retries SELECT (vitest + RTL + MSW)
- [ ] 4.2 Integration test fetchProjects + dual filter — mocked Supabase returns JOINed `{ *, profiles: { name, avatar } }` shape; dual predicate matches UUID and legacy dishes without duplicates (vitest + jsdom)
- [ ] 4.3 Type-check — run `tsc --noEmit` and confirm zero errors on new `Project` / `UserSession` types

## Phase 5: Cleanup

- [ ] 5.1 Verify `npm run lint` passes; remove any dead code or debug logs introduced during implementation
