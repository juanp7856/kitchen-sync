/**
 * topicClusters — Orchestrator for semantic clustering (main thread).
 *
 * Pipeline:
   *   1. Dynamic import @huggingface/transformers (lazy loaded)
 *   2. Generate embeddings for project titles
 *   3. Run DBSCAN clustering
 *   4. Persist to Supabase (if session-specific)
 */

import { supabase } from './supabase';
import type { ClusterResult, TopicCluster, TopicClusterProject } from './types';

export { runClustering };

interface RunClusteringOptions {
  sessionId: string | null; // null = global historical analysis
  weekStart: string;
}

type ProgressCallback = (stage: 'loading' | 'embedding' | 'clustering', progress: number) => void;

/**
 * Run the full clustering pipeline in the main thread.
 */
async function runClustering(
  titles: { id: string; title: string }[],
  options: RunClusteringOptions,
  onProgress?: ProgressCallback
): Promise<ClusterResult[]> {
  const { sessionId, weekStart } = options;

  if (titles.length === 0) return [];

  // ─── Stage 1: Load model (lazy dynamic import) ────────────────────────────
  onProgress?.('loading', 0);

  const { pipeline } = await import('@huggingface/transformers');

  const extractor = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2',
    {
      dtype: 'fp32',
      progress_callback: (progress: any) => {
        if (progress.status === 'progress' && progress.total) {
          const pct = Math.round((progress.loaded / progress.total) * 50);
          onProgress?.('loading', pct);
        }
      }
    }
  );

  onProgress?.('loading', 50);

  // ─── Stage 2: Embed titles ────────────────────────────────────────────────
  onProgress?.('embedding', 50);

  const texts = titles.map(t => t.title).filter(Boolean);
  const embeddingsOutput = await extractor(texts, {
    pooling: 'mean',
    normalize: true,
  });

  let embeddingsArray;
  if (embeddingsOutput && typeof embeddingsOutput.tolist === 'function') {
    embeddingsArray = embeddingsOutput.tolist();
  } else if (Array.isArray(embeddingsOutput)) {
    embeddingsArray = embeddingsOutput;
  } else {
    throw new Error('Unexpected embeddings output format');
  }

  if (!Array.isArray(embeddingsArray[0])) {
    embeddingsArray = [embeddingsArray];
  }

  const embeddings: Record<string, number[]> = {};
  for (let i = 0; i < titles.length; i++) {
    if (embeddingsArray[i]) {
      embeddings[titles[i].id] = embeddingsArray[i];
    }
  }

  onProgress?.('embedding', 90);

  // ─── Stage 3: Cluster ───────────────────────────────────────────────────────
  onProgress?.('clustering', 90);

  const { labels } = dbscanCosine(titles, embeddings, 0.3, 2);
  const results = buildClusters(titles, embeddings, labels);

  // ─── Stage 4: Persist ────────────────────────────────────────────────────
  await persistResults(results, titles, sessionId, weekStart);

  return results;
}

// ─── DBSCAN (pure JS, cosine distance) ────────────────────────────────────────

const NOISE = -1;
const UNCLASSIFIED = -2;

function dbscanCosine(
  titles: { id: string; title: string }[],
  embeddings: Record<string, number[]>,
  eps: number,
  minPts: number
) {
  const n = titles.length;
  const labels = new Array(n).fill(UNCLASSIFIED);
  let clusterId = 0;

  for (let i = 0; i < n; i++) {
    if (labels[i] !== UNCLASSIFIED) continue;
    const neighbours = regionQuery(titles, embeddings, i, eps);
    if (neighbours.length < minPts) {
      labels[i] = NOISE;
    } else {
      expandCluster(titles, embeddings, labels, i, neighbours, clusterId, eps, minPts);
      clusterId++;
    }
  }

  if (n === 1 && labels[0] === NOISE) labels[0] = 0;
  return { labels };
}

function expandCluster(
  titles: { id: string; title: string }[],
  embeddings: Record<string, number[]>,
  labels: number[],
  pointIdx: number,
  neighbours: number[],
  clusterId: number,
  eps: number,
  minPts: number
) {
  labels[pointIdx] = clusterId;
  const queue = [...neighbours];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (labels[current] === NOISE) labels[current] = clusterId;
    if (labels[current] !== UNCLASSIFIED) continue;

    labels[current] = clusterId;
    const currentNeighbours = regionQuery(titles, embeddings, current, eps);
    if (currentNeighbours.length >= minPts) {
      for (const n of currentNeighbours) {
        if (labels[n] === UNCLASSIFIED || labels[n] === NOISE) {
          queue.push(n);
        }
      }
    }
  }
}

function regionQuery(
  titles: { id: string; title: string }[],
  embeddings: Record<string, number[]>,
  pointIdx: number,
  eps: number
) {
  const neighbours: number[] = [];
  const pVec = embeddings[titles[pointIdx]?.id];
  if (!pVec) return neighbours;

  for (let i = 0; i < titles.length; i++) {
    if (i === pointIdx) continue;
    const oVec = embeddings[titles[i]?.id];
    if (!oVec) continue;
    if (cosineDist(pVec, oVec) <= eps) {
      neighbours.push(i);
    }
  }
  return neighbours;
}

function cosineDist(a: number[], b: number[]) {
  return 1 - cosineSim(a, b);
}

