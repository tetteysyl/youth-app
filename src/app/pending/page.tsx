"use client";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function PendingPage() {
  const router = useRouter();
  const handleSignOut = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #3b1f6e 0%, #2a1550 100%)" }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <div className="flex justify-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full border-2 border-gray-200 bg-blue-50 flex items-center justify-center overflow-hidden p-1">
            <Image src="/pcg-logo.png" alt="PCG" width={56} height={56} className="object-contain" />
          </div>
          <div className="w-16 h-16 rounded-full border-2 border-[#c9a52a] bg-purple-50 flex items-center justify-center overflow-hidden p-1">
            <Image src="/ypg-logo.png" alt="YPG" width={56} height={56} className="object-contain" />
          </div>
        </div>

        <div className="w-14 h-14 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-[#3b1f6e] mb-2">Account Pending Approval</h2>
        <p className="text-gray-500 text-sm mb-4">
          Your registration has been received. The YPG President will review and approve your account shortly.
        </p>
        <p className="text-xs text-gray-400 mb-6 italic">
          "To Know His Will and To Do It"
        </p>
        <button onClick={handleSignOut}
          className="w-full border-2 border-[#3b1f6e] text-[#3b1f6e] py-2.5 rounded-xl text-sm font-medium hover:bg-[#3b1f6e] hover:text-white transition-colors">
          Sign Out
        </button>
      </div>
    </div>
  );
}
