import { create } from 'zustand';

type SessionState = {
  phone: string | null;
  email: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  coinBalance: number;
  setSession: (data: {
    phone?: string | null;
    email?: string | null;
    accessToken: string;
    refreshToken: string;
    coinBalance?: number;
  }) => void;
  setCoinBalance: (balance: number) => void;
  clear: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  phone: null,
  email: null,
  accessToken: null,
  refreshToken: null,
  coinBalance: 0,
  setSession: ({ phone = null, email = null, accessToken, refreshToken, coinBalance = 0 }) =>
    set({ phone, email, accessToken, refreshToken, coinBalance }),
  setCoinBalance: (coinBalance) => set({ coinBalance }),
  clear: () =>
    set({ phone: null, email: null, accessToken: null, refreshToken: null, coinBalance: 0 }),
}));
