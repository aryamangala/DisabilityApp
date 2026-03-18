import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { useNavigation } from "@react-navigation/native";

import ErrorBanner from "../components/ErrorBanner";
import { useSettings } from "../context/SettingsContext";
import { getTranslation } from "../utils/translations";

export default function ImportScreen() {
  const [selectedOption, setSelectedOption] = useState(null); // "photo", "text", "upload"
  const [title, setTitle] = useState("");
  const [textInput, setTextInput] = useState("");
  const [fileMeta, setFileMeta] = useState(null);
  const [imageMeta, setImageMeta] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const navigation = useNavigation();
  const { language: userLanguage } = useSettings();
  const t = (key) => getTranslation(key, userLanguage);

  // For manual text imports, derive a readable title if the title field is blank.
  const buildManualTextTitle = () => {
    const trimmedTitle = title.trim();
    if (trimmedTitle) return trimmedTitle;

    const normalizedText = textInput.replace(/\s+/g, " ").trim();
    if (!normalizedText) return "Untitled";

    const firstSentence = normalizedText.split(/[.!?]/)[0].trim();
    const baseTitle = firstSentence || normalizedText;
    const maxTitleLength = 30;

    return baseTitle.length > maxTitleLength
      ? `${baseTitle.slice(0, maxTitleLength - 3).trim()}...`
      : baseTitle;
  };

  const onSelectPdf = async () => {
    setError("");
    setFileMeta(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        multiple: false,
        copyToCacheDirectory: Platform.OS !== "web"
      });
      if (result.canceled) return;
      const file = result.assets[0];
      
      console.log("PDF selected:", {
        name: file.name,
        uri: file.uri?.substring(0, 50),
        mimeType: file.mimeType,
        size: file.size,
        hasFileProperty: !!file.file,
        platform: Platform.OS
      });
      
      // On web, expo-document-picker may provide file.file or we use the URI
      // Store both for flexibility
      const fileMeta = {
        file: file.file || null, // Actual File object for web (if available)
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType || "application/pdf"
      };
      
      console.log("File metadata stored:", { ...fileMeta, uri: fileMeta.uri?.substring(0, 50) });
      setFileMeta(fileMeta);
    } catch (e) {
      console.error("PDF picker error:", e);
      setError(`Failed to pick PDF: ${e.message || "Unknown error"}`);
    }
  };

  const onTakePhoto = async () => {
    setError("");
    setImageMeta(null);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        setError(t("error") + ": Camera permission is required.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setImageMeta({
        uri: asset.uri,
        name: "photo.jpg",
        mimeType: "image/jpeg"
      });
    } catch (e) {
      setError("Failed to open camera. Please try again.");
    }
  };

  const onProcess = async () => {
    setError("");
    if (submitting) return;
    setSubmitting(true);

    try {
      if (selectedOption === "text") {
        if (!textInput.trim()) {
          setError(t("error") + ": " + t("pleaseSelectAnswer"));
          setSubmitting(false);
          return;
        }
        navigation.navigate("Processing", {
          mode: "text",
          payload: {
            title: buildManualTextTitle(),
            language: userLanguage || "es",
            text: textInput
          }
        });
      } else if (selectedOption === "upload") {
        if (!fileMeta) {
          setError(t("error") + ": Please select a PDF file.");
          setSubmitting(false);
          return;
        }
        
        // On web, skip FileSystem check; on native, verify file exists
        if (Platform.OS !== "web") {
          try {
            const info = await FileSystem.getInfoAsync(fileMeta.uri);
            if (!info.exists) {
              setError(t("error") + ": Selected file is not accessible.");
              setSubmitting(false);
              return;
            }
          } catch (e) {
            console.warn("FileSystem check failed:", e);
          }
        }
        
        navigation.navigate("Processing", {
          mode: "pdf",
          payload: {
            title: title || fileMeta.name || "Untitled",
            language: userLanguage || "es",
            uri: fileMeta.uri,
            name: fileMeta.name,
            mimeType: fileMeta.mimeType,
            file: fileMeta.file // Include file object for web
          }
        });
      } else if (selectedOption === "photo") {
        if (!imageMeta) {
          setError(t("error") + ": Please take a photo first.");
          setSubmitting(false);
          return;
        }
        
        // On web, skip FileSystem check; on native, verify file exists
        if (Platform.OS !== "web") {
          try {
            const info = await FileSystem.getInfoAsync(imageMeta.uri);
            if (!info.exists) {
              setError(t("error") + ": Captured image is not accessible.");
              setSubmitting(false);
              return;
            }
          } catch (e) {
            console.warn("FileSystem check failed:", e);
          }
        }
        
        navigation.navigate("Processing", {
          mode: "image",
          payload: {
            title: title || "Photo document",
            language: userLanguage || "es",
            uri: imageMeta.uri,
            name: imageMeta.name,
            mimeType: imageMeta.mimeType,
            file: imageMeta.file // Include file object for web if available
          }
        });
      } else {
        setError(t("error") + ": Please select an import method.");
        setSubmitting(false);
        return;
      }
    } catch (e) {
      console.error("ImportScreen error:", e);
      setError(`Failed to start processing: ${e.message || "Unknown error"}`);
      setSubmitting(false);
      return;
    }

    setTimeout(() => setSubmitting(false), 300);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("addDocument")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ErrorBanner message={error} />

      <View style={styles.content}>
        <Text style={styles.instruction}>
          {t("chooseImportMethod")}
        </Text>

        <View style={styles.optionsContainer}>
          <TouchableOpacity
            style={styles.optionCard}
            onPress={async () => {
              setSelectedOption("photo");
              await onTakePhoto();
            }}
          >
            <View style={[styles.iconContainer, styles.iconOrange]}>
              <Text style={styles.iconText}>📷</Text>
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionTitle}>{t("takePhoto")}</Text>
              <Text style={styles.optionSubtitle}>{t("scanWithCamera")}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => setSelectedOption("text")}
          >
            <View style={[styles.iconContainer, styles.iconYellow]}>
              <Text style={[styles.iconText, styles.iconTextT]}>T</Text>
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionTitle}>{t("manualText")}</Text>
              <Text style={styles.optionSubtitle}>{t("pasteOrType")}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={async () => {
              setSelectedOption("upload");
              await onSelectPdf();
            }}
          >
            <View style={[styles.iconContainer, styles.iconRed]}>
              <Text style={styles.iconText}>📄</Text>
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionTitle}>{t("uploadDocument")}</Text>
              <Text style={styles.optionSubtitle}>{t("importFiles")}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {selectedOption === "text" && (
          <View style={styles.inputSection}>
            <View style={styles.field}>
              <Text style={styles.label}>{t("documentTitle")}</Text>
              <TextInput
                style={styles.input}
                placeholder={t("enterTitle")}
                value={title}
                onChangeText={setTitle}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{t("pasteOrType")}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={t("pasteOrType") + "..."}
                value={textInput}
                onChangeText={setTextInput}
                multiline
              />
            </View>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                submitting && styles.primaryButtonDisabled
              ]}
              disabled={submitting || !textInput.trim()}
              onPress={onProcess}
            >
              <Text style={styles.primaryButtonText}>
                {submitting ? t("loading") : t("processDocument")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {(selectedOption === "upload" || selectedOption === "photo") && (
          <View style={styles.inputSection}>
            <View style={styles.field}>
              <Text style={styles.label}>{t("documentTitle")}</Text>
              <TextInput
                style={styles.input}
                placeholder={t("enterTitle")}
                value={title}
                onChangeText={setTitle}
              />
            </View>
            {selectedOption === "upload" && fileMeta && (
              <View style={styles.fileInfo}>
                <Text style={styles.fileLabel}>{t("uploadDocument")}: {fileMeta.name}</Text>
              </View>
            )}
            {selectedOption === "photo" && imageMeta && (
              <View style={styles.fileInfo}>
                <Text style={styles.fileLabel}>{t("takePhoto")} ✓</Text>
              </View>
            )}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                submitting && styles.primaryButtonDisabled,
                ((selectedOption === "upload" && !fileMeta) || 
                 (selectedOption === "photo" && !imageMeta)) && styles.primaryButtonDisabled
              ]}
              disabled={
                submitting || 
                (selectedOption === "upload" && !fileMeta) ||
                (selectedOption === "photo" && !imageMeta)
              }
              onPress={onProcess}
            >
              <Text style={styles.primaryButtonText}>
                {submitting ? t("loading") : t("processDocument")}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 24,
    backgroundColor: "#F5F1E8"
  },
  backArrow: {
    fontSize: 24,
    color: "#2C2C2C",
    marginRight: 12
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: "#2C2C2C",
    flex: 1,
    textAlign: "center"
  },
  headerSpacer: {
    width: 36
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20
  },
  instruction: {
    fontSize: 16,
    color: "#4A4A4A",
    textAlign: "center",
    marginBottom: 32
  },
  optionsContainer: {
    gap: 16,
    marginBottom: 24
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8DCC6",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16
  },
  iconOrange: {
    backgroundColor: "#FFB88C"
  },
  iconYellow: {
    backgroundColor: "#FFE66D"
  },
  iconRed: {
    backgroundColor: "#FF6B6B"
  },
  iconText: {
    fontSize: 28,
    color: "#1F2937"
  },
  iconTextT: {
    fontSize: 32,
    fontWeight: "700",
    color: "#8B4513"
  },
  optionTextContainer: {
    flex: 1
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2C2C2C",
    marginBottom: 4
  },
  optionSubtitle: {
    fontSize: 14,
    color: "#475467"
  },
  inputSection: {
    marginTop: 8
  },
  field: {
    marginBottom: 16
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#374151"
  },
  input: {
    backgroundColor: "#E8DCC6",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#2C2C2C"
  },
  textArea: {
    height: 160,
    textAlignVertical: "top"
  },
  fileInfo: {
    marginBottom: 16
  },
  fileLabel: {
    fontSize: 14,
    color: "#2C2C2C",
    backgroundColor: "#E8DCC6",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB"
  },
  primaryButton: {
    backgroundColor: "#B42318",
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  primaryButtonDisabled: {
    opacity: 0.5
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16
  }
});

