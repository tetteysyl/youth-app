import { NextRequest, NextResponse } from "next/server";
import { adminDb, getAdminApp } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// GET /api/reports — list reports. Published reports are visible to everyone;
// pending (draft) reports are only returned so approvers can review them (filtered client-side by permission).
export async function GET() {
  try {
    const snap = await adminDb.collection("reports").get();
    const reports = snap.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          title: data.title ?? "",
          description: data.description ?? "",
          type: data.type ?? "text",
          content: data.content ?? "",
          fileUrl: data.fileUrl ?? null,
          fileName: data.fileName ?? null,
          status: data.status ?? "published", // "pending" | "published"
          publishedBy: data.publishedBy ?? "",
          publishedByName: data.publishedByName ?? "",
          publishedAt: data.publishedAt?.toMillis?.() ?? null,
          submittedBy: data.submittedBy ?? "",
          submittedByName: data.submittedByName ?? "",
          submittedAt: data.submittedAt?.toMillis?.() ?? null,
        };
      })
      .sort((a, b) => (b.publishedAt ?? b.submittedAt ?? 0) - (a.publishedAt ?? a.submittedAt ?? 0));
    return NextResponse.json(reports);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/reports — submit a report (text or PDF upload)
// canPublishDirectly = true (President/General Secretary) -> goes live immediately
// canPublishDirectly = false (Assistant General Secretary) -> saved as "pending", needs approval
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const title = formData.get("title") as string;
      const description = (formData.get("description") as string) || "";
      const publishedBy = formData.get("publishedBy") as string;
      const publishedByName = formData.get("publishedByName") as string;
      const canPublishDirectly = formData.get("canPublishDirectly") === "true";

      if (!file || !title || !publishedBy) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const bucket = getStorage(getAdminApp()).bucket();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `reports/${Date.now()}_${safeName}`;
      const fileRef = bucket.file(storagePath);

      const token = crypto.randomUUID();
      await fileRef.save(buffer, {
        metadata: {
          contentType: file.type || "application/pdf",
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });

      const fileUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

      const payload: any = {
        title, description,
        type: "pdf",
        fileUrl,
        fileName: file.name,
        status: canPublishDirectly ? "published" : "pending",
      };
      if (canPublishDirectly) {
        payload.publishedBy = publishedBy;
        payload.publishedByName = publishedByName;
        payload.publishedAt = FieldValue.serverTimestamp();
      } else {
        payload.submittedBy = publishedBy;
        payload.submittedByName = publishedByName;
        payload.submittedAt = FieldValue.serverTimestamp();
      }

      const ref = await adminDb.collection("reports").add(payload);

      if (!canPublishDirectly) await notifyApprovers(title, publishedByName);

      return NextResponse.json({ id: ref.id, fileUrl, status: payload.status });
    } else {
      const {
        title, description, content, publishedBy, publishedByName, canPublishDirectly,
        type, fileUrl, fileName,
      } = await req.json();
      if (!title || !publishedBy) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }

      const isPdf = type === "pdf";
      if (isPdf && !fileUrl) {
        return NextResponse.json({ error: "Missing fileUrl for PDF report" }, { status: 400 });
      }

      const payload: any = {
        title,
        description: description || "",
        type: isPdf ? "pdf" : "text",
        content: isPdf ? "" : (content || ""),
        fileUrl: isPdf ? fileUrl : null,
        fileName: isPdf ? (fileName || "document.pdf") : null,
        status: canPublishDirectly ? "published" : "pending",
      };
      if (canPublishDirectly) {
        payload.publishedBy = publishedBy;
        payload.publishedByName = publishedByName;
        payload.publishedAt = FieldValue.serverTimestamp();
      } else {
        payload.submittedBy = publishedBy;
        payload.submittedByName = publishedByName;
        payload.submittedAt = FieldValue.serverTimestamp();
      }

      const ref = await adminDb.collection("reports").add(payload);

      if (!canPublishDirectly) await notifyApprovers(title, publishedByName);

      return NextResponse.json({ id: ref.id, status: payload.status });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/reports — approve a pending report (President / General Secretary only — enforced client-side + here)
export async function PATCH(req: NextRequest) {
  try {
    const { reportId, action, approvedBy, approvedByName } = await req.json();
    if (!reportId || !action) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    if (action === "approve") {
      await adminDb.collection("reports").doc(reportId).update({
        status: "published",
        publishedBy: approvedBy || "",
        publishedByName: approvedByName || "",
        publishedAt: FieldValue.serverTimestamp(),
      });
    } else if (action === "reject") {
      await adminDb.collection("reports").doc(reportId).delete();
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/reports — delete a report
export async function DELETE(req: NextRequest) {
  try {
    const { reportId } = await req.json();
    if (!reportId) return NextResponse.json({ error: "Missing reportId" }, { status: 400 });
    await adminDb.collection("reports").doc(reportId).delete();
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function notifyApprovers(title: string, submitterName: string) {
  const snap = await adminDb.collection("members")
    .where("role", "in", ["president", "general_secretary"])
    .get();
  const batch = adminDb.batch();
  const now = new Date();
  snap.docs.forEach((d) => {
    const ref = adminDb.collection("notifications").doc();
    batch.set(ref, {
      userId: d.id,
      title: `Report awaiting approval`,
      body: `${submitterName} submitted "${title}" for your approval.`,
      type: "broadcast",
      read: false,
      createdAt: now,
    });
  });
  await batch.commit();
}
