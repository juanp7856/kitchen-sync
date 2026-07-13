// Inline worker code for topic clustering — avoids Turbopack bundling issues
// This string is injected into a Blob URL to create the Web Worker at runtime

export const WORKER_CODE = `
self.onmessage = async function handler(event) {
  const { type, titles } = event.data;
  if (type !== 'run') return;

  try {
    if (!titles || !Array.isArray(titles) || titles.length === 0) {
      throw new Error('No titles provided for clustering');
    }

    postProgress('loading', 0);

    // Load @xenova/transformers from CDN
    const { pipeline, env } = await import('https://esm.sh/@xenova/transformers@2.17.2');
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    const extractor = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { 
        dtype: 'fp32',
        progress_callback: (progress) => {
          if (progress.status === 'progress' && progress.total) {
            const pct = Math.round((progress.loaded / progress.total) * 50);
            postProgress('loading', pct);
          }
        }
      }
    );

    postProgress('loading', 50);
    postProgress('embedding', 50);

    const texts = titles.map(t => t.title).filter(Boolean);
    if (texts.length === 0) throw new Error('No valid titles to embed');

    const embeddingsOutput = await extractor(texts, { pooling: 'mean', normalize: true });

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

    const embeddings = {};
    for (let i = 0; i < titles.length; i++) {
      if (embeddingsArray[i]) embeddings[titles[i].id] = embeddingsArray[i];
    }

    postProgress('embedding', 90);
    postProgress('clustering', 90);

    const { labels } = dbscanCosine(titles, embeddings, 0.3, 2);
    const clusters = buildClusters(titles, embeddings, labels);

    self.postMessage({ type: 'result', results: clusters });

  } catch (error) {
    console.error('Worker error:', error);
    self.postMessage({ type: 'error', error: error?.message ?? String(error) });
  }
};

function postProgress(stage, progress) {
  self.postMessage({ type: 'progress', stage, progress });
}

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
      labels[i] = NOISE;
    } else {
      expandCluster(titles, embeddings, labels, i, neighbours, clusterId, eps, minPts);
      clusterId++;
    }
  }

  if (n === 1 && labels[0] === NOISE) labels[0] = 0;
  return { labels };
}

function expandCluster(titles, embeddings, labels, pointIdx, neighbours, clusterId, eps, minPts) {
  labels[pointIdx] = clusterId;
  const queue = [...neighbours];
  while (queue.length > 0) {
    const current = queue.shift();
    if (labels[current] === NOISE) labels[current] = clusterId;
    if (labels[current] !== UNCLASSIFIED) continue;
    labels[current] = clusterId;
    const currentNeighbours = regionQuery(titles, embeddings, current, eps);
    if (currentNeighbours.length >= minPts) {
      for (const n of currentNeighbours) {
        if (labels[n] === UNCLASSIFIED || labels[n] === NOISE) queue.push(n);
      }
    }
  }
}

function regionQuery(titles, embeddings, pointIdx, eps) {
  const neighbours = [];
  const pVec = embeddings[titles[pointIdx]?.id];
  if (!pVec) return neighbours;
  for (let i = 0; i < titles.length; i++) {
    if (i === pointIdx) continue;
    const oVec = embeddings[titles[i]?.id];
    if (!oVec) continue;
    if (cosineDist(pVec, oVec) <= eps) neighbours.push(i);
  }
  return neighbours;
}

function cosineDist(a, b) {
  return 1 - cosineSim(a, b);
}

function cosineSim(a, b) {
  if (!a || !b || !Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length === 0 || b.length === 0) return 0;
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

function buildClusters(titles, embeddings, labels) {
  const clusterMap = new Map();
  for (let i = 0; i < labels.length; i++) {
    const cid = labels[i];
    if (!clusterMap.has(cid)) clusterMap.set(cid, []);
    clusterMap.get(cid).push(i);
  }

  const results = [];
  for (let i = 0; i < titles.length; i++) {
    const cid = labels[i];
    const vec = embeddings[titles[i]?.id];
    if (cid === NOISE) {
      results.push({ project_id: titles[i].id, cluster_label: titles[i].title, confidence: 1.0, is_noise: true });
      continue;
    }
    const memberIndices = clusterMap.get(cid);
    const memberTitles = memberIndices.map(idx => titles[idx]?.title).filter(Boolean);
    const label = computeLabel(memberTitles);
    const confidence = computeConfidence(vec, memberIndices, titles, embeddings);
    results.push({ project_id: titles[i].id, cluster_label: label, confidence, is_noise: false });
  }
  return results;
}

function computeLabel(titles) {
  if (titles.length === 0) return 'Sin tema claro';
  if (titles.length === 1) return titles[0];
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'con', 'los', 'las', 'del', 'fix', 'bug']);
  const counts = new Map();
  for (const title of titles) {
    const words = String(title).toLowerCase().split(/\\s+/);
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
    const mVec = embeddings[titles[idx]?.id];
    if (!mVec || !Array.isArray(mVec)) continue;
    for (let i = 0; i < EMBEDDING_DIM; i++) centroid[i] += mVec[i] ?? 0;
  }
  for (let i = 0; i < EMBEDDING_DIM; i++) centroid[i] /= memberIndices.length;
  const sim = cosineSim(vec, centroid);
  return Math.max(0, (sim + 1) / 2);
}
`;
