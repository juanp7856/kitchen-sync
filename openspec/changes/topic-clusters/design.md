# Design: Topic Clusters (Weekly Semantic Analysis)

## Technical Approach

All computation stays in-browser. A thin Web Worker performs embedding inference and DBSCAN clustering. The main thread orchestrates (fetch titles → worker → persist clusters). Raw embeddings never leave the client; only cluster metadata is written to Supabase.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Worker bundling | Next.js-bundled module worker (`lib/workers/topicCluster.worker.ts`) | Static `.js` in `public/` | App Router supports `new Worker(new URL('./file', import.meta.url))` in client components. Next.js bundles the worker separately; `@xenova/transformers` JS glue is small; 80MB weights are runtime-fetched from CDN. |
| Model caching | `@xenova/transformers` built-in Cache API | Custom IndexedDB adapter | The library automatically persists model weights across sessions. Satisfies "no re-download" without ~200 lines of binary-chunk IndexedDB glue. If strict IndexedDB compliance is required later, a custom fetch adapter can be added. |
| Clustering algorithm | Inline DBSCAN (~60 LOC) in `lib/topicClusterEngine.ts` | npm `density-clustering` | Fewer dependencies, full control over cosine distance metric, trivial to test with synthetic vectors. |
| Labeling | Central title (highest avg cosine similarity) for multi-item clusters; project title for singletons; "Sin tema claro" for noise | TF-IDF or LLM summary | Simple, deterministic, no extra deps. Works for short mixed ES/EN titles. |
| Persistence | Client-side delete-then-insert (3 roundtrips) | Supabase RPC function | Manual trigger makes 3 roundtrips acceptable. No server-side functions to maintain. ON DELETE CASCADE on junction table handles cleanup. |
| Component scope | Self-contained `TopicHeatmap` (button + viz) | Separate button component | Minimizes `page.tsx` changes to a single conditional render block. |

## Data Flow

    page.tsx
      ↓ session_id, week_start
    TopicHeatmap (UI + button)
      ↓ on click
    lib/topicClusters.ts (orchestrator)
      → Supabase: SELECT titles, profile_id, chef_name FROM projects
      → Spawn Worker
      → Post titles
    lib/workers/topicCluster.worker.ts
      → Load model (Cache API / CDN)
      → Embed titles (batch)
      → DBSCAN (cosine, ε=0.3, minPts=2)
      → Label clusters
      ← Post ClusterResult[]
    lib/topicClusters.ts
      → DELETE topic_clusters WHERE session_id + week_start
      → INSERT topic_clusters
      → INSERT topic_cluster_projects
      ← Return success
    TopicHeatmap
      ← Re-query clusters → render heatmap

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `sql/migrations/003_topic_clusters.sql` | Create | DDL + indexes + constraints |
| `lib/types.ts` | Modify | Add `TopicCluster`, `TopicClusterProject`, `ClusterResult`, `WorkerMessage` |
| `lib/topicClusterEngine.ts` | Create | Pure DBSCAN + labeling + confidence (testable, no model dep) |
| `lib/workers/topicCluster.worker.ts` | Create | Loads model, embeds, delegates to engine, posts results |
| `lib/topicClusters.ts` | Create | Orchestrator: query Supabase, manage worker, persist results |
| `components/host/TopicHeatmap.tsx` | Create | Button, progress UI, cluster visualization, Supabase query |
| `app/page.tsx` | Modify | Add `<TopicHeatmap sessionId weekStart isHost />` in host section |
| `package.json` | Modify | Add `@xenova/transformers` |

## Interfaces / Contracts

```ts
// lib/types.ts additions
export interface TopicCluster {
  id: string;
  session_id: string;
  week_start: string;
  theme_name: string;
  count: number;
  confidence: number;
  created_at: string;
}

export interface TopicClusterProject {
  id: string;
  topic_cluster_id: string;
  project_id: string;
  profile_id?: string | null;
  chef_name?: string | null;
}

export interface ClusterResult {
  theme_name: string;
  count: number;
  confidence: number;
  project_ids: string[];
  traceability: Array<{ project_id: string; profile_id: string | null; chef_name: string | null }>;
}

export type WorkerMessage =
  | { type: 'progress'; stage: 'download' | 'embed' | 'cluster'; progress: number }
  | { type: 'result'; clusters: ClusterResult[] }
  | { type: 'error'; message: string };
```

Worker contract:
- Input: `postMessage({ type: 'run', titles: Array<{id, text, profile_id?, chef_name?}> })`
- Output: `WorkerMessage` events

## Testing Strategy

| Layer | Target | Approach |
|-------|--------|----------|
| Unit | `topicClusterEngine.ts` | Synthetic 384-dim vectors. Test DBSCAN grouping, noise handling, labeling, confidence. |
| Unit | `topicClusters.ts` orchestrator | Mock `Worker` class and `supabase.from`. Verify message flow, DELETE/INSERT sequence, error handling. |
| Unit | `TopicHeatmap` | Mock `runClustering` promise. Test button visibility, progress states, empty/success/error UI. |
| Integration | End-to-end (no real model) | Optional: mock Worker globally in `vitest.setup.ts` to return fixture clusters. |
| E2E | Real model | Manual only. CI cannot download 80MB. |

## Migration / Rollout

1. Run `003_topic_clusters.sql` against Supabase.
2. No data migration — additive only.
3. Feature is invisible until host clicks button.

## Open Questions

- [ ] Confirm `ε=0.3` for DBSCAN cosine distance after testing with real titles (may need tuning).
- [ ] Verify Next.js 16 worker bundling in App Router during implementation (build test).
