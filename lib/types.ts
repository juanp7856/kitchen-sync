export interface Project {
  id: string;
  title: string;
  status: 'prep' | 'slow' | 'served' | 'cooking';
  temp: number;
  chef_id: string;
  profile_id?: string | null;
  profiles?: {
    name: string;
    avatar: string;
  } | null;
  icon?: string;
  sort_order: number;
  session_id?: string;
}

export interface KitchenSession {
  id: string;
  type: 'monday' | 'friday';
  status: 'active' | 'closed';
  created_at: string;
}

export interface AppSettings {
  id: 1;
  current_host_email: string;
}

// ─── Topic Clusters ───────────────────────────────────────────────────────────

export interface TopicCluster {
  id: string;
  week_start: string; // ISO date string (Monday)
  theme_label: string;
  confidence: number; // [0, 1]
  project_count: number;
  created_at?: string;
}

/** Links a cluster to a project. Exactly one of profile_id or chef_name is set. */
export interface TopicClusterProject {
  topic_cluster_id: string;
  project_id: string;
  profile_id: string | null; // new projects
  chef_name: string | null;  // legacy projects
}

/** Output of the DBSCAN clustering for a single project. */
export interface ClusterResult {
  project_id: string;
  cluster_label: string;
  confidence: number; // [0, 1]; 0 for noise
  is_noise: boolean;
}

// ─── Worker Messages ───────────────────────────────────────────────────────────

export type WorkerMessage =
  | WorkerMessageProgress
  | WorkerMessageResult
  | WorkerMessageError;

export interface WorkerMessageProgress {
  type: 'progress';
  stage: 'loading' | 'embedding' | 'clustering';
  progress: number; // 0–100
}

export interface WorkerMessageResult {
  type: 'result';
  results: ClusterResult[];
}

export interface WorkerMessageError {
  type: 'error';
  error: string;
}
