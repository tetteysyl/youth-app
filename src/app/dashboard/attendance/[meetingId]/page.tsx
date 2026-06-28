"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, getDocs, collection, updateDoc, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";
import { can } from "@/lib/roles";
import { CheckCircle, XCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function AttendancePage() {
  const { meetingId } = useParams<{ meetingId: string }>();
  const { user } = useAuthStore();
  const router = useRouter();
  const [meeting, setMeeting] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    if (!user || !can.markAttendance(user.role)) {
      router.replace("/dashboard");
      return;
    }
    const load = async () => {
      const meetSnap = await getDoc(doc(db, "meetings", meetingId));
      if (meetSnap.exists()) setMeeting({ id: meetSnap.id, ...meetSnap.data() });

      const membersQ = query(collection(db, "members"), where("role", "!=", "pending"));
      const membersSnap = await getDocs(membersQ);
      const list = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMembers(list);

      // Pre-populate from saved attendees
      const saved = meetSnap.data()?.attendees || [];
      const init: Record<string, boolean> = {};
      list.forEach((m: any) => { init[m.id] = saved.includes(m.id); });
      setAttendance(init);
    };
    load();
  }, [meetingId, user, router]);

  const toggle = (uid: string) => {
    setAttendance((prev) => ({ ...prev, [uid]: !prev[uid] }));
  };

  const saveAttendance = async () => {
    setSaving(true);
    try {
      const presentIds = Object.entries(attendance).filter(([, v]) => v).map(([k]) => k);
      await updateDoc(doc(db, "meetings", meetingId), { attendees: presentIds, status: "ongoing" });
      // Notify present members
      await fetch("/api/notify-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, meetingTitle: meeting?.title, presentIds }),
      });
      toast.success("Attendance saved and members notified!");
    } catch {
      toast.error("Failed to save attendance.");
    } finally {
      setSaving(false);
    }
  };

  const endMeeting = async () => {
    setEnding(true);
    try {
      const presentIds = Object.entries(attendance).filter(([, v]) => v).map(([k]) => k);
      const absentIds = members.filter((m) => !presentIds.includes(m.id)).map((m) => m.id);

      await updateDoc(doc(db, "meetings", meetingId), {
        attendees: presentIds,
        status: "ended",
        endedAt: new Date().toISOString(),
      });

      // Send absence inquiry emails
      await fetch("/api/send-absence-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingId,
          meetingTitle: meeting?.title,
          meetingDate: meeting?.date,
          absentIds,
        }),
      });

      toast.success("Meeting ended. Absence inquiry emails sent to absent members.");
      router.replace("/dashboard/meetings");
    } catch {
      toast.error("Failed to end meeting.");
    } finally {
      setEnding(false);
    }
  };

  if (!meeting) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  const presentCount = Object.values(attendance).filter(Boolean).length;

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Attendance</h1>
        <p className="text-gray-500 text-sm">{meeting.title} — {meeting.date} at {meeting.time}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex justify-between text-sm text-gray-600 mb-4">
          <span>Total members: <strong>{members.length}</strong></span>
          <span>Present: <strong className="text-green-600">{presentCount}</strong></span>
          <span>Absent: <strong className="text-red-500">{members.length - presentCount}</strong></span>
        </div>

        <div className="space-y-2">
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                attendance[m.id]
                  ? "border-green-200 bg-green-50"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              {attendance[m.id]
                ? <CheckCircle size={20} className="text-green-500 shrink-0" />
                : <XCircle size={20} className="text-gray-300 shrink-0" />}
              <div>
                <p className="text-sm font-medium text-gray-800">{m.displayName}</p>
                <p className="text-xs text-gray-400">{m.email}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={saveAttendance} disabled={saving}
          className="flex-1 bg-[#1a3a5c] text-white py-3 rounded-xl font-medium disabled:opacity-50">
          {saving ? "Saving..." : "Save Attendance"}
        </button>
        <button onClick={endMeeting} disabled={ending}
          className="flex-1 bg-red-600 text-white py-3 rounded-xl font-medium disabled:opacity-50">
          {ending ? "Ending..." : "End Meeting"}
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Ending the meeting will send an absence inquiry email to all absent members.
      </p>
    </div>
  );
}
