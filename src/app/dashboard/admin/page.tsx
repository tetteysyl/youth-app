"use client";
import { authFetch } from "@/lib/auth-fetch";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";
import { can, Role, ROLE_LABELS, SINGLETON_ROLES } from "@/lib/roles";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, UserCog, Users, Plus, Pencil, X, UserMinus } from "lucide-react";
import toast from "react-hot-toast";

const ALL_ROLES: Role[] = [
  "president", "vice_president", "general_secretary", "assistant_general_secretary",
  "financial_secretary", "treasurer",
  "evangelism_coordinator", "male_organizer", "female_organizer", "member"
];

type CellMember = { id: string; displayName: string; email: string; role: string };
type Cell = {
  id: string;
  name: string;
  leaderId: string;
  leaderName: string;
  memberIds: string[];
  createdBy: string;
};

export default function AdminPage() {
  const { user, setUser } = useAuthStore();
  const router = useRouter();
  const [pending, setPending] = useState<any[]>([]);
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // Cells state
  const [cells, setCells] = useState<Cell[]>([]);
  const [cellMembers, setCellMembers] = useState<CellMember[]>([]);
  const [cellModal, setCellModal] = useState<{ open: boolean; editing: Cell | null }>({ open: false, editing: null });
  const [cellForm, setCellForm] = useState({ name: "", leaderId: "", leaderName: "", memberIds: [] as string[] });
  const [cellSaving, setCellSaving] = useState(false);
  const [assignDropdownFor, setAssignDropdownFor] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const isAdmin = user ? can.accessAdmin(user.role) : false;

  useEffect(() => {
    if (!user || !can.accessAdmin(user.role)) { router.replace("/dashboard"); return; }
    loadData();
    loadCells();
  }, [user]);

  const loadData = async () => {
    const [pendingSnap, activeMembers] = await Promise.all([
      getDocs(query(collection(db, "members"), where("role", "==", "pending"))),
      authFetch("/api/admin/members", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setPending(pendingSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    if (Array.isArray(activeMembers)) setAllMembers(activeMembers);
  };

  const removeMember = async (uid: string, name: string) => {
    if (!confirm(`Remove ${name} from YPG entirely? This deletes their account and cannot be undone.`)) return;
    setRemoving(uid);
    try {
      const res = await authFetch("/api/admin/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to remove member");
      toast.success(`${name} has been removed.`);
      loadData();
      loadCells();
    } catch (e: any) {
      toast.error(e.message || "Failed to remove member.");
    } finally {
      setRemoving(null);
    }
  };

  const loadCells = async () => {
    try {
      const [cellsRes, membersRes] = await Promise.all([
        authFetch("/api/cells", { cache: "no-store" }).then((r) => r.json()),
        authFetch("/api/admin/members", { cache: "no-store" }).then((r) => r.json()),
      ]);
      if (Array.isArray(cellsRes)) setCells(cellsRes);
      if (Array.isArray(membersRes)) setCellMembers(membersRes);
    } catch (e) {
      toast.error("Failed to load cells");
    }
  };

  const approve = async (uid: string, email: string, name: string) => {
    setLoading((p) => ({ ...p, [uid]: true }));
    try {
      await authFetch("/api/approve-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: uid }),
      });
      // Add to their chosen cell, if any
      const pendingMember = pending.find((m) => m.id === uid);
      if (pendingMember?.cellChoice && pendingMember.cellChoice !== "none") {
        await authFetch("/api/cells/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cellName: pendingMember.cellChoice, memberId: uid, memberName: name }),
        }).catch(() => {});
      }
      toast.success(`${name} approved!`);
      loadData();
      loadCells();
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
    if (SINGLETON_ROLES.includes(newRole)) {
      const holder = allMembers.find((m) => m.role === newRole && m.id !== uid);
      if (holder) {
        // If the current user is the holder, offer a transfer instead of blocking
        if (holder.id === user?.uid) {
          const recipient = allMembers.find((m) => m.id === uid);
          if (!confirm(
            `Transfer the ${ROLE_LABELS[newRole]} role to ${recipient?.displayName}?\n\nYou will be demoted to Member and lose all ${ROLE_LABELS[newRole]} privileges immediately.`
          )) return;
          // Atomic transfer: elevate recipient, demote self
          await Promise.all([
            updateDoc(doc(db, "members", uid), { role: newRole }),
            updateDoc(doc(db, "members", holder.id), { role: "member" }),
          ]);
          toast.success(`${ROLE_LABELS[newRole]} transferred to ${recipient?.displayName}.`);
          // Update local user state and redirect (they've lost admin access)
          setUser({ ...user!, role: "member" });
          router.replace("/dashboard");
          return;
        }
        toast.error(`${holder.displayName} already holds the ${ROLE_LABELS[newRole]} role. Reassign them first.`);
        return;
      }
    }
    await updateDoc(doc(db, "members", uid), { role: newRole });
    toast.success("Role updated!");
    loadData();
  };

  const roleTakenBy = (role: Role, excludeUid: string) =>
    SINGLETON_ROLES.includes(role) ? allMembers.find((m) => m.role === role && m.id !== excludeUid) : undefined;

  const CELL_NAMES = ["Charis", "Eleos", "Kleos", "Dunamis"];
  const memberIdsInCells = new Set(cells.flatMap((c) => c.memberIds));
  const membersWithoutCell = cellMembers.filter((m) => !memberIdsInCells.has(m.id));

  const assignToCell = async (memberId: string, memberName: string, cellName: string) => {
    setAssigning(memberId);
    try {
      const res = await authFetch("/api/cells/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cellName, memberId, memberName, notify: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to assign");
      toast.success(`${memberName} assigned to ${cellName}!`);
      setAssignDropdownFor(null);
      loadCells();
    } catch (e: any) {
      toast.error(e.message || "Failed to assign cell.");
    } finally {
      setAssigning(null);
    }
  };

  const openCreateCell = () => {
    setCellForm({ name: "", leaderId: "", leaderName: "", memberIds: [] });
    setCellModal({ open: true, editing: null });
  };

  const openEditCell = (cell: Cell) => {
    const nonLeaderIds = cell.memberIds.filter((id) => id !== cell.leaderId);
    setCellForm({
      name: cell.name,
      leaderId: cell.leaderId,
      leaderName: cell.leaderName,
      memberIds: nonLeaderIds,
    });
    setCellModal({ open: true, editing: cell });
  };

  const closeModal = () => {
    setCellModal({ open: false, editing: null });
    setCellForm({ name: "", leaderId: "", leaderName: "", memberIds: [] });
  };

  const handleLeaderChange = (leaderId: string) => {
    const member = cellMembers.find((m) => m.id === leaderId);
    setCellForm((f) => ({
      ...f,
      leaderId,
      leaderName: member?.displayName || "",
      memberIds: f.memberIds.filter((id) => id !== leaderId),
    }));
  };

  const toggleMember = (memberId: string) => {
    setCellForm((f) => ({
      ...f,
      memberIds: f.memberIds.includes(memberId)
        ? f.memberIds.filter((id) => id !== memberId)
        : [...f.memberIds, memberId],
    }));
  };

  const saveCell = async () => {
    if (!cellForm.name.trim() || !cellForm.leaderId) {
      toast.error("Cell name and leader are required");
      return;
    }
    setCellSaving(true);
    try {
      const allMemberIds = [cellForm.leaderId, ...cellForm.memberIds];
      if (cellModal.editing) {
        const canEditLeader = isAdmin;
        const payload: any = { cellId: cellModal.editing.id, memberIds: allMemberIds };
        if (canEditLeader) {
          payload.name = cellForm.name;
          payload.leaderId = cellForm.leaderId;
          payload.leaderName = cellForm.leaderName;
        }
        await authFetch("/api/cells", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast.success("Cell updated!");
      } else {
        await authFetch("/api/cells", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: cellForm.name,
            leaderId: cellForm.leaderId,
            leaderName: cellForm.leaderName,
            memberIds: allMemberIds,
            createdBy: user!.uid,
          }),
        });
        toast.success("Cell created!");
      }
      closeModal();
      loadCells();
    } catch {
      toast.error("Failed to save cell");
    } finally {
      setCellSaving(false);
    }
  };

  const isLeaderOf = (cell: Cell) => user?.uid === cell.leaderId;

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
                <div className="flex gap-2 mt-0.5">
                  {m.dateOfBirth && <p className="text-xs text-gray-400">🎂 {m.dateOfBirth}</p>}
                  {m.cellChoice && m.cellChoice !== "none" && (
                    <p className="text-xs text-purple-600">Cell: {m.cellChoice}</p>
                  )}
                </div>
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
                title={(() => {
                  const taken = ALL_ROLES.filter((r) => roleTakenBy(r, m.id));
                  return taken.length
                    ? taken.map((r) => `${ROLE_LABELS[r]} — ${roleTakenBy(r, m.id)?.displayName}`).join("\n")
                    : undefined;
                })()}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 max-w-[160px] focus:outline-none focus:ring-1 focus:ring-[#1a3a5c] disabled:opacity-40"
              >
                {ALL_ROLES.map((r) => {
                  const takenBy = roleTakenBy(r, m.id);
                  const takenBySelf = takenBy?.id === user?.uid;
                  return (
                    <option key={r} value={r} disabled={!!takenBy && !takenBySelf}>
                      {takenBy && !takenBySelf ? "🔒 " : takenBySelf ? "⇄ Transfer " : ""}{ROLE_LABELS[r]}
                    </option>
                  );
                })}
              </select>
              {m.id !== user?.uid && (
                <button
                  onClick={() => removeMember(m.id, m.displayName)}
                  disabled={removing === m.id}
                  title="Remove member"
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 shrink-0"
                >
                  <UserMinus size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Members without a Cell */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <Users size={18} className="text-amber-600" />
            <h2 className="font-semibold text-gray-800">Members without a Cell</h2>
            {membersWithoutCell.length > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">
                {membersWithoutCell.length}
              </span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {membersWithoutCell.length === 0 && (
              <p className="text-center py-8 text-gray-400 text-sm">Every member belongs to a cell 🎉</p>
            )}
            {membersWithoutCell.map((m) => (
              <div key={m.id} className="relative">
                <button
                  onClick={() => setAssignDropdownFor(assignDropdownFor === m.id ? null : m.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
                    {m.displayName?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-800">{m.displayName}</p>
                    <p className="text-xs text-gray-400 truncate">{m.email}</p>
                  </div>
                  <span className="text-xs text-[#3b1f6e] font-medium shrink-0">Assign to cell ▾</span>
                </button>
                {assignDropdownFor === m.id && (
                  <div className="px-4 pb-3 flex flex-wrap gap-2">
                    {CELL_NAMES.map((cellName) => (
                      <button
                        key={cellName}
                        onClick={() => assignToCell(m.id, m.displayName, cellName)}
                        disabled={assigning === m.id}
                        className="text-xs bg-[#3b1f6e] text-white px-3 py-1.5 rounded-lg hover:bg-[#2a1550] disabled:opacity-50"
                      >
                        {assigning === m.id ? "Assigning..." : cellName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cells Section */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-[#3b1f6e]" />
            <h2 className="font-semibold text-gray-800">Cells</h2>
            {cells.length > 0 && (
              <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">
                {cells.length}
              </span>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={openCreateCell}
              className="flex items-center gap-1.5 bg-[#3b1f6e] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#2a1550]"
            >
              <Plus size={14} /> Create Cell
            </button>
          )}
        </div>

        <div className="divide-y divide-gray-50">
          {cells.length === 0 && (
            <p className="text-center py-8 text-gray-400 text-sm">No cells created yet</p>
          )}
          {cells.map((cell) => {
            const canEdit = isAdmin || isLeaderOf(cell);
            const memberDetails = cell.memberIds
              .map((id) => cellMembers.find((m) => m.id === id))
              .filter(Boolean) as CellMember[];

            return (
              <div key={cell.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-full bg-[#3b1f6e] flex items-center justify-center shrink-0">
                        <Users size={14} className="text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{cell.name}</p>
                        <p className="text-xs text-gray-500">Leader: {cell.leaderName}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 ml-10">
                      {memberDetails.map((m) => (
                        <span key={m.id} className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          m.id === cell.leaderId
                            ? "bg-[#f0c940] text-[#3b1f6e]"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {m.id === cell.leaderId ? `★ ${m.displayName}` : m.displayName}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2 ml-10">{cell.memberIds.length} member{cell.memberIds.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {canEdit && (
                      <button
                        onClick={() => openEditCell(cell)}
                        className="flex items-center gap-1 text-xs text-[#3b1f6e] border border-[#3b1f6e]/30 px-2.5 py-1.5 rounded-lg hover:bg-purple-50"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cell Modal */}
      {cellModal.open && (
        <div className="modal-overlay fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-gray-800">
                {cellModal.editing ? "Edit Cell" : "Create Cell"}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {/* Cell name — admin only or create */}
              {(isAdmin) && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cell Name</label>
                  <input
                    value={cellForm.name}
                    onChange={(e) => setCellForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Alpha Cell"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]"
                  />
                </div>
              )}

              {/* Leader dropdown — admin only */}
              {isAdmin && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cell Leader</label>
                  <select
                    value={cellForm.leaderId}
                    onChange={(e) => handleLeaderChange(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]"
                  >
                    <option value="">Select leader...</option>
                    {cellMembers.map((m) => (
                      <option key={m.id} value={m.id}>{m.displayName}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Members multi-select */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  Members {cellForm.leaderId && <span className="text-gray-400">(leader auto-included)</span>}
                </label>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-50 max-h-48 overflow-y-auto">
                  {cellMembers
                    .filter((m) => m.id !== cellForm.leaderId)
                    .map((m) => (
                      <label key={m.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cellForm.memberIds.includes(m.id)}
                          onChange={() => toggleMember(m.id)}
                          className="accent-[#3b1f6e]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{m.displayName}</p>
                          <p className="text-xs text-gray-400 truncate">{m.email}</p>
                        </div>
                      </label>
                    ))}
                  {cellMembers.filter((m) => m.id !== cellForm.leaderId).length === 0 && (
                    <p className="text-center py-4 text-gray-400 text-xs">No other members</p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 shrink-0">
              <button
                onClick={saveCell}
                disabled={cellSaving || !cellForm.name.trim() || !cellForm.leaderId}
                className="w-full bg-[#3b1f6e] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#2a1550] disabled:opacity-40"
              >
                {cellSaving ? "Saving..." : cellModal.editing ? "Save Changes" : "Create Cell"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
