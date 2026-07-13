import { describe, it, expect } from 'vitest';
import { clusterTitles, cosineSimilarity } from '@/lib/topicClusterEngine';
import type { ClusterResult } from '@/lib/types';

// ─── Synthetic 384-dim vector helpers ─────────────────────────────────────────

/** Create a 384-dim zero vector (sparse representation — zeros are implicit). */
function zeroVec(): number[] {
  return [];
}

/** Create a 384-dim vector with value v at index i. */
function sparseVec(i: number, v: number): number[] {
  const vec: number[] = new Array(384).fill(0);
  vec[i] = v;
  return vec;
}

/**
 * Create two vectors with controlled cosine similarity.
 * dot = v1[100]*v2[100] + v1[200]*v2[200]
 * magnitude = sqrt(v1[100]^2 + v1[200]^2)
 * cos_sim = dot / (mag1 * mag2)
 *
 * v1 = [a at idx100, b at idx200]
 * v2 = [a at idx100, b at idx200] → cos_sim = 1.0 (identical)
 * v2 = [a at idx100, -b at idx200] → cos_sim depends on ratio
 */
function makePair(
  idx1: number, v1: number,
  idx2: number, v2: number
): [number[], number[]] {
  const vA: number[] = new Array(384).fill(0);
  const vB: number[] = new Array(384).fill(0);
  vA[idx1] = v1;
  vB[idx1] = v1; // same value at same index
  vA[idx2] = v2;
  vB[idx2] = v2;
  return [vA, vB];
}

