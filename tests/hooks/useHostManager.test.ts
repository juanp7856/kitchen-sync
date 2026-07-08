import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useHostManager } from '@/hooks/useHostManager';
import { supabase } from '@/lib/supabase';

describe('useHostManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isHost(email)', () => {
    it('should return true when email matches current_host_email (case-insensitive)', async () => {
      // Setup: mock app_settings query
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 1, current_host_email: 'chef@restaurante.com' },
          error: null,
        }),
      } as any);

      const { result } = renderHook(() => useHostManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isHost('chef@restaurante.com')).toBe(true);
    });

    it('should return false when email does not match current_host_email', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 1, current_host_email: 'chef@restaurante.com' },
          error: null,
        }),
      } as any);

      const { result } = renderHook(() => useHostManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isHost('other@restaurante.com')).toBe(false);
    });

    it('should perform case-insensitive comparison', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 1, current_host_email: 'Chef@Restaurante.com' },
          error: null,
        }),
      } as any);

      const { result } = renderHook(() => useHostManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isHost('CHEF@RESTAURANTE.COM')).toBe(true);
      expect(result.current.isHost('chef@restaurante.com')).toBe(true);
    });
  });

  describe('transferHost(newEmail)', () => {
    it('should update app_settings and reflect in isHost immediately (optimistic)', async () => {
      // Setup mocks for both select (initial fetch) and update (transfer)
      const selectMock = vi.fn().mockReturnThis();
      const eqSelectMock = vi.fn().mockReturnThis();
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: 1, current_host_email: 'old@host.com' },
        error: null,
      });
      const updateMock = vi.fn().mockReturnThis();
      const eqUpdateMock = vi.fn().mockResolvedValue({ error: null });

      const fromMock = vi.fn().mockReturnValue({
        select: selectMock,
        eq: eqSelectMock,
        single: singleMock,
        update: updateMock,
      });

      vi.spyOn(supabase, 'from').mockImplementation(fromMock as any);

      const { result } = renderHook(() => useHostManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Initial state check
      expect(result.current.isHost('old@host.com')).toBe(true);
      expect(result.current.isHost('new@host.com')).toBe(false);

      // Transfer
      await act(async () => {
        await result.current.transferHost('new@host.com');
      });

      // Optimistic update: new email is now host
      expect(result.current.isHost('new@host.com')).toBe(true);
      expect(result.current.isHost('old@host.com')).toBe(false);
    });

    it('should call supabase to update app_settings with new host email', async () => {
      const selectMock = vi.fn().mockReturnThis();
      const eqSelectMock = vi.fn().mockReturnThis();
      const singleMock = vi.fn().mockResolvedValue({
        data: { id: 1, current_host_email: 'old@host.com' },
        error: null,
      });
      const updateMock = vi.fn().mockResolvedValue({ error: null });
      const eqUpdateMock = vi.fn().mockReturnValue({ update: updateMock });

      const fromMock = vi.fn().mockReturnValue({
        select: selectMock,
        eq: eqSelectMock,
        single: singleMock,
        update: updateMock,
      });

      // Override just the eq to return update
      vi.spyOn(supabase, 'from').mockImplementation(() => ({
        select: selectMock,
        eq: (...args: unknown[]) => {
          eqSelectMock(...args);
          if (args[0] === 'id') {
            return { update: updateMock };
          }
          return { single: singleMock };
        },
        single: singleMock,
        update: updateMock,
      } as any));

      const { result } = renderHook(() => useHostManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.transferHost('new@host.com');
      });

      expect(eqSelectMock).toHaveBeenCalledWith('id', 1);
      expect(updateMock).toHaveBeenCalledWith({ current_host_email: 'new@host.com' });
    });

    it('should set error state when transfer fails', async () => {
      const updateMock = vi.fn().mockResolvedValue({ error: { message: 'Permission denied' } });

      vi.spyOn(supabase, 'from').mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 1, current_host_email: 'old@host.com' },
          error: null,
        }),
        update: (...args: unknown[]) => {
          updateMock(...args);
          return { eq: vi.fn().mockResolvedValue({ error: { message: 'Permission denied' } }) };
        },
      } as any));

      const { result } = renderHook(() => useHostManager());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.transferHost('new@host.com');
      });

      expect(result.current.error).toBe('Permission denied');
    });
  });

  describe('loading state', () => {
    it('should be loading initially while fetching app_settings', async () => {
      // Never resolve - keep loading
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnValue(new Promise(() => {}) as any),
      } as any);

      const { result } = renderHook(() => useHostManager());

      // Should be loading initially
      expect(result.current.loading).toBe(true);

      // Cleanup
      await act(async () => {
        await new Promise(r => setTimeout(r, 0));
      });
    });
  });
});
