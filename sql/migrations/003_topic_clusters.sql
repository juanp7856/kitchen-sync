-- Migration: Add topic_clusters and topic_cluster_projects tables
-- Created: 2026-07-13
-- Feature: Weekly semantic clustering of project titles (topic-clusters change)

-- Topic clusters: one row per cluster per (session_id, week_start)
CREATE TABLE IF NOT EXISTS public.topic_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,  -- Monday of the week (ISO)
  theme_label TEXT NOT NULL, -- Most frequent words from cluster titles
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  project_count INTEGER NOT NULL CHECK (project_count >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A session+week can have multiple clusters, but the same cluster
  -- cannot appear twice (each cluster is unique per session-week)
  UNIQUE (session_id, week_start, id)
);

-- Junction table: which projects belong to which cluster
CREATE TABLE IF NOT EXISTS public.topic_cluster_projects (
  topic_cluster_id UUID NOT NULL REFERENCES public.topic_clusters(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  -- Mixed traceability: exactly one of profile_id or chef_name is set
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  chef_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A project can only be in one cluster per week
  UNIQUE (topic_cluster_id, project_id),

  -- CHECK constraint: exactly one of profile_id or chef_name must be set
  CHECK (
    (profile_id IS NOT NULL AND chef_name IS NULL) OR
    (profile_id IS NULL AND chef_name IS NOT NULL)
  )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_topic_clusters_session_week
  ON public.topic_clusters(session_id, week_start);

CREATE INDEX IF NOT EXISTS idx_topic_cluster_projects_cluster
  ON public.topic_cluster_projects(topic_cluster_id);

CREATE INDEX IF NOT EXISTS idx_topic_cluster_projects_profile
  ON public.topic_cluster_projects(profile_id)
  WHERE profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_topic_cluster_projects_chef
  ON public.topic_cluster_projects(chef_name)
  WHERE chef_name IS NOT NULL;
