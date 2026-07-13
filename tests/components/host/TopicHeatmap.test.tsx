import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import type { ClusterResult } from '@/lib/types';

/**
 * TopicHeatmap component tests.
 *
 * Tests:
 *   1. Hidden when !isHost
 *   2. Button visible when isHost
 *   3. Progress states shown during clustering
 *   4. Error state when clustering fails
 *   5. Empty state when no projects
 *   6. Success state with cluster cards
 */

vi.mock('@/lib/topicClusters', () => ({
  runClustering: vi.fn(),
}));

const mockProjects = [
  { id: 'p1', title: 'Fix AOD login' },
  { id: 'p2', title: 'AOD integration steps' },
  { id: 'p3', title: 'CLAIMS dashboard' },
];

const mockClusterResults: ClusterResult[] = [
  { project_id: 'p1', cluster_label: 'AOD', confidence: 0.9, is_noise: false },
  { project_id: 'p2', cluster_label: 'AOD', confidence: 0.85, is_noise: false },
  { project_id: 'p3', cluster_label: 'CLAIMS', confidence: 0.8, is_noise: false },
];

describe('TopicHeatmap', () => {
  let TopicHeatmap: React.ComponentType<{
    sessionId: string;
    weekStart: string;
    isHost: boolean;
    projects: Array<{ id: string; title: string }>;
  }>;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('@/components/host/TopicHeatmap');
    TopicHeatmap = mod.default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be hidden when !isHost', async () => {
    const { runClustering } = await import('@/lib/topicClusters');
    (runClustering as ReturnType<typeof vi.fn>).mockResolvedValue(mockClusterResults);

    render(
      <TopicHeatmap
        sessionId="s1"
        weekStart="2026-07-13"
        isHost={false}
        projects={mockProjects}
      />
    );

    // Button should not be in document
    expect(screen.queryByRole('button', { name: /Analizar temas/i })).not.toBeInTheDocument();
  });

  it('should show button when isHost', async () => {
    const { runClustering } = await import('@/lib/topicClusters');
    (runClustering as ReturnType<typeof vi.fn>).mockResolvedValue(mockClusterResults);

    render(
      <TopicHeatmap
        sessionId="s1"
        weekStart="2026-07-13"
        isHost={true}
        projects={mockProjects}
      />
    );

    expect(screen.getByRole('button', { name: /Analizar temas/i })).toBeInTheDocument();
  });

  it('should show success state with cluster cards after clustering', async () => {
    const { runClustering } = await import('@/lib/topicClusters');
    (runClustering as ReturnType<typeof vi.fn>).mockResolvedValue(mockClusterResults);

    render(
      <TopicHeatmap
        sessionId="s1"
        weekStart="2026-07-13"
        isHost={true}
        projects={mockProjects}
      />
    );

    const button = screen.getByRole('button', { name: /Analizar temas/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('AOD')).toBeInTheDocument();
    });

    // Should show 2 themes
    expect(screen.getByText('2 temas detectados')).toBeInTheDocument();
  });

  it('should show error state when clustering fails', async () => {
    const { runClustering } = await import('@/lib/topicClusters');
    (runClustering as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Model load failed'));

    render(
      <TopicHeatmap
        sessionId="s1"
        weekStart="2026-07-13"
        isHost={true}
        projects={mockProjects}
      />
    );

    const button = screen.getByRole('button', { name: /Analizar temas/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Error/i)).toBeInTheDocument();
    });
  });

  it('should show empty state when no projects', async () => {
    const { runClustering } = await import('@/lib/topicClusters');
    (runClustering as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    render(
      <TopicHeatmap
        sessionId="s1"
        weekStart="2026-07-13"
        isHost={true}
        projects={[]}
      />
    );

    const button = screen.getByRole('button', { name: /Analizar temas/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/No hay platos para analizar/i)).toBeInTheDocument();
    });
  });
});
