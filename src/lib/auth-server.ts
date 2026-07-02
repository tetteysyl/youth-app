import { adminAuth, adminDb } from "./firebase-admin";
import { NextRequest } from "next/server";

export interface AuthedUser {
  uid: string;
  role: string;
  displayName: string;
  email: string;
}

/** Verify the Firebase ID token from the Authorization header. Returns null if missing or invalid. */
export async function requireAuth(req: NextRequest): Promise<{ uid: string } | null> {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}

/** Verify token AND fetch the member's Firestore profile (role, displayName, email). */
export async function requireAuthWithRole(req: NextRequest): Promise<AuthedUser | null> {
  const authed = await requireAuth(req);
  if (!authed) return null;
  const snap = await adminDb.collection("members").doc(authed.uid).get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  if (data.role === "pending" || data.role === "rejected") return null;
  return {
    uid: authed.uid,
    role: data.role ?? "member",
    displayName: data.displayName ?? "",
    email: data.email ?? "",
  };
}

export function unauth() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return Response.json({ error: "Forbidden" }, { status: 403 });
}
