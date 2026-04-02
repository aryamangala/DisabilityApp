import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";

import LoadingOverlay from "../components/LoadingOverlay";
import ErrorBanner from "../components/ErrorBanner";
import { createDocumentFromText, createDocumentFromFile } from "../api";
import { useDocument } from "../context/DocumentContext";
import { useSettings } from "../context/SettingsContext";
import { getTranslation } from "../utils/translations";

export default function ProcessingScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { setDocId, setChunkCount, setCurrentChunkIndex, clearAll } =
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
        console.log("Processing already in progress, skipping...");
        return;
      }
      hasRun = true;

      if (!mode || !payload) {
        setError("Missing processing parameters.");
        return;
      }

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
          console.log("Processing file upload:", {
            mode,
            pages: payload.imagePages?.length || 1
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

        setStatus("Preparing reader...");
        setDocId(result.docId);
        setChunkCount(result.chunkCount);
        setCurrentChunkIndex(0);

        navigation.reset({
          index: 1,
          routes: [
            { name: "Import" },
            { name: "Reader" }
          ]
        });
      } catch (e) {
        if (cancelled) return;
        console.error("ProcessingScreen error:", e);
        setError(e.message || "Failed to process document. Check console for details.");
      } finally {
        if (!cancelled) {
          setStatus("");
        }
      }
    }

    run();

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
        {t("mayTakeMoment")}
      </Text>
      <LoadingOverlay text={status || t("processing")} />
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
  }
});

