"use client";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/store";
import { can } from "@/lib/roles";
import { staleWhileRevalidate, invalidate } from "@/lib/cache";
import { Plus, Clock, CheckCircle, Ban } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";

export default function MeetingsPage() {
  const { user } = useAuthStore();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", date: "", time: "", agenda: "", location: "" });
  const [includeDistantMembers, setIncludeDistantMembers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);

  const loadMeetings = () => {
    setLoadError(null);
    staleWhileRevalidate("/api/meetings", 20_000, (data) => {
      if (Array.isArray(data)) { setMeetings(data); setLoadingMeetings(false); }
      else { setLoadError(data.error || "Failed to load meetings"); setLoadingMeetings(false); }
    });
  };

  useEffect(() => { loadMeetings(); }, []);

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, createdBy: user?.uid }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetch("/api/notify-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, date: form.date, time: form.time, includeDistantMembers }),
      });
      toast.success("Meeting scheduled and members notified!");
      setForm({ title: "", date: "", time: "", agenda: "", location: "" });
      setIncludeDistantMembers(true);
      setShowForm(false);
      invalidate("/api/meetings");
      loadMeetings();
    } catch (e: any) {
      toast.error("Failed to schedule meeting: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCheckIn = async (meetingId: string) => {
    if (!user) return;
    setCheckingIn(meetingId);
    try {
      const res = await fetch("/api/attendance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, userId: user.uid, action: "selfCheckin" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Checked in! Awaiting approval from leadership.");
      loadMeetings();
    } catch (e: any) {
      toast.error("Check-in failed: " + e.message);
    } finally {
      setCheckingIn(null);
    }
  };

  const canManage = user && can.scheduleMeeting(user.role);
  const canMarkAttendance = user && can.markAttendance(user.role);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      scheduled: "bg-blue-100 text-blue-700",
      ongoing: "bg-green-100 text-green-700",
      ended: "bg-gray-100 text-gray-600",
    };
    return map[status] || map.scheduled;
  };

  return (
    <div className="page-enter space-y-6">
      <div className="sticky top-0 z-20 -mx-4 lg:-mx-6 px-4 lg:px-6 py-3 bg-gray-100/95 backdrop-blur-sm flex items-center justify-between border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Meetings</h1>
          <p className="text-gray-500 text-sm">
            {canManage ? "Schedule and manage guild meetings" : "View upcoming meetings and check in when present"}
          </p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[#3b1f6e] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#2a1550] shrink-0">
            <Plus size={16} /> Schedule Meeting
          </button>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-gray-800 mb-4">Schedule Meeting</h3>
            <form onSubmit={handleSchedule} className="space-y-3">
              <input required placeholder="Meeting Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]" />
              <div className="grid grid-cols-2 gap-3">
                <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]" />
                <input required type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]" />
              </div>
              <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]" />
              <textarea placeholder="Agenda" value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })}
                rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]" />
              <label className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 cursor-pointer">
                <input type="checkbox" checked={includeDistantMembers}
                  onChange={(e) => setIncludeDistantMembers(e.target.checked)}
                  className="accent-[#3b1f6e] mt-0.5" />
                <span className="text-sm text-gray-700">
                  Include distant members
                  <span className="block text-xs text-gray-400 mt-0.5">
                    Uncheck to skip emailing members marked as distant for this meeting.
                  </span>
                </span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#3b1f6e] text-white py-2 rounded-lg text-sm disabled:opacity-50">
                  {saving ? "Scheduling..." : "Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {loadingMeetings && (
          <div className="stagger space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
                <div className="skeleton h-5 w-2/3" />
                <div className="skeleton h-4 w-1/2" />
                <div className="skeleton h-9 w-full mt-2" />
              </div>
            ))}
          </div>
        )}
        {!loadingMeetings && loadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">⚠️ {loadError}</div>
        )}
        {!loadingMeetings && !loadError && meetings.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Clock size={40} className="mx-auto mb-3 opacity-40" />
            <p>No meetings scheduled yet</p>
          </div>
        )}
        {!loadingMeetings && meetings.map((m) => {
          const selfCheckIns: string[] = m.selfCheckIns ?? [];
          const attendees: string[] = m.attendees ?? [];
          const excludedMemberIds: string[] = m.excludedMemberIds ?? [];
          const iCheckedIn = user ? selfCheckIns.includes(user.uid) : false;
          const iApproved = user ? attendees.includes(user.uid) : false;
          const iAmExcluded = user ? excludedMemberIds.includes(user.uid) : false;
          const isActive = m.status !== "ended";

          return (
            <div key={m.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800">{m.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {m.date ? format(new Date(m.date), "MMMM d, yyyy") : "—"} at {m.time}
                  </p>
                  {m.location && <p className="text-xs text-gray-400 mt-1">📍 {m.location}</p>}
                  {m.agenda && <p className="text-xs text-gray-500 mt-2 italic">{m.agenda}</p>}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${statusBadge(m.status)}`}>
                  {m.status}
                </span>
              </div>

              {isActive && (
                <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                  {/* Leader: mark attendance */}
                  {canMarkAttendance && (
                    <a href={`/dashboard/attendance/${m.id}`}
                      className="flex-1 bg-[#3b1f6e] text-white text-center py-2 rounded-lg text-sm hover:bg-[#2a1550]">
                      Mark Attendance
                      {selfCheckIns.length > 0 && (
                        <span className="ml-2 bg-yellow-400 text-[#3b1f6e] text-xs font-bold px-1.5 py-0.5 rounded-full">
                          {selfCheckIns.length} pending
                        </span>
                      )}
                    </a>
                  )}
                  {/* Regular member: self check-in */}
                  {!canMarkAttendance && (
                    iAmExcluded ? (
                      <div className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm bg-gray-50 text-gray-400 font-medium border border-gray-200">
                        <Ban size={15} /> Not included in this meeting
                      </div>
                    ) : iApproved ? (
                      <div className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm bg-green-50 text-green-700 font-medium border border-green-200">
                        <CheckCircle size={15} /> Attendance Confirmed
                      </div>
                    ) : iCheckedIn ? (
                      <div className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm bg-yellow-50 text-yellow-700 font-medium border border-yellow-200">
                        <Clock size={15} /> Awaiting Approval
                      </div>
                    ) : (
                      <button
                        onClick={() => handleCheckIn(m.id)}
                        disabled={checkingIn === m.id}
                        className="flex-1 bg-[#3b1f6e] text-white py-2 rounded-lg text-sm hover:bg-[#2a1550] disabled:opacity-50"
                      >
                        {checkingIn === m.id ? "Checking in..." : "I'm Present"}
                      </button>
                    )
                  )}
                </div>
              )}

              {m.status === "ended" && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
                  <CheckCircle size={13} />
                  {attendees.length} member{attendees.length !== 1 ? "s" : ""} attended
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
