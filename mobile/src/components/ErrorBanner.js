import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSettings } from "../context/SettingsContext";
import { getTranslation } from "../utils/translations";

export default function ErrorBanner({ message }) {
  const { language } = useSettings();
  const t = (key) => getTranslation(key, language);
  
  if (!message) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("error")}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffe6e6",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#ff9999"
  },
  title: {
    fontWeight: "bold",
    color: "#b00020",
    marginBottom: 4
  },
  message: {
    color: "#b00020"
  }
});

