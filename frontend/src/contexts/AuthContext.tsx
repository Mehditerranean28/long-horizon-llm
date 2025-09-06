"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { loginUser } from "@/api/client";

interface AuthContextType {
  isAuthenticated: boolean;
  subscriptionStatus: "free" | "premium" | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_TOKEN_KEY = "sovereign_auth_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<"free" | "premium" | null>(null);
  const isBrowser = typeof window !== "undefined";

  useEffect(() => {
    if (isBrowser) {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (token) {
        setIsAuthenticated(true);
      }
      const storedStatus = localStorage.getItem("subscription_status");
      if (storedStatus === "premium" || storedStatus === "free") {
        setSubscriptionStatus(storedStatus as "free" | "premium");
      }
    }
  }, [isBrowser]);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await loginUser({ username, password });
      setIsAuthenticated(true);
      setSubscriptionStatus(res.subscriptionStatus);
      if (isBrowser) {
        localStorage.setItem(AUTH_TOKEN_KEY, "true");
        if (res.subscriptionStatus === "premium") {
          localStorage.setItem("subscription_status", "premium");
        } else {
          localStorage.removeItem("subscription_status");
        }
      }
    } catch (err) {
      console.error("Login failed", err);
      throw err;
    }
  }, [isBrowser]);

  const logout = useCallback(async () => {
    setIsAuthenticated(false);
    setSubscriptionStatus(null);
    if (isBrowser) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem("subscription_status");
    }
  }, [isBrowser]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, subscriptionStatus, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
