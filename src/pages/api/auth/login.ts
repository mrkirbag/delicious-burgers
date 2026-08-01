import type { APIRoute } from 'astro';

import { createToken, SESSION_COOKIE } from '@/lib/auth';
import { authenticateUser } from '@/lib/auth/login-service';
import { checkRateLimit, getClientIp } from '@/lib/auth/rate-limit';

export const POST: APIRoute = async ({ request, cookies }) => {
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`login:${clientIp}`);

  if (!rateLimit.allowed) {
    const retryMinutes = Math.ceil(rateLimit.retryAfterMs / 60_000);
    return Response.json(
      {
        error: `Demasiados intentos. Intenta de nuevo en ${retryMinutes} minuto(s).`,
      },
      { status: 429 },
    );
  }

  let body: { username?: string; password?: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const username = body.username?.trim();
  const password = body.password;

  if (!username || !password) {
    return Response.json({ error: 'Usuario y contraseña son requeridos' }, { status: 400 });
  }

  const result = await authenticateUser(username, password);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  const token = await createToken({
    sub: result.user.id,
    username: result.user.username,
    role: result.user.role,
  });

  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: 60 * 60 * 8,
  });

  return Response.json({
    ok: true,
    user: {
      username: result.user.username,
      role: result.user.role,
    },
  });
};
