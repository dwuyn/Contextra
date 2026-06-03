import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SESSION_REVERIFY_INTERVAL_MS = 5 * 60 * 1000;

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  expires?: string | Date;
  lastVerifiedAt?: number;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

export type SessionUpdateResult =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "missing" }
  | { kind: "refreshed"; response: NextResponse };

function getJwtKey() {
  const secretKey = process.env.JWT_SECRET;

  if (!secretKey && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set in production");
  }

  return new TextEncoder().encode(secretKey || "development-secret-change-me");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtKey());
}

export async function decrypt(input: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(input, getJwtKey(), {
    algorithms: ["HS256"],
  });
  if (
    typeof payload.userId !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.name !== "string"
  ) {
    throw new Error("Invalid session payload");
  }

  return payload as SessionPayload;
}

export async function getSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  if (!session) return null;
  try {
    return await decrypt(session);
  } catch {
    return null;
  }
}

export async function updateSession(
  request: NextRequest,
): Promise<SessionUpdateResult> {
  const session = request.cookies.get("session")?.value;
  if (!session) return { kind: "none" };

  let parsed: SessionPayload;
  try {
    parsed = await decrypt(session);
  } catch {
    return { kind: "invalid" };
  }

  const now = Date.now();
  const lastVerified = typeof parsed.lastVerifiedAt === "number" ? parsed.lastVerifiedAt : 0;

  if (now - lastVerified < SESSION_REVERIFY_INTERVAL_MS) {
    parsed.expires = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = NextResponse.next();
    res.cookies.set({
      name: "session",
      value: await encrypt(parsed),
      httpOnly: true,
      expires: new Date(parsed.expires),
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
    return { kind: "refreshed", response: res };
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.userId },
    select: { id: true },
  });
  if (!user) {
    return { kind: "missing" };
  }

  parsed.lastVerifiedAt = now;
  parsed.expires = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const res = NextResponse.next();
  res.cookies.set({
    name: "session",
    value: await encrypt(parsed),
    httpOnly: true,
    expires: new Date(parsed.expires),
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  return { kind: "refreshed", response: res };
}
