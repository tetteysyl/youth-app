"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";
import { can } from "@/lib/roles";
import { Plus, Calendar } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";

export default function EventsPage() {
  const { user } = useAuthStore();
  const [events, setEvents] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", date: "", location: "" });
  const [saving, setSaving] = useState(false);

  const loadEvents = async () => {
    const q = query(collection(db, "events"), orderBy("date", "asc"));
    const snap = await getDocs(q);
    setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { loadEvents(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addDoc(collection(db, "events"), {
        ...form,
        createdBy: user?.uid,
        createdAt: serverTimestamp(),
      });
      toast.success("Event added!");
      setForm({ title: "", description: "", date: "", location: "" });
      setShowForm(false);
      loadEvents();
    } catch {
      toast.error("Failed to add event.");
    } finally {
      setSaving(false);
    }
  };

  const isManager = user && can.scheduleMeeting(user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Events & Activities</h1>
          <p className="text-gray-500 text-sm">Upcoming guild activities and announcements</p>
        </div>
        {isManager && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-[#1a3a5c] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#142d47] transition-colors"
          >
            <Plus size={16} /> Add Event
          </button>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-gray-800 mb-4">New Event</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <input required placeholder="Event Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
              <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
              <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
              <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]" />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-200 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-[#1a3a5c] text-white py-2 rounded-lg text-sm disabled:opacity-50">
                  {saving ? "Saving..." : "Save Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {events.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Calendar size={40} className="mx-auto mb-3 opacity-40" />
            <p>No events yet</p>
          </div>
        )}
        {events.map((ev) => (
          <div key={ev.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex gap-4">
            <div className="bg-[#1a3a5c] text-white text-center rounded-lg p-3 min-w-[56px]">
              <p className="text-xs">{ev.date ? format(new Date(ev.date), "MMM") : "—"}</p>
              <p className="text-xl font-bold leading-none">{ev.date ? format(new Date(ev.date), "d") : "—"}</p>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-800">{ev.title}</h3>
              <p className="text-sm text-gray-500 mt-1">{ev.description}</p>
              {ev.location && <p className="text-xs text-gray-400 mt-1">📍 {ev.location}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
