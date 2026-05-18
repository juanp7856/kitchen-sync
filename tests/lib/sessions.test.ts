import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cloneSession } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => {
  const mockQuery: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
  };
  return {
    supabase: {
      from: vi.fn(() => mockQuery),
    },
  };
});

describe('Sessions Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should clone projects from Monday to Friday session', async () => {
    const mockNewSession = { id: 'new-friday-id', type: 'friday', status: 'active' };
    const mockPrevMondaySession = { id: 'old-monday-id', type: 'monday', status: 'closed' };
    const mockProjects = [
      { id: 'p1', title: 'Dish 1', session_id: 'old-monday-id', sort_order: 100 },
    ];

    const fromSpy = vi.spyOn(supabase, 'from');

    // Mock implementation for different tables and calls
    fromSpy.mockImplementation((table: string) => {
      const mockQuery: any = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn(),
        // Handle the case where the chain ends with eq() or select() being awaited
        then: vi.fn().mockImplementation(async (resolve) => {
          if (table === 'projects' && mockQuery.select.mock.calls.length > 0) {
            return resolve({ data: mockProjects, error: null });
          }
          if (table === 'projects' && mockQuery.insert.mock.calls.length > 0) {
            return resolve({ data: [], error: null });
          }
          return resolve({ data: null, error: null });
        })
      };

      mockQuery.single.mockImplementation(async () => {
        if (table === 'sessions') {
          // If it's an insert call (first session call in the new logic)
          if (mockQuery.insert.mock.calls.length > 0) {
            return { data: mockNewSession, error: null };
          }
          // If it's a select call (fetching Monday to clone)
          if (mockQuery.select.mock.calls.length > 0) {
            return { data: mockPrevMondaySession, error: null };
          }
        }
        return { data: null, error: null };
      });

      return mockQuery;
    });

    const result = await cloneSession('friday');

    expect(result).toEqual(mockNewSession);
    
    // Should have called sessions twice (one insert, one select)
    const sessionCalls = fromSpy.mock.calls.filter(c => c[0] === 'sessions');
    expect(sessionCalls.length).toBe(2);

    // Should have called projects to fetch and then to insert
    const projectsCalls = fromSpy.mock.calls.filter(c => c[0] === 'projects');
    expect(projectsCalls.length).toBe(2);
  });

  it('should NOT clone projects when creating a Monday session', async () => {
    const mockNewMondaySession = { id: 'new-monday-id', type: 'monday', status: 'active' };

    const fromSpy = vi.spyOn(supabase, 'from');

    fromSpy.mockImplementation((table: string) => {
      const mockQuery: any = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockNewMondaySession, error: null }),
        then: vi.fn().mockImplementation(async (resolve) => resolve({ data: mockNewMondaySession, error: null }))
      };
      return mockQuery;
    });

    const result = await cloneSession('monday');

    expect(result).toEqual(mockNewMondaySession);
    
    // Should ONLY have called sessions table for the insert
    const tableCalls = fromSpy.mock.calls.map(c => c[0]);
    expect(tableCalls).toContain('sessions');
    expect(tableCalls).not.toContain('projects');
  });
});
