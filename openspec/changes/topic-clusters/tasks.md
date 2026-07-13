# Tasks: Topic Clusters (Weekly Semantic Analysis)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 370–430 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (borderline; split to foundation + implementation if >420) |
| Delivery strategy | ask-always |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Foundation: types, SQL, package, DBSCAN engine | PR 1 | ~100 lines, self-contained, testable with synthetic vectors |
| 2 | Core + UI: worker, orchestrator, heatmap, page wiring | PR 1 | ~210 lines, depends on unit 1 |
| 3 | Testing: unit tests for engine, orchestrator, heatmap | PR 1 | ~110 lines, depends on units 1–2 |

## Phase 1: Foundation

- [ ] 1.1 Add types (`TopicCluster`, `TopicClusterProject`, `ClusterResult`, `WorkerMessage`) to `lib/types.ts` — 4 interfaces per design §Interfaces/Contracts
- [ ] 1.2 Create migration `sql/migrations/003_topic_clusters.sql` — `topic_clusters` + `topic_cluster_projects` with CHECK constraint (`profile_id` XOR `chef_name`), UNIQUE on `(topic_cluster_id, project_id)`, ON DELETE CASCADE
- [ ] 1.3 Add `@xenova/transformers` to `package.json` dependencies
- [ ] 1.4 Create `lib/topicClusterEngine.ts` — pure DBSCAN (cosine distance, ε=0.3, minPts=2), cluster labeling (central title / singleton / "Sin tema claro"), confidence calc. **No model dependency** — testable with synthetic vectors.

## Phase 2: Core Implementation

- [ ] 2.1 Create `lib/workers/topicCluster.worker.ts` — Next.js-bundled module worker. Input: `{ type: 'run', titles }`. Loads model via `@xenova/transformers` (Cache API), embeds titles, delegates to `topicClusterEngine`, posts `WorkerMessage` progress/result/error events.
- [ ] 2.2 Create `lib/topicClusters.ts` — orchestrator: query `projects` (titles + profile_id + chef_name), spawn Worker, receive `ClusterResult[]`, delete-then-insert into `topic_clusters` → `topic_cluster_projects`. Re-query for fresh results.

## Phase 3: UI Integration

- [ ] 3.1 Create `components/host/TopicHeatmap.tsx` — button "🔥 Analizar temas" (host-only via `isHost` prop), progress UI (download/embed/cluster stages), success visualization (theme list + count + confidence bar + project examples), error/empty states. Calls `lib/topicClusters.ts`.
- [ ] 3.2 Wire `TopicHeatmap` into `app/page.tsx`: import component, render `<TopicHeatmap sessionId={currentSession.id} weekStart={weekStart} isHost={isHostUser} />` inside host section, compute `weekStart` (Monday of current week).

## Phase 4: Testing

- [ ] 4.1 Unit test `lib/topicClusterEngine.ts` — synthetic 384-dim vectors. Verify DBSCAN grouping (similar → same cluster), noise → "Sin tema claro", singleton labeling, confidence range [0,1], empty input edge case. **Ref: spec §§Local Clustering Pipeline**
- [ ] 4.2 Unit test `lib/topicClusters.ts` — mock `Worker` + `supabase.from`. Verify message flow (post/onmessage), DELETE→INSERT sequence, error propagation, empty project list handling, re-execution replaces week. **Ref: spec §§Weekly UPSERT Strategy**
- [ ] 4.3 Unit test `components/host/TopicHeatmap.tsx` — mock `runClustering`. Verify button hidden when `!isHost`, progress states, success/empty/error UI, confidence bar rendering. **Ref: spec §§Host-Only Execution Gate**
- [ ] 4.4 Manual E2E — real model `all-MiniLM-L6-v2` (~80MB download). Verify: titles cluster semantically, embeddings stay local (network panel), second run uses cache (IndexedDB hit), non-host sees no button. **NOT automated in CI due to model size. Ref: spec §§Embedding Privacy Guarantee, Model Caching in IndexedDB**
