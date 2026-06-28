"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import Sidebar from "@/components/Sidebar";
import { Menu, Bell } from "lucide-react";
import Image from "next/image";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role === "pending") router.replace("/pending");
  }, [user, loading, router]);

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
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 shadow-sm">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500 hover:text-[#3b1f6e]">
            <Menu size={22} />
          </button>

          {/* Title */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:block w-7 h-7 overflow-hidden">
              <Image src="/ypg-logo.png" alt="YPG" width={28} height={28} className="object-contain" />
            </div>
            <span className="font-bold text-[#3b1f6e] hidden sm:block text-sm">YPG Management System</span>
          </div>

          <div className="flex-1" />

          <button className="relative text-gray-400 hover:text-[#3b1f6e] transition-colors">
            <Bell size={20} />
          </button>

          {/* Avatar */}
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[#3b1f6e] font-bold text-sm"
            style={{ background: "linear-gradient(135deg, #f0c940, #c9a52a)" }}>
            {user.displayName?.charAt(0).toUpperCase()}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
