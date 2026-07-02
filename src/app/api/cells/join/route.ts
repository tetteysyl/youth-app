import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuthWithRole, unauth, forbidden } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  const caller = await requireAuthWithRole(req);
  if (!caller) return unauth();
  if (caller.role !== "president") return forbidden();

  try {
    const { cellName, memberId, memberName, notify } = await req.json();
    if (!memberId || !cellName || cellName === "none") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Remove member from any other cell they might already be in
    const existingSnap = await adminDb.collection("cells").where("memberIds", "array-contains", memberId).get();
    const batch = adminDb.batch();
    existingSnap.docs.forEach((d) => {
      const ids: string[] = d.data().memberIds || [];
      batch.update(d.ref, { memberIds: ids.filter((id) => id !== memberId) });
    });
    if (existingSnap.docs.length > 0) await batch.commit();

    let cellId: string;
    let created = false;

    // Find or create the target cell by name
    const targetSnap = await adminDb.collection("cells").where("name", "==", cellName).limit(1).get();
    if (!targetSnap.empty) {
      const targetDoc = targetSnap.docs[0];
      const ids: string[] = targetDoc.data().memberIds || [];
      if (!ids.includes(memberId)) {
        await targetDoc.ref.update({ memberIds: [...ids, memberId] });
      }
      cellId = targetDoc.id;
    } else {
      const ref = await adminDb.collection("cells").add({
        name: cellName,
        leaderId: "",
        leaderName: "",
        memberIds: [memberId],
        createdBy: "system",
        createdAt: FieldValue.serverTimestamp(),
      });
      cellId = ref.id;
      created = true;
    }

    if (notify) {
      await adminDb.collection("notifications").add({
        userId: memberId,
        title: "You've been assigned to a cell",
        body: `The President has assigned you to ${cellName}.`,
        type: "broadcast",
        read: false,
        createdAt: new Date(),
      });
    }

    return NextResponse.json({ ok: true, cellId, created });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
