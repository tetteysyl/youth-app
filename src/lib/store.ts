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
}

interface AuthStore {
  user: UserProfile | null;
  loading: boolean;
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
}));
