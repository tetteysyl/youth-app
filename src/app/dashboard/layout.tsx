"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import Sidebar from "@/components/Sidebar";
import { Menu, Bell } from "lucide-react";
import Image from "next/image";
import {
  collection, query, where, onSnapshot, orderBy,
  updateDoc, doc, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Notif = { id: string; title: string; body: string; type: string; read: boolean; createdAt: any };

const TYPE_ICON: Record<string, string> = {
  meeting: "📅",
  attendance: "✅",
  absence: "⚠️",
  evangelism: "📖",
  broadcast: "📢",
  default: "🔔",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role === "pending") router.replace("/pending");
  }, [user, loading, router]);

  // Live notifications
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const notifs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Notif))
        .sort((a, b) => {
          const at = a.createdAt?.toMillis?.() ?? (a.createdAt instanceof Date ? a.createdAt.getTime() : 0);
          const bt = b.createdAt?.toMillis?.() ?? (b.createdAt instanceof Date ? b.createdAt.getTime() : 0);
          return bt - at;
        });
      setNotifications(notifs);
    });
    return () => unsub();
  }, [user]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = notifications.filter((n) => !n.read).length;

  const markAllRead = async () => {
    const unreadNotifs = notifications.filter((n) => !n.read);
    if (!unreadNotifs.length) return;
    const batch = writeBatch(db);
    unreadNotifs.forEach((n) => batch.update(doc(db, "notifications", n.id), { read: true }));
    await batch.commit();
  };

  const markRead = async (id: string) => {
    await updateDoc(doc(db, "notifications", id), { read: true });
  };

  const formatTime = (ts: any) => {
    if (!ts) return "";
    const date = ts.toDate?.() ?? (ts instanceof Date ? ts : null);
    if (!date) return "";
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#3b1f6e" }}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#f0c940] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#f0c940] font-medium">Loading YPG App...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 shadow-sm">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500 hover:text-[#3b1f6e]">
            <Menu size={22} />
          </button>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block w-7 h-7 overflow-hidden">
              <Image src="/ypg-logo.png" alt="YPG" width={28} height={28} className="object-contain" />
            </div>
            <span className="font-bold text-[#3b1f6e] hidden sm:block text-sm">YPG Management System</span>
          </div>

          <div className="flex-1" />

          {/* Notification Bell */}
          <div className="relative" ref={bellRef}>
            <button
              onClick={() => { setShowNotifs((v) => !v); if (!showNotifs) markAllRead(); }}
              className="relative text-gray-400 hover:text-[#3b1f6e] transition-colors p-1"
            >
              <Bell size={20} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-10 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="font-semibold text-gray-800 text-sm">Notifications</p>
                  {notifications.some((n) => !n.read) && (
                    <button onClick={markAllRead} className="text-xs text-[#3b1f6e] hover:underline">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                  {notifications.length === 0 && (
                    <p className="text-center py-8 text-gray-400 text-sm">No notifications yet</p>
                  )}
                  {notifications.slice(0, 20).map((n) => (
                    <div
                      key={n.id}
                      onClick={() => markRead(n.id)}
                      className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${!n.read ? "bg-purple-50" : ""}`}
                    >
                      <div className="flex gap-2.5">
                        <span className="text-lg shrink-0 leading-none mt-0.5">
                          {TYPE_ICON[n.type] ?? TYPE_ICON.default}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${!n.read ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                            {n.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
                          <p className="text-xs text-gray-400 mt-1">{formatTime(n.createdAt)}</p>
                        </div>
                        {!n.read && (
                          <div className="w-2 h-2 bg-[#3b1f6e] rounded-full shrink-0 mt-1.5" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[#3b1f6e] font-bold text-sm"
            style={{ background: "linear-gradient(135deg, #f0c940, #c9a52a)" }}>
            {user.displayName?.charAt(0).toUpperCase()}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
