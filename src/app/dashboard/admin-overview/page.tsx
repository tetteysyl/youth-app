"use client";
import { authFetch } from "@/lib/auth-fetch";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { can, ROLE_LABELS, Role } from "@/lib/roles";
import Link from "next/link";
import { format } from "date-fns";
import {
  Users, UserCheck, UserPlus, Layers, DollarSign, TrendingUp, TrendingDown,
  Wallet, FileClock, CalendarCheck, RefreshCw, AlertTriangle, MapPin,
  Settings, Megaphone, ClipboardList, FileText, ArrowRight, PieChart,
} from "lucide-react";

/**
 * Admin Management Dashboard — an executive command centre.
 *
 * This page is READ-ONLY and additive: it aggregates data from the existing
 * API routes and deep-links into the existing management pages. It does not
 * introduce any new write paths or alter the main app logic.
 */

const EXEC_ROLES: Role[] = [
  "president", "vice_president", "general_secretary", "assistant_general_secretary",
  "financial_secretary", "treasurer", "evangelism_coordinator", "male_organizer", "female_organizer",
];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// Firestore Timestamps come back from the Admin SDK as { _seconds, _nanoseconds }.
// Handle that plus ISO strings and epoch millis.
function toMillis(v: any): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") { const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
  if (typeof v === "object") {
    if (typeof v._seconds === "number") return v._seconds * 1000;
    if (typeof v.seconds === "number") return v.seconds * 1000;
    if (typeof v.toMillis === "function") return v.toMillis();
  }
  return 0;
}

const cedis = (n: number) => `GH₵${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Member = {
  id: string; displayName?: string; email?: string; role?: Role; gender?: string;
  isYaf?: boolean; yafStartedAt?: any; isDistantMember?: boolean; createdAt?: any; photoURL?: string;
};
type Txn = { id: string; type?: string; amount?: number; description?: string; date?: string; category?: string };

type Aggregate = {
  members: Member[];
  pendingCount: number;
  cellCount: number;
  membersInCells: number;
  pendingReports: number;
  meetings: number;
  events: number;
  finance: { income: number; expense: number; balance: number; monthIncome: number; monthExpense: number; recent: Txn[] } | null;
  duesRate: { paid: number; total: number } | null;
};

function StatTile({ icon: Icon, label, value, sub, color, href, delay }: {
  icon: any; label: string; value: React.ReactNode; sub?: string; color: string; href?: string; delay: number;
}) {
  const inner = (
    <div
      className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 h-full hover:shadow-md transition-all"
      style={{ animation: `fadeUp 0.35s ease ${delay}s both` }}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon size={20} />
      </div>
      <p className="text-2xl font-bold text-gray-800 leading-tight">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block active:scale-95 transition-transform">{inner}</Link> : inner;
}

function SkeletonTile() {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="skeleton w-10 h-10 rounded-lg mb-3" />
      <div className="skeleton w-12 h-7 mb-1.5" />
      <div className="skeleton w-20 h-3" />
    </div>
  );
}

function SectionTitle({ icon: Icon, children, tint }: { icon: any; children: React.ReactNode; tint: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${tint}`}>
        <Icon size={15} />
      </div>
      <h2 className="font-semibold text-gray-800">{children}</h2>
    </div>
  );
}

