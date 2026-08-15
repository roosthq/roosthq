import * as jwt from 'jsonwebtoken';

export interface SessionPayload {
  userId: string;
  familyId: string;
  // Set only while the instance owner is ghosting as this user - the real
  // owner's own userId, so "return to owner" can rebuild their session
  // without a second round-trip through the DB to remember who they were.
  ghostedBy?: string;
  // Stamped by AuthGuard (not part of the signed JWT) when this request came
  // in via the x-kiosk-token header rather than the cookie - i.e. someone
  // else is driving a kiosk-selected profile, not that person's own signed-in
  // session. Safe to derive purely from which transport was used: it only
  // ever narrows what a request can do (see PresenceService.assertActionable),
  // never widens it.
  viaKiosk?: boolean;
}

export function signSession(p: SessionPayload): string {
  return jwt.sign(p, process.env.SESSION_SECRET as string, { expiresIn: '30d' });
}

// Short-lived token minted after a kiosk profile unlock. Same shape as a session,
// delivered via the x-kiosk-token header instead of a cookie.
export function signKiosk(p: SessionPayload): string {
  return jwt.sign(p, process.env.SESSION_SECRET as string, { expiresIn: '12h' });
}

export function verifySession(token: string): SessionPayload {
  const decoded = jwt.verify(token, process.env.SESSION_SECRET as string) as jwt.JwtPayload;
  return { userId: decoded.userId, familyId: decoded.familyId, ghostedBy: decoded.ghostedBy };
}
