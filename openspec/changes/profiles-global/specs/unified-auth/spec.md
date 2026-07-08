# Delta for Unified Auth

## ADDED Requirements

### Requirement: Session Carries Profile UUID

The system SHALL include a `profileId` field (UUID) in the session object returned from authentication. This UUID is resolved from the `profiles` table at login.

#### Scenario: Session includes profileId for returning chef

- GIVEN a profile exists with `id = 'abc-123'` and `email = 'chef@restaurante.com'`
- WHEN the chef enters with that email
- THEN the session object contains `{ name, avatar, email, profileId: 'abc-123' }`

#### Scenario: Session includes profileId for new chef

- GIVEN a new chef enters with `email = 'new@restaurante.com'`
- WHEN the chef completes the profile step
- THEN a profile is INSERTed and the session contains the new UUID as `profileId`

## MODIFIED Requirements

### Requirement: Direct Email Entry for All Users

The system MUST accept any email via a single text input. On submit, the system SHALL query the `profiles` table by normalized email (trimmed + lowercased). If a profile exists, the chef enters directly with `{ name, avatar, email, profileId }`. If no profile exists, the system proceeds to the profile step (name, avatar) — on completion, a profile is INSERTed and the chef enters with the new UUID.

(Previously: Email submit always proceeds to profile step or loads from localStorage; no database lookup.)

#### Scenario: Chef enters email and proceeds to profile

- GIVEN the auth screen is displayed
- WHEN a user enters `chef@restaurante.com` and submits
- AND no profile exists for that email in `profiles`
- THEN the system proceeds to the profile step (name, avatar)
- AND no Magic Link or OTP is sent

#### Scenario: Host enters email and proceeds to profile

- GIVEN the auth screen is displayed
- WHEN a user enters the current host email and submits
- AND no profile exists for that email in `profiles`
- THEN the system proceeds to the profile step (name, avatar)
- AND no secret code or Maître login is shown

#### Scenario: Email is trimmed and lowercased

- GIVEN a user enters `  Chef@Restaurante.COM  `
- WHEN the email is processed
- THEN the stored email is `chef@restaurante.com`

#### Scenario: Returning chef enters directly from profiles lookup

- GIVEN a profile exists in `profiles` with `email = 'chef@restaurante.com'`, `name = 'Juan'`, `avatar = '👨‍🍳'`, `id = 'abc-123'`
- WHEN the user enters `chef@restaurante.com` and submits
- THEN the system queries `profiles` by normalized email
- AND enters directly with `{ name: 'Juan', avatar: '👨‍🍳', email: 'chef@restaurante.com', profileId: 'abc-123' }`
- AND the profile step is NOT shown

### Requirement: Session Profile Persistence

The system SHALL persist user profiles in `profiles` (Supabase) as the source of truth. On re-entry with a known email, the system queries `profiles` first. As a fallback for offline or migration scenarios, `localStorage` MAY still be checked, but `profiles` takes precedence.

(Previously: Profiles persisted only in localStorage, keyed by email; no database involvement.)

#### Scenario: Returning user loads from profiles table

- GIVEN a profile exists in `profiles` for `chef@restaurante.com` with `name = 'Juan'` and `avatar = '👨‍🍳'`
- WHEN the same email is entered again
- THEN the system queries `profiles` and retrieves the profile
- AND calls `onEntry` with `{ name, avatar, email, profileId }` without showing the profile step

#### Scenario: New user sees profile step

- GIVEN an email not found in `profiles`
- WHEN the user submits their email
- THEN the profile step (name, avatar) is displayed
- AND on completion, a profile is INSERTed into `profiles`

#### Scenario: localStorage fallback during migration

- GIVEN a profile exists in localStorage but NOT yet in `profiles`
- WHEN the user enters their email
- THEN the system may use the localStorage profile as a fallback
- AND the chef enters with the localStorage data

### Requirement: onEntry Callback Includes Profile UUID

The `AuthScreenProps.onEntry` callback SHALL include a `profileId` field (UUID string, or `undefined` during migration fallback). The payload type becomes `{ name, avatar, email, profileId?: string }`.

(Previously: `onEntry` payload was `{ name, avatar, email }` only.)

#### Scenario: Auth screen has no role selector

- GIVEN the profile step of `AuthScreen` is displayed
- WHEN inspecting the UI
- THEN no radio buttons, dropdown, or toggle for `chef`/`host` role exists
- AND no "¿Eres el Maître? Acceso Secreto" link is present

#### Scenario: onEntry callback includes profileId

- GIVEN a user completes the profile step or is resolved from `profiles`
- WHEN `onEntry` is called
- THEN the payload contains `{ name, avatar, email, profileId }`
- AND `profileId` is the UUID from `profiles.id`
- AND `role` is NOT included in the payload
