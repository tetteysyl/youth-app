"use client";
import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/lib/store";
import { can } from "@/lib/roles";
import { staleWhileRevalidate } from "@/lib/cache";
import { Users, Calendar, BookOpen, DollarSign, RefreshCw, AlertTriangle, MapPin } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import toast from "react-hot-toast";

type DashData = {
  stats: { members: number; meetings: number; events: number };
  upcoming: { id: string; title: string; description: string; date: string; time: string }[];
};

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="skeleton w-10 h-10 rounded-lg mb-3" />
      <div className="skeleton w-12 h-7 mb-1.5" />
      <div className="skeleton w-20 h-3" />
    </div>
  );
}

function SkeletonEvent() {
  return (
    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
      <div className="skeleton w-12 h-12 rounded-lg shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="skeleton w-3/4 h-4" />
        <div className="skeleton w-1/2 h-3" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, setUser } = useAuthStore();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [today, setToday] = useState("");
  const [key, setKey] = useState(0); // bump to re-trigger animations
  const [savingDistant, setSavingDistant] = useState(false);

  useEffect(() => {
    setToday(format(new Date(), "EEEE, MMMM d, yyyy"));
  }, []);

  const load = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    staleWhileRevalidate("/api/dashboard", 30_000, (json, fromCache) => {
      if (!json.error) {
        setData(json);
        setLoading(false);
        if (!fromCache) {
          setRefreshing(false);
          if (isRefresh) setKey((k) => k + 1);
        }
      }
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  // YAF countdown — 2 months (60 days) from yafStartedAt
  const yafCountdown = (() => {
    if (!user?.isYaf || !user.yafStartedAt) return null;
    const startedAt = new Date(user.yafStartedAt).getTime();
    const deadline = startedAt + 60 * 24 * 60 * 60 * 1000;
    const msLeft = deadline - Date.now();
    const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
    return { daysLeft, deadline };
  })();

  const toggleDistant = async () => {
    if (!user || savingDistant) return;
    setSavingDistant(true);
    const next = !user.isDistantMember;
    try {
      const res = await fetch("/api/member-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, isDistantMember: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setUser({ ...user, isDistantMember: next });
      toast.success(next ? "You're now marked as a distant member." : "You're no longer marked as a distant member.");
    } catch (e: any) {
      toast.error(e.message || "Failed to update status.");
    } finally {
      setSavingDistant(false);
    }
  };

  const cards = [
    { label: "Total Members", value: data?.stats.members ?? 0, icon: Users, color: "bg-purple-50 text-[#3b1f6e]", href: "/dashboard/members" },
    { label: "Meetings Held", value: data?.stats.meetings ?? 0, icon: Calendar, color: "bg-yellow-50 text-yellow-700", href: "/dashboard/meetings" },
    { label: "Events Planned", value: data?.stats.events ?? 0, icon: BookOpen, color: "bg-blue-50 text-blue-700", href: "/dashboard/events" },
    ...(can.viewFinance(user?.role!) ? [{ label: "Finance", value: "—", icon: DollarSign, color: "bg-green-50 text-green-700", href: "/dashboard/finance" }] : []),
  ];

  return (
    <div key={key} className="page-enter space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Welcome, {user?.displayName?.split(" ")[0]} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">{today}</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="p-2 rounded-lg text-gray-400 hover:text-[#3b1f6e] hover:bg-white transition-all disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {/* YAF countdown banner */}
      {yafCountdown && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              You are now a YAF (Young Adult Fellowship) member
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {yafCountdown.daysLeft > 0
                ? `Your YPG account will be automatically closed in ${yafCountdown.daysLeft} day${yafCountdown.daysLeft !== 1 ? "s" : ""} — on ${format(new Date(yafCountdown.deadline), "MMMM d, yyyy")}.`
                : "Your YPG account is scheduled for closure shortly."}
              {" "}Thank you for your years of service to the Guild.
            </p>
          </div>
        </div>
      )}

      {/* Distant member toggle */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <MapPin size={16} className="text-[#3b1f6e]" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">Distant Member Status</p>
            <p className="text-xs text-gray-400">
              {user?.isDistantMember
                ? "You may be excluded from meeting email notifications."
                : "You receive all meeting email notifications."}
            </p>
          </div>
        </div>
        <button
          onClick={toggleDistant}
          disabled={savingDistant}
          className={`relative w-12 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
            user?.isDistantMember ? "bg-[#3b1f6e]" : "bg-gray-300"
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            user?.isDistantMember ? "translate-x-6" : "translate-x-0"
          }`} />
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : cards.map((card) => (
              <Link
                key={card.label}
                href={card.href}
                className="stat-card bg-white rounded-xl p-4 shadow-sm hover:shadow-md active:scale-95 transition-all border border-gray-100"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${card.color}`}>
                  <card.icon size={20} />
                </div>
                <p className="text-2xl font-bold text-gray-800">{card.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
              </Link>
            ))}
      </div>

      {/* Upcoming Events */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5" style={{ animation: "fadeUp 0.35s ease 0.2s both" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Upcoming Events</h2>
          <Link href="/dashboard/events" className="text-xs text-[#3b1f6e] hover:underline">View all</Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            <SkeletonEvent />
            <SkeletonEvent />
            <SkeletonEvent />
          </div>
        ) : data?.upcoming.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">No upcoming events</p>
        ) : (
          <div className="stagger space-y-3">
            {data?.upcoming.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="text-white text-center rounded-lg p-2 min-w-[48px] shrink-0" style={{ background: "linear-gradient(135deg, #3b1f6e, #2a1550)" }}>
                  <p className="text-xs leading-none mb-0.5">{ev.date ? format(new Date(ev.date), "MMM") : "—"}</p>
                  <p className="text-lg font-bold leading-none">{ev.date ? format(new Date(ev.date), "d") : "—"}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-800">{ev.title}</p>
                  {ev.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{ev.description}</p>}
                  {ev.time && <p className="text-xs text-gray-400 mt-0.5">🕐 {ev.time}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
