/**
 * topicClusters — Orchestrator for weekly semantic clustering.
 *
 * Pipeline:
 *   1. Query projects (id, title, profile_id, chef_name) from Supabase
 *   2. Spawn Web Worker with project titles
 *   3. Receive ClusterResult[] from worker (embeddings never leave browser)
 *   4. DELETE existing clusters for (session_id, week_start)
 *   5. INSERT fresh clusters + project links into Supabase
 *   6. Return fresh cluster results
 */

import { supabase } from './supabase';
import type { ClusterResult, TopicCluster, TopicClusterProject } from './types';

export { runClustering };

interface RunClusteringOptions {
  sessionId: string;
  weekStart: string; // ISO date (Monday)
}

type ProgressCallback = (stage: 'loading' | 'embedding' | 'clustering', progress: number) => void;

/**
 * Run the full clustering pipeline.
 * Returns fresh TopicCluster[] after persisting to Supabase.
 *
 * @param titles — Array of {id, title} for projects in scope
 * @param options — { sessionId, weekStart }
 * @param onProgress — Optional callback for progress updates
 */
async function runClustering(
  titles: { id: string; title: string }[],
  options: RunClusteringOptions,
  onProgress?: ProgressCallback
): Promise<ClusterResult[]> {
  const { sessionId, weekStart } = options;

  // ─── Edge case: empty ───────────────────────────────────────────────────────
  if (titles.length === 0) return [];

  // ─── Spawn worker ───────────────────────────────────────────────────────────
  const worker = new Worker(
    new URL('../public/workers/topicCluster.worker.js', import.meta.url)
  );

  return new Promise<ClusterResult[]>((resolve, reject) => {
    worker.onmessage = async (event) => {
      const msg = event.data;

      if (msg.type === 'progress') {
        onProgress?.(msg.stage, msg.progress);
        return;
      }

      if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.error));
        return;
      }

      if (msg.type === 'result') {
        worker.terminate();
        const results: ClusterResult[] = msg.results;

        // ─── Persist to Supabase ────────────────────────────────────────────
        await persistResults(results, titles, sessionId, weekStart);

        resolve(results);
        return;
      }
    };

    worker.onerror = (error) => {
      worker.terminate();
      reject(new Error(error.message ?? 'Worker error'));
    };

    // Start the worker
    worker.postMessage({ type: 'run', titles });
  });
}

/**
 * Persist clustering results to Supabase.
 * Uses DELETE + INSERT strategy for weekly replacement (same session_id + week_start).
 */
async function persistResults(
  results: ClusterResult[],
  titles: { id: string; title: string }[],
  sessionId: string,
  weekStart: string
): Promise<void> {
  if (results.length === 0) return;

  // Group results by cluster_label to build TopicCluster rows
  const clusterMap = new Map<string, ClusterResult[]>();
  for (const r of results) {
    if (!clusterMap.has(r.cluster_label)) {
      clusterMap.set(r.cluster_label, []);
    }
    clusterMap.get(r.cluster_label)!.push(r);
  }

  // ─── DELETE existing clusters for this week ───────────────────────────────
  const { error: deleteError } = await supabase
    .from('topic_clusters')
    .delete()
    .eq('session_id', sessionId)
    .eq('week_start', weekStart);

  if (deleteError) throw new Error(`Failed to delete old clusters: ${deleteError.message}`);

  // ─── INSERT new clusters ─────────────────────────────────────────────────
  const clusters: TopicCluster[] = Array.from(clusterMap.entries()).map(([theme_label, members]) => ({
    id: crypto.randomUUID(),
    session_id: sessionId,
    week_start: weekStart,
    theme_label,
    confidence: members.reduce((sum, m) => sum + m.confidence, 0) / members.length,
    project_count: members.length,
  }));

  const { error: insertClusterError } = await supabase
    .from('topic_clusters')
    .insert(clusters);

  if (insertClusterError) throw new Error(`Failed to insert clusters: ${insertClusterError.message}`);

  // ─── INSERT project links ─────────────────────────────────────────────────
  // We need profile_id/chef_name from the original projects query.
  // Re-query to get full project data with profile linkage.
  const { data: projectsData, error: projectsError } = await supabase
    .from('projects')
    .select('id, profile_id, chef_id')
    .eq('session_id', sessionId);

  if (projectsError) throw new Error(`Failed to fetch project data: ${projectsError.message}`);

  const projectMeta = new Map(
    (projectsData ?? []).map(p => [p.id, { profile_id: p.profile_id, chef_id: p.chef_id }])
  );

  const links: TopicClusterProject[] = [];
  for (const cluster of clusters) {
    const members = clusterMap.get(cluster.theme_label)!;
    for (const member of members) {
      const meta = projectMeta.get(member.project_id);
      if (!meta) continue; // shouldn't happen

      // Mixed traceability: use profile_id if available, chef_name (chef_id) otherwise
      const profile_id = meta.profile_id ?? null;
      const chef_name = meta.chef_id ?? null; // chef_id is stored as chef_name in legacy projects

      links.push({
        topic_cluster_id: cluster.id,
        project_id: member.project_id,
        profile_id,
        chef_name,
      });
    }
  }

  const { error: insertLinkError } = await supabase
    .from('topic_cluster_projects')
    .insert(links);

  if (insertLinkError) throw new Error(`Failed to insert cluster links: ${insertLinkError.message}`);
}
