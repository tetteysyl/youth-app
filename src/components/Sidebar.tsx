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
  Megaphone, LogOut, Settings, X, ClipboardList, MessageCircle, FileText, Gauge, Shield
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "viewMemberDashboard" },
  { href: "/dashboard/console", label: "Admin Console", icon: Shield, permission: "accessConsole" },
  { href: "/dashboard/admin-overview", label: "Admin Dashboard", icon: Gauge, permission: "accessAdmin" },
  { href: "/dashboard/events", label: "Events & Activities", icon: Calendar, always: true },
  { href: "/dashboard/reports", label: "Reports", icon: FileText, always: true },
  { href: "/dashboard/messages", label: "Messages", icon: MessageCircle, permission: "useMessaging" },
  { href: "/dashboard/meetings", label: "Meetings", icon: ClipboardList, always: true },
  { href: "/dashboard/attendance", label: "Attendance", icon: Users, permission: "markAttendance" },
  { href: "/dashboard/finance", label: "Finance", icon: DollarSign, permission: "viewFinance" },
  { href: "/dashboard/broadcast", label: "Broadcast", icon: Megaphone, permission: "sendBroadcast" },
  { href: "/dashboard/members", label: "Members", icon: Users, permission: "viewAllMembers" },
  { href: "/dashboard/admin", label: "Admin Panel", icon: Settings, permission: "accessAdmin" },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  unreadMessages?: number;
}

export default function Sidebar({ open, onClose, unreadMessages = 0 }: SidebarProps) {
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
              <div className="w-10 h-10 rounded-full border border-[#c9a52a] overflow-hidden shrink-0">
                <Image src="/ypg-logo.png" alt="YPG" width={40} height={40} className="w-full h-full object-cover" />
              </div>
              <div>
                <p className="text-[#f0c940] font-bold text-sm leading-tight">YPG</p>
                <p className="text-white/50 text-xs leading-tight">SAVIOUR CONGREGATION</p>
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
              <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center font-bold text-[#3b1f6e] text-sm shrink-0"
                style={{ background: "linear-gradient(135deg, #f0c940, #c9a52a)" }}>
                {user.photoURL
                  ? <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                  : user.displayName?.charAt(0).toUpperCase()
                }
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
                <div className="relative">
                  <item.icon size={17} />
                  {item.href === "/dashboard/messages" && unreadMessages > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                      {unreadMessages > 9 ? "9+" : unreadMessages}
                    </span>
                  )}
                </div>
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
