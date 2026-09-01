import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile, UserRole } from '@/types';
import { api, useMockMode, getSimulatedProfile, setSimulatedProfile } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { mockStore } from '@/lib/mockStore';

interface AuthContextType {
  user: Profile | null;
  role: UserRole;
  isOwner: boolean;
  isProduction: boolean;
  isSeller: boolean;
  isLoading: boolean;
  login: (phoneOrEmail: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  switchSimulatedUser: (profileId: string) => void;
  availableProfiles: Profile[];
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [availableProfiles, setAvailableProfiles] = useState<Profile[]>([]);

  const loadUser = async () => {
    try {
      setIsLoading(true);
      if (useMockMode) {
        const simulated = getSimulatedProfile();
        setUser(simulated);
        setAvailableProfiles(mockStore.getProfiles());
      } else {
        const profile = await api.getProfile();
        setUser(profile);
        const all = await api.getAllProfiles();
        setAvailableProfiles(all);
      }
    } catch (err) {
      console.error('Error loading auth user:', err);
      // Fallback
      if (useMockMode) {
        setUser(mockStore.getProfiles()[0]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUser();

    if (!useMockMode) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
        loadUser();
      });
      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  const login = async (phoneOrEmail: string, password = 'password') => {
    setIsLoading(true);
    try {
      if (useMockMode) {
        // Find profile matching phone or role or default
        const profiles = mockStore.getProfiles();
        const matched = profiles.find((p) => p.phone === phoneOrEmail || p.id === phoneOrEmail || p.role === phoneOrEmail) || profiles[0];
        setSimulatedProfile(matched);
        setUser(matched);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: phoneOrEmail.includes('@') ? phoneOrEmail : `${phoneOrEmail}@jankikulfi.in`,
          password,
        });
        if (error) throw error;
        await loadUser();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    if (useMockMode) {
      // In mock mode, keep session or reset
    } else {
      await supabase.auth.signOut();
    }
    setUser(null);
  };

  const switchSimulatedUser = (profileId: string) => {
    const profile = mockStore.getProfileById(profileId);
    if (profile) {
      setSimulatedProfile(profile);
      setUser(profile);
    }
  };

  const role: UserRole = user?.role || 'owner';
  const isOwner = role === 'owner';
  const isProduction = role === 'production_worker' || role === 'owner';
  const isSeller = role === 'seller';

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isOwner,
        isProduction,
        isSeller,
        isLoading,
        login,
        logout,
        switchSimulatedUser,
        availableProfiles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
