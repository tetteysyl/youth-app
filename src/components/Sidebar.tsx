"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";
import { can, ROLE_LABELS, ROLE_COLORS } from "@/lib/roles";
import Image from "next/image";
import {
  LayoutDashboard, Users, Calendar, DollarSign,
  BookOpen, Megaphone, LogOut, Settings, X, ClipboardList, MessageCircle
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, always: true },
  { href: "/dashboard/events", label: "Events & Activities", icon: Calendar, always: true },
  { href: "/dashboard/messages", label: "Messages", icon: MessageCircle, always: true },
  { href: "/dashboard/meetings", label: "Meetings", icon: ClipboardList, permission: "scheduleMeeting" },
  { href: "/dashboard/attendance", label: "Attendance", icon: Users, permission: "markAttendance" },
  { href: "/dashboard/finance", label: "Finance", icon: DollarSign, permission: "viewFinance" },
  { href: "/dashboard/evangelism", label: "Evangelism", icon: BookOpen, permission: "sendBibleQuote" },
  { href: "/dashboard/broadcast", label: "Broadcast", icon: Megaphone, permission: "sendBroadcast" },
  { href: "/dashboard/members", label: "Members", icon: Users, permission: "checkAbsentMembers" },
  { href: "/dashboard/admin", label: "Admin Panel", icon: Settings, permission: "accessAdmin" },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const visibleItems = navItems.filter((item) => {
    if (item.always) return true;
    if (!item.permission || !user) return false;
    return (can as any)[item.permission](user.role);
  });

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={onClose} />
      )}

      <aside className={`fixed top-0 left-0 h-full w-64 z-30 transform transition-transform duration-200 flex flex-col
        ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 lg:static lg:flex`}
        style={{ background: "linear-gradient(180deg, #3b1f6e 0%, #2a1550 100%)" }}>

        {/* Logo Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/10 border border-[#c9a52a] overflow-hidden flex items-center justify-center p-0.5">
                <Image src="/ypg-logo.png" alt="YPG" width={36} height={36} className="object-contain" />
              </div>
              <div>
                <p className="text-[#f0c940] font-bold text-sm leading-tight">YPG</p>
                <p className="text-white/50 text-xs leading-tight">PCG — Saviour</p>
              </div>
            </div>
            <button onClick={onClose} className="lg:hidden text-white/40 hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* User Profile */}
        {user && (
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[#3b1f6e] text-sm shrink-0"
                style={{ background: "linear-gradient(135deg, #f0c940, #c9a52a)" }}>
                {user.displayName?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{user.displayName}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role]}`}>
                  {ROLE_LABELS[user.role]}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {visibleItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  active
                    ? "text-[#3b1f6e] font-semibold shadow"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
                style={active ? { background: "linear-gradient(135deg, #f0c940, #c9a52a)" } : {}}>
                <item.icon size={17} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* PCG Logo + Sign Out */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex items-center justify-center p-0.5">
              <Image src="/pcg-logo.png" alt="PCG" width={28} height={28} className="object-contain" />
            </div>
            <p className="text-white/40 text-xs">Presbyterian Church of Ghana</p>
          </div>
          <button onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
