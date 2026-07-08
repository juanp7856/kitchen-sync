# Profile Management Specification

## Purpose

The system SHALL provide a Supabase-backed `profiles` table with UUID identity, enabling cross-device chef attribution and a smooth strangler-fig migration from free-text `chef_id` to stable `profile_id`. Legacy dishes remain untouched; new dishes carry both `profile_id` (UUID) and `chef_id` (display name).

## Requirements

### Requirement: Profiles Table Schema

The system MUST maintain a `profiles` table with the following columns:
- `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
- `email` TEXT UNIQUE (normalized: trimmed + lowercased)
- `name` TEXT (display name chosen by chef)
- `avatar` TEXT (emoji or URL, optional)
- `created_at` TIMESTAMPTZ DEFAULT `now()`

#### Scenario: Table exists with correct constraints

- GIVEN the migration `002_profiles.sql` has been applied
- WHEN querying `information_schema.columns` for table `profiles`
- THEN columns `id`, `email`, `name`, `avatar`, `created_at` exist
- AND `email` has a UNIQUE constraint

#### Scenario: Duplicate email is rejected

- GIVEN a profile exists with `email = 'chef@restaurante.com'`
- WHEN inserting another row with `email = 'chef@restaurante.com'`
- THEN the database rejects the insert with a UNIQUE violation

### Requirement: Email-Based Profile Lookup

The system MUST query `profiles` by normalized email (trimmed + lowercased) when a chef enters their email at login.

#### Scenario: Returning profile found — enter directly

- GIVEN a profile exists with `email = 'chef@restaurante.com'`, `name = 'Juan'`, `avatar = '👨‍🍳'`
- WHEN the chef enters `chef@restaurante.com` at the auth screen
- THEN the system retrieves `{ id, name, avatar }` from `profiles`
- AND the chef enters the kitchen directly without the profile step

#### Scenario: Email case variations resolve to same profile

- GIVEN a profile exists with `email = 'chef@restaurante.com'`
- WHEN the chef enters `  Chef@Restaurante.COM  `
- THEN the lookup normalizes to `chef@restaurante.com`
- AND the existing profile is returned

#### Scenario: No profile found — prompt for name and avatar

- GIVEN no profile exists for the entered email
- WHEN the chef submits their email
- THEN the system displays the profile step (name input, avatar picker)
- AND does NOT enter the kitchen yet

### Requirement: Profile Creation on First Entry

The system MUST INSERT a new profile when a chef enters with an email not found in `profiles`.

#### Scenario: New profile created with chef-provided data

- GIVEN no profile exists for `chef@restaurante.com`
- WHEN the chef enters name "María" and selects avatar "👩‍🍳"
- THEN a new row is INSERTed with `email = 'chef@restaurante.com'`, `name = 'María'`, `avatar = '👩‍🍳'`
- AND the chef enters the kitchen with the new profile's UUID as `profileId`

#### Scenario: UNIQUE race on dual-device first login

- GIVEN two devices simultaneously enter `chef@restaurante.com` for the first time
- WHEN both attempt INSERT
- THEN one succeeds and the other receives a UNIQUE violation
- AND the failing device retries with a SELECT and enters with the existing profile

### Requirement: Projects Profile ID (Soft FK)

The system MUST support a nullable `profile_id` column on `projects` referencing `profiles(id)`. New dishes set `profile_id = session.profileId` while keeping `chef_id = session.name` for display.

#### Scenario: New dish carries profile UUID

- GIVEN session has `profileId = 'abc-123'` and `name = 'Juan'`
- WHEN a chef creates a new dish
- THEN the dish is INSERTed with `profile_id = 'abc-123'` AND `chef_id = 'Juan'`

#### Scenario: Legacy dish has NULL profile_id

- GIVEN a dish created before the profiles migration
- WHEN querying the dish
- THEN `profile_id IS NULL`
- AND `chef_id` contains the display name

### Requirement: Dual Ownership Filter (Strangler Fig)

The system MUST filter "mis platos" using a dual predicate: `profile_id === session.profileId OR chef_id === session.name`. This ensures both UUID-attributed and legacy dishes appear as "mine."

#### Scenario: UUID dishes appear in "mis platos"

- GIVEN session has `profileId = 'abc-123'`
- WHEN filtering dishes for the current chef
- THEN dishes with `profile_id = 'abc-123'` are included

#### Scenario: Legacy dishes appear in "mis platos"

- GIVEN session has `name = 'Juan'`
- WHEN filtering dishes for the current chef
- THEN dishes with `chef_id = 'Juan'` AND `profile_id IS NULL` are included

#### Scenario: No duplicate dishes in filter result

- GIVEN a dish has `profile_id = 'abc-123'` AND `chef_id = 'Juan'`
- WHEN applying the dual filter
- THEN the dish appears exactly once (not duplicated by both predicates)

### Requirement: Chef Display Resolution

The system MUST resolve chef display by preferring `profiles.name`/`avatar` for UUID dishes, falling back to `chef_id` text for legacy dishes.

#### Scenario: UUID dish shows profile name and avatar

- GIVEN a dish has `profile_id = 'abc-123'`
- WHEN rendering the dish card
- THEN the display uses `profiles.name` and `profiles.avatar` from the JOIN

#### Scenario: Legacy dish shows chef_id text

- GIVEN a dish has `profile_id IS NULL` and `chef_id = 'Juan'`
- WHEN rendering the dish card
- THEN the display shows `chef_id` as the chef name
- AND no avatar is shown (or a default placeholder is used)
