import { describe, it, expect } from 'vitest';
import { isHost } from '@/lib/auth';

describe('isHost', () => {
  it('should return true for the official host email', () => {
    const hostEmail = 'jduarte@intercorp.com.pe';
    expect(isHost(hostEmail)).toBe(true);
  });

  it('should return false for other emails', () => {
    expect(isHost('guest@example.com')).toBe(false);
    expect(isHost('someone.else@intercorp.com.pe')).toBe(false);
  });

  it('should handle case insensitivity', () => {
    expect(isHost('JDUARTE@INTERCORP.COM.PE')).toBe(true);
  });

  it('should return false for null or undefined', () => {
    expect(isHost(null)).toBe(false);
    expect(isHost(undefined)).toBe(false);
  });
});
