import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { requireAuth, unauth, forbidden } from "@/lib/auth-server";

export const runtime = "nodejs";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_SIZE = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const authed = await requireAuth(req);
  if (!authed) return unauth();
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const uid = form.get("uid") as string | null;
    if (!file || !uid) return NextResponse.json({ error: "Missing file or uid" }, { status: 400 });
    if (uid !== authed.uid) return forbidden();
    if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: "Only JPEG, PNG, WebP, or GIF images are allowed" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "Image exceeds 2MB" }, { status: 400 });

    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const dest = `profile-photos/${uid}.${ext}`;
    const bucket = adminStorage.bucket();
    const gcsFile = bucket.file(dest);
    const buffer = Buffer.from(await file.arrayBuffer());
    await gcsFile.save(buffer, { contentType: file.type, public: true });
    const photoURL = `https://storage.googleapis.com/${bucket.name}/${dest}`;
    await adminDb.collection("members").doc(uid).update({ photoURL });
    return NextResponse.json({ photoURL });
  } catch { return NextResponse.json({ error: "Upload failed" }, { status: 500 }); }
}
