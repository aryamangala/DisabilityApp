import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSettings } from "../context/SettingsContext";
import { getTranslation } from "../utils/translations";

export default function ChunkProgress({ current, total }) {
  const { language } = useSettings();
  const t = (key) => getTranslation(key, language);
  
  if (!total || total <= 0) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {t("chunk")} {current + 1} {language === "es" ? "de" : "of"} {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    alignSelf: "flex-start",
    marginBottom: 8
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827"
  }
});

