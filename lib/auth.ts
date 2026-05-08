export const HOST_EMAIL = 'jduarte@intercorp.com.pe';

/**
 * Checks if the given email corresponds to the Host user.
 */
export function isHost(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === HOST_EMAIL.toLowerCase();
}
