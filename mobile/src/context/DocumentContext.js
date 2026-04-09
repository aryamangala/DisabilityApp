import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DocumentContext = createContext(null);

const DOC_INDEX_KEY = "@clarodoc_doc_index_v1";
const docKey = (docId) => `@clarodoc_doc_v1:${docId}`;

export function DocumentProvider({ children }) {
  const [docId, setDocId] = useState(null);
  const [chunkCount, setChunkCount] = useState(null);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [chunksCache, setChunksCache] = useState({});
  const [restoring, setRestoring] = useState(true);
  const [docIndex, setDocIndex] = useState([]); // [{ docId, title, createdAt, chunkCount }]

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DOC_INDEX_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setDocIndex(parsed);
          }
        }
      } catch {
        // ignore; keep empty index
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const refreshDocIndex = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(DOC_INDEX_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setDocIndex(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
    setDocIndex([]);
  }, []);

  const upsertLocalDocument = async ({ docId, title, createdAt, chunkCount, chunks }) => {
    const safeCreatedAt = createdAt || new Date().toISOString();
    const safeTitle = title || "Untitled";
    const record = {
      docId,
      title: safeTitle,
      createdAt: safeCreatedAt,
      chunkCount: Number.isInteger(chunkCount) ? chunkCount : chunks?.length || 0,
    };
    const docPayload = {
      ...record,
      chunks: Array.isArray(chunks) ? chunks : [],
    };
    try {
      await AsyncStorage.setItem(docKey(docId), JSON.stringify(docPayload));
    } catch {
      throw new Error(
        "Could not save this document on your device. Free some storage space and try again."
      );
    }

    let existingIndex = [];
    try {
      const raw = await AsyncStorage.getItem(DOC_INDEX_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) existingIndex = parsed;
      }
    } catch {
      existingIndex = [];
    }
    const nextIndex = [record, ...existingIndex.filter((d) => d.docId !== docId)];
    try {
      await AsyncStorage.setItem(DOC_INDEX_KEY, JSON.stringify(nextIndex));
    } catch {
      throw new Error(
        "Could not update your document list on this device. Free some storage space and try again."
      );
    }
    setDocIndex(nextIndex);
  };

  const getLocalDocument = async (docId) => {
    if (docId == null || typeof docId !== "string" || !docId.trim()) {
      return null;
    }
    let raw;
    try {
      raw = await AsyncStorage.getItem(docKey(docId));
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const deleteLocalDocument = async (deleteDocId) => {
    try {
      await AsyncStorage.removeItem(docKey(deleteDocId));
    } catch {
      // ignore
    }
    let existingIndex = [];
    try {
      const raw = await AsyncStorage.getItem(DOC_INDEX_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) existingIndex = parsed;
      }
    } catch {
      existingIndex = [];
    }
    const nextIndex = existingIndex.filter((d) => d.docId !== deleteDocId);
    try {
      await AsyncStorage.setItem(DOC_INDEX_KEY, JSON.stringify(nextIndex));
    } catch {
      // ignore
    }
    setDocIndex(nextIndex);

    // If the user deleted the currently open document, clear session state.
    if (docId && deleteDocId === docId) {
      setDocId(null);
      setChunkCount(null);
      setCurrentChunkIndex(0);
      setChunksCache({});
    }
  };

  const clearLocalDocuments = async () => {
    const ids = docIndex.map((d) => d.docId);
    setDocIndex([]);
    try {
      await AsyncStorage.setItem(DOC_INDEX_KEY, JSON.stringify([]));
    } catch {
      // ignore
    }
    try {
      await AsyncStorage.multiRemove(ids.map((id) => docKey(id)));
    } catch {
      // ignore
    }
  };

  const value = useMemo(() => ({
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
    docIndex,
    refreshDocIndex,
    upsertLocalDocument,
    getLocalDocument,
    deleteLocalDocument,
    clearLocalDocuments,
    clearAll: async () => {
      setDocId(null);
      setChunkCount(null);
      setCurrentChunkIndex(0);
      setChunksCache({});
    },
    restoring
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [docId, chunkCount, currentChunkIndex, chunksCache, docIndex, restoring, refreshDocIndex]);

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

