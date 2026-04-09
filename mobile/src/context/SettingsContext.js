import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { devWarn } from "../devLog";

const STORAGE_KEY = "@clarodoc_settings_v1";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [textSize, setTextSize] = useState("medium"); // small, medium, large, xlarge
  const [language, setLanguage] = useState("es"); // es (Spanish) or en (English)
  const [theme, setTheme] = useState("dark"); // dark (default/current) or light
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setTextSize(parsed.textSize || "medium");
          setLanguage(parsed.language || "es");
          setTheme(parsed.theme === "light" ? "light" : "dark");
        }
      } catch (e) {
        devWarn("Failed to restore settings:", e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    (async () => {
      const payload = { textSize, language, theme };
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        devWarn("Failed to persist settings:", e.message);
      }
    })();
  }, [textSize, language, theme, loading]);

  const getTextSizeStyle = () => {
    const sizes = {
      small: { fontSize: 12 },
      medium: { fontSize: 14 },
      large: { fontSize: 16 },
      xlarge: { fontSize: 18 }
    };
    return sizes[textSize] || sizes.medium;
  };

  const value = {
    textSize,
    setTextSize,
    language,
    setLanguage,
    theme,
    setTheme,
    getTextSizeStyle,
    loading
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}
