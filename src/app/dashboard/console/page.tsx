"use client";
import { authFetch } from "@/lib/auth-fetch";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { can, ROLE_LABELS, Role } from "@/lib/roles";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from "firebase/firestore";
import {
  Shield, Users, Wallet, CalendarDays, Search, Plus, Pencil, Trash2, Check, X,
  CheckCircle, XCircle, TrendingUp, TrendingDown, RefreshCw, AlertTriangle, Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";

/**
 * Admin Console — the system owner's back-office.
 *
 * A single surface with full create / edit / delete / monitor control over the
 * app's backend data. Every call goes through the existing, role-gated API routes
 * (or the Firestore rules for events); the super_admin role is a member of each
 * permission group, so nothing here bypasses the permission model.
 */

const ROLE_OPTIONS: Role[] = [
  "president", "vice_president", "general_secretary", "assistant_general_secretary",
  "financial_secretary", "treasurer", "evangelism_coordinator", "male_organizer", "female_organizer", "member",
];
const cedis = (n: number) => `GH₵${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Member = { id: string; displayName?: string; email?: string; phone?: string; role?: Role; gender?: string; dateOfBirth?: string; isDistantMember?: boolean; cellChoice?: string; photoURL?: string };
type Txn = { id: string; type?: string; amount?: number; description?: string; date?: string; category?: string };
type EventDoc = { id: string; title?: string; description?: string; date?: string; time?: string };

type TabKey = "members" | "finance" | "events";
const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "members", label: "Members & Roles", icon: Users },
  { key: "finance", label: "Finances", icon: Wallet },
  { key: "events", label: "Events", icon: CalendarDays },
];

function Confirm({ text, onYes, onNo }: { text: string; onYes: () => void; onNo: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onNo}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0"><AlertTriangle size={18} className="text-red-500" /></div>
          <p className="text-sm text-gray-700 mt-1">{text}</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onNo} className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100">Cancel</button>
          <button onClick={onYes} className="px-3 py-1.5 rounded-lg text-sm bg-red-500 text-white hover:bg-red-600">Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Members tab ─────────────────────────── */
function MembersTab() {
  const { user } = useAuthStore();
  const [pending, setPending] = useState<Member[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Member | null>(null);
  const [confirmDel, setConfirmDel] = useState<Member | null>(null);

  const load = useCallback(async () => {
    const [p, m] = await Promise.all([
      authFetch("/api/admin/members?status=pending", { cache: "no-store" }).then((r) => r.json()),
      authFetch("/api/admin/members", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setPending(Array.isArray(p) ? p : []);
    setMembers(Array.isArray(m) ? m : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const mark = (id: string, v: boolean) => setBusy((b) => ({ ...b, [id]: v }));

  const approve = async (m: Member, action: "approve" | "reject") => {
    mark(m.id, true);
    try {
      const res = await authFetch("/api/approve-member", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId: m.id, action }) });
      if (!res.ok) throw new Error();
      toast.success(action === "approve" ? `${m.displayName} approved` : `${m.displayName} rejected`);
      load();
    } catch { toast.error("Action failed"); } finally { mark(m.id, false); }
  };

  const changeRole = async (m: Member, role: Role) => {
    mark(m.id, true);
    try {
      const res = await authFetch("/api/admin/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId: m.id, role }) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success("Role updated");
      load();
    } catch (e: any) { toast.error(e.message || "Failed"); } finally { mark(m.id, false); }
  };

  const del = async (m: Member) => {
    setConfirmDel(null);
    mark(m.id, true);
    try {
      const res = await authFetch("/api/admin/members", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid: m.id }) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success(`${m.displayName} removed`);
      load();
    } catch (e: any) { toast.error(e.message || "Failed to remove"); } finally { mark(m.id, false); }
  };

  const filtered = members.filter((m) =>
    !q || (m.displayName || "").toLowerCase().includes(q.toLowerCase()) || (m.email || "").toLowerCase().includes(q.toLowerCase()));

  if (loading) return <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin mx-auto mb-2" /> Loading members…</div>;

  return (
    <div className="space-y-6">
      {/* Pending approvals */}
      {pending.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <h3 className="font-semibold text-gray-800 text-sm">Pending Approvals</h3>
            <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full font-medium">{pending.length}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {pending.map((m) => (
              <div key={m.id} className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-700 font-bold text-xs shrink-0">{m.displayName?.charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{m.displayName}</p>
                  <p className="text-xs text-gray-400 truncate">{m.email}{m.dateOfBirth ? ` · 🎂 ${m.dateOfBirth}` : ""}</p>
                </div>
                <button disabled={busy[m.id]} onClick={() => approve(m, "approve")} className="flex items-center gap-1 bg-green-50 text-green-700 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-green-100 disabled:opacity-50"><CheckCircle size={13} /> Approve</button>
                <button disabled={busy[m.id]} onClick={() => approve(m, "reject")} className="flex items-center gap-1 bg-red-50 text-red-600 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50"><XCircle size={13} /> Reject</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Member roster */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
          <h3 className="font-semibold text-gray-800 text-sm shrink-0">All Members</h3>
          <span className="text-xs text-gray-400">{members.length}</span>
          <div className="flex-1" />
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#3b1f6e] w-40 sm:w-56" />
          </div>
        </div>
        <div className="divide-y divide-gray-50 max-h-[560px] overflow-y-auto">
          {filtered.length === 0 && <p className="text-center py-10 text-gray-400 text-sm">No members match</p>}
          {filtered.map((m) => (
            <div key={m.id} className="p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[#3b1f6e] flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden">
                {m.photoURL ? <img src={m.photoURL} alt="" className="w-full h-full object-cover" /> : m.displayName?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{m.displayName}</p>
                <p className="text-xs text-gray-400 truncate">{m.email}</p>
              </div>
              <select
                value={m.role}
                disabled={busy[m.id] || m.id === user?.uid}
                onChange={(e) => changeRole(m, e.target.value as Role)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 max-w-[150px] focus:outline-none focus:ring-1 focus:ring-[#3b1f6e] disabled:opacity-40"
              >
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <button onClick={() => setEditing(m)} title="Edit record" className="p-1.5 text-gray-300 hover:text-[#3b1f6e] shrink-0"><Pencil size={15} /></button>
              {m.id !== user?.uid && (
                <button onClick={() => setConfirmDel(m)} disabled={busy[m.id]} title="Remove" className="p-1.5 text-gray-300 hover:text-red-500 disabled:opacity-40 shrink-0"><Trash2 size={15} /></button>
              )}
            </div>
          ))}
        </div>
      </div>

      {editing && <MemberEditModal member={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {confirmDel && <Confirm text={`Permanently remove ${confirmDel.displayName}? This deletes their account and cannot be undone.`} onYes={() => del(confirmDel)} onNo={() => setConfirmDel(null)} />}
    </div>
  );
}

function MemberEditModal({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    displayName: member.displayName ?? "", phone: member.phone ?? "",
    dateOfBirth: member.dateOfBirth ?? "", gender: member.gender ?? "",
    isDistantMember: !!member.isDistantMember,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/admin/members", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId: member.id, fields: form }) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success("Member updated");
      onSaved();
    } catch (e: any) { toast.error(e.message || "Failed to save"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Edit {member.displayName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-3">
          <Field label="Full name"><input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="inp" /></Field>
          <Field label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="inp" /></Field>
          <Field label="Date of birth"><input type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className="inp" /></Field>
          <Field label="Gender">
            <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="inp">
              <option value="">—</option><option value="Male">Male</option><option value="Female">Female</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700 pt-1">
            <input type="checkbox" checked={form.isDistantMember} onChange={(e) => setForm({ ...form, isDistantMember: e.target.checked })} className="accent-[#3b1f6e]" />
            Distant member (opted out of meeting emails)
          </label>
        </div>
        <div className="p-4 border-t border-gray-100">
          <button onClick={save} disabled={saving} className="w-full bg-[#3b1f6e] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#2a1550] disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Finance tab ─────────────────────────── */
function FinanceTab() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: Txn | null }>({ open: false, editing: null });
  const [confirmDel, setConfirmDel] = useState<Txn | null>(null);

  const load = useCallback(async () => {
    const d = await authFetch("/api/finance").then((r) => r.json());
    setTxns(d && Array.isArray(d.transactions) ? d.transactions : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const totals = txns.reduce((acc, t) => {
    const amt = Number(t.amount) || 0;
    if (t.type === "expense") acc.expense += amt; else acc.income += amt;
    return acc;
  }, { income: 0, expense: 0 });

  const del = async (t: Txn) => {
    setConfirmDel(null);
    try {
      const res = await authFetch("/api/finance", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id }) });
      if (!res.ok) throw new Error();
      toast.success("Transaction deleted");
      load();
    } catch { toast.error("Delete failed"); }
  };

  if (loading) return <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin mx-auto mb-2" /> Loading finances…</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"><div className="w-9 h-9 rounded-lg bg-green-50 text-green-700 flex items-center justify-center mb-2"><Wallet size={17} /></div><p className="text-lg font-bold text-gray-800">{cedis(totals.income - totals.expense)}</p><p className="text-xs text-gray-400">Balance</p></div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"><div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2"><TrendingUp size={17} /></div><p className="text-lg font-bold text-gray-800">{cedis(totals.income)}</p><p className="text-xs text-gray-400">Total Income</p></div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"><div className="w-9 h-9 rounded-lg bg-red-50 text-red-500 flex items-center justify-center mb-2"><TrendingDown size={17} /></div><p className="text-lg font-bold text-gray-800">{cedis(totals.expense)}</p><p className="text-xs text-gray-400">Total Expenses</p></div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm">Transactions <span className="text-gray-400 font-normal">({txns.length})</span></h3>
          <button onClick={() => setModal({ open: true, editing: null })} className="flex items-center gap-1.5 bg-[#3b1f6e] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#2a1550]"><Plus size={14} /> Add</button>
        </div>
        <div className="divide-y divide-gray-50 max-h-[560px] overflow-y-auto">
          {txns.length === 0 && <p className="text-center py-10 text-gray-400 text-sm">No transactions yet</p>}
          {txns.map((t) => {
            const isExp = t.type === "expense";
            return (
              <div key={t.id} className="p-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isExp ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-600"}`}>{isExp ? <TrendingDown size={14} /> : <TrendingUp size={14} />}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{t.description || "—"}</p>
                  <p className="text-xs text-gray-400">{t.date}{t.category ? ` · ${t.category}` : ""}</p>
                </div>
                <p className={`text-sm font-semibold shrink-0 ${isExp ? "text-red-500" : "text-emerald-600"}`}>{isExp ? "−" : "+"}{cedis(Number(t.amount) || 0)}</p>
                <button onClick={() => setModal({ open: true, editing: t })} className="p-1.5 text-gray-300 hover:text-[#3b1f6e] shrink-0"><Pencil size={14} /></button>
                <button onClick={() => setConfirmDel(t)} className="p-1.5 text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      </div>

      {modal.open && <TxnModal editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSaved={() => { setModal({ open: false, editing: null }); load(); }} />}
      {confirmDel && <Confirm text={`Delete this transaction (${cedis(Number(confirmDel.amount) || 0)})?`} onYes={() => del(confirmDel)} onNo={() => setConfirmDel(null)} />}
    </div>
  );
}

