import * as jwt from 'jsonwebtoken';

export interface SessionPayload {
  userId: string;
  familyId: string;
}

export function signSession(p: SessionPayload): string {
  return jwt.sign(p, process.env.SESSION_SECRET as string, { expiresIn: '30d' });
}

export function verifySession(token: string): SessionPayload {
  const decoded = jwt.verify(token, process.env.SESSION_SECRET as string) as jwt.JwtPayload;
  return { userId: decoded.userId, familyId: decoded.familyId };
}
