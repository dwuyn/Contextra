import { SignJWT, jwtVerify } from "jose";

export interface CollaborationTokenPayload {
  [key: string]: unknown;
  userId: string;
  projectId: string;
  chapterId: string;
  name: string;
  profileImageUrl?: string | null;
  readOnly: boolean;
}

function getCollaborationKey() {
  const secret = process.env.COLLAB_JWT_SECRET || process.env.JWT_SECRET;

  if (
    (!secret || secret === "development-collab-secret-change-me" || secret === "development-secret-change-me") &&
    process.env.NODE_ENV !== "development" &&
    process.env.NODE_ENV !== "test"
  ) {
    throw new Error("COLLAB_JWT_SECRET or JWT_SECRET must be set to a secure, non-placeholder value in non-development environments");
  }

  const key = new TextEncoder().encode(secret || "development-collab-secret-change-me");
  
  if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_COLLAB_DEBUG === "true") {
    console.log("[auth] getCollaborationKey - source:", process.env.COLLAB_JWT_SECRET ? "COLLAB_JWT_SECRET" : process.env.JWT_SECRET ? "JWT_SECRET" : "fallback", "| secret length:", key.length);
  }
  
  return key;
}

export async function createCollaborationToken(payload: CollaborationTokenPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getCollaborationKey());
}

export async function verifyCollaborationToken(token: string): Promise<CollaborationTokenPayload> {
  const { payload } = await jwtVerify(token, getCollaborationKey(), {
    algorithms: ["HS256"],
  });

  if (
    typeof payload.userId !== "string" ||
    typeof payload.projectId !== "string" ||
    typeof payload.chapterId !== "string" ||
    typeof payload.name !== "string" ||
    typeof payload.readOnly !== "boolean"
  ) {
    throw new Error("Invalid collaboration token");
  }

  return {
    userId: payload.userId,
    projectId: payload.projectId,
    chapterId: payload.chapterId,
    name: payload.name,
    profileImageUrl: typeof payload.profileImageUrl === "string" ? payload.profileImageUrl : null,
    readOnly: payload.readOnly,
  };
}
