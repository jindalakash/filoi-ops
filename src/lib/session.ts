// Edge-safe session helpers (used by proxy.ts and server code)
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "filoi_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type SessionPayload = { uid: string; role: string; name: string };

function key() {
  return new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret");
}

export async function signSession(p: SessionPayload) {
  return new SignJWT(p)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
}

export async function verifySession(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE;
