/**
 * topicClusterEngine — Pure DBSCAN clustering for project titles.
 *
 * All computation is local; no network, no model dependency.
 * Testable with synthetic 384-dim vectors.
 *
 * DBSCAN parameters (per design):
 *   ε (epsilon)     = 0.3  (cosine distance threshold)
 *   minPts          = 2
 *   embedding_dim   = 384  (all-MiniLM-L6-v2)
 */

import type { ClusterResult } from './types';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Cluster project titles using DBSCAN on pre-computed embeddings.
 *
 * @param titles      - Array of {id, title} for projects in scope
 * @param embeddings  - Map of project_id → 384-dim embedding vector
 * @returns ClusterResult[] — one entry per input title
 */
export function clusterTitles(
  titles: { id: string; title: string }[],
  embeddings: Record<string, number[]>
): ClusterResult[] {
  if (titles.length === 0) return [];

  const vectors = titles.map(t => ({
    id: t.id,
    title: t.title,
    vec: embeddings[t.id] ?? [],
  }));

  // DBSCAN: assign cluster labels
  const { labels } = dbscan(vectors, EPSILON, MIN_PTS);

  // Post-process: if exactly 1 title total was marked noise, treat as singleton
  // cluster (per spec: "with 1: singleton cluster"). DBSCAN with minPts=2
  // always marks a single point as noise, but the spec expects a cluster.
  if (titles.length === 1 && labels[0] === NOISE) {
    labels[0] = 0; // singleton gets cluster 0 (doesn't matter which)
  }

  // Group by cluster_id (-1 = noise)
  const clusters = new Map<number, typeof vectors>();
  for (let i = 0; i < vectors.length; i++) {
    const cid = labels[i];
    if (!clusters.has(cid)) clusters.set(cid, []);
    clusters.get(cid)!.push(vectors[i]);
  }

  return vectors.map((v, i) => {
    const cid = labels[i];
    if (cid === NOISE) {
      return {
        project_id: v.id,
        cluster_label: 'Sin tema claro',
        confidence: 0,
        is_noise: true,
      };
    }

    const clusterVecs = clusters.get(cid)!;
    const label = computeClusterLabel(clusterVecs.map(x => x.title));
    const confidence = computeConfidence(v.vec, clusterVecs);

    return {
      project_id: v.id,
      cluster_label: label,
      confidence,
      is_noise: false,
    };
  });
}

// ─── Cosine Similarity ────────────────────────────────────────────────────────

const EMBEDDING_DIM = 384;

/**
 * Cosine similarity between two 384-dim vectors.
 * Returns 0 for zero/empty vectors (no direction).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < EMBEDDING_DIM; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }

  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  if (mag === 0) return 0;
  return dot / mag;
}

/** Cosine distance = 1 - similarity */
function cosineDist(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

// ─── DBSCAN ──────────────────────────────────────────────────────────────────

const NOISE = -1;
const UNCLASSIFIED = -2;
const EPSILON = 0.3; // cosine distance threshold
const MIN_PTS = 2;

interface DataPoint {
  id: string;
  title: string;
  vec: number[];
}

/**
 * Pure DBSCAN implementation using cosine distance.
 * Border points (1 neighbour) join the seed's cluster.
 * True noise: 0 neighbours within eps.
 * Singleton clusters arise when a point has exactly 1 neighbour that is
 * already part of a different cluster (border point logic handles this).
 *
 * Returns cluster labels array (same order as input).
 */
function dbscan(points: DataPoint[], eps: number, minPts: number): { labels: number[] } {
  const n = points.length;
  const labels = new Array<number>(n).fill(UNCLASSIFIED);
  let clusterId = 0;

  for (let i = 0; i < n; i++) {
    if (labels[i] !== UNCLASSIFIED) continue;

    const neighbours = regionQuery(points, i, eps);
    if (neighbours.length < minPts) {
      // 0 neighbours = true noise; 1 neighbour = border (handled in expandCluster)
      if (neighbours.length === 0) {
        labels[i] = NOISE;
      } else {
        // 1 neighbour: border point — expand to find its cluster
        expandCluster(points, labels, i, neighbours, clusterId, eps, minPts);
        clusterId++;
      }
    } else {
      // Core point: expand cluster
      expandCluster(points, labels, i, neighbours, clusterId, eps, minPts);
      clusterId++;
    }
  }

  return { labels };
}

function expandCluster(
  points: DataPoint[],
  labels: number[],
  pointIdx: number,
  neighbours: number[],
  clusterId: number,
  eps: number,
  minPts: number
): void {
  labels[pointIdx] = clusterId;
  const queue = [...neighbours];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (labels[current] === NOISE) {
      labels[current] = clusterId; // noise becomes border point
    }
    if (labels[current] !== UNCLASSIFIED) continue; // already classified

    labels[current] = clusterId;
    const currentNeighbours = regionQuery(points, current, eps);
    if (currentNeighbours.length >= minPts) {
      // Merge new neighbours
      for (const n of currentNeighbours) {
        if (labels[n] === UNCLASSIFIED || labels[n] === NOISE) {
          queue.push(n);
        }
      }
    }
  }
}

/**
 * Find all points within eps (cosine distance) of pointIdx.
 */
function regionQuery(points: DataPoint[], pointIdx: number, eps: number): number[] {
  const neighbours: number[] = [];
  const pVec = points[pointIdx].vec;
  for (let i = 0; i < points.length; i++) {
    if (i === pointIdx) continue;
    if (cosineDist(pVec, points[i].vec) <= eps) {
      neighbours.push(i);
    }
  }
  return neighbours;
}

// ─── Labeling ─────────────────────────────────────────────────────────────────

/**
 * Compute cluster label from member titles.
 * Strategy: most frequent content words (length >= 3), up to 3 words.
 */
function computeClusterLabel(titles: string[]): string {
  if (titles.length === 0) return 'Sin tema claro';
  if (titles.length === 1) return titles[0];

  // Tokenize and count word frequencies
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'eles', 'con', 'los', 'las', 'del']);
  const counts = new Map<string, number>();

  for (const title of titles) {
    const words = title.toLowerCase().split(/\s+/);
    for (const w of words) {
      const cleaned = w.replace(/[^a-z0-9]/g, '');
      if (cleaned.length >= 3 && !stopWords.has(cleaned)) {
        counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
      }
    }
  }

  if (counts.size === 0) return titles[0]; // fallback

  // Sort by frequency desc, then alphabetically
  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const topWords = sorted.slice(0, 3).map(([w]) => w);
  return topWords.join(' ');
}

// ─── Confidence ──────────────────────────────────────────────────────────────

/**
 * Confidence = average cosine similarity to cluster centroid.
 * For singleton: 1.0 (perfect confidence in its own label).
 * For noise: 0 (handled before calling this).
 */
function computeConfidence(
  vec: number[],
  clusterVecs: DataPoint[]
): number {
  if (clusterVecs.length === 1) return 1.0;

  // Compute centroid
  const centroid = new Array(EMBEDDING_DIM).fill(0);
  for (const cv of clusterVecs) {
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      centroid[i] += cv.vec[i] ?? 0;
    }
  }
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    centroid[i] /= clusterVecs.length;
  }

  const sim = cosineSimilarity(vec, centroid);
  // Normalize to [0, 1] — cosine similarity is already in [-1, 1]
  return Math.max(0, (sim + 1) / 2);
}
