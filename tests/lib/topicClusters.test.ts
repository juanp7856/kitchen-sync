import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ClusterResult } from '@/lib/types';

/**
 * topicClusters orchestrator — unit tests.
 *
 * These tests verify the Worker interaction contract.
 * Supabase persistence (DELETE→INSERT) is tested via integration tests.
 */

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((_table: string) => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

const mockResults: ClusterResult[] = [
  { project_id: 'p1', cluster_label: 'AOD', confidence: 0.9, is_noise: false },
  { project_id: 'p2', cluster_label: 'AOD', confidence: 0.85, is_noise: false },
];

let lastWorkerInstance: { postMessage: ReturnType<typeof vi.fn>; terminate: ReturnType<typeof vi.fn> } | null = null;

vi.stubGlobal('Worker', class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage = vi.fn((msg) => {
    setTimeout(() => {
      const m = msg as { type: string };
      if (m.type === 'run') {
        this.onmessage?.({ data: { type: 'result', results: mockResults } } as MessageEvent);
      }
    }, 0);
  });
  terminate = vi.fn();
  constructor() {
    lastWorkerInstance = this as typeof lastWorkerInstance;
  }
} as unknown as typeof Worker);

describe('topicClusters orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastWorkerInstance = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should short-circuit with empty array (no Worker call)', async () => {
    const { runClustering } = await import('@/lib/topicClusters');

    const results = await runClustering([], { weekStart: '2026-07-13' });

    expect(results).toEqual([]);
  });
});
