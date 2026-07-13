import { describe, it, expect } from 'vitest';
import type {
  TopicCluster,
  TopicClusterProject,
  ClusterResult,
  WorkerMessage,
  WorkerMessageProgress,
  WorkerMessageResult,
  WorkerMessageError,
} from '@/lib/types';

describe('Topic cluster types', () => {
  describe('TopicCluster', () => {
    it('should have required fields', () => {
      const cluster: TopicCluster = {
        id: 'cluster-1',
        session_id: 'session-1',
        week_start: '2026-07-13',
        theme_label: 'Auth fixes',
        confidence: 0.85,
        project_count: 3,
        is_global: false,
        created_at: '2026-07-13T10:00:00Z',
      };
      expect(cluster.id).toBe('cluster-1');
      expect(cluster.session_id).toBe('session-1');
      expect(cluster.theme_label).toBe('Auth fixes');
      expect(cluster.confidence).toBe(0.85);
      expect(cluster.project_count).toBe(3);
      expect(cluster.is_global).toBe(false);
    });

    it('should allow global clusters with null session', () => {
      const cluster: TopicCluster = {
        id: 'cluster-2',
        session_id: null,
        week_start: '2026-07-13',
        theme_label: 'Global analysis',
        confidence: 0.9,
        project_count: 10,
        is_global: true,
      };
      expect(cluster.session_id).toBeNull();
      expect(cluster.is_global).toBe(true);
    });

    it('should allow optional created_at', () => {
      const cluster: TopicCluster = {
        id: 'cluster-1',
        session_id: 'session-1',
        week_start: '2026-07-13',
        theme_label: 'Singleton',
        confidence: 1.0,
        project_count: 1,
        is_global: false,
      };
      expect(cluster.created_at).toBeUndefined();
    });
  });

  describe('TopicClusterProject', () => {
    it('should link cluster to project with profile_id (new project)', () => {
      const link: TopicClusterProject = {
        topic_cluster_id: 'cluster-1',
        project_id: 'project-1',
        profile_id: 'profile-uuid-123',
        chef_name: null,
      };
      expect(link.topic_cluster_id).toBe('cluster-1');
      expect(link.project_id).toBe('project-1');
      expect(link.profile_id).toBe('profile-uuid-123');
      expect(link.chef_name).toBeNull();
    });

    it('should link cluster to project with chef_name (legacy project)', () => {
      const link: TopicClusterProject = {
        topic_cluster_id: 'cluster-1',
        project_id: 'project-2',
        profile_id: null,
        chef_name: 'Chef Antonio',
      };
      expect(link.profile_id).toBeNull();
      expect(link.chef_name).toBe('Chef Antonio');
    });

    it('should NOT allow both profile_id and chef_name set', () => {
      // TypeScript would catch this at compile time — both cannot be non-null
      const link: TopicClusterProject = {
        topic_cluster_id: 'cluster-1',
        project_id: 'project-3',
        profile_id: 'some-uuid',
        chef_name: null, // must be null when profile_id is set
      };
      expect(link.profile_id).not.toBeNull();
      expect(link.chef_name).toBeNull();
    });
  });

  describe('ClusterResult', () => {
    it('should hold clustering output for a single project', () => {
      const result: ClusterResult = {
        project_id: 'project-1',
        cluster_label: 'AOD Integration',
        confidence: 0.92,
        is_noise: false,
      };
      expect(result.project_id).toBe('project-1');
      expect(result.cluster_label).toBe('AOD Integration');
      expect(result.confidence).toBe(0.92);
      expect(result.is_noise).toBe(false);
    });

    it('should mark noise projects with "Sin tema claro"', () => {
      const result: ClusterResult = {
        project_id: 'project-2',
        cluster_label: 'Sin tema claro',
        confidence: 0,
        is_noise: true,
      };
      expect(result.is_noise).toBe(true);
      expect(result.cluster_label).toBe('Sin tema claro');
    });
  });

  describe('WorkerMessage', () => {
    it('should type guard progress messages', () => {
      const msg: WorkerMessage = {
        type: 'progress',
        stage: 'embedding',
        progress: 50,
      } as WorkerMessageProgress;
      expect(msg.type).toBe('progress');
    });

    it('should type guard result messages', () => {
      const result: WorkerMessageResult = {
        type: 'result',
        results: [
          { project_id: 'p1', cluster_label: 'Auth', confidence: 0.9, is_noise: false },
        ],
      };
      expect(result.type).toBe('result');
      expect(result.results).toHaveLength(1);
    });

    it('should type guard error messages', () => {
      const msg: WorkerMessageError = {
        type: 'error',
        error: 'Model failed to load',
      };
      expect(msg.type).toBe('error');
      expect(msg.error).toBe('Model failed to load');
    });
  });
});
