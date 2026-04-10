import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSettings } from "../context/SettingsContext";
import { useAuth } from "../context/AuthContext";
import { getTranslation } from "../utils/translations";

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { textSize, setTextSize, language, setLanguage, theme, setTheme, getTextSizeStyle } = useSettings();
  const { signOut, user } = useAuth();
  const t = (key) => getTranslation(key, language);

  const textSizes = [
    { key: "small", label: t("small"), size: 12 },
    { key: "medium", label: t("medium"), size: 14 },
    { key: "large", label: t("large"), size: 16 },
    { key: "xlarge", label: t("extraLarge"), size: 18 }
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← {t("back")}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("settingsTitle")}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("appearance")}</Text>
          <Text style={styles.sectionDescription}>{t("chooseTheme")}</Text>

          <View style={styles.optionsContainer}>
            <TouchableOpacity
              style={[
                styles.optionButton,
                theme === "light" && styles.optionButtonActive
              ]}
              onPress={() => setTheme("light")}
            >
              <Text
                style={[
                  styles.optionText,
                  theme === "light" && styles.optionTextActive
                ]}
              >
                {t("lightMode")}
              </Text>
              {theme === "light" && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.optionButton,
                theme === "dark" && styles.optionButtonActive
              ]}
              onPress={() => setTheme("dark")}
            >
              <Text
                style={[
                  styles.optionText,
                  theme === "dark" && styles.optionTextActive
                ]}
              >
                {t("darkMode")}
              </Text>
              {theme === "dark" && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("textSize")}</Text>
          <Text style={styles.sectionDescription}>
            {t("chooseTextSize")}
          </Text>

          <View style={styles.optionsContainer}>
            {textSizes.map((size) => (
              <TouchableOpacity
                key={size.key}
                style={[
                  styles.optionButton,
                  textSize === size.key && styles.optionButtonActive
                ]}
                onPress={() => setTextSize(size.key)}
              >
                <Text
                  style={[
                    styles.optionText,
                    textSize === size.key && styles.optionTextActive,
                    { fontSize: size.size }
                  ]}
                >
                  {size.label}
                </Text>
                {textSize === size.key && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.previewContainer}>
            <Text style={styles.previewLabel}>{t("preview")}:</Text>
            <Text style={[styles.previewText, getTextSizeStyle()]}>
              {t("previewText")}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("languageSetting")}</Text>
          <Text style={styles.sectionDescription}>
            {t("chooseLanguage")}
          </Text>

          <View style={styles.optionsContainer}>
            <TouchableOpacity
              style={[
                styles.optionButton,
                language === "es" && styles.optionButtonActive
              ]}
              onPress={() => setLanguage("es")}
            >
              <Text
                style={[
                  styles.optionText,
                  language === "es" && styles.optionTextActive
                ]}
              >
                {t("spanish")}
              </Text>
              {language === "es" && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.optionButton,
                language === "en" && styles.optionButtonActive
              ]}
              onPress={() => setLanguage("en")}
            >
              <Text
                style={[
                  styles.optionText,
                  language === "en" && styles.optionTextActive
                ]}
              >
                {t("english")}
              </Text>
              {language === "en" && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.sectionDescription} numberOfLines={1} ellipsizeMode="tail">
            Signed in as {user?.getUsername?.() || ""}
          </Text>
          <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F1E8"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: "#F5F1E8"
  },
  backButton: {
    fontSize: 24,
    color: "#2C2C2C",
    fontWeight: "600"
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: "#2C2C2C",
    flex: 1,
    textAlign: "center"
  },
  placeholder: {
    width: 60
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    padding: 24
  },
  section: {
    backgroundColor: "#E8DCC6",
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2C2C2C",
    marginBottom: 8
  },
  sectionDescription: {
    fontSize: 14,
    color: "#4A4A4A",
    marginBottom: 16
  },
  optionsContainer: {
    gap: 8
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    backgroundColor: "#F5F1E8"
  },
  optionButtonActive: {
    borderColor: "#8F2D12",
    backgroundColor: "#FBE4DD"
  },
  optionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2C2C2C"
  },
  optionTextActive: {
    color: "#8F2D12"
  },
  checkmark: {
    fontSize: 18,
    color: "#8F2D12",
    fontWeight: "700"
  },
  previewContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#F5F1E8",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB"
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5B6473",
    marginBottom: 8
  },
  previewText: {
    color: "#111827",
    lineHeight: 22
  },
  signOutButton: {
    marginTop: 4,
    backgroundColor: "#8F2D12",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  signOutText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
