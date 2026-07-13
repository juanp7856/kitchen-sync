# Topic Clusters Specification

## Purpose

The system SHALL provide weekly semantic clustering of project titles within a session, delivering the host (Maître) a "hot themes" report — all computation local to the browser, zero embeddings transmitted.

## Requirements

### Requirement: Local Clustering Pipeline

The system MUST execute: fetch titles → embed → DBSCAN cluster → label → persist. All steps in-browser; embeddings MUST NOT leave the client.

#### Scenario: Full pipeline execution

- GIVEN a session with ≥2 projects for the current week
- WHEN the host triggers "Analizar temas"
- THEN fetch titles, embed via `@xenova/transformers` (`all-MiniLM-L6-v2`), apply DBSCAN (`minPts=2`, cosine similarity), label clusters, insert into `topic_clusters` + `topic_cluster_projects`

#### Scenario: Similar titles cluster; noise and singletons handled

- GIVEN "Fix AOD", "Integración con AOD", plus unrelated "CLAIMS.AI"
- WHEN the pipeline executes
- THEN AOD titles share a cluster; "CLAIMS.AI" is singleton; DBSCAN noise → "Sin tema claro"

#### Scenario: Empty or single-project session

- GIVEN a session with 0 or 1 projects
- WHEN triggered
- THEN with 0: "No hay platos para analizar", no DB writes; with 1: singleton cluster

### Requirement: Web Worker Execution

The system MUST run embedding inference and DBSCAN inside a Web Worker. The UI SHALL remain responsive.

#### Scenario: UI stays responsive during processing

- GIVEN clustering with 50+ projects
- WHILE the Worker processes
- THEN the UI remains responsive and a loading indicator shows progress

#### Scenario: Worker handles model warmup

- GIVEN the model is not yet loaded
- WHEN clustering is first triggered
- THEN the Worker loads the model and reports progress to the main thread

### Requirement: Model Caching in IndexedDB

The system SHALL cache the model (~80MB) in IndexedDB after first download. Subsequent runs MUST reuse the cached model.

#### Scenario: First run downloads, subsequent runs use cache

- GIVEN no cached model exists
- WHEN triggered
- THEN model downloads from CDN with progress and cancel option, stores in IndexedDB
- AND subsequent runs load from IndexedDB with no network request

#### Scenario: Download failure is recoverable

- GIVEN the model download fails
- WHEN the attempt errors
- THEN error message with retry option; no partial model cached

### Requirement: Relational Persistence with Mixed Traceability

The system MUST persist results in `topic_clusters` and `topic_cluster_projects`. Junction rows SHALL include `profile_id` (new) or `chef_name` (legacy), never both.

#### Scenario: New vs legacy project linkage

- GIVEN a project with valid `profile_id`
- WHEN assigned to a cluster
- THEN `topic_cluster_projects` stores `profile_id`, `chef_name` is NULL
- AND for legacy projects (`profile_id` NULL), `chef_name` is stored instead

#### Scenario: Junction uniqueness enforced

- GIVEN a project already linked to a cluster
- WHEN a duplicate insert is attempted
- THEN the UNIQUE constraint `(topic_cluster_id, project_id)` prevents it

### Requirement: Weekly UPSERT Strategy

The system MUST use upsert keyed on `(session_id, week_start)`. Re-execution for the same week SHALL delete then insert fresh results.

#### Scenario: Re-execution replaces week's clusters

- GIVEN clusters exist for `(session_id, week_start)`
- WHEN the host re-triggers clustering
- THEN existing rows for that week deleted from both tables, fresh results inserted

#### Scenario: Different weeks coexist

- GIVEN clusters for week 2026-07-06
- WHEN pipeline runs for week 2026-07-13
- THEN week 2026-07-06 clusters remain; new clusters for 2026-07-13

### Requirement: Host-Only Execution Gate

The system SHALL allow clustering only when `useHostManager(session.email).isHost` is true.

#### Scenario: Host sees button, non-host does not

- GIVEN `isHost` is true/false
- WHEN the kitchen page renders
- THEN the "🔥 Analizar temas" button is visible/hidden

### Requirement: Embedding Privacy Guarantee

The system MUST ensure raw embeddings and intermediate vectors NEVER leave the browser. Only final cluster results are sent to Supabase.

#### Scenario: No embeddings in network traffic

- GIVEN the pipeline executes
- WHEN inspecting network requests
- THEN no request contains embedding vectors; only Supabase queries and model CDN requests
