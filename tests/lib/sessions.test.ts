import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cloneSession } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

describe('Sessions Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockQuery = (resolvedValue: any) => {
    const mock: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(resolvedValue),
      then: vi.fn().mockImplementation((resolve) => resolve(resolvedValue)),
    };
    return mock;
  };

  it('should clone projects from Monday to Friday session excluding served ones', async () => {
    const mockNewSession = { id: 'new-friday-id', type: 'friday', status: 'active' };
    const mockPrevMondaySession = { id: 'old-monday-id', type: 'monday', status: 'closed' };
    const mockProjects = [
      { id: 'p1', title: 'Pending Dish', status: 'prep', session_id: 'old-monday-id', sort_order: 100 },
      { id: 'p2', title: 'Served Dish', status: 'served', session_id: 'old-monday-id', sort_order: 200 },
    ];

    const fromSpy = vi.spyOn(supabase, 'from');

    // 1st call: sessions (insert)
    const sessionInsertMock = createMockQuery({ data: mockNewSession, error: null });
    // 2nd call: sessions (select)
    const sessionSelectMock = createMockQuery({ data: mockPrevMondaySession, error: null });
    // 3rd call: projects (select)
    const projectsSelectMock = createMockQuery({ data: [mockProjects[0]], error: null });
    // 4th call: projects (insert)
    const projectsInsertMock = createMockQuery({ data: [], error: null });

    fromSpy
      .mockReturnValueOnce(sessionInsertMock)
      .mockReturnValueOnce(sessionSelectMock)
      .mockReturnValueOnce(projectsSelectMock)
      .mockReturnValueOnce(projectsInsertMock);

    const result = await cloneSession('friday');

    expect(result).toEqual(mockNewSession);
    expect(fromSpy).toHaveBeenCalledTimes(4);
    expect(projectsSelectMock.neq).toHaveBeenCalledWith('status', 'served');
  });

  it('should NOT clone projects when creating a Monday session if there is no previous session', async () => {
    const mockNewMondaySession = { id: 'new-monday-id', type: 'monday', status: 'active' };

    const fromSpy = vi.spyOn(supabase, 'from');

    // 1st call: sessions (insert)
    const sessionInsertMock = createMockQuery({ data: mockNewMondaySession, error: null });
    // 2nd call: sessions (select) - returns nothing
    const sessionSelectMock = createMockQuery({ data: null, error: { message: 'Not found' } });

    fromSpy
      .mockReturnValueOnce(sessionInsertMock)
      .mockReturnValueOnce(sessionSelectMock);

    const result = await cloneSession('monday');

    expect(result).toEqual(mockNewMondaySession);
    expect(fromSpy).toHaveBeenCalledTimes(2);
  });

  it('should clone projects from Friday to Monday session excluding served ones', async () => {
    const mockNewMondaySession = { id: 'new-monday-id', type: 'monday', status: 'active' };
    const mockPrevFridaySession = { id: 'old-friday-id', type: 'friday', status: 'closed' };
    const mockProjects = [
      { id: 'p1', title: 'Pending Dish', status: 'prep', session_id: 'old-friday-id', sort_order: 100 },
      { id: 'p2', title: 'Served Dish', status: 'served', session_id: 'old-friday-id', sort_order: 200 },
    ];

    const fromSpy = vi.spyOn(supabase, 'from');

    // 1st call: sessions (insert)
    const sessionInsertMock = createMockQuery({ data: mockNewMondaySession, error: null });
    // 2nd call: sessions (select)
    const sessionSelectMock = createMockQuery({ data: mockPrevFridaySession, error: null });
    // 3rd call: projects (select) - Mock only the non-served project as the database would filter it
    const projectsSelectMock = createMockQuery({ data: [mockProjects[0]], error: null });
    // 4th call: projects (insert)
    const projectsInsertMock = createMockQuery({ data: [], error: null });

    fromSpy
      .mockReturnValueOnce(sessionInsertMock)
      .mockReturnValueOnce(sessionSelectMock)
      .mockReturnValueOnce(projectsSelectMock)
      .mockReturnValueOnce(projectsInsertMock);

    const result = await cloneSession('monday');

    expect(result).toEqual(mockNewMondaySession);
    
    // Verify that the projects select call included the neq('status', 'served') filter
    expect(projectsSelectMock.neq).toHaveBeenCalledWith('status', 'served');

    // Verify that only the non-served project was inserted
    const insertedProjects = projectsInsertMock.insert.mock.calls[0][0];
    expect(insertedProjects).toHaveLength(1);
    expect(insertedProjects[0].title).toBe('Pending Dish');
  });
});
