import { describe, it, expect } from 'vitest';
import type { Project } from '@/lib/types';

/**
 * Dual ownership filter: strangler-fig pattern
 * Matches dishes by stable UUID (profile_id) OR legacy display name (chef_id).
 * This prevents duplicates when the same chef logs in from different devices
 * where older dishes may only have chef_id populated.
 */
function myDishes(projects: Project[], profileId: string, chefName: string): Project[] {
  return projects.filter(p => p.profile_id === profileId || p.chef_id === chefName);
}

describe('Dual ownership filter (strangler-fig)', () => {
  const baseProjects: Project[] = [
    {
      id: 'p1',
      title: 'Legacy Dish A',
      status: 'prep',
      temp: 20,
      chef_id: 'Chef Antonio',
      profile_id: undefined,
      sort_order: 1,
      session_id: 's1',
    },
    {
      id: 'p2',
      title: 'New UUID Dish B',
      status: 'cooking',
      temp: 45,
      chef_id: 'Chef Antonio',
      profile_id: 'uuid-1234',
      sort_order: 2,
      session_id: 's1',
    },
    {
      id: 'p3',
      title: 'Other Chef Dish',
      status: 'prep',
      temp: 20,
      chef_id: 'Chef Maria',
      profile_id: 'uuid-other',
      sort_order: 3,
      session_id: 's1',
    },
    {
      id: 'p4',
      title: 'Legacy without UUID',
      status: 'slow',
      temp: 60,
      chef_id: 'Chef Antonio',
      profile_id: null,
      sort_order: 4,
      session_id: 's1',
    },
  ];

  it('should match dishes by profile_id (UUID match)', () => {
    const result = myDishes(baseProjects, 'uuid-1234', 'Chef Maria');
    expect(result.map(p => p.id)).toContain('p2');
  });

  it('should match dishes by chef_id (legacy match)', () => {
    const result = myDishes(baseProjects, 'uuid-1234', 'Chef Antonio');
    // Legacy dish (no profile_id) matched by chef_id
    expect(result.map(p => p.id)).toContain('p1');
  });

  it('should NOT return duplicates when dish has both profile_id AND matching chef_id', () => {
    const result = myDishes(baseProjects, 'uuid-1234', 'Chef Antonio');
    // p2 matches BOTH conditions but should appear only once
    const p2Count = result.filter(p => p.id === 'p2').length;
    expect(p2Count).toBe(1);
  });

  it('should NOT include dishes from other chefs', () => {
    const result = myDishes(baseProjects, 'uuid-1234', 'Chef Antonio');
    expect(result.map(p => p.id)).not.toContain('p3');
  });

  it('should return all my dishes when I have mixed UUID and legacy dishes', () => {
    const result = myDishes(baseProjects, 'uuid-1234', 'Chef Antonio');
    // p1: legacy (chef_id match), p2: UUID (profile_id match), p4: legacy null profile_id (chef_id match)
    expect(result.map(p => p.id)).toEqual(['p1', 'p2', 'p4']);
  });

  it('should handle empty project list gracefully', () => {
    const result = myDishes([], 'uuid-1234', 'Chef Antonio');
    expect(result).toEqual([]);
  });
});