describe('topicClusterEngine', () => {
  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical non-zero vectors', () => {
      const [v1, v2] = makePair(50, 0.8, 150, 0.6);
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 4);
    });

    it('should return 0.0 for orthogonal vectors', () => {
      const v1: number[] = new Array(384).fill(0);
      const v2: number[] = new Array(384).fill(0);
      v1[0] = 1;
      v2[1] = 1; // different indices
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(0.0, 4);
    });

    it('should return -1.0 for opposite vectors', () => {
      const v1: number[] = new Array(384).fill(0);
      const v2: number[] = new Array(384).fill(0);
      v1[0] = 0.5;
      v2[0] = -0.5;
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1.0, 4);
    });

    it('should handle zero vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
      expect(cosineSimilarity([], [1, 2, 3])).toBe(0);
    });
  });

  describe('clusterTitles — DBSCAN with ε=0.3, minPts=2', () => {
    it('should group similar titles into the same cluster', () => {
      // 4 titles, pairs are semantically similar (high cosine sim)
      const titles = [
        { id: 'p1', title: 'Fix AOD login bug' },
        { id: 'p2', title: 'AOD integration steps' },
        { id: 'p3', title: 'CLAIMS.AI dashboard' },
        { id: 'p4', title: 'CLAIMS pie chart view' },
      ];

      // Synthetic embeddings: p1≈p2 (similar), p3≈p4 (similar), unrelated to each other
      // Embeddings as sparse vectors
      const embeddings: Record<string, number[]> = {
        p1: (() => { const v = new Array(384).fill(0); v[0] = 0.8; v[1] = 0.6; return v; })(),
        p2: (() => { const v = new Array(384).fill(0); v[0] = 0.8; v[1] = 0.6; return v; })(),
        p3: (() => { const v = new Array(384).fill(0); v[2] = 0.9; v[3] = 0.5; return v; })(),
        p4: (() => { const v = new Array(384).fill(0); v[2] = 0.9; v[3] = 0.5; return v; })(),
      };

      const results = clusterTitles(titles, embeddings);

      // p1 and p2 should be in same cluster (not noise)
      const r1 = results.find(r => r.project_id === 'p1')!;
      const r2 = results.find(r => r.project_id === 'p2')!;
      expect(r1.is_noise).toBe(false);
      expect(r2.is_noise).toBe(false);
      expect(r1.cluster_label).toBe(r2.cluster_label);

      // p3 and p4 should be in same cluster (not noise)
      const r3 = results.find(r => r.project_id === 'p3')!;
      const r4 = results.find(r => r.project_id === 'p4')!;
      expect(r3.is_noise).toBe(false);
      expect(r4.is_noise).toBe(false);
      expect(r3.cluster_label).toBe(r4.cluster_label);

      // The two clusters should have different labels
      expect(r1.cluster_label).not.toBe(r3.cluster_label);
    });

    it('should mark noise (no neighbours within ε) as "Sin tema claro"', () => {
      const titles = [
        { id: 'p1', title: 'Fix AOD' },
        { id: 'p2', title: 'AOD integration' },
        { id: 'p3', title: 'CLAIMS dashboard' }, // far from AOD cluster
      ];

      // p1≈p2 (cluster), p3 is isolated
      const embeddings: Record<string, number[]> = {
        p1: (() => { const v = new Array(384).fill(0); v[0] = 0.8; v[1] = 0.6; return v; })(),
        p2: (() => { const v = new Array(384).fill(0); v[0] = 0.8; v[1] = 0.6; return v; })(),
        p3: (() => { const v = new Array(384).fill(0); v[100] = 0.9; v[101] = 0.5; return v; })(),
      };

      const results = clusterTitles(titles, embeddings);

      const r1 = results.find(r => r.project_id === 'p1')!;
      const r3 = results.find(r => r.project_id === 'p3')!;
      expect(r1.is_noise).toBe(false);
      expect(r3.is_noise).toBe(true);
      expect(r3.cluster_label).toBe('Sin tema claro');
      expect(r3.confidence).toBe(0);
    });

    it('should label singleton cluster with its own title', () => {
      const titles = [{ id: 'p1', title: 'CLAIMS pie chart' }];
      const embeddings: Record<string, number[]> = {
        p1: (() => { const v = new Array(384).fill(0); v[0] = 0.9; return v; })(),
      };

      const results = clusterTitles(titles, embeddings);
      expect(results[0].is_noise).toBe(false);
      expect(results[0].cluster_label).toBe('CLAIMS pie chart');
      expect(results[0].confidence).toBe(1.0);
    });

    it('should calculate confidence in range [0, 1]', () => {
      const titles = [
        { id: 'p1', title: 'Fix AOD' },
        { id: 'p2', title: 'AOD integration' },
      ];
      const embeddings: Record<string, number[]> = {
        p1: (() => { const v = new Array(384).fill(0); v[0] = 0.8; v[1] = 0.6; return v; })(),
        p2: (() => { const v = new Array(384).fill(0); v[0] = 0.8; v[1] = 0.6; return v; })(),
      };

      const results = clusterTitles(titles, embeddings);
      for (const r of results) {
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should handle empty input gracefully', () => {
      const results = clusterTitles([], {});
      expect(results).toEqual([]);
    });

    it('should label multi-title cluster with most frequent words', () => {
      const titles = [
        { id: 'p1', title: 'Fix AOD login bug' },
        { id: 'p2', title: 'AOD integration steps' },
        { id: 'p3', title: 'Fix AOD memory leak' },
      ];
      // All similar → same cluster; label should contain "AOD" (most frequent)
      const embeddings: Record<string, number[]> = {
        p1: (() => { const v = new Array(384).fill(0); v[0] = 0.8; v[1] = 0.6; return v; })(),
        p2: (() => { const v = new Array(384).fill(0); v[0] = 0.8; v[1] = 0.6; return v; })(),
        p3: (() => { const v = new Array(384).fill(0); v[0] = 0.8; v[1] = 0.6; return v; })(),
      };

      const results = clusterTitles(titles, embeddings);
      const clusterLabels = new Set(results.map(r => r.cluster_label));
      expect(clusterLabels.size).toBe(1);
      const label = results[0].cluster_label;
      expect(label.toLowerCase()).toContain('aod');
    });

    it('should produce one ClusterResult per input title', () => {
      const titles = [
        { id: 'p1', title: 'Fix AOD' },
        { id: 'p2', title: 'CLAIMS dashboard' },
        { id: 'p3', title: 'Inventory tracker' },
      ];
      const embeddings: Record<string, number[]> = {
        p1: (() => { const v = new Array(384).fill(0); v[0] = 0.8; return v; })(),
        p2: (() => { const v = new Array(384).fill(0); v[10] = 0.8; return v; })(),
        p3: (() => { const v = new Array(384).fill(0); v[20] = 0.8; return v; })(),
      };

      const results = clusterTitles(titles, embeddings);
      expect(results).toHaveLength(3);
      const ids = results.map(r => r.project_id).sort();
      expect(ids).toEqual(['p1', 'p2', 'p3']);
    });
  });
});
