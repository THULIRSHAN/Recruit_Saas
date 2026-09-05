'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, refreshAccessToken, setAccessToken } from './api';

// Mirrors backend/src/auth/auth.service.ts's AccessTokenPayload -- returned
// as-is by GET /auth/me.
export interface AuthUser {
  sub: string;
  orgId: string | null;
  roles: string[];
  isSuperAdmin: boolean;
  email: string;
  fullName: string;
}

interface RegisterCandidateInput {
  email: string;
  password: string;
  fullName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  registerCandidate: (input: RegisterCandidateInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const me = await api.get<AuthUser>('/auth/me');
    setUser(me);
    return me;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // Silent SSO: the refresh token lives in an httpOnly cookie the JS
        // layer never sees, so every page load re-mints an access token
        // from it rather than persisting the access token itself.
        // Goes through the same deduplicated refreshAccessToken() the 401
        // retry path uses (not a raw api.post) -- React Strict Mode double-
        // invokes this effect in development, and the refresh token is
        // single-use, so two independent calls would race (one 401s and
        // wrongly logs the user back out).
        const refreshed = await refreshAccessToken();
        if (!refreshed) throw new Error('refresh failed');
        await loadMe();
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ accessToken: string }>('/auth/login', {
        email,
        password,
      });
      setAccessToken(res.accessToken);
      return loadMe();
    },
    [loadMe],
  );

  const registerCandidate = useCallback(async (input: RegisterCandidateInput) => {
    await api.post('/auth/register', input);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Best-effort -- clear local state regardless of server response.
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, registerCandidate, logout, refreshUser: loadMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
