import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AddDishForm from '@/components/AddDishForm';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal('localStorage', localStorageMock);

// Mock supabase — capture the insert call args
const mockInsert = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  },
}));

describe('AddDishForm profile_id in INSERT', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
  });

  it('should include profile_id alongside chef_id in the INSERT', async () => {
    render(
      <AddDishForm
        chefId="Chef Antonio"
        profileId="uuid-1234-abcd"
        sessionId="session-001"
      />
    );

    const titleInput = screen.getByPlaceholderText(/base de datos/i);
    fireEvent.change(titleInput, { target: { value: 'Test Dish' } });

    const submitBtn = screen.getByRole('button', { name: /añadir/i });
    fireEvent.click(submitBtn);

    // Wait for the async insert to complete
    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    // Verify the insert was called with an object that has both chef_id AND profile_id
    const insertArg = mockInsert.mock.calls[0][0];
    const projectRow = insertArg[0];
    expect(projectRow).toMatchObject({
      chef_id: 'Chef Antonio',
      profile_id: 'uuid-1234-abcd',
      session_id: 'session-001',
    });
    expect(projectRow.title).toBe('Test Dish');
  });

  it('should reset title after successful submit', async () => {
    render(
      <AddDishForm
        chefId="Chef Beta"
        profileId="uuid-9999"
        sessionId="session-002"
      />
    );

    const titleInput = screen.getByPlaceholderText(/base de datos/i);
    fireEvent.change(titleInput, { target: { value: 'Reloaded Dish' } });

    const submitBtn = screen.getByRole('button', { name: /añadir/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });

    // After successful insert, title should be cleared
    await waitFor(() => {
      expect((titleInput as HTMLInputElement).value).toBe('');
    });
  });
});
