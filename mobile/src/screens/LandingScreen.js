import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSettings } from "../context/SettingsContext";
import { getTranslation } from "../utils/translations";

export default function LandingScreen() {
  const navigation = useNavigation();
  const { language } = useSettings();
  const t = (key) => getTranslation(key, language);

  return (
    <View style={styles.container}>
      <View style={styles.headerSection}>
        <View style={styles.iconContainer}>
          <View style={styles.iconBackground}>
            <Text style={styles.iconText}>⚖</Text>
          </View>
        </View>
        <Text style={styles.title}>{t("appTitle")}</Text>
        <Text style={styles.tagline}>{t("tagline")}</Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => navigation.navigate("Import")}
        >
          <Text style={styles.buttonIcon}>+</Text>
          <Text style={styles.buttonText}>{t("newFile")}</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => navigation.navigate("PreviousFiles")}
        >
          <Text style={styles.buttonIcon}>↻</Text>
          <Text style={styles.buttonText}>{t("previousFiles")}</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => navigation.navigate("Settings")}
        >
          <Text style={styles.buttonIcon}>⚙</Text>
          <Text style={styles.buttonText}>{t("settings")}</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F1E8"
  },
  headerSection: {
    alignItems: "center",
    paddingTop: 80,
    paddingBottom: 60,
    paddingHorizontal: 24
  },
  iconContainer: {
    marginBottom: 24
  },
  iconBackground: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: "#B42318",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  iconText: {
    fontSize: 40,
    color: "white"
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#2C2C2C",
    marginBottom: 8,
    textAlign: "center"
  },
  tagline: {
    fontSize: 16,
    color: "#4A4A4A",
    textAlign: "center"
  },
  buttonContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 12
  },
  menuButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8DCC6",
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  buttonIcon: {
    fontSize: 24,
    color: "#2C2C2C",
    marginRight: 16,
    width: 28,
    textAlign: "center"
  },
  buttonText: {
    flex: 1,
    fontSize: 17,
    fontWeight: "500",
    color: "#2C2C2C"
  },
  chevron: {
    fontSize: 24,
    color: "#2C2C2C",
    marginLeft: 8
  }
});
