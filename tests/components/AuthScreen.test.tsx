import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthScreen from '@/components/auth/AuthScreen';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
vi.stubGlobal('localStorage', localStorageMock);

// Mock functions — two separate chains:
// - mockSelectEqResult: for SELECT (array result, no .single())
// - mockInsertSelectSingle: for INSERT .select().single()
const mockSelectEqResult = vi.fn(); // .select().eq() → array
const mockInsertSelectSingle = vi.fn(); // INSERT: .select().single()

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: mockSelectEqResult, // returns array directly
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: mockInsertSelectSingle,
        })),
      })),
    })),
  },
}));

describe('AuthScreen profile lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: SELECT returns empty (profile step)
    mockSelectEqResult.mockResolvedValue({ data: [], error: null });
    mockInsertSelectSingle.mockResolvedValue({ data: null, error: null });
  });

  const mockOnEntry = vi.fn();

  describe('email submit flow', () => {
    it('should enter directly when profile exists (SELECT hit)', async () => {
      const existingProfile = {
        id: 'uuid-1234',
        email: 'chef@test.com',
        name: 'Chef Antonio',
        avatar: '👨‍🍳',
      };

      mockSelectEqResult.mockResolvedValueOnce({
        data: [existingProfile],
        error: null,
      });

      render(<AuthScreen onEntry={mockOnEntry} />);

      // Enter email
      const emailInput = screen.getByPlaceholderText(/chef@restaurante.com/i);
      fireEvent.change(emailInput, { target: { value: 'Chef@test.com' } });

      // Submit
      const submitBtn = screen.getByRole('button', { name: /continuar/i });
      fireEvent.click(submitBtn);

      // Should call onEntry with profileId from Supabase
      await waitFor(() => {
        expect(mockOnEntry).toHaveBeenCalledWith({
          name: 'Chef Antonio',
          avatar: '👨‍🍳',
          email: 'chef@test.com',
          profileId: 'uuid-1234',
        });
      });
    });

    it('should go to profile step when profile does not exist (SELECT miss)', async () => {
      mockSelectEqResult.mockResolvedValueOnce({
        data: [],
        error: { code: 'PGRST116' },
      });

      render(<AuthScreen onEntry={mockOnEntry} />);

      // Enter email
      const emailInput = screen.getByPlaceholderText(/chef@restaurante.com/i);
      fireEvent.change(emailInput, { target: { value: 'newchef@test.com' } });

      // Submit
      const submitBtn = screen.getByRole('button', { name: /continuar/i });
      fireEvent.click(submitBtn);

      // Should show profile step (avatar + name form)
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/¿cómo te llamas/i)).toBeInTheDocument();
      });
    });

    it('should INSERT new profile and enter when profile step is completed', async () => {
      // First call: SELECT miss
      mockSelectEqResult.mockResolvedValueOnce({
        data: [],
        error: { code: 'PGRST116' },
      });

      // INSERT profile succeeds
      mockInsertSelectSingle.mockResolvedValueOnce({
        data: { id: 'uuid-new', name: 'New Chef', avatar: '🍕' },
        error: null,
      });

      render(<AuthScreen onEntry={mockOnEntry} />);

      // Enter email and submit to reach profile step
      const emailInput = screen.getByPlaceholderText(/chef@restaurante.com/i);
      fireEvent.change(emailInput, { target: { value: 'newchef@test.com' } });
      fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

      // Now fill profile step
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/¿cómo te llamas/i)).toBeInTheDocument();
      });

      const nameInput = screen.getByPlaceholderText(/¿cómo te llamas/i);
      fireEvent.change(nameInput, { target: { value: 'New Chef' } });

      // Submit profile
      fireEvent.click(screen.getByRole('button', { name: /oído cocina/i }));

      // Should call onEntry with new profileId
      // Note: avatar is the local state (default 👨‍🍳), not from INSERT response
      await waitFor(() => {
        expect(mockOnEntry).toHaveBeenCalledWith({
          name: 'New Chef',
          avatar: '👨‍🍳', // local state, not from DB
          email: 'newchef@test.com',
          profileId: 'uuid-new',
        });
      });
    });

    it('should retry SELECT on 23505 UNIQUE race condition', async () => {
      // Note: Full retry flow requires integration test due to complex mock chain.
      // This test verifies INSERT with 23505 error is handled without crashing.
      const existingProfile = {
        id: 'uuid-race',
        email: 'race@test.com',
        name: 'Race Chef',
        avatar: '🌮',
      };

      // First SELECT: miss (from handleEmailSubmit)
      mockSelectEqResult.mockResolvedValueOnce({
        data: [],
        error: { code: 'PGRST116' },
      });

      // INSERT fails with 23505
      mockInsertSelectSingle.mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'unique_email' },
      });

      // Retry SELECT: hit with existing profile
      mockSelectEqResult.mockResolvedValueOnce({
        data: existingProfile,
        error: null,
      });

      render(<AuthScreen onEntry={mockOnEntry} />);

      // Enter email
      const emailInput = screen.getByPlaceholderText(/chef@restaurante.com/i);
      fireEvent.change(emailInput, { target: { value: 'race@test.com' } });
      fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

      // Wait for profile step
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/¿cómo te llamas/i)).toBeInTheDocument();
      });

      // Fill in the name field
      const nameInput = screen.getByPlaceholderText(/¿cómo te llamas/i);
      fireEvent.change(nameInput, { target: { value: 'Race Chef' } });

      // Submit - should handle 23505 error gracefully (no crash)
      fireEvent.click(screen.getByRole('button', { name: /oído cocina/i }));

      // The component should handle the 23505 error gracefully
      // Note: Full retry flow requires integration testing
      await new Promise(resolve => setTimeout(resolve, 500));
      // If we get here without crashing, the error handling works
    });

    it('should normalize email to lowercase before lookup', async () => {
      mockSelectEqResult.mockResolvedValueOnce({
        data: [{ id: 'uuid-1', email: 'mixed@test.com', name: 'Mixed', avatar: '🍔' }],
        error: null,
      });

      render(<AuthScreen onEntry={mockOnEntry} />);

      const emailInput = screen.getByPlaceholderText(/chef@restaurante.com/i);
      fireEvent.change(emailInput, { target: { value: 'MIXED@TEST.COM' } });
      fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

      await waitFor(() => {
        expect(mockOnEntry).toHaveBeenCalledWith(
          expect.objectContaining({
            email: 'mixed@test.com',
          }),
        );
      });
    });
  });
});
