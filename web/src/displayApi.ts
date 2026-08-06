import { BASE_URL } from './api';

// Shared by Display.tsx and Screensaver.tsx — pulled out to its own module so
// neither has to import the other just to reuse these (Display already
// renders Screensaver; importing back the other way would be circular).
export const displayToken = new URLSearchParams(window.location.search).get('token');
export const displayConfigId = new URLSearchParams(window.location.search).get('config');

export async function dget<T>(path: string, extra: Record<string, string> = {}): Promise<T> {
  const sp = new URLSearchParams(extra);
  if (displayToken) sp.set('token', displayToken);
  if (displayConfigId) sp.set('config', displayConfigId);
  const qs = sp.toString();
  const res = await fetch(`${BASE_URL}${path}${qs ? `?${qs}` : ''}`, { credentials: 'include' });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

export async function dpost<T>(path: string, body: unknown): Promise<T> {
  return dwrite('POST', path, body);
}

export async function dpatch<T>(path: string, body: unknown): Promise<T> {
  return dwrite('PATCH', path, body);
}

async function dwrite<T>(method: string, path: string, body: unknown): Promise<T> {
  const sp = new URLSearchParams();
  if (displayToken) sp.set('token', displayToken);
  if (displayConfigId) sp.set('config', displayConfigId);
  const qs = sp.toString();
  const res = await fetch(`${BASE_URL}${path}${qs ? `?${qs}` : ''}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}
