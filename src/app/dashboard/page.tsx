"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";
import { can } from "@/lib/roles";
import { Users, Calendar, DollarSign, BookOpen } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({ members: 0, meetings: 0, events: 0 });
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(format(new Date(), "EEEE, MMMM d, yyyy"));
  }, []);

  useEffect(() => {
    const load = async () => {
      const [membersSnap, meetingsSnap, eventsSnap] = await Promise.all([
        getDocs(query(collection(db, "members"), where("role", "!=", "pending"))),
        getDocs(collection(db, "meetings")),
        getDocs(collection(db, "events")),
      ]);
      setStats({
        members: membersSnap.size,
        meetings: meetingsSnap.size,
        events: eventsSnap.size,
      });

      const evQ = query(collection(db, "events"), orderBy("date", "asc"), limit(3));
      const evSnap = await getDocs(evQ);
      setUpcoming(evSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    load();
  }, []);

  const cards = [
    { label: "Total Members", value: stats.members, icon: Users, color: "bg-purple-50 text-[#3b1f6e]", href: "/dashboard/members" },
    { label: "Meetings Held", value: stats.meetings, icon: Calendar, color: "bg-yellow-50 text-yellow-700", href: "/dashboard/meetings" },
    { label: "Events Planned", value: stats.events, icon: BookOpen, color: "bg-blue-50 text-blue-700", href: "/dashboard/events" },
  ];

  if (can.viewFinance(user?.role!)) {
    cards.push({ label: "Finance", value: "—", icon: DollarSign, color: "bg-green-50 text-green-700", href: "/dashboard/finance" } as any);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Welcome, {user?.displayName?.split(" ")[0]} 👋</h1>
        <p className="text-gray-500 text-sm mt-1">{today}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border border-gray-100">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${card.color}`}>
              <card.icon size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{card.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
          </Link>
        ))}
      </div>

      {/* Upcoming Events */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Upcoming Events</h2>
          <Link href="/dashboard/events" className="text-xs text-[#1a3a5c] hover:underline">View all</Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">No upcoming events</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-white text-center rounded-lg p-2 min-w-[48px]" style={{ background: "linear-gradient(135deg, #3b1f6e, #2a1550)" }}>
                  <p className="text-xs">{ev.date ? format(new Date(ev.date), "MMM") : "—"}</p>
                  <p className="text-lg font-bold leading-none">{ev.date ? format(new Date(ev.date), "d") : "—"}</p>
                </div>
                <div>
                  <p className="font-medium text-sm text-gray-800">{ev.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{ev.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