export default function AdminOverviewPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [data, setData] = useState<Aggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const canFinance = user ? can.viewFinance(user.role) : false;
  const canDues = user ? ["president", "financial_secretary", "treasurer"].includes(user.role) : false;
  const canAdmin = user ? can.accessAdmin(user.role) : false;

  useEffect(() => {
    if (user && !can.accessAdmin(user.role)) router.replace("/dashboard");
  }, [user, router]);

  const load = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    setError(false);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const monthPrefix = `${y}-${String(m).padStart(2, "0")}`;

    const [membersR, pendingR, cellsR, reportsR, financeR, duesR, dashR] = await Promise.allSettled([
      authFetch("/api/admin/members", { cache: "no-store" }).then((r) => r.json()),
      authFetch("/api/admin/members?status=pending", { cache: "no-store" }).then((r) => r.json()),
      authFetch("/api/cells").then((r) => r.json()),
      authFetch("/api/reports").then((r) => r.json()),
      canFinance ? authFetch("/api/finance").then((r) => r.json()) : Promise.resolve(null),
      canDues ? authFetch(`/api/dues/summary?year=${y}&month=${m}`).then((r) => r.json()) : Promise.resolve(null),
      authFetch("/api/dashboard").then((r) => r.json()),
    ]);

    const val = <T,>(r: PromiseSettledResult<any>, fallback: T): T =>
      r.status === "fulfilled" && r.value && !r.value.error ? r.value : fallback;

    const members: Member[] = Array.isArray(val(membersR, [])) ? val(membersR, []) : [];
    const pending = Array.isArray(val(pendingR, [])) ? val(pendingR, []) : [];
    const cells: any[] = Array.isArray(val(cellsR, [])) ? val(cellsR, []) : [];
    const reports: any[] = Array.isArray(val(reportsR, [])) ? val(reportsR, []) : [];
    const dash = val(dashR, { stats: { meetings: 0, events: 0 } });

    const inCells = new Set<string>();
    cells.forEach((c) => (c.memberIds || []).forEach((id: string) => inCells.add(id)));

    let finance: Aggregate["finance"] = null;
    const fin: any = val<any>(financeR, null);
    if (canFinance && fin && Array.isArray(fin.transactions)) {
      const txns: Txn[] = fin.transactions;
      let income = 0, expense = 0, monthIncome = 0, monthExpense = 0;
      for (const t of txns) {
        const amt = Number(t.amount) || 0;
        const isExpense = t.type === "expense";
        if (isExpense) expense += amt; else income += amt;
        if ((t.date || "").startsWith(monthPrefix)) {
          if (isExpense) monthExpense += amt; else monthIncome += amt;
        }
      }
      const recent = [...txns]
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        .slice(0, 5);
      finance = { income, expense, balance: income - expense, monthIncome, monthExpense, recent };
    }

    let duesRate: Aggregate["duesRate"] = null;
    const dues: any = val<any>(duesR, null);
    if (canDues && dues && typeof dues === "object") {
      const values = Object.values(dues as Record<string, { paid: boolean }>);
      const paid = values.filter((d) => d?.paid).length;
      duesRate = { paid, total: members.length };
    }

    setData({
      members,
      pendingCount: pending.length,
      cellCount: cells.length,
      membersInCells: inCells.size,
      pendingReports: reports.filter((r) => r.status === "pending").length,
      meetings: dash?.stats?.meetings ?? 0,
      events: dash?.stats?.events ?? 0,
      finance,
      duesRate,
    });
    setLoading(false);
    setRefreshing(false);
    if (membersR.status === "rejected") setError(true);
  }, [user, canFinance, canDues]);

  useEffect(() => { if (user) load(); }, [user, load]);

  if (!user || !canAdmin) return null;

  // Derived breakdowns
  const members = data?.members ?? [];
  const total = members.length;
  const execCount = members.filter((m) => m.role && EXEC_ROLES.includes(m.role)).length;
  const yafMembers = members
    .filter((m) => m.isYaf && m.yafStartedAt)
    .map((m) => {
      const start = toMillis(m.yafStartedAt);
      const deadline = start + 366 * 24 * 60 * 60 * 1000;
      const daysLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 86_400_000));
      return { ...m, daysLeft, deadline };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const distantCount = members.filter((m) => m.isDistantMember).length;
  const genderKnown = members.filter((m) => m.gender);
  const maleCount = genderKnown.filter((m) => (m.gender || "").toLowerCase().startsWith("m")).length;
  const femaleCount = genderKnown.filter((m) => (m.gender || "").toLowerCase().startsWith("f")).length;
  const recentMembers = [...members]
    .filter((m) => m.createdAt)
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    .slice(0, 5);
  const unassigned = Math.max(0, total - (data?.membersInCells ?? 0));

  const now = new Date();
  const duesPct = data?.duesRate && data.duesRate.total > 0
    ? Math.round((data.duesRate.paid / data.duesRate.total) * 100) : 0;

  const quickActions = [
    { label: "Approvals & Roles", desc: "Members, roles, cells", icon: Settings, href: "/dashboard/admin", tint: "bg-purple-50 text-[#3b1f6e]", show: can.accessAdmin(user.role), badge: data?.pendingCount },
    { label: "Finance", desc: "Dues, transactions, statements", icon: DollarSign, href: "/dashboard/finance", tint: "bg-green-50 text-green-700", show: can.viewFinance(user.role) },
    { label: "Broadcast", desc: "Message everyone", icon: Megaphone, href: "/dashboard/broadcast", tint: "bg-orange-50 text-orange-700", show: can.sendBroadcast(user.role) },
    { label: "Reports", desc: "Review & publish", icon: FileText, href: "/dashboard/reports", tint: "bg-blue-50 text-blue-700", show: true, badge: data?.pendingReports },
    { label: "Meetings", desc: "Schedule & attendance", icon: ClipboardList, href: "/dashboard/meetings", tint: "bg-indigo-50 text-indigo-700", show: true },
    { label: "Members", desc: "Full directory", icon: Users, href: "/dashboard/members", tint: "bg-pink-50 text-pink-700", show: can.viewAllMembers(user.role) },
  ].filter((a) => a.show);

  return (
    <div className="page-enter space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            {format(now, "EEEE, MMMM d, yyyy")} · Overview for {ROLE_LABELS[user.role]}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="p-2 rounded-lg text-gray-400 hover:text-[#3b1f6e] hover:bg-white transition-all disabled:opacity-50 shrink-0"
          title="Refresh"
        >
          <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700">Couldn&apos;t load some dashboard data. <button onClick={() => load(true)} className="underline font-medium">Retry</button></p>
        </div>
      )}

      {/* ── Overview / Analytics ───────────────────────────── */}
      <section>
        <SectionTitle icon={PieChart} tint="bg-purple-50 text-[#3b1f6e]">Overview</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonTile key={i} />)
          ) : (
            <>
              <StatTile icon={Users} label="Total Members" value={total} sub={`${execCount} executives`} color="bg-purple-50 text-[#3b1f6e]" href="/dashboard/members" delay={0} />
              <StatTile icon={UserPlus} label="Pending Approvals" value={data?.pendingCount ?? 0} sub={data?.pendingCount ? "Needs review" : "All clear"} color="bg-yellow-50 text-yellow-700" href={can.accessAdmin(user.role) ? "/dashboard/admin" : undefined} delay={0.05} />
              <StatTile icon={Layers} label="Active Cells" value={data?.cellCount ?? 0} sub={`${unassigned} unassigned member${unassigned !== 1 ? "s" : ""}`} color="bg-blue-50 text-blue-700" delay={0.1} />
              <StatTile icon={CalendarCheck} label="Meetings Held" value={data?.meetings ?? 0} sub={`${data?.events ?? 0} events planned`} color="bg-emerald-50 text-emerald-700" href="/dashboard/meetings" delay={0.15} />
            </>
          )}
        </div>

        {/* Composition bar */}
        {!loading && total > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mt-4" style={{ animation: "fadeUp 0.35s ease 0.2s both" }}>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Gender split</p>
                {genderKnown.length > 0 ? (
                  <>
                    <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
                      <div className="bg-[#3b1f6e]" style={{ width: `${(maleCount / genderKnown.length) * 100}%` }} />
                      <div className="bg-[#f0c940]" style={{ width: `${(femaleCount / genderKnown.length) * 100}%` }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1.5">
                      <span className="text-[#3b1f6e] font-medium">{maleCount} male</span> · <span className="text-[#c9a52a] font-medium">{femaleCount} female</span>
                    </p>
                  </>
                ) : <p className="text-sm text-gray-300">Not available</p>}
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Cell coverage</p>
                <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
                  <div className="bg-emerald-500" style={{ width: `${total > 0 ? ((data?.membersInCells ?? 0) / total) * 100 : 0}%` }} />
                </div>
                <p className="text-xs text-gray-500 mt-1.5">{data?.membersInCells ?? 0} of {total} in a cell</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Distant members</p>
                <div className="flex items-center gap-2">
                  <MapPin size={15} className="text-[#3b1f6e]" />
                  <p className="text-sm text-gray-700"><span className="font-semibold">{distantCount}</span> opted out of meeting emails</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Finance Oversight ───────────────────────────── */}
      {canFinance && (
        <section>
          <SectionTitle icon={Wallet} tint="bg-green-50 text-green-700">Finance Oversight</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <SkeletonTile key={i} />)
            ) : data?.finance ? (
              <>
                <StatTile icon={Wallet} label="Current Balance" value={cedis(data.finance.balance)} color="bg-green-50 text-green-700" href="/dashboard/finance" delay={0} />
                <StatTile icon={TrendingUp} label={`${MONTHS[now.getMonth()]} Income`} value={cedis(data.finance.monthIncome)} color="bg-emerald-50 text-emerald-700" delay={0.05} />
                <StatTile icon={TrendingDown} label={`${MONTHS[now.getMonth()]} Expenses`} value={cedis(data.finance.monthExpense)} color="bg-red-50 text-red-600" delay={0.1} />
                {canDues
                  ? <StatTile icon={UserCheck} label="Dues Collected" value={`${duesPct}%`} sub={`${data.duesRate?.paid ?? 0} of ${data.duesRate?.total ?? 0} this month`} color="bg-yellow-50 text-yellow-700" delay={0.15} />
                  : <StatTile icon={DollarSign} label="All-time Income" value={cedis(data.finance.income)} color="bg-yellow-50 text-yellow-700" delay={0.15} />}
              </>
            ) : (
              <p className="text-sm text-gray-400 col-span-full py-4">No finance data available.</p>
            )}
          </div>

          {/* Recent transactions */}
          {!loading && data?.finance && data.finance.recent.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mt-4" style={{ animation: "fadeUp 0.35s ease 0.2s both" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-800 text-sm">Recent Transactions</h3>
                <Link href="/dashboard/finance" className="text-xs text-[#3b1f6e] hover:underline flex items-center gap-1">View all <ArrowRight size={12} /></Link>
              </div>
              <div className="divide-y divide-gray-50">
                {data.finance.recent.map((t) => {
                  const isExpense = t.type === "expense";
                  return (
                    <div key={t.id} className="flex items-center gap-3 py-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isExpense ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-600"}`}>
                        {isExpense ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{t.description || "—"}</p>
                        <p className="text-xs text-gray-400">{t.date}{t.category ? ` · ${t.category}` : ""}</p>
                      </div>
                      <p className={`text-sm font-semibold shrink-0 ${isExpense ? "text-red-500" : "text-emerald-600"}`}>
                        {isExpense ? "−" : "+"}{cedis(Number(t.amount) || 0)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Member Lifecycle ───────────────────────────── */}
      <section>
        <SectionTitle icon={UserCheck} tint="bg-amber-50 text-amber-600">Member Lifecycle</SectionTitle>
        <div className="grid lg:grid-cols-2 gap-4">
          {/* YAF countdowns */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5" style={{ animation: "fadeUp 0.35s ease 0.05s both" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-800 text-sm flex items-center gap-2"><AlertTriangle size={15} className="text-amber-500" /> YAF Transitions</h3>
              <span className="text-xs text-gray-400">{yafMembers.length} member{yafMembers.length !== 1 ? "s" : ""}</span>
            </div>
            {loading ? (
              <div className="space-y-2"><div className="skeleton h-10 rounded-lg" /><div className="skeleton h-10 rounded-lg" /></div>
            ) : yafMembers.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No members in YAF transition</p>
            ) : (
              <div className="space-y-2">
                {yafMembers.slice(0, 5).map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-2.5 bg-amber-50/60 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs shrink-0">
                      {m.displayName?.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{m.displayName}</p>
                      <p className="text-xs text-gray-400">Closes {format(new Date(m.deadline), "MMM d, yyyy")}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${m.daysLeft <= 30 ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>
                      {m.daysLeft}d left
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent registrations */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5" style={{ animation: "fadeUp 0.35s ease 0.1s both" }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-800 text-sm flex items-center gap-2"><UserPlus size={15} className="text-[#3b1f6e]" /> Recent Members</h3>
              {(data?.pendingCount ?? 0) > 0 && can.accessAdmin(user.role) && (
                <Link href="/dashboard/admin" className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium hover:bg-yellow-200">
                  {data?.pendingCount} pending
                </Link>
              )}
            </div>
            {loading ? (
              <div className="space-y-2"><div className="skeleton h-10 rounded-lg" /><div className="skeleton h-10 rounded-lg" /></div>
            ) : recentMembers.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No members yet</p>
            ) : (
              <div className="space-y-2">
                {recentMembers.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-[#3b1f6e] flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden">
                      {m.photoURL ? <img src={m.photoURL} alt="" className="w-full h-full object-cover" /> : (m.displayName?.charAt(0).toUpperCase() || "?")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{m.displayName}</p>
                      <p className="text-xs text-gray-400 truncate">{m.role ? ROLE_LABELS[m.role] : "Member"}</p>
                    </div>
                    {m.createdAt && <p className="text-xs text-gray-400 shrink-0">{format(new Date(toMillis(m.createdAt)), "MMM d")}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Consolidated Management ───────────────────────────── */}
      <section>
        <SectionTitle icon={Settings} tint="bg-indigo-50 text-indigo-700">Management</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {quickActions.map((a, i) => (
            <Link
              key={a.href}
              href={a.href}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-[#3b1f6e]/20 active:scale-[0.98] transition-all group"
              style={{ animation: `fadeUp 0.35s ease ${i * 0.04}s both` }}
            >
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${a.tint}`}>
                  <a.icon size={20} />
                </div>
                {typeof a.badge === "number" && a.badge > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
                    {a.badge > 99 ? "99+" : a.badge}
                  </span>
                )}
              </div>
              <p className="font-semibold text-sm text-gray-800 flex items-center gap-1">
                {a.label}
                <ArrowRight size={13} className="text-gray-300 group-hover:text-[#3b1f6e] group-hover:translate-x-0.5 transition-all" />
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{a.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-gray-300 pt-2 flex items-center justify-center gap-1">
        <FileClock size={12} /> Read-only overview · data from live records
      </p>
    </div>
  );
}
