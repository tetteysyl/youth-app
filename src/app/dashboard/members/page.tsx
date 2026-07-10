"use client";
import { authFetch } from "@/lib/auth-fetch";
import { staleWhileRevalidate, invalidate } from "@/lib/cache";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/lib/store";
import { can, ROLE_LABELS, ROLE_COLORS } from "@/lib/roles";
import { useRouter } from "next/navigation";
import { Users, Search, UserMinus } from "lucide-react";
import toast from "react-hot-toast";

export default function MembersPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [members, setMembers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const isPresident = user?.role === "president";

  const load = (fresh = false) => {
    if (fresh) invalidate("/api/admin/members");
    staleWhileRevalidate("/api/admin/members", 30_000, (data) => {
      if (Array.isArray(data)) setMembers(data);
    });
  };

  useEffect(() => {
    if (!user || !can.checkAbsentMembers(user.role)) { router.replace("/dashboard"); return; }
    load();
  }, [user]);

  const removeMember = async (uid: string, name: string) => {
    if (!confirm(`Remove ${name} from YPG entirely? This permanently deletes their account.`)) return;
    setRemoving(uid);
    try {
      const res = await authFetch("/api/admin/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success(`${name} has been removed.`);
      load(true);
    } catch (e: any) {
      toast.error(e.message || "Failed to remove member.");
    } finally {
      setRemoving(null);
    }
  };

  const filtered = members.filter((m) =>
    m.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    m.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Members</h1>
        <p className="text-gray-500 text-sm">All active guild members</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a5c] bg-white"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Users size={40} className="mx-auto mb-3 opacity-40" />
            <p>No members found</p>
          </div>
        )}
        {filtered.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-4">
            <div className="relative w-10 h-10 rounded-full bg-[#3b1f6e] flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
              {m.photoURL
                ? <img src={m.photoURL} alt={m.displayName} className="w-full h-full object-cover" />
                : m.displayName?.charAt(0).toUpperCase()
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-800">{m.displayName}</p>
              <p className="text-xs text-gray-400 truncate">{m.email}</p>
              {m.phone && <p className="text-xs text-gray-400">{m.phone}</p>}
              {can.viewDateOfBirth(user!.role) && m.dateOfBirth && (
                <p className="text-xs text-gray-400">🎂 {m.dateOfBirth}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex flex-col items-end gap-1">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[m.role as keyof typeof ROLE_COLORS]}`}>
                  {ROLE_LABELS[m.role as keyof typeof ROLE_LABELS]}
                </span>
                {m.isYaf && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 whitespace-nowrap">
                    🎓 Ready to graduate to YAF
                  </span>
                )}
              </div>
              {isPresident && m.id !== user?.uid && (
                <button
                  onClick={() => removeMember(m.id, m.displayName)}
                  disabled={removing === m.id}
                  title="Remove member"
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
                >
                  {removing === m.id
                    ? <div className="w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
                    : <UserMinus size={16} />
                  }
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
