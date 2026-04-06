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
      const token = localStorage.getItem('userToken');
      
      if (token) {
        try {
          // Validate token with backend and fetch user data
          const response = await api.get('/auth/me');
          setUser(response.data);
        } catch (e) {
          // Token invalid or expired — clear session
          console.error('Session validation failed');
          localStorage.removeItem('userToken');
          setUser(null);
        }
      }
      setIsLoading(false); // Only set this to false AFTER the API responds
    };

    validateSession();
  }, []);

  const login = (userData: User, token: string) => {
    localStorage.setItem('userToken', token);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('userToken');
    setUser(null);
  };

  const updateUser = (userData: Partial<User>) => {
    if (user) {
      setUser({ ...user, ...userData });
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
