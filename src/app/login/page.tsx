"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";
import toast from "react-hot-toast";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const snap = await getDoc(doc(db, "members", cred.user.uid));
        if (!snap.exists()) throw new Error("Account not found.");
        const data = snap.data();
        if (data.role === "pending") router.replace("/pending");
        else router.replace("/dashboard");
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "members", cred.user.uid), {
          email,
          displayName: name,
          phone,
          role: "pending",
          createdAt: serverTimestamp(),
        });
        toast.success("Registration submitted! Awaiting approval.");
        router.replace("/pending");
      }
    } catch (err: any) {
      const msg = err.code === "auth/network-request-failed"
        ? "Network error. Please check your internet connection and try again."
        : err.code === "auth/invalid-credential"
        ? "Incorrect email or password."
        : err.code === "auth/user-not-found"
        ? "No account found with this email."
        : err.message || "An error occurred.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const ref = doc(db, "members", cred.user.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          email: cred.user.email,
          displayName: cred.user.displayName,
          photoURL: cred.user.photoURL,
          phone: "",
          role: "pending",
          createdAt: serverTimestamp(),
        });
        toast.success("Account created! Awaiting approval.");
        router.replace("/pending");
      } else {
        const data = snap.data();
        if (data.role === "pending") router.replace("/pending");
        else router.replace("/dashboard");
      }
    } catch (err: any) {
      toast.error(err.message || "Google sign-in failed.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Panel — Branding */}
      <div className="lg:w-5/12 bg-[#3b1f6e] flex flex-col items-center justify-center p-10 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          {[60,120,180,240,300,360,420,480,540,600].map((size) => (
            <div key={size} className="absolute rounded-full border border-white"
              style={{ width: `${size}px`, height: `${size}px`, top: "50%", left: "50%", transform: "translate(-50%,-50%)" }} />
          ))}
        </div>

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="flex items-center gap-6 mb-8">
            <div className="w-24 h-24 rounded-full bg-white/10 border-2 border-white/40 flex items-center justify-center overflow-hidden p-1">
              <Image src="/pcg-logo.png" alt="PCG Logo" width={88} height={88} className="object-contain" />
            </div>
            <div className="w-px h-16 bg-white/30" />
            <div className="w-24 h-24 rounded-full bg-white/10 border-2 border-[#c9a52a] flex items-center justify-center overflow-hidden p-1">
              <Image src="/ypg-logo.png" alt="YPG Logo" width={88} height={88} className="object-contain" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-[#f0c940] mb-2">Young People's Guild</h1>
          <p className="text-white/80 text-lg mb-1">Presbyterian Church of Ghana</p>
          <p className="text-white/50 text-sm mb-8">Saviour Congregation</p>

          <div className="border border-[#c9a52a]/40 rounded-xl px-6 py-4 bg-white/5 max-w-xs">
            <p className="text-[#f0c940] italic text-sm text-center leading-relaxed">
              "To Know His Will and To Do It"
            </p>
          </div>
          <div className="mt-8 text-white/40 text-xs text-center">
            <p>That one they all may be</p>
          </div>
        </div>
      </div>

      {/* Right Panel — Auth Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[#3b1f6e]">
              {mode === "login" ? "Welcome Back" : "Join the Guild"}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {mode === "login"
                ? "Sign in to access the YPG management system"
                : "Register to become a member of YPG"}
            </p>
          </div>

          <div className="flex rounded-xl bg-gray-200 p-1 mb-6">
            <button onClick={() => setMode("login")}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === "login" ? "bg-[#3b1f6e] text-white shadow" : "text-gray-500 hover:text-gray-700"
              }`}>Sign In</button>
            <button onClick={() => setMode("register")}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === "register" ? "bg-[#3b1f6e] text-white shadow" : "text-gray-500 hover:text-gray-700"
              }`}>Register</button>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            {mode === "register" && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Full Name</label>
                  <input type="text" placeholder="Enter your full name" value={name}
                    onChange={(e) => setName(e.target.value)} required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e] bg-white" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Phone Number</label>
                  <input type="tel" placeholder="e.g. 0244000000" value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e] bg-white" />
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Email Address</label>
              <input type="email" placeholder="Enter your email" value={email}
                onChange={(e) => setEmail(e.target.value)} required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e] bg-white" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Password</label>
              <input type="password" placeholder="Enter your password" value={password}
                onChange={(e) => setPassword(e.target.value)} required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e] bg-white" />
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-[#3b1f6e] hover:bg-[#2a1550] text-white py-3 rounded-xl font-medium transition-colors disabled:opacity-50 mt-2">
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-gray-50 px-3 text-xs text-gray-400">or continue with</span>
            </div>
          </div>

          <button onClick={handleGoogle} disabled={loading}
            className="w-full border-2 border-gray-200 py-3 rounded-xl font-medium text-gray-700 hover:bg-white hover:border-gray-300 transition-all flex items-center justify-center gap-3 disabled:opacity-50">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {mode === "register" && (
            <p className="text-xs text-gray-400 text-center mt-4">
              Your account will be reviewed and approved by the President before you can access the app.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
