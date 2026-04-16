import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";

import LoadingOverlay from "../components/LoadingOverlay";
import ErrorBanner from "../components/ErrorBanner";
import { createDocumentFromText, createDocumentFromFile, fetchChunk } from "../api";
import { useDocument } from "../context/DocumentContext";
import { useSettings } from "../context/SettingsContext";
import { getTranslation } from "../utils/translations";
import { devError, devLog, devWarn } from "../devLog";

export default function ProcessingScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { setDocId, setChunkCount, setCurrentChunkIndex, setChunkInCache, upsertLocalDocument, clearAll } =
    useDocument();
  const { language } = useSettings();
  const t = (key) => getTranslation(key, language);

  const [error, setError] = useState("");
  const [status, setStatus] = useState("Preparing...");

  const mode = route.params?.mode;
  const payload = route.params?.payload;

  useEffect(() => {
    let cancelled = false;
    let hasRun = false; // Prevent multiple runs

    async function run() {
      // Prevent multiple simultaneous runs
      if (hasRun) {
        devLog("Processing already in progress, skipping...");
        return;
      }
      hasRun = true;

      if (!mode || !payload) {
        setError("Missing processing parameters.");
        return;
      }

      let savedToDevice = false;

      try {
        await clearAll();
      } catch {
        // ignore
      }

      try {
        setStatus("Contacting server...");
        let result;
        if (mode === "text") {
          result = await createDocumentFromText({
            title: payload.title,
            language: payload.language,
            text: payload.text
          });
        } else if (mode === "pdf" || mode === "image") {
          setStatus("Preparing file upload...");
          devLog("Processing file upload:", {
            mode,
            pages: payload.imagePages?.length || 1,
          });

          if (mode === "image" && payload.imagePages?.length > 0) {
            result = await createDocumentFromFile({
              title: payload.title,
              language: payload.language,
              inputType: "image",
              imagePages: payload.imagePages
            });
          } else {
            result = await createDocumentFromFile({
              title: payload.title,
              language: payload.language,
              uri: payload.uri,
              name: payload.name,
              mimeType: payload.mimeType,
              inputType: mode === "pdf" ? "pdf" : "image",
              file: payload.file
            });
          }

          setStatus("Processing document...");
        } else {
          throw new Error("Unknown mode.");
        }

        if (cancelled) return;

        if (!result.docId || !result.chunkCount) {
          throw new Error("Server returned incomplete response.");
        }

        const MAX_LOCAL_CHUNKS = 280;
        if (result.chunkCount > MAX_LOCAL_CHUNKS) {
          throw new Error(
            getTranslation("documentTooLargeDevice", language)
          );
        }

        setStatus("Loading...");
        setDocId(result.docId);
        setChunkCount(result.chunkCount);
        setCurrentChunkIndex(0);

        const createdAt = new Date().toISOString();
        const titleForLocal =
          payload?.title ||
          payload?.name ||
          (mode === "image" ? "Photo document" : "Untitled");

        // Fetch all chunks once so the backend can remain ephemeral.
        const chunks = [];
        for (let i = 0; i < result.chunkCount; i++) {
          if (cancelled) return;
          setStatus(`Saving / Loading... (${i + 1}/${result.chunkCount})`);
          const data = await fetchChunk(result.docId, i);
          chunks.push(data);
          setChunkInCache(i, data);
        }

        try {
          await upsertLocalDocument({
            docId: result.docId,
            title: titleForLocal,
            createdAt,
            chunkCount: result.chunkCount,
            chunks,
          });
          savedToDevice = true;
        } catch (saveErr) {
          try {
            await clearAll();
          } catch {
            // ignore
          }
          throw saveErr;
        }

        setStatus("Preparing reader...");
        try {
          navigation.reset({
            index: 1,
            routes: [
              { name: "Import" },
              { name: "Reader" }
            ]
          });
        } catch (navErr) {
          devWarn("ProcessingScreen navigation.reset failed:", navErr);
          navigation.navigate("Reader");
        }
      } catch (e) {
        if (cancelled) return;
        devError("ProcessingScreen error:", e);
        if (!savedToDevice) {
          try {
            await clearAll();
          } catch {
            // ignore
          }
        }
        setError(
          e.message || "Failed to process document. Please try again."
        );
      } finally {
        if (!cancelled) {
          setStatus("");
        }
      }
    }

    run().catch((e) => {
      devError("ProcessingScreen unhandled:", e);
      if (!cancelled) {
        setError(e?.message || "Something went wrong. Please try again.");
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount - mode and payload are passed via route params

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{t("processing")}</Text>
      <ErrorBanner message={error} />
      <Text style={styles.body}>
        {error ? t("processingErrorHint") : t("mayTakeMoment")}
      </Text>
      {!error ? (
        <LoadingOverlay text={status || t("processing")} />
      ) : (
        <View style={styles.errorActions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate("Import")}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>{t("tryAgain")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate("Landing")}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryButtonText}>{t("backToHome")}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 80,
    backgroundColor: "#F5F1E8",
    alignItems: "center"
  },
  header: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 8,
    color: "#2C2C2C",
    textAlign: "center"
  },
  body: {
    fontSize: 16,
    color: "#4A4A4A",
    marginTop: 8,
    textAlign: "center"
  },
  errorActions: {
    marginTop: 28,
    width: "100%",
    maxWidth: 320,
    gap: 12
  },
  primaryButton: {
    backgroundColor: "#B42318",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center"
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16
  },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#8F2D12"
  },
  secondaryButtonText: {
    color: "#8F2D12",
    fontWeight: "600",
    fontSize: 16
  }
});

