'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { AppSettings } from '@/lib/types';

export interface UseHostManagerResult {
  currentHostEmail: string | null;
  isHost: (email: string) => boolean;
  transferHost: (newEmail: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useHostManager(): UseHostManagerResult {
  const [currentHostEmail, setCurrentHostEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to app_settings changes via Realtime
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const fetchAndSubscribe = async () => {
      try {
        // Initial fetch
        const { data, error: fetchError } = await supabase
          .from('app_settings')
          .select('current_host_email')
          .eq('id', 1)
          .single();

        if (fetchError) {
          console.warn('[useHostManager] Fetch error:', fetchError.message);
          // Fallback: if table doesn't exist or is empty, use default host email
          setCurrentHostEmail('jduarte@intercorp.com.pe');
          setLoading(false);
          return;
        }

        if (data?.current_host_email) {
          setCurrentHostEmail(data.current_host_email);
        } else {
          // Table exists but is empty — fallback to default
          console.warn('[useHostManager] app_settings row missing, using default host');
          setCurrentHostEmail('jduarte@intercorp.com.pe');
        }
        setLoading(false);

        // Subscribe to changes
        channel = supabase
          .channel('app_settings_changes')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'app_settings',
              filter: 'id=eq.1',
            },
            (payload) => {
              const newSettings = payload.new as AppSettings;
              if (newSettings.current_host_email) {
                setCurrentHostEmail(newSettings.current_host_email);
              }
            }
          )
          .subscribe();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    };

    fetchAndSubscribe();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const isHost = useCallback(
    (email: string): boolean => {
      if (!email || !currentHostEmail) return false;
      return email.toLowerCase() === currentHostEmail.toLowerCase();
    },
    [currentHostEmail]
  );

  const transferHost = useCallback(
    async (newEmail: string): Promise<void> => {
      if (!newEmail) return;

      const trimmedEmail = newEmail.trim().toLowerCase();

      // Reject transfer to self
      if (currentHostEmail && trimmedEmail === currentHostEmail.toLowerCase()) {
        setError('No puedes transferirte el rol a ti mismo');
        return;
      }

      setError(null);

      // Optimistic update
      setCurrentHostEmail(trimmedEmail);

      try {
        const { error: updateError } = await supabase
          .from('app_settings')
          .update({ current_host_email: trimmedEmail })
          .eq('id', 1);

        if (updateError) {
          // Revert optimistic update on error
          if (currentHostEmail) {
            setCurrentHostEmail(currentHostEmail);
          }
          setError(updateError.message);
        }
      } catch (err) {
        // Revert optimistic update on error
        if (currentHostEmail) {
          setCurrentHostEmail(currentHostEmail);
        }
        setError(err instanceof Error ? err.message : 'Transfer failed');
      }
    },
    [currentHostEmail]
  );

  return {
    currentHostEmail,
    isHost,
    transferHost,
    loading,
    error,
  };
}
