# Unified Auth Specification

## Purpose

The system SHALL provide a single direct-email authentication flow for ALL users (chefs and hosts alike), eliminating Magic Link, secret codes (`CHEF123`), hardcoded email detection, and role selection at login. The host role is derived from the database, not chosen by the user.

## Requirements

### Requirement: Direct Email Entry for All Users

The system MUST accept any email via a single text input and proceed directly to the profile step — no Magic Link, no OTP, no password. All users follow the identical flow.

#### Scenario: Chef enters email and proceeds to profile

- GIVEN the auth screen is displayed
- WHEN a user enters `chef@restaurante.com` and submits
- THEN the system proceeds to the profile step (name, avatar)
- AND no Magic Link or OTP is sent

#### Scenario: Host enters email and proceeds to profile

- GIVEN the auth screen is displayed
- WHEN a user enters the current host email and submits
- THEN the system proceeds to the profile step (name, avatar)
- AND no secret code or Maître login is shown

#### Scenario: Email is trimmed and lowercased

- GIVEN a user enters `  Chef@Restaurante.COM  `
- WHEN the email is processed
- THEN the stored email is `chef@restaurante.com`

### Requirement: No Hardcoded Host Detection

The system SHALL NOT contain any hardcoded email strings (`jduarte@intercorp.com.pe`) or secret codes (`CHEF123`) for host identification. All host detection comes from the `app_settings` table via `useHostManager`.

#### Scenario: Source contains no hardcoded host email

- GIVEN the codebase is searched for `jduarte@intercorp.com.pe`
- WHEN scanning `lib/auth.ts`, `AuthScreen.tsx`, and `page.tsx`
- THEN zero matches are found

#### Scenario: Source contains no secret codes

- GIVEN the codebase is searched for `CHEF123` or `HOST_SECRET`
- WHEN scanning all source files
- THEN zero matches are found

### Requirement: No Magic Link Flow

The system SHALL NOT use Supabase Magic Link (`signInWithOtp`) for any user. The `handleMagicLink` function and all related UI (magic link sent screen, "Enviar Enlace Mágico" button) MUST be removed.

#### Scenario: No OTP calls in auth flow

- GIVEN a user submits their email on the auth screen
- WHEN the submission handler executes
- THEN `supabase.auth.signInWithOtp` is NOT called
- AND no email is sent by Supabase

#### Scenario: No Magic Link UI exists

- GIVEN the auth screen renders
- WHEN inspecting the DOM
- THEN no "Enlace Mágico", "Revisa tu correo", or Magic Link confirmation screen is present

### Requirement: No Role Selection at Login

The system SHALL NOT present a role chooser (`chef` vs `host`) or a "¿Eres el Maître?" toggle during authentication. The `AuthScreenProps.onEntry` callback SHALL NOT include a `role` field — role is derived downstream by `useHostManager`.

#### Scenario: Auth screen has no role selector

- GIVEN the profile step of `AuthScreen` is displayed
- WHEN inspecting the UI
- THEN no radio buttons, dropdown, or toggle for `chef`/`host` role exists
- AND no "¿Eres el Maître? Acceso Secreto" link is present

#### Scenario: onEntry callback omits role

- GIVEN a user completes the profile step
- WHEN `onEntry` is called
- THEN the payload contains `{ name, avatar, email }` only
- AND `role` is NOT included in the payload

### Requirement: Auth Library Removal

The system SHALL remove `lib/auth.ts` entirely. The `isHost` function and `HOST_EMAIL` constant are replaced by `useHostManager` hook behavior.

#### Scenario: auth.ts file does not exist

- GIVEN the migration is complete
- WHEN checking the filesystem
- THEN `lib/auth.ts` does NOT exist

#### Scenario: Tests reference useHostManager instead

- GIVEN the test file `tests/auth/host.test.ts` exists
- WHEN tests run
- THEN they test `useHostManager` host detection against `app_settings`
- AND they do NOT import from `lib/auth.ts`

### Requirement: Session Profile Persistence

The system SHALL continue to persist user profiles (name, avatar) in `localStorage` for returning users, keyed by email. On re-entry with a known email, the system skips the profile step and enters directly.

#### Scenario: Returning user skips profile

- GIVEN a user previously entered as `chef@restaurante.com` with name "Juan" and avatar "👨‍🍳"
- WHEN the same email is entered again
- THEN the system loads the saved profile from localStorage
- AND calls `onEntry` directly without showing the profile step

#### Scenario: New user sees profile step

- GIVEN an email not found in localStorage
- WHEN the user submits their email
- THEN the profile step (name, avatar) is displayed
