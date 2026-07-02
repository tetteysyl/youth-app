"use client";
import { authFetch } from "@/lib/auth-fetch";
import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuthStore } from "@/lib/store";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Fetch profile via Admin SDK API (faster than Firestore client + avoids rules)
        try {
          const res = await authFetch(`/api/get-members?uid=${firebaseUser.uid}`);
          const data = await res.json();
          if (data && data.uid) {
            setUser(data);
          } else {
            setUser(null);
          }
        } catch {
          // Network error — keep cached user so app stays usable
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [setUser, setLoading]);

  return <>{children}</>;
}
