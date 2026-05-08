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

  it('should clone projects from previous session to new session', async () => {
    const mockSession = { id: 'new-session-id', type: 'friday', status: 'active' };
    const mockPrevSession = { id: 'old-session-id', type: 'monday', status: 'closed' };
    const mockProjects = [
      { id: 'p1', title: 'Dish 1', session_id: 'old-session-id', version: 1, parent_id: null },
      { id: 'p2', title: 'Dish 2', session_id: 'old-session-id', version: 2, parent_id: 'p0' },
    ];

    // Mock sequence of calls:
    // 1. Fetch most recent Monday session
    // 2. Insert new Friday session
    // 3. Fetch projects from Monday session
    // 4. Insert cloned projects
    
    const fromSpy = vi.spyOn(supabase, 'from');

    // Setup mock return values for each call
    fromSpy.mockImplementation((table: string) => {
      const mockQuery: any = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(async () => {
          if (table === 'sessions') {
            // First call: fetch previous session
            if (fromSpy.mock.calls.length === 1) {
              return { data: mockPrevSession, error: null };
            }
            // Second call: insert new session (+ select + single)
            return { data: mockSession, error: null };
          }
          return { data: null, error: null };
        }),
        // Handle the case where the chain ends with eq() or select() being awaited
        then: vi.fn().mockImplementation(async (resolve) => {
          if (table === 'projects') {
            // Check if we are in the select projects call (fetch projects to clone)
            if (mockQuery.select.mock.calls.length > 0 && mockQuery.eq.mock.calls.length > 0) {
                return resolve({ data: mockProjects, error: null });
            }
            // Check if we are in the insert projects call
            if (mockQuery.insert.mock.calls.length > 0) {
                return resolve({ data: [], error: null });
            }
          }
          return resolve({ data: null, error: null });
        })
      };

      return mockQuery;
    });

    const result = await cloneSession('friday');

    expect(result).toEqual(mockSession);
    expect(fromSpy).toHaveBeenCalledWith('sessions');
    expect(fromSpy).toHaveBeenCalledWith('projects');
    
    // Verify projects were cloned with version++ and parent_id
    const projectsTableCall = fromSpy.mock.calls.filter(c => c[0] === 'projects');
    expect(projectsTableCall.length).toBeGreaterThan(0);

    // Find the insert call for projects - it should be the last call to 'projects' table
    const projectsMocks = fromSpy.mock.results
      .filter((_, i) => fromSpy.mock.calls[i][0] === 'projects')
      .map(r => r.value);
    
    const insertMock = projectsMocks.find(m => m.insert.mock.calls.length > 0).insert;
    const clonedProjects = insertMock.mock.calls[0][0];

    expect(clonedProjects).toHaveLength(2);
    expect(clonedProjects[0]).toMatchObject({
      title: 'Dish 1',
      session_id: 'new-session-id',
      version: 2,
      parent_id: 'p1'
    });
    expect(clonedProjects[1]).toMatchObject({
      title: 'Dish 2',
      session_id: 'new-session-id',
      version: 3,
      parent_id: 'p2'
    });
  });
});