function cosineSim(a: number[], b: number[]) {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  let dot = 0, magA = 0, magB = 0;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

// ─── Result builder ──────────────────────────────────────────────────────────

function buildClusters(
  titles: { id: string; title: string }[],
  embeddings: Record<string, number[]>,
  labels: number[]
): ClusterResult[] {
  const clusterMap = new Map<number, number[]>();
  for (let i = 0; i < labels.length; i++) {
    const cid = labels[i];
    if (!clusterMap.has(cid)) clusterMap.set(cid, []);
    clusterMap.get(cid)!.push(i);
  }

  const results: ClusterResult[] = [];
  for (let i = 0; i < titles.length; i++) {
    const cid = labels[i];
    const vec = embeddings[titles[i]?.id];

    if (cid === NOISE) {
      results.push({
        project_id: titles[i].id,
        cluster_label: titles[i].title,
        confidence: 1.0,
        is_noise: true,
      });
      continue;
    }

    const memberIndices = clusterMap.get(cid)!;
    const memberTitles = memberIndices.map(idx => titles[idx]?.title).filter(Boolean);
    const label = computeLabel(memberTitles);
    const confidence = computeConfidence(vec, memberIndices, titles, embeddings);

    results.push({
      project_id: titles[i].id,
      cluster_label: label,
      confidence,
      is_noise: false,
    });
  }
  return results;
}

function computeLabel(titles: string[]) {
  if (titles.length === 0) return 'Sin tema claro';
  if (titles.length === 1) return titles[0];

  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'con', 'los', 'las', 'del', 'fix', 'bug']);
  const counts = new Map<string, number>();

  for (const title of titles) {
    const words = String(title).toLowerCase().split(/\s+/);
    for (const w of words) {
      const cleaned = w.replace(/[^a-z0-9]/g, '');
      if (cleaned.length >= 3 && !stopWords.has(cleaned)) {
        counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
      }
    }
  }

  if (counts.size === 0) return titles[0];

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted.slice(0, 3).map(([w]) => w).join(' ');
}

function computeConfidence(
  vec: number[] | undefined,
  memberIndices: number[],
  titles: { id: string; title: string }[],
  embeddings: Record<string, number[]>
) {
  if (memberIndices.length === 1) return 1.0;
  if (!vec) return 0;

  const EMBEDDING_DIM = 384;
  const centroid = new Array(EMBEDDING_DIM).fill(0);
  for (const idx of memberIndices) {
    const mVec = embeddings[titles[idx]?.id];
    if (!mVec) continue;
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      centroid[i] += mVec[i] ?? 0;
    }
  }
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    centroid[i] /= memberIndices.length;
  }

  const sim = cosineSim(vec, centroid);
  return Math.max(0, (sim + 1) / 2);
}

// ─── Persistence ───────────────────────────────────────────────────────────────

async function persistResults(
  results: ClusterResult[],
  titles: { id: string; title: string }[],
  sessionId: string | null,
  weekStart: string
): Promise<void> {
  if (results.length === 0) return;

  const isGlobal = sessionId === null;
  const clusterMap = new Map<string, ClusterResult[]>();
  for (const r of results) {
    if (!clusterMap.has(r.cluster_label)) {
      clusterMap.set(r.cluster_label, []);
    }
    clusterMap.get(r.cluster_label)!.push(r);
  }

  // DELETE existing clusters for this week (session-specific or global)
  let deleteQuery = supabase
    .from('topic_clusters')
    .delete()
    .eq('week_start', weekStart);
  
  if (isGlobal) {
    deleteQuery = deleteQuery.eq('is_global', true);
  } else {
    deleteQuery = deleteQuery.eq('session_id', sessionId);
  }

  const { error: deleteError } = await deleteQuery;

  if (deleteError) throw new Error(`Failed to delete old clusters: ${deleteError.message}`);

  // INSERT new clusters
  const clusters = Array.from(clusterMap.entries()).map(([theme_label, members]) => ({
    id: crypto.randomUUID(),
    session_id: sessionId,
    week_start: weekStart,
    theme_label,
    confidence: members.reduce((sum, m) => sum + m.confidence, 0) / members.length,
    project_count: members.length,
    is_global: isGlobal,
  }));

  const { error: insertClusterError } = await supabase
    .from('topic_clusters')
    .insert(clusters);

  if (insertClusterError) throw new Error(`Failed to insert clusters: ${insertClusterError.message}`);

  // Fetch project metadata for linking
  const projectIds = titles.map(t => t.id);
  const { data: projectsData, error: projectsError } = await supabase
    .from('projects')
    .select('id, profile_id, chef_id')
    .in('id', projectIds);

  if (projectsError) throw new Error(`Failed to fetch project data: ${projectsError.message}`);

  const projectMeta = new Map(
    (projectsData ?? []).map(p => [p.id, { profile_id: p.profile_id, chef_id: p.chef_id }])
  );

  const links: TopicClusterProject[] = [];
  for (const cluster of clusters) {
    const members = clusterMap.get(cluster.theme_label)!;
    for (const member of members) {
      const meta = projectMeta.get(member.project_id);
      if (!meta) continue;

      links.push({
        topic_cluster_id: cluster.id,
        project_id: member.project_id,
        profile_id: meta.profile_id ?? null,
        chef_name: meta.chef_id ?? null,
      });
    }
  }

  const { error: insertLinkError } = await supabase
    .from('topic_cluster_projects')
    .insert(links);

  if (insertLinkError) throw new Error(`Failed to insert cluster links: ${insertLinkError.message}`);
}
