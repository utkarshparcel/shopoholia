import { create } from 'zustand';

type SessionState = {
  phone: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  coinBalance: number;
  setSession: (data: {
    phone: string;
    accessToken: string;
    refreshToken: string;
    coinBalance?: number;
  }) => void;
  setCoinBalance: (balance: number) => void;
  clear: () => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  phone: null,
  accessToken: null,
  refreshToken: null,
  coinBalance: 0,
  setSession: ({ phone, accessToken, refreshToken, coinBalance = 0 }) =>
    set({ phone, accessToken, refreshToken, coinBalance }),
  setCoinBalance: (coinBalance) => set({ coinBalance }),
  clear: () =>
    set({ phone: null, accessToken: null, refreshToken: null, coinBalance: 0 }),
}));
