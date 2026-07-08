import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import EvaluationRounds from '@/components/EvaluationRounds';

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      send: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
}));

describe('EvaluationRounds', () => {
  const mockProjects = [
    { id: '1', name: 'Project 1', chef_id: 'chef1', temperature: 50, description: 'Desc 1', status: 'active' as const },
  ];
  const mockUser = { name: 'Test User', avatar: '👤', email: 'user@test.com' };
  const mockHost = { name: 'Host User', avatar: '👑', email: 'jduarte@intercorp.com.pe' };

  it('should render "INICIAR RONDAS" button if user is host and no round is active', () => {
    render(<EvaluationRounds projects={mockProjects as any} historicalProjects={[]} currentUser={mockHost} isHost={true} />);
    
    expect(screen.getByText(/INICIAR RONDAS/i)).toBeInTheDocument();
  });

  it('should NOT render "INICIAR RONDAS" button if user is NOT host', () => {
    render(<EvaluationRounds projects={mockProjects as any} historicalProjects={[]} currentUser={mockUser} isHost={false} />);
    
    expect(screen.queryByText(/INICIAR RONDAS/i)).not.toBeInTheDocument();
  });
});
