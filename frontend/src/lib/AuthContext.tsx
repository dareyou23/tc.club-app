'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiClient } from './api';
import { TrainingUser } from './types';

interface AuthContextType {
  isAuthenticated: boolean;
  currentUser: TrainingUser | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUser: (updates: Partial<TrainingUser>) => void;
  isLoading: boolean;
  // Impersonate
  isImpersonating: boolean;
  impersonate: (spielerId: string) => Promise<{ success: boolean; error?: string }>;
  stopImpersonating: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<TrainingUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isImpersonating, setIsImpersonating] = useState(false);

  useEffect(() => {
    const user = apiClient.getUser();
    if (user && apiClient.isAuthenticated()) setCurrentUser(user);
    // Check if we're impersonating
    if (typeof window !== 'undefined' && localStorage.getItem('training_admin_backup')) {
      setIsImpersonating(true);
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiClient.login(email, password);
    if (res.success && res.data) {
      setCurrentUser(res.data.user);
      return { success: true };
    }
    return { success: false, error: res.error || 'Login fehlgeschlagen' };
  };

  const logout = () => {
    // Wenn impersoniert, auch Backup löschen
    if (typeof window !== 'undefined') {
      localStorage.removeItem('training_admin_backup');
    }
    setIsImpersonating(false);
    apiClient.logout();
    setCurrentUser(null);
  };

  const updateUser = (updates: Partial<TrainingUser>) => {
    setCurrentUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      if (typeof window !== 'undefined') {
        localStorage.setItem('training_user', JSON.stringify(updated));
      }
      return updated;
    });
  };

  const impersonate = async (spielerId: string) => {
    const res = await apiClient.impersonate(spielerId);
    if (res.success && res.data) {
      // Backup current admin session
      if (typeof window !== 'undefined') {
        localStorage.setItem('training_admin_backup', JSON.stringify({
          token: localStorage.getItem('training_token'),
          refreshToken: localStorage.getItem('training_refresh_token'),
          tokenExpiresAt: localStorage.getItem('training_token_expires_at'),
          user: localStorage.getItem('training_user'),
        }));
      }
      // Switch to impersonated user
      apiClient.setTokenAndUser(res.data.accessToken, res.data.expiresIn, res.data.user);
      setCurrentUser(res.data.user);
      setIsImpersonating(true);
      return { success: true };
    }
    return { success: false, error: res.error || 'Impersonate fehlgeschlagen' };
  };

  const stopImpersonating = () => {
    if (typeof window !== 'undefined') {
      const backup = localStorage.getItem('training_admin_backup');
      if (backup) {
        const data = JSON.parse(backup);
        localStorage.setItem('training_token', data.token);
        localStorage.setItem('training_refresh_token', data.refreshToken || '');
        localStorage.setItem('training_token_expires_at', data.tokenExpiresAt);
        localStorage.setItem('training_user', data.user);
        localStorage.removeItem('training_admin_backup');

        // Reload to reinitialize ApiClient with restored token
        window.location.href = '/';
        return;
      }
    }
    setIsImpersonating(false);
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated: currentUser !== null,
      currentUser, login, logout, updateUser, isLoading,
      isImpersonating, impersonate, stopImpersonating,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
