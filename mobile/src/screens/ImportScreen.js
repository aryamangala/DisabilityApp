import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Platform,
  BackHandler,
  ScrollView,
  KeyboardAvoidingView
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useNavigation, useFocusEffect } from "@react-navigation/native";

import ErrorBanner from "../components/ErrorBanner";
import { useSettings } from "../context/SettingsContext";
import { getTranslation } from "../utils/translations";
import { devError, devLog, devWarn } from "../devLog";

const MAX_PHOTO_PAGES = 24;
/** Rough cap to keep JSON body under backend limits and avoid device memory spikes */
const MAX_MANUAL_TEXT_CHARS = 450000;

export default function ImportScreen() {
  const [selectedOption, setSelectedOption] = useState(null); // "photo", "text", "upload"
  const [title, setTitle] = useState("");
  const [textInput, setTextInput] = useState("");
  const [fileMeta, setFileMeta] = useState(null);
  const [imagePages, setImagePages] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const navigation = useNavigation();
  const { language: userLanguage } = useSettings();
  const t = (key) => getTranslation(key, userLanguage);

  // After Processing, the stack may be [Import, Reader]; popping Reader leaves Import as root,
  // so goBack() would fail. Fall back to Landing when there is no history.
  const onBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("Landing");
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return undefined;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (navigation.canGoBack()) return false;
        navigation.navigate("Landing");
        return true;
      });
      return () => sub.remove();
    }, [navigation])
  );

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
    setImagePages([]);
    setFileMeta(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        multiple: false,
        copyToCacheDirectory: Platform.OS !== "web"
      });
      if (result.canceled) return;
      const file = result.assets[0];
      
      devLog("PDF selected:", {
        name: file.name,
        uri: file.uri?.substring(0, 50),
        mimeType: file.mimeType,
        size: file.size,
        hasFileProperty: !!file.file,
        platform: Platform.OS,
      });
      
      // On web, expo-document-picker may provide file.file or we use the URI
      // Store both for flexibility
      const fileMeta = {
        file: file.file || null, // Actual File object for web (if available)
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType || "application/pdf"
      };
      
      devLog("File metadata stored:", {
        ...fileMeta,
        uri: fileMeta.uri?.substring(0, 50),
      });
      setFileMeta(fileMeta);
    } catch (e) {
      devError("PDF picker error:", e);
      setError(`Failed to pick PDF: ${e.message || "Unknown error"}`);
    }
  };

  /**
   * Web: use a file input so each page is a real File (upload works) and mobile browsers
   * can offer camera + library in one flow. Native: expo-image-picker camera.
   */
  const capturePhotoPage = async () => {
    if (imagePages.length >= MAX_PHOTO_PAGES) {
      setError(t("maxPhotoPages"));
      return;
    }
    setError("");

    if (Platform.OS === "web" && typeof document !== "undefined") {
      try {
        await new Promise((resolve) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/jpeg,image/png,image/webp,image/heic";
          input.onchange = () => {
            const f = input.files?.[0];
            if (!f) {
              resolve();
              return;
            }
            setImagePages((prev) => {
              const nextIndex = prev.length + 1;
              return [
                ...prev,
                {
                  uri: URL.createObjectURL(f),
                  name: `page_${nextIndex}.jpg`,
                  mimeType: f.type || "image/jpeg",
                  file: f
                }
              ];
            });
            resolve();
          };
          input.click();
        });
      } catch (e) {
        devError("Web photo pick failed:", e);
        setError(t("webPhotoFailed"));
      }
      return;
    }

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
      setImagePages((prev) => [
        ...prev,
        {
          uri: asset.uri,
          name: `page_${prev.length + 1}.jpg`,
          mimeType: "image/jpeg",
          file: null
        }
      ]);
    } catch (e) {
      setError("Failed to open camera. Please try again.");
    }
  };

  const removePhotoPage = (index) => {
    setImagePages((prev) => prev.filter((_, i) => i !== index));
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
        if (textInput.length > MAX_MANUAL_TEXT_CHARS) {
          setError(
            t("error") +
              ": " +
              t("textPasteTooLong")
          );
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
            devWarn("FileSystem check failed:", e);
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
        if (!imagePages.length) {
          setError(t("error") + ": " + t("pleaseCaptureOnePage"));
          setSubmitting(false);
          return;
        }

        if (Platform.OS !== "web") {
          try {
            for (const p of imagePages) {
              const info = await FileSystem.getInfoAsync(p.uri);
              if (!info.exists) {
                setError(t("error") + ": Captured image is not accessible.");
                setSubmitting(false);
                return;
              }
            }
          } catch (e) {
            devWarn("FileSystem check failed:", e);
          }
        }

        navigation.navigate("Processing", {
          mode: "image",
          payload: {
            title: title || "Photo document",
            language: userLanguage || "es",
            imagePages: imagePages.map(({ uri, name, mimeType, file }) => ({
              uri,
              name,
              mimeType,
              file
            }))
          }
        });
      } else {
        setError(t("error") + ": Please select an import method.");
        setSubmitting(false);
        return;
      }
    } catch (e) {
      devError("ImportScreen error:", e);
      setError(`Failed to start processing: ${e.message || "Unknown error"}`);
      setSubmitting(false);
      return;
    }

    setTimeout(() => setSubmitting(false), 300);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("addDocument")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <ErrorBanner message={error} />

          <Text style={styles.instruction}>
            {t("chooseImportMethod")}
          </Text>

          <View style={styles.optionsContainer}>
            <TouchableOpacity
              style={styles.optionCard}
              onPress={async () => {
                setSelectedOption("photo");
                setFileMeta(null);
                if (imagePages.length === 0) {
                  await capturePhotoPage();
                }
              }}
            >
              <View style={[styles.iconContainer, styles.iconOrange]}>
                <Text style={styles.iconText}>📷</Text>
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>{t("takePhoto")}</Text>
                <Text style={styles.optionSubtitle}>{t("scanMultiplePages")}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => {
                setImagePages([]);
                setSelectedOption("text");
              }}
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
                setImagePages([]);
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
                  <Text style={styles.fileLabel}>
                    {t("uploadDocument")}: {fileMeta.name}
                  </Text>
                </View>
              )}
              {selectedOption === "photo" && (
                <View style={styles.photoSection}>
                  {imagePages.map((p, index) => (
                    <View key={`${p.uri}-${index}`} style={styles.pageRow}>
                      <Text style={styles.pageRowLabel}>
                        {t("pageLabel")} {index + 1}
                      </Text>
                      <TouchableOpacity
                        onPress={() => removePhotoPage(index)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.removePageText}>{t("removePage")}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={[
                      styles.secondaryButton,
                      (imagePages.length >= MAX_PHOTO_PAGES || submitting) &&
                        styles.secondaryButtonDisabled
                    ]}
                    disabled={imagePages.length >= MAX_PHOTO_PAGES || submitting}
                    onPress={capturePhotoPage}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {imagePages.length === 0
                        ? t("capturePage")
                        : t("addAnotherPage")}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.pageHint}>
                    {imagePages.length} / {MAX_PHOTO_PAGES}
                  </Text>
                  {Platform.OS === "web" && (
                    <Text style={styles.webPhotoHint}>{t("webPhotoHint")}</Text>
                  )}
                </View>
              )}
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  submitting && styles.primaryButtonDisabled,
                  ((selectedOption === "upload" && !fileMeta) ||
                    (selectedOption === "photo" && !imagePages.length)) &&
                    styles.primaryButtonDisabled
                ]}
                disabled={
                  submitting ||
                  (selectedOption === "upload" && !fileMeta) ||
                  (selectedOption === "photo" && !imagePages.length)
                }
                onPress={onProcess}
              >
                <Text style={styles.primaryButtonText}>
                  {submitting ? t("loading") : t("processDocument")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  keyboardAvoid: {
    flex: 1
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    flexGrow: 1
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
  photoSection: {
    marginBottom: 16
  },
  pageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#E8DCC6",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8
  },
  pageRowLabel: {
    fontSize: 14,
    color: "#2C2C2C",
    fontWeight: "600"
  },
  removePageText: {
    fontSize: 14,
    color: "#B42318",
    fontWeight: "600"
  },
  secondaryButton: {
    backgroundColor: "#D4C4A8",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 8
  },
  secondaryButtonDisabled: {
    opacity: 0.45
  },
  secondaryButtonText: {
    color: "#2C2C2C",
    fontWeight: "700",
    fontSize: 15
  },
  pageHint: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 4
  },
  webPhotoHint: {
    fontSize: 12,
    color: "#5B6473",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 18
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

