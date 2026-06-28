"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, doc, updateDoc, query, orderBy, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";
import { can } from "@/lib/roles";
import { Plus, CheckCircle, XCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";

export default function MeetingsPage() {
  const { user } = useAuthStore();
  const [meetings, setMeetings] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", date: "", time: "", agenda: "", location: "" });
  const [saving, setSaving] = useState(false);

  const loadMeetings = async () => {
    const q = query(collection(db, "meetings"), orderBy("date", "desc"));
    const snap = await getDocs(q);
    setMeetings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { loadMeetings(); }, []);

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addDoc(collection(db, "meetings"), {
        ...form,
        status: "scheduled",
        createdBy: user?.uid,
        createdAt: serverTimestamp(),
        attendees: [],
      });
      // Notify all members via API
      await fetch("/api/notify-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, date: form.date, time: form.time }),
      });
      toast.success("Meeting scheduled and members notified!");
      setForm({ title: "", date: "", time: "", agenda: "", location: "" });
      setShowForm(false);
      loadMeetings();
    } catch {
      toast.error("Failed to schedule meeting.");
    } finally {
      setSaving(false);
    }
  };

  const canManage = user && can.scheduleMeeting(user.role);
  const canAttend = user && can.markAttendance(user.role);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      scheduled: "bg-blue-100 text-blue-700",
      ongoing: "bg-green-100 text-green-700",
      ended: "bg-gray-100 text-gray-600",
    };
    return map[status] || map.scheduled;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Meetings</h1>
          <p className="text-gray-500 text-sm">Schedule and manage guild meetings</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[#1a3a5c] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#142d47]">
            <Plus size={16} /> Schedule Meeting
          </button>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-gray-800 mb-4">Schedule Meeting</h3>
            <form onSubmit={handleSchedule} className="space-y-3">
              <input required placeholder="Meeting Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
              <div className="grid grid-cols-2 gap-3">
                <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
                <input required type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
              </div>
              <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
              <textarea placeholder="Agenda" value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })}
                rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#1a3a5c] text-white py-2 rounded-lg text-sm disabled:opacity-50">
                  {saving ? "Scheduling..." : "Schedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {meetings.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Clock size={40} className="mx-auto mb-3 opacity-40" />
            <p>No meetings scheduled yet</p>
          </div>
        )}
        {meetings.map((m) => (
          <div key={m.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-800">{m.title}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {m.date ? format(new Date(m.date), "MMMM d, yyyy") : "—"} at {m.time}
                </p>
                {m.location && <p className="text-xs text-gray-400 mt-1">📍 {m.location}</p>}
                {m.agenda && <p className="text-xs text-gray-500 mt-2 italic">{m.agenda}</p>}
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadge(m.status)}`}>
                {m.status}
              </span>
            </div>
            {canAttend && m.status !== "ended" && (
              <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                <a href={`/dashboard/attendance/${m.id}`}
                  className="flex-1 bg-[#1a3a5c] text-white text-center py-2 rounded-lg text-sm hover:bg-[#142d47]">
                  Mark Attendance
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
