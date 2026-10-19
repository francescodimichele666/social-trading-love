import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken, type User } from './api';

type Me = User & { email: string; invitesLeft: number };
type AuthState = { me: Me | null; unread: number; unreadMessages: number; setUnreadMessages: (n: number) => void; loading: boolean; login: (token: string) => Promise<void>; logout: () => void; refresh: () => Promise<void> };

const AuthContext = createContext<AuthState>(null!);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [unread, setUnread] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) { setMe(null); setLoading(false); return; }
    try {
      const data = await api<{ user: Me; unreadNotifications: number; unreadMessages?: number }>('/me');
      setMe(data.user);
      setUnread(data.unreadNotifications);
      setUnreadMessages(data.unreadMessages ?? 0);
    } catch {
      setToken(null);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!me) return;
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [me, refresh]);

  const login = async (token: string) => { setToken(token); await refresh(); };
  const logout = () => { setToken(null); setMe(null); };

  return <AuthContext.Provider value={{ me, unread, unreadMessages, setUnreadMessages, loading, login, logout, refresh }}>{children}</AuthContext.Provider>;
}
