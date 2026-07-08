# Host Management Specification

## Purpose

The system MUST manage the Host (Maître) role via a database-backed singleton (`app_settings`) with Supabase Realtime synchronization, replacing all hardcoded email checks. Host delegation transfers through a UI modal, and the role is DERIVED at runtime — never chosen or stored in the client session.

## Requirements

### Requirement: DB-Backed Host Singleton

The system SHALL store the current host email in a single-row `app_settings` table (`id = 1`, `current_host_email`). The default value MUST be `jduarte@intercorp.com.pe`. Any email comparison for host detection queries this value, never a hardcoded string.

#### Scenario: Host detection matches DB value

- GIVEN `app_settings.current_host_email` = `chef@restaurante.com`
- WHEN a user signs in with email `chef@restaurante.com`
- THEN the system derives `isHost = true` for that session

#### Scenario: Host detection rejects non-matching email

- GIVEN `app_settings.current_host_email` = `chef@restaurante.com`
- WHEN a user signs in with email `other@restaurante.com`
- THEN the system derives `isHost = false` for that session

#### Scenario: Case-insensitive host comparison

- GIVEN `app_settings.current_host_email` = `Chef@Restaurante.com`
- WHEN a user signs in with email `chef@restaurante.com`
- THEN the system derives `isHost = true` (case-insensitive match)

### Requirement: Realtime Host Sync

The system MUST subscribe to `postgres_changes` on `app_settings` so all connected clients receive host updates within 2 seconds without page reload.

#### Scenario: Host transfer propagates to all clients

- GIVEN Chef A is host and Chef B is connected as chef
- WHEN Chef A transfers host to Chef B via the modal
- THEN Chef B's UI reflects `isHost = true` within 2s
- AND Chef A's UI reflects `isHost = false` within 2s

#### Scenario: New client receives current host on connect

- GIVEN `app_settings.current_host_email` = `maria@restaurante.com`
- WHEN a new client loads the kitchen page
- THEN the client reads `current_host_email` from DB on mount
- AND derives role before rendering the kitchen view

#### Scenario: Stale DB read falls back gracefully

- GIVEN the Realtime subscription fails or disconnects
- WHEN the system queries `app_settings` directly
- THEN it uses the latest DB value for host detection
- AND retries the Realtime subscription

### Requirement: Host Transfer via UI

The system SHALL provide a `HostTransferModal` component that lists active chefs from Supabase presence and allows the current host to transfer their role to any listed chef.

#### Scenario: Host opens transfer modal

- GIVEN the current user is the host (`isHost = true`)
- WHEN the host clicks the "Transferir" action
- THEN the `HostTransferModal` opens showing all active chefs from presence

#### Scenario: Host confirms transfer

- GIVEN the host has selected Chef B from the list
- WHEN the host clicks "Confirm Transfer"
- THEN the system updates `app_settings.current_host_email` to Chef B's email
- AND the modal closes
- AND the optimistic update reflects the role change immediately

#### Scenario: Non-host cannot access transfer

- GIVEN the current user is NOT the host
- WHEN the user attempts to access the transfer modal
- THEN the modal MUST NOT render or be triggerable

#### Scenario: Transfer to self is rejected

- GIVEN the host attempts to transfer to their own email
- WHEN the transfer is submitted
- THEN the system rejects the operation with a visible message
- AND `app_settings` remains unchanged

### Requirement: Derived Role in Kitchen View

The system MUST derive the user's host role from `useHostManager(session.email)` — the `page.tsx` component SHALL NOT use `session.role === 'host'` or any localStorage-stored role for privilege checks.

#### Scenario: Kitchen view uses hook for host checks

- GIVEN a user session with email `juan@restaurante.com`
- WHEN `page.tsx` renders host-only controls (close session, clear kitchen)
- THEN visibility is determined by `useHostManager(session.email).isHost`
- AND NOT by any value stored in the session object or localStorage

#### Scenario: Role changes mid-session

- GIVEN a chef is viewing the kitchen as non-host
- WHEN another host transfers the role to this chef
- THEN the chef's UI updates to show host controls WITHOUT reload
