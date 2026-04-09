import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useDocument } from "../context/DocumentContext";
import { useSettings } from "../context/SettingsContext";
import { getTranslation } from "../utils/translations";
import { devWarn } from "../devLog";

export default function DoneScreen() {
  const navigation = useNavigation();
  const { clearAll } = useDocument();
  const { language } = useSettings();
  const t = (key) => getTranslation(key, language);
  const [busy, setBusy] = useState(false);

  const onStartOver = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await clearAll();
      try {
        navigation.reset({
          index: 0,
          routes: [{ name: "Landing" }]
        });
      } catch (e) {
        devWarn("DoneScreen reset failed:", e);
        navigation.navigate("Landing");
      }
    } catch (e) {
      devWarn("DoneScreen clearAll:", e);
      Alert.alert(t("error"), e?.message || t("failedToProcess"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("allDone")}</Text>
      <Text style={styles.body}>
        {t("finishedReading")}
      </Text>
      <TouchableOpacity
        style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
        onPress={onStartOver}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.primaryButtonText}>{t("processAnother")}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 80,
    alignItems: "center",
    backgroundColor: "#F5F1E8"
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 8,
    color: "#2C2C2C",
    textAlign: "center"
  },
  body: {
    fontSize: 16,
    color: "#4A4A4A",
    textAlign: "center",
    marginBottom: 40
  },
  primaryButton: {
    backgroundColor: "#B42318",
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 24,
    minHeight: 56,
    minWidth: 220,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  primaryButtonDisabled: {
    opacity: 0.7
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16
  }
});

