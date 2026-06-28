"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";
import { can, Role, ROLE_LABELS } from "@/lib/roles";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, UserCog } from "lucide-react";
import toast from "react-hot-toast";

const ALL_ROLES: Role[] = [
  "president", "vice_president", "financial_secretary", "treasurer",
  "evangelism_coordinator", "male_organizer", "female_organizer", "member"
];

export default function AdminPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [pending, setPending] = useState<any[]>([]);
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user || !can.accessAdmin(user.role)) { router.replace("/dashboard"); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    const [pendingSnap, allSnap] = await Promise.all([
      getDocs(query(collection(db, "members"), where("role", "==", "pending"))),
      getDocs(query(collection(db, "members"), where("role", "!=", "pending"))),
    ]);
    setPending(pendingSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setAllMembers(allSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
  };

  const approve = async (uid: string, email: string, name: string) => {
    setLoading((p) => ({ ...p, [uid]: true }));
    try {
      await updateDoc(doc(db, "members", uid), { role: "member" });
      await fetch("/api/approve-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      toast.success(`${name} approved!`);
      loadData();
    } catch {
      toast.error("Failed to approve.");
    } finally {
      setLoading((p) => ({ ...p, [uid]: false }));
    }
  };

  const reject = async (uid: string, name: string) => {
    setLoading((p) => ({ ...p, [uid]: true }));
    try {
      await updateDoc(doc(db, "members", uid), { role: "rejected" });
      toast.success(`${name}'s request rejected.`);
      loadData();
    } catch {
      toast.error("Failed to reject.");
    } finally {
      setLoading((p) => ({ ...p, [uid]: false }));
    }
  };

  const changeRole = async (uid: string, newRole: Role) => {
    await updateDoc(doc(db, "members", uid), { role: newRole });
    toast.success("Role updated!");
    loadData();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Admin Panel</h1>
        <p className="text-gray-500 text-sm">Manage member approvals and roles</p>
      </div>

      {/* Pending Approvals */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <h2 className="font-semibold text-gray-800">Pending Approvals</h2>
          {pending.length > 0 && (
            <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full font-medium">
              {pending.length}
            </span>
          )}
        </div>
        <div className="divide-y divide-gray-50">
          {pending.length === 0 && (
            <p className="text-center py-8 text-gray-400 text-sm">No pending requests</p>
          )}
          {pending.map((m) => (
            <div key={m.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-700 font-bold text-sm shrink-0">
                {m.displayName?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-800">{m.displayName}</p>
                <p className="text-xs text-gray-400 truncate">{m.email}</p>
                {m.phone && <p className="text-xs text-gray-400">{m.phone}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => approve(m.id, m.email, m.displayName)} disabled={loading[m.id]}
                  className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-100 disabled:opacity-50">
                  <CheckCircle size={14} /> Approve
                </button>
                <button onClick={() => reject(m.id, m.displayName)} disabled={loading[m.id]}
                  className="flex items-center gap-1 bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50">
                  <XCircle size={14} /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Role Management */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2">
          <UserCog size={18} className="text-[#1a3a5c]" />
          <h2 className="font-semibold text-gray-800">Manage Roles</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {allMembers.length === 0 && (
            <p className="text-center py-8 text-gray-400 text-sm">No members yet</p>
          )}
          {allMembers.map((m) => (
            <div key={m.id} className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#1a3a5c] flex items-center justify-center text-white font-bold text-sm shrink-0">
                {m.displayName?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-800">{m.displayName}</p>
                <p className="text-xs text-gray-400 truncate">{m.email}</p>
              </div>
              <select
                value={m.role}
                onChange={(e) => changeRole(m.id, e.target.value as Role)}
                disabled={m.id === user?.uid}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#1a3a5c] disabled:opacity-40"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
