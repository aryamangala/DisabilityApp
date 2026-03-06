import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useDocument } from "../context/DocumentContext";
import { useSettings } from "../context/SettingsContext";
import { getTranslation } from "../utils/translations";

export default function DoneScreen() {
  const navigation = useNavigation();
  const { clearAll } = useDocument();
  const { language } = useSettings();
  const t = (key) => getTranslation(key, language);

  const onStartOver = async () => {
    await clearAll();
    navigation.reset({
      index: 0,
      routes: [{ name: "Landing" }]
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("allDone")}</Text>
      <Text style={styles.body}>
        {t("finishedReading")}
      </Text>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={onStartOver}
      >
        <Text style={styles.primaryButtonText}>{t("processAnother")}</Text>
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
    backgroundColor: "#FF6B4A",
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16
  }
});

