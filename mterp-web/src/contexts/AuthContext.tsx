import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import api from '../api/api';
import { syncAttendanceMasterData } from '../services/attendanceSyncEngine';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  cachedUser: User | null;
  login: (userData: User, token: string) => void;
  logout: () => void;
  loginOffline: () => boolean;
  updateUser: (userData: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cachedUser, setCachedUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('cachedUserData');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    // Check for existing auth on mount and validate with backend
    const validateSession = async () => {
      const token = localStorage.getItem('userToken');
      
      if (token) {
        try {
          // Validate token with backend and fetch user data
          const response = await api.get('/auth/me');
          setUser(response.data);
          setCachedUser(response.data);
          localStorage.setItem('cachedUserData', JSON.stringify(response.data));
          syncAttendanceMasterData().catch(() => {});
        } catch (e: any) {
          const isNetworkOrServerIssue =
            !navigator.onLine ||
            !e.response ||
            e.code === 'ERR_NETWORK' ||
            (e.response && e.response.status >= 500);

          if (isNetworkOrServerIssue) {
            console.warn('Backend unreachable or offline; preserving local cached user session');
            const stored = localStorage.getItem('cachedUserData');
            if (stored) {
              try {
                const parsed = JSON.parse(stored);
                setUser(parsed);
                setCachedUser(parsed);
              } catch {
                setUser(null);
              }
            }
          } else if (e.response?.status === 401) {
            // Token explicitly invalid or expired — clear session
            console.error('Session validation failed (401 Unauthorized)');
            localStorage.removeItem('userToken');
            localStorage.removeItem('cachedUserData');
            setUser(null);
            setCachedUser(null);
          }
        }
      }
      setIsLoading(false); // Only set this to false AFTER the API responds
    };

    validateSession();
  }, []);

  const login = (userData: User, token: string) => {
    localStorage.setItem('userToken', token);
    localStorage.setItem('cachedUserData', JSON.stringify(userData));
    setUser(userData);
    setCachedUser(userData);
    syncAttendanceMasterData().catch(() => {});
  };

  const logout = () => {
    localStorage.removeItem('userToken');
    localStorage.removeItem('cachedUserData');
    setUser(null);
    setCachedUser(null);
  };

  const loginOffline = (): boolean => {
    try {
      const stored = localStorage.getItem('cachedUserData');
      if (stored) {
        const parsed = JSON.parse(stored);
        setUser(parsed);
        setCachedUser(parsed);
        return true;
      }
    } catch (e) {
      console.error('Failed to load offline user', e);
    }
    return false;
  };

  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updated = { ...user, ...userData };
      setUser(updated);
      setCachedUser(updated);
      localStorage.setItem('cachedUserData', JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        cachedUser,
        login,
        logout,
        loginOffline,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