function TxnModal({ editing, onClose, onSaved }: { editing: Txn | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    type: editing?.type ?? "income", amount: editing?.amount != null ? String(editing.amount) : "",
    description: editing?.description ?? "", date: editing?.date ?? new Date().toISOString().split("T")[0], category: editing?.category ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.amount || !form.description || !form.date) { toast.error("Amount, description and date are required"); return; }
    setSaving(true);
    try {
      const res = editing
        ? await authFetch("/api/finance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, ...form }) })
        : await authFetch("/api/finance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error();
      toast.success(editing ? "Transaction updated" : "Transaction added");
      onSaved();
    } catch { toast.error("Save failed"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">{editing ? "Edit" : "Add"} Transaction</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            {["income", "expense"].map((t) => (
              <button key={t} onClick={() => setForm({ ...form, type: t })} className={`flex-1 py-2 rounded-lg text-sm border capitalize ${form.type === t ? "border-[#3b1f6e] bg-[#3b1f6e] text-white" : "border-gray-200 text-gray-600"}`}>{t}</button>
            ))}
          </div>
          <Field label="Amount (GH₵)"><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="inp" /></Field>
          <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="inp" /></Field>
          <Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="inp" /></Field>
          <Field label="Category"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Dues, Offering" className="inp" /></Field>
        </div>
        <div className="p-4 border-t border-gray-100">
          <button onClick={save} disabled={saving} className="w-full bg-[#3b1f6e] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#2a1550] disabled:opacity-50">{saving ? "Saving…" : editing ? "Save changes" : "Add transaction"}</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Events tab ─────────────────────────── */
function EventsTab() {
  const [events, setEvents] = useState<EventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; editing: EventDoc | null }>({ open: false, editing: null });
  const [confirmDel, setConfirmDel] = useState<EventDoc | null>(null);

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, "events"), orderBy("date", "asc")));
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EventDoc)));
    } catch { toast.error("Failed to load events"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const del = async (ev: EventDoc) => {
    setConfirmDel(null);
    try { await deleteDoc(doc(db, "events", ev.id)); toast.success("Event deleted"); load(); }
    catch { toast.error("Delete failed"); }
  };

  if (loading) return <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin mx-auto mb-2" /> Loading events…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 text-sm">Events <span className="text-gray-400 font-normal">({events.length})</span></h3>
        <button onClick={() => setModal({ open: true, editing: null })} className="flex items-center gap-1.5 bg-[#3b1f6e] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#2a1550]"><Plus size={14} /> Add Event</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {events.length === 0 && <p className="text-center py-10 text-gray-400 text-sm col-span-full">No events yet</p>}
        {events.map((ev) => (
          <div key={ev.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex gap-3">
            <div className="text-white text-center rounded-lg p-2 min-w-[48px] h-fit shrink-0" style={{ background: "linear-gradient(135deg, #3b1f6e, #2a1550)" }}>
              <p className="text-xs leading-none mb-0.5">{ev.date ? format(new Date(ev.date), "MMM") : "—"}</p>
              <p className="text-lg font-bold leading-none">{ev.date ? format(new Date(ev.date), "d") : "—"}</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-gray-800 truncate">{ev.title}</p>
              {ev.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ev.description}</p>}
              {ev.time && <p className="text-xs text-gray-400 mt-0.5">🕐 {ev.time}</p>}
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button onClick={() => setModal({ open: true, editing: ev })} className="p-1.5 text-gray-300 hover:text-[#3b1f6e]"><Pencil size={14} /></button>
              <button onClick={() => setConfirmDel(ev)} className="p-1.5 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {modal.open && <EventModal editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onSaved={() => { setModal({ open: false, editing: null }); load(); }} />}
      {confirmDel && <Confirm text={`Delete event "${confirmDel.title}"?`} onYes={() => del(confirmDel)} onNo={() => setConfirmDel(null)} />}
    </div>
  );
}

function EventModal({ editing, onClose, onSaved }: { editing: EventDoc | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: editing?.title ?? "", description: editing?.description ?? "", date: editing?.date ?? "", time: editing?.time ?? "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title || !form.date) { toast.error("Title and date are required"); return; }
    setSaving(true);
    try {
      if (editing) await updateDoc(doc(db, "events", editing.id), { ...form });
      else await addDoc(collection(db, "events"), { ...form, createdAt: serverTimestamp() });
      toast.success(editing ? "Event updated" : "Event created");
      onSaved();
    } catch { toast.error("Save failed"); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">{editing ? "Edit" : "Add"} Event</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-3">
          <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="inp" /></Field>
          <Field label="Description"><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="inp" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="inp" /></Field>
            <Field label="Time"><input value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="e.g. 4:00 PM" className="inp" /></Field>
          </div>
        </div>
        <div className="p-4 border-t border-gray-100">
          <button onClick={save} disabled={saving} className="w-full bg-[#3b1f6e] text-white py-2.5 rounded-xl text-sm font-medium hover:bg-[#2a1550] disabled:opacity-50">{saving ? "Saving…" : editing ? "Save changes" : "Create event"}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

/* ─────────────────────────── Shell ─────────────────────────── */
export default function ConsolePage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("members");

  useEffect(() => {
    if (user && !can.accessConsole(user.role)) router.replace("/dashboard");
  }, [user, router]);

  if (!user || !can.accessConsole(user.role)) return null;

  return (
    <div className="page-enter space-y-6 max-w-5xl">
      <style>{`.inp{width:100%;border:1px solid #e5e7eb;border-radius:0.5rem;padding:0.5rem 0.75rem;font-size:0.875rem;outline:none}.inp:focus{box-shadow:0 0 0 2px rgba(59,31,110,.35)}`}</style>

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #111827, #3b1f6e)" }}>
          <Shield size={22} className="text-[#f0c940]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Admin Console</h1>
          <p className="text-gray-500 text-sm">Back office control</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-white text-[#3b1f6e] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "members" && <MembersTab />}
      {tab === "finance" && <FinanceTab />}
      {tab === "events" && <EventsTab />}
    </div>
  );
}
