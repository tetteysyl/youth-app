"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";
import toast from "react-hot-toast";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [cellChoice, setCellChoice] = useState("none");
  const [gender, setGender] = useState("");
  const [isDistantMember, setIsDistantMember] = useState(false);
  const [loading, setLoading] = useState(false);

  const CELL_OPTIONS = ["Charis", "Eleos", "Kleos", "Dunamis"];
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const calcAge = (dob: string) => {
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "register") {
      const age = calcAge(dateOfBirth);
      if (age === null) {
        toast.error("Please enter a valid date of birth.");
        return;
      }
      if (age < 18) {
        toast.error("Sorry, your age does not permit you to be a YPG member. Kindly join Children Service.");
        return;
      }
      if (age > 30) {
        toast.error("Sorry, you can't be part of YPG. Your age makes you a YAF member.");
        return;
      }
      if (!gender) {
        toast.error("Please select your gender.");
        return;
      }
    }

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
          dateOfBirth,
          cellChoice,
          gender,
          isDistantMember,
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

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSent(true);
    } catch (err: any) {
      const msg = err.code === "auth/user-not-found"
        ? "No account found with this email."
        : err.code === "auth/invalid-email"
        ? "Invalid email address."
        : err.message || "Failed to send reset email.";
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
            <div className="w-24 h-24 rounded-full bg-white/10 border-2 border-[#c9a52a] flex items-center justify-center overflow-hidden">
              <Image src="/ypg-logo.png" alt="YPG Logo" width={96} height={96} className="object-cover w-full h-full" />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-[#f0c940] mb-2">Young People's Guild</h1>
          <p className="text-white/80 text-lg mb-1">Presbyterian Church of Ghana</p>
          <p className="text-white/50 text-sm mb-8">Saviour Congregation, Madina-West</p>

          <div className="border border-[#c9a52a]/40 rounded-xl px-6 py-4 bg-white/5 max-w-xs">
            <p className="text-[#f0c940] italic text-sm text-center leading-relaxed">
              "To Know His Will and To Do It"
            </p>
          </div>
          <div className="mt-8 text-white/40 text-xs text-center">
            <p>That they all may be one</p>
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
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e] bg-white" />
                  <p className="text-xs text-gray-400 mt-1">Only visible to the President</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Cell</label>
                  <select value={cellChoice} onChange={(e) => setCellChoice(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e] bg-white">
                    <option value="none">No cell yet</option>
                    {CELL_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 cursor-pointer">
                  <input type="checkbox" checked={isDistantMember}
                    onChange={(e) => setIsDistantMember(e.target.checked)}
                    className="accent-[#3b1f6e] mt-0.5" />
                  <span className="text-sm text-gray-700">I am a distant member</span>
                </label>
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
              <div className="relative">
                <input type={showPassword ? "text" : "password"} placeholder="Enter your password" value={password}
                  onChange={(e) => setPassword(e.target.value)} required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e] bg-white" />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {mode === "login" && (
              <div className="text-right -mt-1">
                <button type="button" onClick={() => { setShowReset(true); setResetEmail(email); setResetSent(false); }}
                  className="text-xs text-[#3b1f6e] hover:underline">
                  Forgot password?
                </button>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-[#3b1f6e] hover:bg-[#2a1550] text-white py-3 rounded-xl font-medium transition-colors disabled:opacity-50 mt-2">
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          {/* Password reset modal */}
          {showReset && (
            <div className="modal-overlay fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
                {resetSent ? (
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-gray-800 mb-1">Check your email</h3>
                    <p className="text-sm text-gray-500 mb-5">
                      A password reset link has been sent to <strong>{resetEmail}</strong>.
                    </p>
                    <button onClick={() => setShowReset(false)}
                      className="w-full bg-[#3b1f6e] text-white py-2.5 rounded-xl text-sm font-medium">
                      Done
                    </button>
                  </div>
                ) : (
                  <>
                    <h3 className="font-semibold text-gray-800 mb-1">Reset your password</h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Enter your email and we'll send you a link to reset your password.
                    </p>
                    <form onSubmit={handleReset} className="space-y-3">
                      <input
                        type="email" required
                        placeholder="Your email address"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#3b1f6e]"
                      />
                      <div className="flex gap-3">
                        <button type="button" onClick={() => setShowReset(false)}
                          className="flex-1 border border-gray-200 py-2.5 rounded-xl text-sm text-gray-600">
                          Cancel
                        </button>
                        <button type="submit" disabled={loading}
                          className="flex-1 bg-[#3b1f6e] text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
                          {loading ? "Sending..." : "Send link"}
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>
          )}

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
