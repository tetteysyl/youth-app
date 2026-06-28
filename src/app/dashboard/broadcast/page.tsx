"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";
import { can } from "@/lib/roles";
import { useRouter } from "next/navigation";
import { Megaphone, Send } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";

export default function BroadcastPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);

  useEffect(() => {
    if (!user || !can.sendBroadcast(user.role)) { router.replace("/dashboard"); return; }
    const load = async () => {
      const q = query(collection(db, "broadcasts"), orderBy("sentAt", "desc"));
      const snap = await getDocs(q);
      setBroadcasts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    load();
  }, [user]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await addDoc(collection(db, "broadcasts"), {
        subject,
        message,
        sentBy: user?.uid,
        sentByName: user?.displayName,
        sentAt: serverTimestamp(),
      });

      await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, senderName: user?.displayName }),
      });

      toast.success("Broadcast sent to all members!");
      setSubject("");
      setMessage("");
      const q = query(collection(db, "broadcasts"), orderBy("sentAt", "desc"));
      const snap = await getDocs(q);
      setBroadcasts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error("Failed to send broadcast.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Broadcast</h1>
        <p className="text-gray-500 text-sm">Send messages to all guild members</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Megaphone size={18} className="text-[#1a3a5c]" /> New Broadcast
        </h2>
        <form onSubmit={handleSend} className="space-y-3">
          <input
            required
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
          />
          <textarea
            required
            placeholder="Write your message to all members..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
          />
          <button type="submit" disabled={sending}
            className="w-full bg-[#1a3a5c] text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-[#142d47]">
            <Send size={16} />
            {sending ? "Sending..." : "Send to All Members"}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Broadcast History</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {broadcasts.length === 0 && (
            <p className="text-center py-8 text-gray-400 text-sm">No broadcasts yet</p>
          )}
          {broadcasts.map((b) => (
            <div key={b.id} className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="font-medium text-sm text-gray-800">{b.subject}</p>
                <p className="text-xs text-gray-400">
                  {b.sentAt?.toDate ? format(b.sentAt.toDate(), "MMM d, yyyy") : "—"}
                </p>
              </div>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{b.message}</p>
              <p className="text-xs text-gray-400 mt-2">— {b.sentByName}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
