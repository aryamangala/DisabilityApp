import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

import ErrorBanner from "../components/ErrorBanner";
import { useDocument } from "../context/DocumentContext";
import { useSettings } from "../context/SettingsContext";
import { getTranslation } from "../utils/translations";
import { deleteDocument } from "../api";

export default function PreviousFilesScreen() {
  const navigation = useNavigation();
  const { docIndex, refreshDocIndex, getLocalDocument, deleteLocalDocument, clearLocalDocuments, setDocId, setChunkCount, setCurrentChunkIndex, setChunkInCache, clearAll } =
    useDocument();
  const { language } = useSettings();
  const t = (key) => getTranslation(key, language);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        try {
          setLoading(true);
          setError("");
          await refreshDocIndex();
        } catch (e) {
          if (mounted) setError(e?.message || "Failed to load files.");
        } finally {
          if (mounted) setLoading(false);
        }
      })();
      return () => {
        mounted = false;
      };
    }, [refreshDocIndex])
  );

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return "—";
      return (
        date.toLocaleDateString() +
        " " +
        date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    } catch {
      return "—";
    }
  };

  const confirm = async (title, message) => {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.confirm) {
      return window.confirm(message);
    }
    return new Promise((resolve) => {
      Alert.alert(
        title,
        message,
        [
          { text: t("cancel"), style: "cancel", onPress: () => resolve(false) },
          { text: t("delete"), style: "destructive", onPress: () => resolve(true) }
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
    });
  };

  const onOpen = async (id) => {
    setError("");
    try {
      // Find entry in index for chunkCount
      const indexEntry = docIndex.find((d) => d.docId === id);
      const n = indexEntry ? Number(indexEntry.chunkCount) : 0;

      await clearAll();
      setDocId(id);
      setCurrentChunkIndex(0);

      // Load from local cache if available (faster, works offline)
      const doc = await getLocalDocument(id);
      if (doc && Number.isInteger(Number(doc.chunkCount)) && Number(doc.chunkCount) > 0) {
        setChunkCount(Number(doc.chunkCount));
        if (Array.isArray(doc.chunks)) {
          doc.chunks.forEach((chunk, idx) => {
            if (chunk) setChunkInCache(idx, chunk);
          });
        }
      } else if (n > 0) {
        // No local cache — set chunkCount from index; Reader will fetch from API
        setChunkCount(n);
      } else {
        setError(t("failedToLoad"));
        return;
      }

      navigation.navigate("Reader");
    } catch (e) {
      setError(e?.message || "Failed to open file.");
    }
  };

  const onDelete = async (id) => {
    const ok = await confirm(t("deleteDocument") || "Delete", t("deleteDocumentConfirm") || "Delete this file?");
    if (!ok) return;
    try {
      await deleteLocalDocument(id);
      await refreshDocIndex();
    } catch (e) {
      setError(e?.message || "Failed to delete file.");
    }
  };

  const onClearAll = async () => {
    if (!docIndex.length) return;
    const ok = await confirm(t("clearAll") || "Clear all", t("clearAllConfirm") || "Delete all saved files?");
    if (!ok) return;
    try {
      // Delete each document from the API, then clear local cache
      await Promise.allSettled(docIndex.map((d) => deleteDocument(d.docId)));
      await clearLocalDocuments();
      await refreshDocIndex();
    } catch (e) {
      setError(e?.message || "Failed to clear files.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← {t("back")}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("previousFilesTitle")}</Text>
        <View style={styles.headerRight}>
          {docIndex.length > 0 ? (
            <TouchableOpacity onPress={onClearAll} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>{t("clearAll")}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 1 }} />
          )}
        </View>
      </View>

      <ErrorBanner message={error} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8F2D12" />
          <Text style={styles.loadingText}>{t("loading")}</Text>
        </View>
      ) : docIndex.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t("noFiles")}</Text>
          <Text style={styles.emptySubtext}>{t("newFile")}</Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={() => navigation.navigate("Import")}
            activeOpacity={0.85}
          >
            <Text style={styles.emptyCtaText}>{t("newFile")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {docIndex.map((d) => (
            <View key={d.docId} style={styles.card}>
              <TouchableOpacity onPress={() => onOpen(d.docId)} style={styles.cardMain}>
                <View style={styles.cardLeft}>
                  <Text style={styles.title} numberOfLines={1}>
                    {d.title || "Untitled"}
                  </Text>
                  <Text style={styles.subtitle}>
                    {formatDate(d.createdAt)} · {d.chunkCount || 0} {t("chunk") || "chunks"}
                  </Text>
                </View>
                <Text style={styles.openChevron}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDelete(d.docId)} style={styles.deleteBtn}>
                <Text style={styles.deleteText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F1E8" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: "#F5F1E8"
  },
  backButton: { fontSize: 24, color: "#2C2C2C", fontWeight: "600", minWidth: 60 },
  headerTitle: { fontSize: 28, fontWeight: "700", color: "#2C2C2C", flex: 1, textAlign: "center" },
  headerRight: { minWidth: 80, alignItems: "flex-end" },
  clearButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#DC2626", borderRadius: 12 },
  clearButtonText: { fontSize: 14, color: "white", fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  loadingText: { marginTop: 8, color: "#4A4A4A", fontSize: 16 },
  emptyText: { fontSize: 18, fontWeight: "600", color: "#4A4A4A", marginBottom: 4 },
  emptySubtext: { fontSize: 14, color: "#5B6473", marginBottom: 20, textAlign: "center" },
  emptyCta: {
    marginTop: 8,
    backgroundColor: "#B42318",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12
  },
  emptyCtaText: { color: "white", fontWeight: "700", fontSize: 16 },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8DCC6",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2
  },
  cardMain: { flex: 1, flexDirection: "row", alignItems: "center", padding: 16 },
  cardLeft: { flex: 1, paddingRight: 10 },
  title: { fontSize: 16, fontWeight: "700", color: "#2C2C2C", marginBottom: 4 },
  subtitle: { fontSize: 12, color: "#4A4A4A" },
  openChevron: { fontSize: 26, color: "#2C2C2C", marginLeft: 8 },
  deleteBtn: { paddingHorizontal: 14, paddingVertical: 16, borderLeftWidth: 1, borderLeftColor: "#D1D5DB" },
  deleteText: { fontSize: 18 }
});

