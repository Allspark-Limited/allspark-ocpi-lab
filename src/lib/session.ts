const SESSION_KEY = 'ocpi-lab-session';

export function saveSession(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_KEY, token);
}

export function getSession(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(SESSION_KEY);
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getSession();
  return token ? { authorization: `Bearer ${token}` } : {};
}
