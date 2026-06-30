import { create } from "zustand";
import { Role } from "./roles";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  phone?: string;
  photoURL?: string;
  fcmToken?: string;
  createdAt: string;
  dateOfBirth?: string;
  isYaf?: boolean;
  yafStartedAt?: string | number;
  gender?: string;
  isDistantMember?: boolean;
}

const CACHE_KEY = "ypg_user";

function readCache(): UserProfile | null {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(CACHE_KEY) : null;
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch { return null; }
}

function writeCache(user: UserProfile | null) {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(CACHE_KEY);
  } catch {}
}

const cached = readCache();

interface AuthStore {
  user: UserProfile | null;
  // loading = false once we have something to show (cached or confirmed)
  loading: boolean;
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  // If cached profile exists, start with loading=false so UI renders immediately
  user: cached,
  loading: cached === null, // only show spinner when there's nothing cached
  setUser: (user) => {
    writeCache(user);
    set({ user });
  },
  setLoading: (loading) => set({ loading }),
}));
