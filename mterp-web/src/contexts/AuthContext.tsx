import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import api from '../api/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (userData: User, token: string) => void;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing auth on mount and validate with backend
    const validateSession = async () => {
      const userData = localStorage.getItem('userData');
      const token = localStorage.getItem('userToken');
      
      if (userData && token) {
        try {
          // Set user from localStorage immediately for fast UI
          setUser(JSON.parse(userData));
          // Then validate token with backend and refresh user data
          const response = await api.get('/auth/me');
          const freshUser = response.data;
          setUser(freshUser);
          localStorage.setItem('userData', JSON.stringify(freshUser));
        } catch (e) {
          // Token invalid or expired — clear session
          console.error('Session validation failed');
          localStorage.removeItem('userData');
          localStorage.removeItem('userToken');
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    validateSession();
  }, []);

  const login = (userData: User, token: string) => {
    localStorage.setItem('userToken', token);
    localStorage.setItem('userData', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('userToken');
    localStorage.removeItem('userData');
    setUser(null);
  };

  const updateUser = (userData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...userData };
      localStorage.setItem('userData', JSON.stringify(updatedUser));
      setUser(updatedUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
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
