-- Migration: Add app_settings singleton table for dynamic host management
-- Created: 2026-07-08

CREATE TABLE IF NOT EXISTS public.app_settings (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  current_host_email text NOT NULL DEFAULT 'jduarte@intercorp.com.pe'::text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT app_settings_pkey PRIMARY KEY (id)
);

-- Insert initial host (only if row doesn't exist)
INSERT INTO public.app_settings (id, current_host_email)
VALUES (1, 'jduarte@intercorp.com.pe')
ON CONFLICT (id) DO NOTHING;
