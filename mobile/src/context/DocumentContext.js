import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@easyread_state_v1";

const DocumentContext = createContext(null);

export function DocumentProvider({ children }) {
  const [docId, setDocId] = useState(null);
  const [chunkCount, setChunkCount] = useState(null);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [chunksCache, setChunksCache] = useState({});
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setDocId(parsed.docId || null);
          setChunkCount(parsed.chunkCount || null);
          setCurrentChunkIndex(parsed.currentChunkIndex || 0);
        }
      } catch (e) {
        console.warn("Failed to restore saved state:", e.message);
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (restoring) return;
    (async () => {
      const payload = {
        docId,
        chunkCount,
        currentChunkIndex
      };
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        console.warn("Failed to persist state:", e.message);
      }
    })();
  }, [docId, chunkCount, currentChunkIndex, restoring]);

  const value = {
    docId,
    setDocId,
    chunkCount,
    setChunkCount,
    currentChunkIndex,
    setCurrentChunkIndex,
    chunksCache,
    setChunkInCache: (index, data) => {
      setChunksCache((prev) => ({
        ...prev,
        [index]: data
      }));
    },
    clearAll: async () => {
      setDocId(null);
      setChunkCount(null);
      setCurrentChunkIndex(0);
      setChunksCache({});
      try {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        console.warn("Failed to clear persisted state:", e.message);
      }
    },
    restoring
  };

  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
}

export function useDocument() {
  const ctx = useContext(DocumentContext);
  if (!ctx) {
    throw new Error("useDocument must be used within DocumentProvider");
  }
  return ctx;
}

