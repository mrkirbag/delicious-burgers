import { SignJWT, jwtVerify } from 'jose';

import { env } from '@/lib/config/env';
import type { UserRole } from '@/lib/db/types';

const secret = new TextEncoder().encode(env.jwtSecret);

export type TokenPayload = {
  sub: string;
  username: string;
  role: UserRole;
};

export async function createToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({ username: payload.username, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || typeof payload.username !== 'string' || typeof payload.role !== 'string') {
      return null;
    }

    return {
      sub: payload.sub,
      username: payload.username,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}
