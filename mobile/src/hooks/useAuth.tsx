import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  getAccessToken,
  removeAccessToken,
  saveAccessToken,
} from "../services/authStorage";
import type { AuthState, AuthUser } from "../types/auth";
import { api } from "../services/api";

type AuthContextType = AuthState & {
  isInitializing: boolean;
  hasCompletedProfile: boolean;
  login: (token: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfileStatus: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function decodeJwtPayload(token: string): { sub: string; email: string } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (typeof parsed.sub === "string" && typeof parsed.email === "string") {
      return { sub: parsed.sub, email: parsed.email };
    }
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hasCompletedProfile, setHasCompletedProfile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);

  const clearAuthState = useCallback(async () => {
    await removeAccessToken();
    setAccessToken(null);
    setUser(null);
    setHasCompletedProfile(false);
  }, []);

  const fetchProfileStatus = useCallback(
    async (token: string) => {
      try {
        const response = await api.get("/profile/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setHasCompletedProfile(!!response.data.profile);
        return true;
      } catch (error: unknown) {
        console.log("PROFILE STATUS ERROR:", error);

        // Any error (401 or network) — clear auth and force fresh login
        await clearAuthState();

        return false;
      }
    },
    [clearAuthState]
  );

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const token = await getAccessToken();

        if (token) {
          const payload = decodeJwtPayload(token);
          if (payload) {
            setUser({ id: payload.sub, email: payload.email });
          }
          setAccessToken(token);
          await fetchProfileStatus(token);
        }
      } finally {
        setIsLoading(false);
        setIsInitializing(false);
      }
    };

    void bootstrap();
  }, [fetchProfileStatus]);

  const login = useCallback(
    async (token: string, authUser: AuthUser) => {
      setIsInitializing(true);
      try {
        await saveAccessToken(token);
        setAccessToken(token);
        setUser(authUser);
        await fetchProfileStatus(token);
      } finally {
        setIsInitializing(false);
      }
    },
    [fetchProfileStatus]
  );

  const logout = useCallback(async () => {
    await clearAuthState();
  }, [clearAuthState]);

  const refreshProfileStatus = useCallback(async () => {
    if (!accessToken) return;
    setIsInitializing(true);
    try {
      await fetchProfileStatus(accessToken);
    } finally {
      setIsInitializing(false);
    }
  }, [accessToken, fetchProfileStatus]);

  const value = useMemo(
    () => ({
      accessToken,
      user,
      isAuthenticated: !!accessToken,
      isLoading,
      isInitializing,
      hasCompletedProfile,
      login,
      logout,
      refreshProfileStatus,
    }),
    [
      accessToken,
      user,
      isLoading,
      isInitializing,
      hasCompletedProfile,
      login,
      logout,
      refreshProfileStatus,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
