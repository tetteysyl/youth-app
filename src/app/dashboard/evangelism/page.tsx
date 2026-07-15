"use client";
import { authFetch } from "@/lib/auth-fetch";
import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";
import { can } from "@/lib/roles";
import { useRouter } from "next/navigation";
import { BookOpen, Send } from "lucide-react";
import toast from "react-hot-toast";

export default function EvangelismPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [members, setMembers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(true);
  const [quote, setQuote] = useState("");
  const [reference, setReference] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!user || !can.sendBibleQuote(user.role)) { router.replace("/dashboard"); return; }
    const load = async () => {
      const membersRes = await authFetch("/api/get-members").then((r) => r.json());
      setMembers(Array.isArray(membersRes) ? membersRes : []);

      const hSnap = await getDocs(query(collection(db, "bible_quotes"), where("sentBy", "==", user.uid)));
      setHistory(hSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    load();
  }, [user]);

  const toggleMember = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quote.trim()) return;
    setSending(true);
    try {
      const recipientIds = sendToAll ? members.map((m) => m.id) : selected;
      await addDoc(collection(db, "bible_quotes"), {
        quote,
        reference,
        recipientIds,
        sentBy: user?.uid,
        sentByName: user?.displayName,
        sentAt: serverTimestamp(),
      });

      await authFetch("/api/send-bible-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote, reference, recipientIds, senderName: user?.displayName }),
      });

      toast.success(`Bible quote sent to ${recipientIds.length} member(s)!`);
      setQuote("");
      setReference("");
      setSelected([]);
    } catch {
      toast.error("Failed to send.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Evangelism</h1>
        <p className="text-gray-500 text-sm">Send Bible quotes and devotionals to members</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <BookOpen size={18} className="text-[#1a3a5c]" /> Send Bible Quote
        </h2>
        <form onSubmit={handleSend} className="space-y-4">
          <textarea
            required
            placeholder="Enter Bible quote or devotional message..."
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            rows={4}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
          />
          <input
            placeholder="Scripture reference (e.g. John 3:16)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c]"
          />

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Recipients</p>
            <div className="flex gap-3 mb-3">
              <button type="button" onClick={() => setSendToAll(true)}
                className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${sendToAll ? "border-[#1a3a5c] bg-[#1a3a5c] text-white" : "border-gray-200 text-gray-600"}`}>
                All Members ({members.length})
              </button>
              <button type="button" onClick={() => setSendToAll(false)}
                className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${!sendToAll ? "border-[#1a3a5c] bg-[#1a3a5c] text-white" : "border-gray-200 text-gray-600"}`}>
                Select Members
              </button>
            </div>
            {!sendToAll && (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggleMember(m.id)}
                      className="accent-[#1a3a5c]" />
                    <span className="text-sm text-gray-700">{m.displayName}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <button type="submit" disabled={sending || (!sendToAll && selected.length === 0)}
            className="w-full bg-[#1a3a5c] text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-[#142d47]">
            <Send size={16} />
            {sending ? "Sending..." : "Send Quote"}
          </button>
        </form>
      </div>
    </div>
  );
}
