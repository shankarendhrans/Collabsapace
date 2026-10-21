import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

export interface User {
  id: string;
  fullName: string;
  email: string;
  username: string;
  preferences?: {
    theme: 'light' | 'dark' | 'color';
    accentColor?: string;
  };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (identifier: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (fullName: string, email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('collabspace_token'));
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const verifySession = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get('/auth/me');
        setUser(res.data.user);
      } catch {
        localStorage.removeItem('collabspace_token');
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    verifySession();
  }, [token]);

  const login = async (identifier: string, password: string, rememberMe = true) => {
    const res = await api.post('/auth/login', { identifier, password, rememberMe });
    localStorage.setItem('collabspace_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
  };

  const register = async (fullName: string, email: string, username: string, password: string) => {
    const res = await api.post('/auth/register', { fullName, email, username, password });
    localStorage.setItem('collabspace_token', res.data.token);
    setToken(res.data.token);
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem('collabspace_token');
    localStorage.removeItem('cs_active_user');
    sessionStorage.removeItem('cs_active_room');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
