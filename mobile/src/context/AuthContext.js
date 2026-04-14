import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BACKEND_URL } from "../constants";

// expo-secure-store only works on native; fall back to AsyncStorage on web
let SecureStore = null;
if (Platform.OS !== "web") {
  SecureStore = require("expo-secure-store");
}

const KEY_ACCESS = "app_access_token";
const KEY_EMAIL = "app_email";

// Storage abstraction: SecureStore on native, AsyncStorage on web
const storage = {
  async set(key, value) {
    if (SecureStore) {
      await SecureStore.setItemAsync(key, value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  },
  async get(key) {
    if (SecureStore) {
      return await SecureStore.getItemAsync(key);
    } else {
      return await AsyncStorage.getItem(key);
    }
  },
  async remove(key) {
    if (SecureStore) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  },
};

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);   // { email }
  const [accessToken, setAccessToken] = useState(null);
  const [restoring, setRestoring] = useState(true);

  async function _clearStorage() {
    await Promise.allSettled([
      storage.remove(KEY_ACCESS),
      storage.remove(KEY_EMAIL),
    ]);
  }

  // Restore session on app launch
  useEffect(() => {
    (async () => {
      try {
        const storedToken = await storage.get(KEY_ACCESS);
        const storedEmail = await storage.get(KEY_EMAIL);
        if (storedToken && storedEmail && !isTokenExpired(storedToken)) {
          setUser({ email: storedEmail });
          setAccessToken(storedToken);
        } else {
          await _clearStorage();
        }
      } catch {
        await _clearStorage();
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (email, password) => {
    const resp = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      const err = new Error(data?.error || "Login failed.");
      err.code = "NotAuthorizedException";
      throw err;
    }
    await Promise.all([
      storage.set(KEY_ACCESS, data.accessToken),
      storage.set(KEY_EMAIL, data.email),
    ]);
    setUser({ email: data.email });
    setAccessToken(data.accessToken);
    return data;
  }, []);

  const signUp = useCallback(async (email, password) => {
    const resp = await fetch(`${BACKEND_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      const err = new Error(data?.error || "Registration failed.");
      if (resp.status === 409) err.code = "UsernameExistsException";
      throw err;
    }
    // Auto sign in after registration
    return signIn(email, password);
  }, [signIn]);

  const signOut = useCallback(async () => {
    await _clearStorage();
    setUser(null);
    setAccessToken(null);
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    const resp = await fetch(`${BACKEND_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "Failed to send reset code.");
    return data;
  }, []);

  const resetPassword = useCallback(async (email, code, newPassword) => {
    const resp = await fetch(`${BACKEND_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, newPassword }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || "Password reset failed.");
    return data;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user,
        restoring,
        signIn,
        signUp,
        signOut,
        requestPasswordReset,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
