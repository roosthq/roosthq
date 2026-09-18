import { BASE_URL } from './api';

// Shared by Display.tsx and Screensaver.tsx - pulled out to its own module so
// neither has to import the other just to reuse these (Display already
// renders Screensaver; importing back the other way would be circular).
export const displayToken = new URLSearchParams(window.location.search).get('token');
export const displayConfigId = new URLSearchParams(window.location.search).get('config');

// Server errors on these routes ARE already written in plain English
// (BadRequestException('...') etc, see api.ts's req() for the same
// convention) - throwing the bare HTTP status code instead of that message
// meant a failure here showed "401" or "500" to whoever caught it, not
// what actually went wrong.
async function messageFor(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message : Array.isArray(body?.message) ? body.message[0] : null;
  return message || `${res.status} ${res.statusText}`;
}

export async function dget<T>(path: string, extra: Record<string, string> = {}): Promise<T> {
  const sp = new URLSearchParams(extra);
  if (displayToken) sp.set('token', displayToken);
  if (displayConfigId) sp.set('config', displayConfigId);
  const qs = sp.toString();
  const res = await fetch(`${BASE_URL}${path}${qs ? `?${qs}` : ''}`, { credentials: 'include' });
  if (!res.ok) throw new Error(await messageFor(res));
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
  if (!res.ok) throw new Error(await messageFor(res));
  return (await res.json()) as T;
}
