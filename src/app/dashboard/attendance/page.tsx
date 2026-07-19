"use client";
import { authFetch } from "@/lib/auth-fetch";
import { staleWhileRevalidate } from "@/lib/cache";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { can } from "@/lib/roles";
import { CheckCircle, XCircle, Users, ChevronRight, ClipboardList, ChevronDown } from "lucide-react";
import { format } from "date-fns";

type Meeting = {
  id: string; title: string; date: string; time: string;
  status: string; attendees: string[];
};
type Member = { id: string; displayName: string; email: string; role: string };

export default function AttendanceIndexPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"meetings" | "stats">("meetings");

  // Stats filters
  const currentYear = new Date().getFullYear();
  const [filterYear, setFilterYear] = useState(currentYear);
  const [filterMonth, setFilterMonth] = useState<number>(0); // 0 = All
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!can.markAttendance(user.role)) {
      router.replace("/dashboard");
      return;
    }

    staleWhileRevalidate("/api/meetings", 30_000, (m) => {
      if (Array.isArray(m)) { setMeetings(m); setLoading(false); }
      else setError(m.error || "Failed to load meetings");
    });
    staleWhileRevalidate("/api/get-members", 30_000, (mb) => {
      if (Array.isArray(mb)) setMembers(mb);
    });
  }, [user, router]);

  const statusColor: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700",
    ongoing: "bg-green-100 text-green-700",
    ended: "bg-gray-100 text-gray-600",
  };

  // Stats computation
  const filteredMeetings = meetings.filter((m) => {
    if (!m.date) return false;
    const d = new Date(m.date);
    if (d.getFullYear() !== filterYear) return false;
    if (filterMonth !== 0 && d.getMonth() + 1 !== filterMonth) return false;
    return true;
  });

  const sortedMembers = [...members].sort((a, b) =>
    (a.displayName || "").localeCompare(b.displayName || "")
  );

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;
  if (error) return <div className="text-center py-12 text-red-500">{error}</div>;

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Attendance</h1>
          <p className="text-gray-500 text-sm">View and mark attendance for meetings</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setActiveTab("meetings")}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "meetings"
              ? "bg-[#3b1f6e] text-white shadow-sm"
              : "text-gray-600 hover:text-gray-800"
          }`}
        >
          Meetings
        </button>
        <button
          onClick={() => setActiveTab("stats")}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "stats"
              ? "bg-[#3b1f6e] text-white shadow-sm"
              : "text-gray-600 hover:text-gray-800"
          }`}
        >
          Member Stats
        </button>
      </div>

      {/* Meetings Tab */}
      {activeTab === "meetings" && (
        <>
          {meetings.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <ClipboardList size={40} className="mx-auto mb-3 opacity-40" />
              <p>No meetings scheduled yet</p>
            </div>
          )}

          <div className="space-y-3">
            {meetings.map((m) => {
              const presentCount = m.attendees?.length ?? 0;
              const totalCount = members.length;
              const isOpen = expanded === m.id;
              const presentSet = new Set(m.attendees ?? []);

              return (
                <div key={m.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-800">{m.title}</h3>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {m.date ? format(new Date(m.date), "MMMM d, yyyy") : "—"} at {m.time}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${statusColor[m.status] || statusColor.scheduled}`}>
                        {m.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle size={14} /> {presentCount} present
                        </span>
                        <span className="flex items-center gap-1 text-red-500">
                          <XCircle size={14} /> {totalCount - presentCount} absent
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.status !== "ended" ? (
                          <a href={`/dashboard/attendance/${m.id}`}
                            className="text-xs bg-[#3b1f6e] text-white px-3 py-1.5 rounded-lg hover:bg-[#2a1550]">
                            Mark Attendance
                          </a>
                        ) : user && can.accessConsole(user.role) ? (
                          // The admin can correct records of already-ended meetings.
                          <a href={`/dashboard/attendance/${m.id}`}
                            className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600">
                            Edit Attendance
                          </a>
                        ) : null}
                        {totalCount > 0 && (
                          <button onClick={() => setExpanded(isOpen ? null : m.id)}
                            className="flex items-center gap-1 text-xs text-[#3b1f6e] hover:underline">
                            {isOpen ? "Hide" : "View list"}
                            <ChevronRight size={13} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {members.map((mem) => {
                        const present = presentSet.has(mem.id);
                        return (
                          <div key={mem.id} className={`flex items-center gap-3 px-4 py-2.5 ${present ? "bg-green-50" : "bg-red-50/40"}`}>
                            {present
                              ? <CheckCircle size={16} className="text-green-500 shrink-0" />
                              : <XCircle size={16} className="text-gray-300 shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800">{mem.displayName}</p>
                              <p className="text-xs text-gray-400">{mem.email}</p>
                            </div>
                            <span className={`text-xs font-medium ${present ? "text-green-600" : "text-gray-400"}`}>
                              {present ? "Present" : "Absent"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Member Stats Tab */}
      {activeTab === "stats" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]"
            >
              {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]"
            >
              <option value={0}>All Months</option>
              {MONTHS.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>

          {/* Summary bar */}
          <div className="bg-[#3b1f6e] text-white rounded-xl px-4 py-3 flex items-center gap-3">
            <Users size={18} className="opacity-70" />
            <p className="text-sm">
              <span className="font-bold">{filteredMeetings.length}</span> meeting{filteredMeetings.length !== 1 ? "s" : ""} in period,{" "}
              <span className="font-bold">{members.length}</span> member{members.length !== 1 ? "s" : ""} tracked
            </p>
          </div>

          {filteredMeetings.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <ClipboardList size={40} className="mx-auto mb-3 opacity-40" />
              <p>No meetings in this period</p>
            </div>
          )}

          {filteredMeetings.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-4 gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <span className="col-span-1">Member</span>
                <span className="text-center">Present</span>
                <span className="text-center">Absent</span>
                <span className="text-center">%</span>
              </div>

              <div className="divide-y divide-gray-50">
                {sortedMembers.map((mem) => {
                  const presentCount = filteredMeetings.filter((m) =>
                    (m.attendees ?? []).includes(mem.id)
                  ).length;
                  const total = filteredMeetings.length;
                  const absentCount = total - presentCount;
                  const pct = total > 0 ? Math.round((presentCount / total) * 100) : 0;
                  const isOpen = expandedMember === mem.id;

                  return (
                    <div key={mem.id}>
                      <button
                        onClick={() => setExpandedMember(isOpen ? null : mem.id)}
                        className="w-full grid grid-cols-4 gap-2 px-4 py-3 hover:bg-gray-50 transition-colors text-left items-center"
                      >
                        <div className="col-span-1 flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-[#f0c940] flex items-center justify-center text-[#3b1f6e] font-bold text-xs shrink-0">
                            {mem.displayName?.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-gray-800 truncate">{mem.displayName}</span>
                          <ChevronDown size={13} className={`text-gray-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </div>
                        <span className="text-center text-sm text-green-600 font-medium">{presentCount}</span>
                        <span className="text-center text-sm text-red-500 font-medium">{absentCount}</span>
                        <span className={`text-center text-sm font-bold ${pct >= 75 ? "text-green-600" : pct >= 50 ? "text-yellow-600" : "text-red-500"}`}>
                          {pct}%
                        </span>
                      </button>

                      {isOpen && (
                        <div className="bg-gray-50 border-t border-gray-100 divide-y divide-gray-100 px-4">
                          {filteredMeetings
                            .slice()
                            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                            .map((m) => {
                              const present = (m.attendees ?? []).includes(mem.id);
                              return (
                                <div key={m.id} className="flex items-center gap-3 py-2.5">
                                  {present
                                    ? <CheckCircle size={15} className="text-green-500 shrink-0" />
                                    : <XCircle size={15} className="text-red-400 shrink-0" />}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-700">{m.title}</p>
                                    <p className="text-xs text-gray-400">
                                      {m.date ? format(new Date(m.date), "MMM d, yyyy") : "—"}
                                    </p>
                                  </div>
                                  <span className={`text-xs font-medium ${present ? "text-green-600" : "text-red-500"}`}>
                                    {present ? "Present ✓" : "Absent ✗"}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
