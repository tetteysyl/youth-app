"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";
import { can, ROLE_LABELS, ROLE_COLORS } from "@/lib/roles";
import { useRouter } from "next/navigation";
import { Users, Search } from "lucide-react";

export default function MembersPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [members, setMembers] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user || !can.checkAbsentMembers(user.role)) { router.replace("/dashboard"); return; }
    const load = async () => {
      const q = query(collection(db, "members"), where("role", "!=", "pending"));
      const snap = await getDocs(q);
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    load();
  }, [user]);

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
            <div className="w-10 h-10 rounded-full bg-[#1a3a5c] flex items-center justify-center text-white font-bold text-sm shrink-0">
              {m.displayName?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-800">{m.displayName}</p>
              <p className="text-xs text-gray-400 truncate">{m.email}</p>
              {m.phone && <p className="text-xs text-gray-400">{m.phone}</p>}
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[m.role as keyof typeof ROLE_COLORS]}`}>
              {ROLE_LABELS[m.role as keyof typeof ROLE_LABELS]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
