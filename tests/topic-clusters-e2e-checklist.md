# Manual E2E Validation Checklist — Topic Clusters

## Purpose
Validate the full topic clustering pipeline end-to-end using the real `all-MiniLM-L6-v2` model (~80MB). This is **NOT automated** due to model size.

---

## Prerequisites

1. Run SQL migration in Supabase:
   ```sql
   -- Apply sql/migrations/003_topic_clusters.sql
   ```

2. Ensure `@xenova/transformers` is installed:
   ```bash
   npm install
   ```

3. Ensure the app runs without errors:
   ```bash
   npm run dev
   ```

---

## Validation Steps

### Step 1: Host Sees Button, Non-Host Does Not

- [ ] **a.** Login as a non-host chef (regular user)
- [ ] **b.** Open the Kitchen page — verify NO "🔥 Analizar temas" button is visible
- [ ] **c.** Login as the host (Maître)
- [ ] **d.** Open the Kitchen page — verify "🔥 Analizar temas" button IS visible

### Step 2: First Run — Model Download

- [ ] **a.** As host, click "🔥 Analizar temas" with ≥3 projects
- [ ] **b.** Verify progress bar shows "Descargando modelo..." (loading stage)
- [ ] **c.** Network tab: verify model is downloaded from CDN (Xenova/transformers HuggingFace CDN)
- [ ] **d.** After download, progress shows "Generando embeddings..."
- [ ] **e.** After embeddings, progress shows "Agrupando temas..."
- [ ] **f.** After completion, clusters appear with theme labels

### Step 3: Embeddings Stay Local (Privacy Check)

- [ ] **a.** Open browser DevTools → Network tab
- [ ] **b.** Run clustering on a session with projects
- [ ] **c.** Verify: NO request to any endpoint contains embedding vectors
- [ ] **d.** Verify: only Supabase queries and model CDN requests appear
- [ ] **e.** Supabase network requests should contain only cluster results (IDs, labels, confidence)

### Step 4: Semantic Clustering Quality

- [ ] **a.** Create projects with similar titles:
  - "Fix AOD login bug"
  - "AOD integration steps"
  - "CLAIMS dashboard"
  - "CLAIMS pie chart view"
  - "Inventory tracker"
- [ ] **b.** Run clustering
- [ ] **c.** Verify: "AOD" titles cluster together (2 projects)
- [ ] **d.** Verify: "CLAIMS" titles cluster together (2 projects)
- [ ] **e.** Verify: "Inventory" is its own singleton cluster or noise

### Step 5: Model Caching (Second Run)

- [ ] **a.** After Step 2 completes, close the tab
- [ ] **b.** Reopen the app (same browser)
- [ ] **c.** Click "🔥 Analizar temas" again
- [ ] **d.** Verify: progress shows "Cargando modelo..." but with fast completion (< 2s)
- [ ] **e.** Network tab: verify NO model download request (cached in IndexedDB)

### Step 6: Re-Execution Replaces Week's Clusters

- [ ] **a.** Run clustering → note the number of clusters
- [ ] **b.** Run clustering again (same week)
- [ ] **c.** Verify: clusters are replaced (same session_id + week_start)
- [ ] **d.** Check Supabase `topic_clusters` table — only new clusters exist (old deleted)

### Step 7: Different Weeks Coexist

- [ ] **a.** Run clustering in current week
- [ ] **b.** Manually insert a cluster from a previous week via Supabase:
  ```sql
  INSERT INTO topic_clusters (id, session_id, week_start, theme_label, confidence, project_count)
  VALUES ('prev-week-cluster', 'your-session-id', '2026-07-06', 'Legacy Theme', 0.75, 1);
  ```
- [ ] **c.** Run clustering for current week again
- [ ] **d.** Verify: previous week's cluster still exists, new clusters added

### Step 8: Singleton and Noise Handling

- [ ] **a.** Create a session with only 1 project: "Solo project"
- [ ] **b.** Run clustering
- [ ] **c.** Verify: result shows the project with its own title as cluster label
- [ ] **d.** Create a session with 2 projects with unrelated titles: "Fix AOD" and "CLAIMS dashboard"
- [ ] **e.** Run clustering
- [ ] **f.** Verify: each project gets its own cluster (not noise)

### Step 9: Empty State

- [ ] **a.** Create a session with 0 projects (or delete all projects)
- [ ] **b.** Click "🔥 Analizar temas"
- [ ] **c.** Verify: "No hay platos para analizar" message appears

### Step 10: Error State / Retry

- [ ] **a.** Simulate a failure by disabling network mid-run (or use browser DevTools to block requests)
- [ ] **b.** Click "🔥 Analizar temas"
- [ ] **c.** Verify: error message appears with retry option
- [ ] **d.** Re-enable network and retry
- [ ] **e.** Verify: clustering completes successfully

---

## Expected Results Summary

| Checkpoint | Expected |
|------------|----------|
| Button visibility | Host: visible; Non-host: hidden |
| Model download | First run: ~80MB download from CDN |
| Embeddings | Never leave browser |
| Cluster quality | Similar titles grouped semantically |
| Model cache | Second run: instant (IndexedDB hit) |
| Re-execution | Replaces same-week clusters |
| Different weeks | Coexist independently |
| Singleton | Own cluster with own title |
| Empty state | "No hay platos para analizar" |
| Error state | Error message + retry option |

---

## Rollback / Cleanup

If validation reveals issues:

```sql
-- Remove all clusters for a session
DELETE FROM topic_clusters WHERE session_id = 'your-session-id';
```

Or drop the tables entirely:
```sql
DROP TABLE IF EXISTS public.topic_cluster_projects;
DROP TABLE IF EXISTS public.topic_clusters;
```
