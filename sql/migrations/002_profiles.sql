-- Migration: Add profiles table with UUID identity and soft FK on projects
-- Created: 2026-07-08
-- Feature: Global Profiles with UUIDs (profiles-global change)

-- Profiles table: canonical chef identity with stable UUID
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Soft FK on projects: nullable profile_id for new dishes
-- Legacy dishes (profile_id IS NULL) continue working via chef_id filter
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id);

-- Index for email lookups (used on every login)
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
