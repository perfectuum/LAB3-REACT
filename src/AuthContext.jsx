import { createContext, useCallback, useEffect, useState } from "react";
import { request } from "./api.js";

export const AuthContext = createContext(null);

function validateUser(user) {
  if (!user || !Number.isInteger(user.id) || typeof user.name !== "string" ||
      typeof user.email !== "string" || typeof user.login !== "string" ||
      !["admin", "user"].includes(user.role) ||
      !Number.isFinite(user.couponPercent) || user.couponPercent < 0 || user.couponPercent > 99) {
    throw new Error("API вернул некорректные данные пользователя.");
  }
  return user;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshUser = useCallback(async () => {
    if (!sessionStorage.getItem("token")) {
      setLoading(false);
      return;
    }
    setError("");
    try {
      setUser(validateUser(await request("/auth/me")));
    } catch (err) {
      setError(err.message);
      if (err.status === 401) {
        sessionStorage.removeItem("token");
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    window.addEventListener("focus", refreshUser);
    return () => window.removeEventListener("focus", refreshUser);
  }, [refreshUser]);

  function acceptSession(data) {
    validateUser(data.user);
    if (typeof data.token !== "string" || !data.token) throw new Error("API не вернул сессию пользователя.");
    sessionStorage.setItem("token", data.token);
    setUser(data.user);
    setError("");
  }

  async function login(email, password) {
    acceptSession(await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }));
  }

  async function register(name, email, password) {
    acceptSession(await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }));
  }

  async function logout() {
    await request("/auth/logout", { method: "POST" });
    sessionStorage.removeItem("token");
    setUser(null);
    setError("");
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
