/**
 * topicCluster.worker — Web Worker for topic clustering
 *
 * Runs entirely in the worker thread:
 *   1. Load @xenova/transformers model (cached in IndexedDB)
 *   2. Generate embeddings for project titles
 *   3. Run DBSCAN clustering
 *   4. Post results back to main thread
 *
 * Privacy: embeddings NEVER leave the browser.
 */

self.onmessage = async function handler(event) {
  const { type, titles } = event.data;

  if (type !== 'run') return;

  try {
    // ─── Stage 1: Load model ────────────────────────────────────────────────
    postProgress('loading', 0);

    const { pipeline, env } = await import('@xenova/transformers');

    // Enable IndexedDB caching (persistent across sessions)
    env.cacheDir = 'indexeddb://xenova-transformers';

    const extractor = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { progress_callback: (progress) => {
          if (progress.status === 'progress' && progress.total) {
            postProgress('loading', Math.round(progress.index / progress.total * 50));
          }
        }
      }
    );

    postProgress('loading', 50);

    // ─── Stage 2: Embed titles ──────────────────────────────────────────────
    postProgress('embedding', 50);

    const texts = titles.map(t => t.title);
    const embeddingsOutput = await extractor(texts, {
      pooling: 'mean',
      normalize: true,
    });

    // embeddingsOutput is a 2D array: [num_titles, embedding_dim]
    const embeddingsArray = embeddingsOutput.tolist
      ? embeddingsOutput.tolist()   // Tensor object
      : embeddingsOutput;            // plain array

    const embeddings = {};
    titles.forEach((t, i) => {
      embeddings[t.id] = embeddingsArray[i];
    });

    postProgress('embedding', 90);

    // ─── Stage 3: Cluster (pure JS — DBSCAN) ───────────────────────────────
    postProgress('clustering', 90);

    // Inline DBSCAN to avoid module import complexity in worker
    const { labels } = dbscanCosine(titles, embeddings, 0.3, 2);

    // ─── Stage 4: Build results ─────────────────────────────────────────────
    const clusters = buildClusters(titles, embeddings, labels);

    self.postMessage({ type: 'result', results: clusters });

  } catch (error) {
    self.postMessage({ type: 'error', error: error.message ?? String(error) });
  }
};

function postProgress(stage, progress) {
  self.postMessage({ type: 'progress', stage, progress });
}

// ─── DBSCAN (inline, pure cosine distance) ────────────────────────────────────

const NOISE = -1;
const UNCLASSIFIED = -2;

function dbscanCosine(titles, embeddings, eps, minPts) {
  const n = titles.length;
  const labels = new Array(n).fill(UNCLASSIFIED);
  let clusterId = 0;

  for (let i = 0; i < n; i++) {
    if (labels[i] !== UNCLASSIFIED) continue;
    const neighbours = regionQuery(titles, embeddings, i, eps);
    if (neighbours.length < minPts) {
      if (neighbours.length === 0) {
        labels[i] = NOISE;
      } else {
        expandCluster(titles, embeddings, labels, i, neighbours, clusterId, eps, minPts);
        clusterId++;
      }
    } else {
      expandCluster(titles, embeddings, labels, i, neighbours, clusterId, eps, minPts);
      clusterId++;
    }
  }

  // Singleton post-process: 1 title marked noise → its own cluster
  if (n === 1 && labels[0] === NOISE) {
    labels[0] = 0;
  }

  return { labels };
}

function expandCluster(titles, embeddings, labels, pointIdx, neighbours, clusterId, eps, minPts) {
  labels[pointIdx] = clusterId;
  const queue = [...neighbours];

  while (queue.length > 0) {
    const current = queue.shift();
    if (labels[current] === NOISE) {
      labels[current] = clusterId;
    }
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

function regionQuery(titles, embeddings, pointIdx, eps) {
  const neighbours = [];
  const pVec = embeddings[titles[pointIdx].id];
  for (let i = 0; i < titles.length; i++) {
    if (i === pointIdx) continue;
    const oVec = embeddings[titles[i].id];
    if (cosineDist(pVec, oVec) <= eps) {
      neighbours.push(i);
    }
  }
  return neighbours;
}

function cosineDist(a, b) {
  return 1 - cosineSim(a, b);
}

function cosineSim(a, b) {
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

function buildClusters(titles, embeddings, labels) {
  // Group by cluster_id
  const clusterMap = new Map();
  for (let i = 0; i < labels.length; i++) {
    const cid = labels[i];
    if (!clusterMap.has(cid)) clusterMap.set(cid, []);
    clusterMap.get(cid).push(i);
  }

  const results = [];

  for (let i = 0; i < titles.length; i++) {
    const cid = labels[i];
    const vec = embeddings[titles[i].id];

    if (cid === NOISE) {
      results.push({
        project_id: titles[i].id,
        cluster_label: 'Sin tema claro',
        confidence: 0,
        is_noise: true,
      });
      continue;
    }

    const memberIndices = clusterMap.get(cid);
    const memberTitles = memberIndices.map(idx => titles[idx].title);
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

function computeLabel(titles) {
  if (titles.length === 0) return 'Sin tema claro';
  if (titles.length === 1) return titles[0];

  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'eles', 'con', 'los', 'las', 'del']);
  const counts = new Map();

  for (const title of titles) {
    const words = title.toLowerCase().split(/\s+/);
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

function computeConfidence(vec, memberIndices, titles, embeddings) {
  if (memberIndices.length === 1) return 1.0;

  const EMBEDDING_DIM = 384;
  const centroid = new Array(EMBEDDING_DIM).fill(0);
  for (const idx of memberIndices) {
    const mVec = embeddings[titles[idx].id];
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
