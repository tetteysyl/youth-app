import { NextRequest, NextResponse } from "next/server";
import { adminDb, getAdminApp } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { requireAuth, requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

const PUBLISHERS = ["president", "general_secretary"];
const ALLOWED_REPORT_ROLES = ["president", "general_secretary", "assistant_general_secretary", "financial_secretary", "treasurer"];
const MAX_PDF_SIZE = 10 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const authed = await requireAuth(req);
  if (!authed) return unauth();
  try {
    const snap = await adminDb.collection("reports").get();
    const reports = snap.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          id: d.id, title: data.title ?? "", description: data.description ?? "",
          type: data.type ?? "text", content: data.content ?? "", fileUrl: data.fileUrl ?? null,
          fileName: data.fileName ?? null, status: data.status ?? "published",
          publishedBy: data.publishedBy ?? "", publishedByName: data.publishedByName ?? "",
          publishedAt: data.publishedAt?.toMillis?.() ?? null, submittedBy: data.submittedBy ?? "",
          submittedByName: data.submittedByName ?? "", submittedAt: data.submittedAt?.toMillis?.() ?? null,
        };
      })
      .sort((a, b) => (b.publishedAt ?? b.submittedAt ?? 0) - (a.publishedAt ?? a.submittedAt ?? 0));
    return NextResponse.json(reports);
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!ALLOWED_REPORT_ROLES.includes(caller.role)) return forbidden();

  try {
    const contentType = req.headers.get("content-type") ?? "";
    const canPublishDirectly = PUBLISHERS.includes(caller.role);

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const title = ((formData.get("title") as string) ?? "").trim().slice(0, 200);
      const description = ((formData.get("description") as string) ?? "").trim().slice(0, 1000);
      if (!file || !title) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      if (file.type !== "application/pdf") return NextResponse.json({ error: "Only PDF files allowed" }, { status: 400 });
      if (file.size > MAX_PDF_SIZE) return NextResponse.json({ error: "PDF too large (max 10MB)" }, { status: 400 });
      const buffer = Buffer.from(await file.arrayBuffer());
      const bucket = getStorage(getAdminApp()).bucket();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
      const storagePath = `reports/${Date.now()}_${safeName}`;
      const fileRef = bucket.file(storagePath);
      const token = crypto.randomUUID();
      await fileRef.save(buffer, { metadata: { contentType: "application/pdf", metadata: { firebaseStorageDownloadTokens: token } } });
      const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
      const payload: any = { title, description, type: "pdf", fileUrl, fileName: file.name, status: canPublishDirectly ? "published" : "pending" };
      if (canPublishDirectly) { payload.publishedBy = caller.uid; payload.publishedByName = caller.displayName; payload.publishedAt = FieldValue.serverTimestamp(); }
      else { payload.submittedBy = caller.uid; payload.submittedByName = caller.displayName; payload.submittedAt = FieldValue.serverTimestamp(); }
      const ref = await adminDb.collection("reports").add(payload);
      if (!canPublishDirectly) await notifyApprovers(title, caller.displayName);
      return NextResponse.json({ id: ref.id, fileUrl, status: payload.status });
    } else {
      const { title, description, content, type, fileUrl, fileName } = await req.json();
      if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });
      const isPdf = type === "pdf";
      const payload: any = {
        title: String(title).slice(0, 200),
        description: String(description || "").slice(0, 1000),
        type: isPdf ? "pdf" : "text",
        content: isPdf ? "" : String(content || "").slice(0, 20000),
        fileUrl: isPdf ? fileUrl : null,
        fileName: isPdf ? (fileName || "document.pdf") : null,
        status: canPublishDirectly ? "published" : "pending",
      };
      if (canPublishDirectly) { payload.publishedBy = caller.uid; payload.publishedByName = caller.displayName; payload.publishedAt = FieldValue.serverTimestamp(); }
      else { payload.submittedBy = caller.uid; payload.submittedByName = caller.displayName; payload.submittedAt = FieldValue.serverTimestamp(); }
      const ref = await adminDb.collection("reports").add(payload);
      if (!canPublishDirectly) await notifyApprovers(title, caller.displayName);
      return NextResponse.json({ id: ref.id, status: payload.status });
    }
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!PUBLISHERS.includes(caller.role)) return forbidden();
  try {
    const { reportId, action } = await req.json();
    if (!reportId || !action) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const ALLOWED_ACTIONS = ["approve", "reject"];
    if (!ALLOWED_ACTIONS.includes(action)) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    if (action === "approve") {
      await adminDb.collection("reports").doc(reportId).update({ status: "published", publishedBy: caller.uid, publishedByName: caller.displayName, publishedAt: FieldValue.serverTimestamp() });
    } else {
      await adminDb.collection("reports").doc(reportId).delete();
    }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (!PUBLISHERS.includes(caller.role)) return forbidden();
  try {
    const { reportId } = await req.json();
    if (!reportId) return NextResponse.json({ error: "Missing reportId" }, { status: 400 });
    await adminDb.collection("reports").doc(reportId).delete();
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 500 }); }
}

async function notifyApprovers(title: string, submitterName: string) {
  const snap = await adminDb.collection("members").where("role", "in", ["president", "general_secretary"]).get();
  const batch = adminDb.batch();
  const now = new Date();
  snap.docs.forEach((d) => {
    const ref = adminDb.collection("notifications").doc();
    batch.set(ref, { userId: d.id, title: "Report awaiting approval", body: `${submitterName} submitted "${title}" for your approval.`, type: "broadcast", read: false, createdAt: now });
  });
  await batch.commit();
}
