# Design: Global Profiles with UUIDs in KitchenSync

## Technical Approach

Additive schema migration introducing a canonical identity layer. A `profiles` table (UUID PK, unique normalized email) becomes the source of truth for chef identity. A nullable `profile_id` FK on `projects` lets new dishes carry a stable UUID while legacy rows remain untouched. AuthScreen queries Supabase on email submit—existing profiles enter directly with `profileId`; new profiles trigger an INSERT. A dual-predicate client-side filter (`profile_id || chef_id`) acts as a strangler-fig for legacy data. The data fetch JOINs `profiles` to enrich the `Project` type, preparing child components for future display updates.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Migration | Soft FK, nullable `profile_id` | Backfill legacy rows, hard FK | Zero downtime; no data rewrite; legacy dishes keep working |
| Identity source | Supabase `profiles` first, localStorage fallback | localStorage-only, Magic Link/OTP | DB is cross-device source of truth; localStorage covers offline edge cases |
| Ownership filter | Dual predicate client-side | Server-side RLS, single UUID filter | Matches existing client-side filter pattern; project accepts no-RLS architecture |
| Race condition | Catch `23505` → retry SELECT | Pre-generate UUID, distributed locks | Simple, leverages DB `UNIQUE` constraint, no extra infrastructure |
| Display resolution | JOIN in `page.tsx`, enrich `Project` type | Separate profiles query, denormalize | Single round-trip for project list; child components receive enriched data unchanged |

## Data Flow

```
AuthScreen (email submit)
  → Supabase SELECT profiles WHERE email = ?
    → Hit: onEntry({ profileId, name, avatar, email })
    → Miss: profile step → INSERT profiles
      → 23505 UNIQUE violation? → SELECT → onEntry with existing profile
        → Session (profileId) stored in localStorage
          → AddDishForm receives profileId + chefId
            → INSERT projects (profile_id = UUID, chef_id = display name)
              → page.tsx fetchProjects
                → SELECT projects + JOIN profiles(name, avatar)
                  → Client-side dual filter: profile_id === session.profileId || chef_id === session.name
                    → MasterKitchenView / EvaluationRounds (data enriched, UI consumption deferred)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `sql/migrations/002_profiles.sql` | Create | `profiles` DDL + `ALTER TABLE projects ADD COLUMN profile_id` |
| `lib/types.ts` | Modify | Add `profile_id?: string \| null` and `profiles?: { name: string; avatar: string } \| null` to `Project` |
| `components/auth/AuthScreen.tsx` | Modify | Supabase SELECT on email; INSERT on new profile; `23505` retry; `onEntry` carries `profileId` |
| `app/page.tsx` | Modify | `UserSession` gains `profileId`; `fetchProjects` JOINs `profiles`; dual filter; passes `profileId` to `AddDishForm` |
| `components/AddDishForm.tsx` | Modify | Accept `profileId` prop; insert both `profile_id` and `chef_id` |

## Interfaces / Contracts

```typescript
// lib/types.ts — enriched Project
export interface Project {
  id: string;
  title: string;
  status: 'prep' | 'slow' | 'served' | 'cooking';
  temp: number;
  chef_id: string;              // display name (legacy + new)
  profile_id?: string | null;   // stable UUID (new only)
  profiles?: {                // Supabase JOIN result
    name: string;
    avatar: string;
  } | null;
  icon?: string;
  sort_order: number;
  session_id?: string;
}

// app/page.tsx — enriched session
interface UserSession {
  name: string;
  avatar: string;
  email: string;
  profileId: string;            // resolved from profiles.id
}

// components/auth/AuthScreen.tsx — enriched callback
interface AuthScreenProps {
  onEntry: (userData: {
    name: string;
    avatar: string;
    email: string;
    profileId: string;
  }) => void;
}

// components/AddDishForm.tsx — enriched props
interface AddDishFormProps {
  chefId: string;               // display name for chef_id column
  profileId: string;            // UUID for profile_id column
  sessionId: string;
}
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | AuthScreen state machine: email → SELECT hit, email → SELECT miss → INSERT, `23505` retry path | vitest + React Testing Library + MSW |
| Integration | `fetchProjects` returns JOINed shape; dual filter correctly includes UUID and legacy dishes | vitest + jsdom + mocked Supabase client |
| Type-check | `tsc --noEmit` passes with new `Project`/`UserSession` shapes | `npx tsc --noEmit` |

## Migration / Rollout

No data migration required. Additive schema only:
1. Run `002_profiles.sql` to create `profiles` and add nullable `projects.profile_id`.
2. Deploy client code. Legacy dishes (`profile_id IS NULL`) continue to filter by `chef_id`.
3. New dishes carry both `profile_id` and `chef_id`.
4. Rollback: `ALTER TABLE projects DROP COLUMN profile_id; DROP TABLE profiles;` + revert client code.

## Open Questions

- **UI consumption deferred**: `MasterKitchenView` and `EvaluationRounds` currently key display logic off `chef_id`. They will need updates to prefer `project.profiles?.name/avatar` with `chef_id` fallback. Per implementation constraints, these components are out of scope for this slice; the data layer (JOIN + enriched `Project` type) is prepared now to unblock that future work.
