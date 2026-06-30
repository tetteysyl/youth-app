"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { can } from "@/lib/roles";
import { CheckCircle, XCircle, Clock, ThumbsUp, ThumbsDown, Ban } from "lucide-react";
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
  const [approving, setApproving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [meetRes, membersRes] = await Promise.all([
        fetch(`/api/attendance?meetingId=${meetingId}`),
        fetch("/api/get-members"),
      ]);
      if (!meetRes.ok) { setError((await meetRes.json()).error || "Failed to load meeting"); return; }
      const meetData = await meetRes.json();
      setMeeting(meetData);
      const memberList = await membersRes.json();
      const list = Array.isArray(memberList) ? memberList : [];
      setMembers(list);
      const saved: string[] = meetData.attendees || [];
      const init: Record<string, boolean> = {};
      list.forEach((m: any) => { init[m.id] = saved.includes(m.id); });
      setAttendance(init);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    }
  }, [meetingId]);

  useEffect(() => {
    if (!user) return;
    if (!can.markAttendance(user.role)) { router.replace("/dashboard"); return; }
    loadData();
  }, [meetingId, user, router, loadData]);

  const toggle = (uid: string) => {
    const excluded: string[] = meeting?.excludedMemberIds ?? [];
    if (excluded.includes(uid)) {
      toast.error("This member is not included in this meeting.");
      return;
    }
    setAttendance((prev) => ({ ...prev, [uid]: !prev[uid] }));
  };

  const handleApprove = async (uid: string) => {
    setApproving(uid);
    try {
      const res = await fetch("/api/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, userId: uid, action: "approve" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Attendance approved!");
      // Reflect locally immediately
      setMeeting((prev: any) => ({
        ...prev,
        selfCheckIns: (prev.selfCheckIns || []).filter((id: string) => id !== uid),
        attendees: [...(prev.attendees || []), uid],
      }));
      setAttendance((prev) => ({ ...prev, [uid]: true }));
    } catch (e: any) {
      toast.error("Failed to approve: " + e.message);
    } finally {
      setApproving(null);
    }
  };

  const handleReject = async (uid: string) => {
    setApproving(uid);
    try {
      const res = await fetch("/api/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, userId: uid, action: "reject" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Check-in rejected.");
      setMeeting((prev: any) => ({
        ...prev,
        selfCheckIns: (prev.selfCheckIns || []).filter((id: string) => id !== uid),
      }));
    } catch (e: any) {
      toast.error("Failed to reject: " + e.message);
    } finally {
      setApproving(null);
    }
  };

  const saveAttendance = async () => {
    setSaving(true);
    try {
      const presentIds = Object.entries(attendance).filter(([, v]) => v).map(([k]) => k);
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, presentIds, action: "save" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetch("/api/notify-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, meetingTitle: meeting?.title, presentIds }),
      });
      toast.success("Attendance saved and members notified!");
    } catch (e: any) {
      toast.error("Failed to save attendance: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const endMeeting = async () => {
    setEnding(true);
    try {
      const presentIds = Object.entries(attendance).filter(([, v]) => v).map(([k]) => k);
      const absentIds = eligibleMembers.filter((m) => !presentIds.includes(m.id)).map((m) => m.id);
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, presentIds, action: "end" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetch("/api/send-absence-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, meetingTitle: meeting?.title, meetingDate: meeting?.date, absentIds }),
      });
      toast.success("Meeting ended. Absence inquiry emails sent.");
      router.replace("/dashboard/meetings");
    } catch (e: any) {
      toast.error("Failed to end meeting: " + e.message);
    } finally {
      setEnding(false);
    }
  };

  if (error) return (
    <div className="text-center py-12">
      <p className="text-red-500 font-medium">{error}</p>
      <button onClick={() => router.back()} className="mt-3 text-sm text-[#3b1f6e] underline">Go back</button>
    </div>
  );
  if (!meeting) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  const selfCheckIns: string[] = meeting.selfCheckIns ?? [];
  const excludedMemberIds: string[] = meeting.excludedMemberIds ?? [];
  const pendingMembers = members.filter((m) => selfCheckIns.includes(m.id));
  const eligibleMembers = members.filter((m) => !excludedMemberIds.includes(m.id));
  const presentCount = Object.values(attendance).filter(Boolean).length;

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Mark Attendance</h1>
        <p className="text-gray-500 text-sm">{meeting.title} — {meeting.date} at {meeting.time}</p>
      </div>

      {/* Pending self-check-ins */}
      {pendingMembers.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-yellow-200 flex items-center gap-2">
            <Clock size={16} className="text-yellow-600" />
            <p className="font-semibold text-yellow-800 text-sm">
              Self Check-Ins Awaiting Approval ({pendingMembers.length})
            </p>
          </div>
          <div className="divide-y divide-yellow-100">
            {pendingMembers.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-[#f0c940] flex items-center justify-center font-bold text-[#3b1f6e] text-sm shrink-0">
                  {m.displayName?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{m.displayName}</p>
                  <p className="text-xs text-gray-400">{m.email}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleApprove(m.id)}
                    disabled={approving === m.id}
                    className="flex items-center gap-1 bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <ThumbsUp size={12} /> Approve
                  </button>
                  <button
                    onClick={() => handleReject(m.id)}
                    disabled={approving === m.id}
                    className="flex items-center gap-1 bg-red-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50"
                  >
                    <ThumbsDown size={12} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual attendance list */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex justify-between text-sm text-gray-600 mb-4">
          <span>Total: <strong>{eligibleMembers.length}</strong></span>
          <span>Present: <strong className="text-green-600">{presentCount}</strong></span>
          <span>Absent: <strong className="text-red-500">{eligibleMembers.length - presentCount}</strong></span>
        </div>

        <div className="space-y-2">
          {members.length === 0 && (
            <p className="text-center py-4 text-gray-400 text-sm">Loading members...</p>
          )}
          {members.map((m) => {
            const isExcluded = excludedMemberIds.includes(m.id);
            if (isExcluded) {
              return (
                <div key={m.id} className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50 opacity-60">
                  <Ban size={20} className="text-gray-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-500">{m.displayName}</p>
                    <p className="text-xs text-gray-400">{m.email}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">Not included</span>
                </div>
              );
            }
            return (
              <button key={m.id} onClick={() => toggle(m.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                  attendance[m.id] ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"
                }`}>
                {attendance[m.id]
                  ? <CheckCircle size={20} className="text-green-500 shrink-0" />
                  : <XCircle size={20} className="text-gray-300 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{m.displayName}</p>
                  <p className="text-xs text-gray-400">{m.email}</p>
                </div>
                {selfCheckIns.includes(m.id) && (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full shrink-0">
                    self-checked
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={saveAttendance} disabled={saving}
          className="flex-1 bg-[#3b1f6e] text-white py-3 rounded-xl font-medium disabled:opacity-50">
          {saving ? "Saving..." : "Save Attendance"}
        </button>
        <button onClick={endMeeting} disabled={ending}
          className="flex-1 bg-red-600 text-white py-3 rounded-xl font-medium disabled:opacity-50">
          {ending ? "Ending..." : "End Meeting"}
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Ending the meeting sends an absence inquiry email to all absent members.
      </p>
    </div>
  );
}
