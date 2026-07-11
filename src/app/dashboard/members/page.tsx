"use client";
import { authFetch } from "@/lib/auth-fetch";
import { staleWhileRevalidate, invalidate } from "@/lib/cache";
import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "@/lib/store";
import { can, ROLE_LABELS, ROLE_COLORS } from "@/lib/roles";
import { useRouter } from "next/navigation";
import { Users, Search, X, Mail, CheckCircle2, Settings2 } from "lucide-react";
import toast from "react-hot-toast";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_NAMES_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type DuesPayments = Record<string, { paid: boolean; paidAt: number | null; markedByName: string }>;

function DuesModal({ member, onClose, onSaved, duesAmount }: { member: any; onClose: () => void; onSaved: () => void; duesAmount: number }) {
  const year = new Date().getFullYear();
  const [payments, setPayments] = useState<DuesPayments>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch(`/api/dues?memberId=${member.id}`)
      .then((r) => r.json())
      .then((d) => { if (d && !d.error) setPayments(d); })
      .finally(() => setLoading(false));
  }, [member.id]);

  const isPaid = (m: number) => !!payments[`${year}-${String(m).padStart(2, "0")}`]?.paid;
  const allPaid = MONTH_NAMES.every((_, i) => isPaid(i + 1));

  const toggleMonth = (m: number) => {
    if (isPaid(m)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };

  const selectAll = () => {
    const unpaid = MONTH_NAMES.map((_, i) => i + 1).filter((m) => !isPaid(m));
    setSelected(new Set(unpaid));
  };

  const save = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/dues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, months: Array.from(selected), year }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      toast.success(`Recorded dues for ${json.recorded} month${json.recorded !== 1 ? "s" : ""}`);
      // Refresh dues
      const updated = await authFetch(`/api/dues?memberId=${member.id}`).then((r) => r.json());
      if (updated && !updated.error) setPayments(updated);
      setSelected(new Set());
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Failed to record dues");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-800">{member.displayName}</p>
            <p className="text-xs text-gray-400">Dues — {year} · GH₵{duesAmount}/month</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>

        {/* Month grid */}
        <div className="p-5">
          {loading ? (
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                {MONTH_NAMES.map((name, i) => {
                  const m = i + 1;
                  const paid = isPaid(m);
                  const sel = selected.has(m);
                  return (
                    <button
                      key={m}
                      onClick={() => toggleMonth(m)}
                      disabled={paid}
                      className={`h-10 rounded-lg text-xs font-medium transition-all
                        ${paid ? "bg-emerald-100 text-emerald-700 cursor-default" :
                          sel ? "bg-[#3b1f6e] text-white" :
                          "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >
                      {paid ? <span className="flex flex-col items-center leading-tight"><CheckCircle2 size={12} className="mx-auto mb-0.5" />{name}</span> : name}
                    </button>
                  );
                })}
              </div>

              {!allPaid && (
                <button onClick={selectAll} className="mt-3 text-xs text-[#3b1f6e] hover:underline">
                  Select all unpaid
                </button>
              )}

              {selected.size > 0 && (
                <div className="mt-3 p-3 bg-purple-50 rounded-lg text-xs text-purple-700">
                  <span className="font-medium">Marking:</span> {Array.from(selected).sort((a, b) => a - b).map((m) => MONTH_NAMES_FULL[m - 1]).join(", ")}
                  <br /><span className="font-medium">Total: GH₵{duesAmount * selected.size}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={save}
            disabled={selected.size === 0 || saving}
            className="w-full py-2.5 rounded-xl bg-[#3b1f6e] text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
            {saving ? "Recording…" : `Mark ${selected.size} Month${selected.size !== 1 ? "s" : ""} as Paid`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MembersPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [members, setMembers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [duesMember, setDuesMember] = useState<any | null>(null);
  const [allDues, setAllDues] = useState<Record<string, DuesPayments>>({});
  const [sendingReminder, setSendingReminder] = useState(false);
  const [duesAmount, setDuesAmount] = useState(5);
  const [showSetDues, setShowSetDues] = useState(false);
  const [newDuesAmount, setNewDuesAmount] = useState("");
  const [savingDuesAmount, setSavingDuesAmount] = useState(false);
  const duesLoadedRef = useRef(false);

  const canManageDues = user ? can.manageDues(user.role) : false;
  const canViewDues = user ? can.viewDuesStatus(user.role) : false;

  const load = (fresh = false) => {
    if (fresh) invalidate("/api/admin/members");
    staleWhileRevalidate("/api/admin/members", 30_000, (data) => {
      if (Array.isArray(data)) setMembers(data);
    });
  };

  useEffect(() => {
    if (!user || !can.viewAllMembers(user.role)) { router.replace("/dashboard"); return; }
    load();
    // Load dues amount for current year
    const year = new Date().getFullYear();
    authFetch(`/api/dues/settings?year=${year}`)
      .then((r) => r.json())
      .then((d) => { if (d?.amount) setDuesAmount(d.amount); })
      .catch(() => {});
  }, [user]);

  // Load dues summary for president view — single batch call instead of N individual requests
  useEffect(() => {
    if (!canViewDues || members.length === 0 || duesLoadedRef.current) return;
    duesLoadedRef.current = true;
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    authFetch(`/api/dues/summary?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((summary: Record<string, { paid: boolean; paidAt: number | null }>) => {
        if (summary && !summary.error) {
          // Convert batch summary into the DuesPayments shape the UI expects
          const key = `${year}-${String(month).padStart(2, "0")}`;
          const map: Record<string, DuesPayments> = {};
          for (const [memberId, info] of Object.entries(summary)) {
            map[memberId] = { [key]: { paid: info.paid, paidAt: info.paidAt, markedByName: "" } };
          }
          setAllDues(map);
        }
      })
      .catch(() => {});
  }, [members, canViewDues]);

  const saveDuesAmount = async () => {
    const amt = parseFloat(newDuesAmount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    setSavingDuesAmount(true);
    try {
      const year = new Date().getFullYear();
      const res = await authFetch("/api/dues/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, amount: amt }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setDuesAmount(amt);
      setShowSetDues(false);
      setNewDuesAmount("");
      toast.success(`Dues set to GH₵${amt}/month for ${year}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update dues amount");
    } finally {
      setSavingDuesAmount(false);
    }
  };

  const sendReminder = async () => {
    if (!confirm("Send a dues reminder email to all members who haven't paid this month?")) return;
    setSendingReminder(true);
    try {
      const res = await authFetch("/api/dues/remind", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      toast.success(json.sent > 0 ? `Reminder sent to ${json.sent} member${json.sent !== 1 ? "s" : ""}` : "All members have paid this month!");
    } catch (e: any) {
      toast.error(e.message || "Failed to send reminder");
    } finally {
      setSendingReminder(false);
    }
  };

  const getCurrentMonthDues = (memberId: string): boolean | null => {
    if (!(memberId in allDues)) return null; // still loading
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    return allDues[memberId]?.[key]?.paid ?? false; // loaded but no record = unpaid
  };

  const filtered = members.filter((m) =>
    m.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    m.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Members</h1>
          <p className="text-gray-500 text-sm">All active guild members</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {user && can.manageDues(user.role) && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-600">
              <span>GH₵{duesAmount}/mo</span>
              {user.role === "treasurer" && (
                <button onClick={() => { setNewDuesAmount(String(duesAmount)); setShowSetDues(true); }} className="text-[#3b1f6e] hover:underline ml-1">
                  <Settings2 size={13} />
                </button>
              )}
            </div>
          )}
          {user && can.sendDuesReminder(user.role) && (
            <button
              onClick={sendReminder}
              disabled={sendingReminder}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#3b1f6e] text-[#3b1f6e] text-xs font-medium hover:bg-purple-50 transition-colors disabled:opacity-50"
            >
              {sendingReminder
                ? <div className="w-3.5 h-3.5 border-2 border-[#3b1f6e] border-t-transparent rounded-full animate-spin" />
                : <Mail size={14} />}
              Remind
            </button>
          )}
        </div>
      </div>

      {/* Set dues amount modal */}
      {showSetDues && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0" onClick={() => setShowSetDues(false)}>
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-gray-800 mb-1">Set Dues Amount</p>
            <p className="text-xs text-gray-400 mb-4">Monthly dues for {new Date().getFullYear()}</p>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-gray-500">GH₵</span>
              <input
                type="number"
                min="1"
                step="0.5"
                value={newDuesAmount}
                onChange={(e) => setNewDuesAmount(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]"
                placeholder="5"
              />
              <span className="text-xs text-gray-400">/ month</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowSetDues(false)} className="flex-1 border border-gray-200 py-2 rounded-xl text-sm text-gray-600">Cancel</button>
              <button onClick={saveDuesAmount} disabled={savingDuesAmount} className="flex-1 bg-[#3b1f6e] text-white py-2 rounded-xl text-sm disabled:opacity-50">
                {savingDuesAmount ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

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
        {filtered.map((m) => {
          const paidThisMonth = canViewDues ? getCurrentMonthDues(m.id) : null;
          return (
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
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[m.role as keyof typeof ROLE_COLORS]}`}>
                    {ROLE_LABELS[m.role as keyof typeof ROLE_LABELS]}
                  </span>
                  {m.isYaf && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 whitespace-nowrap">
                      🎓 Ready for YAF
                    </span>
                  )}
                  {/* Dues badge — president and fin/treasurer see this */}
                  {canViewDues && paidThisMonth !== null && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                      paidThisMonth ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-600"
                    }`}>
                      {paidThisMonth ? "✓ Dues paid" : "Dues unpaid"}
                    </span>
                  )}
                </div>
                {/* Manage dues button */}
                {canManageDues && m.id !== user?.uid && (
                  <button
                    onClick={() => setDuesMember(m)}
                    title="Manage dues"
                    className="p-1.5 text-gray-300 hover:text-[#3b1f6e] transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {duesMember && (
        <DuesModal
          member={duesMember}
          duesAmount={duesAmount}
          onClose={() => setDuesMember(null)}
          onSaved={() => {
            duesLoadedRef.current = false;
            // Refresh dues
            authFetch(`/api/dues?memberId=${duesMember.id}`)
              .then((r) => r.json())
              .then((d) => {
                if (d && !d.error) setAllDues((prev) => ({ ...prev, [duesMember.id]: d }));
              });
          }}
        />
      )}
    </div>
  );
}
