"use client";
import { authFetch } from "@/lib/auth-fetch";
import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";
import toast from "react-hot-toast";

const CELL_OPTIONS = ["Charis", "Eleos", "Kleos", "Dunamis"];

export default function PendingPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [cellChoice, setCellChoice] = useState("none");
  const [gender, setGender] = useState("");
  const [isDistantMember, setIsDistantMember] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { setChecked(true); return; }
      setUid(fbUser.uid);
      const snap = await getDoc(doc(db, "members", fbUser.uid));
      if (snap.exists()) {
        const data = snap.data();
        if (!data.dateOfBirth) setNeedsProfile(true);
      }
      setChecked(true);
    });
    return () => unsub();
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    if (!gender) { toast.error("Please select your gender."); return; }
    setSaving(true);
    try {
      const res = await authFetch("/api/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, dateOfBirth, cellChoice, gender, isDistantMember }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      toast.success("Profile completed! Awaiting approval.");
      setNeedsProfile(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #3b1f6e 0%, #2a1550 100%)" }}>
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
        <div className="flex justify-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full border-2 border-gray-200 bg-blue-50 flex items-center justify-center overflow-hidden p-1">
            <Image src="/pcg-logo.png" alt="PCG" width={56} height={56} className="object-contain" />
          </div>
          <div className="w-16 h-16 rounded-full border-2 border-[#c9a52a] bg-purple-50 flex items-center justify-center overflow-hidden">
            <Image src="/ypg-logo.png" alt="YPG" width={64} height={64} className="object-cover w-full h-full" />
          </div>
        </div>

        {checked && needsProfile ? (
          <>
            <h2 className="text-xl font-bold text-[#3b1f6e] mb-2">Complete Your Profile</h2>
            <p className="text-gray-500 text-sm mb-5">
              Just a couple more details before your registration can be reviewed.
            </p>
            <form onSubmit={handleSaveProfile} className="space-y-3 text-left">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Gender</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setGender("male")}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                      gender === "male" ? "bg-[#3b1f6e] text-white border-[#3b1f6e]" : "border-gray-200 text-gray-600 bg-white"
                    }`}>Male</button>
                  <button type="button" onClick={() => setGender("female")}
                    className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                      gender === "female" ? "bg-[#3b1f6e] text-white border-[#3b1f6e]" : "border-gray-200 text-gray-600 bg-white"
                    }`}>Female</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Date of Birth</label>
                <input type="date" required value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]" />
                <p className="text-xs text-gray-400 mt-1">Only visible to the President</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Cell</label>
                <select value={cellChoice} onChange={(e) => setCellChoice(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]">
                  <option value="none">No cell yet</option>
                  {CELL_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <label className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 cursor-pointer">
                <input type="checkbox" checked={isDistantMember}
                  onChange={(e) => setIsDistantMember(e.target.checked)}
                  className="accent-[#3b1f6e] mt-0.5" />
                <span className="text-sm text-gray-700">I am a distant member</span>
              </label>
              <button type="submit" disabled={saving}
                className="w-full bg-[#3b1f6e] text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 mt-2">
                {saving ? "Saving..." : "Save & Continue"}
              </button>
            </form>
          </>
        ) : (
          <>
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
          </>
        )}

        <button onClick={handleSignOut}
          className="w-full border-2 border-[#3b1f6e] text-[#3b1f6e] py-2.5 rounded-xl text-sm font-medium hover:bg-[#3b1f6e] hover:text-white transition-colors mt-3">
          Sign Out
        </button>
      </div>
    </div>
  );
}
