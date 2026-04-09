import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Speech from "expo-speech";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

import { useDocument } from "../context/DocumentContext";
import { useSettings } from "../context/SettingsContext";
import { fetchChunk } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import ChunkProgress from "../components/ChunkProgress";
import { getTranslation } from "../utils/translations";
import { devWarn } from "../devLog";

function isWordChar(char) {
  return /[A-Za-z0-9\u00C0-\u017F_]/.test(char);
}

function getNonOverlappingTermMatches(sentence, keyTerms, sentenceIndex) {
  if (!sentence || !Array.isArray(keyTerms) || keyTerms.length === 0) {
    return [];
  }

  const termsForSentence = keyTerms.filter((item) => {
    const hasIndexedSentence = Number.isInteger(item?.sentenceIndex);
    if (!hasIndexedSentence) return true;
    return item.sentenceIndex === sentenceIndex;
  });

  if (!termsForSentence.length) {
    return [];
  }

  const sentenceLower = sentence.toLowerCase();
  const rawMatches = [];

  termsForSentence.forEach((item) => {
    const term = (item?.term || "").trim();
    const definition = (item?.definition || "").trim();
    if (!term) return;

    const termLower = term.toLowerCase();
    let searchStart = 0;

    while (searchStart < sentenceLower.length) {
      const start = sentenceLower.indexOf(termLower, searchStart);
      if (start === -1) break;

      const end = start + termLower.length;
      const beforeChar = start > 0 ? sentence[start - 1] : " ";
      const afterChar = end < sentence.length ? sentence[end] : " ";
      const hasWordBoundary = !isWordChar(beforeChar) && !isWordChar(afterChar);

      if (hasWordBoundary) {
        rawMatches.push({ start, end, term, definition });
      }

      searchStart = end;
    }
  });

  rawMatches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });

  const filtered = [];
  let lastEnd = -1;

  rawMatches.forEach((match) => {
    if (match.start >= lastEnd) {
      filtered.push(match);
      lastEnd = match.end;
    }
  });

  return filtered;
}

function getUniqueKeyTerms(keyTerms) {
  if (!Array.isArray(keyTerms) || !keyTerms.length) {
    return [];
  }

  const seen = new Set();
  const unique = [];

  keyTerms.forEach((item) => {
    const term = (item?.term || "").trim();
    const definition = (item?.definition || "").trim();
    const normalizedTerm = term.toLowerCase();

    if (!term || !definition || seen.has(normalizedTerm)) {
      return;
    }

    seen.add(normalizedTerm);
    unique.push({ term, definition });
  });

  return unique;
}

export default function ReaderScreen() {
  const {
    docId,
    chunkCount,
    currentChunkIndex,
    chunksCache,
    setChunkInCache,
    setCurrentChunkIndex,
    getLocalDocument
  } = useDocument();
  const { getTextSizeStyle, language, theme } = useSettings();
  const navigation = useNavigation();
  const t = (key) => getTranslation(key, language);
  const isDark = theme !== "light";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [isOriginalExpanded, setIsOriginalExpanded] = useState(false);
  const [selectedKeyTerm, setSelectedKeyTerm] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const cached = chunksCache[currentChunkIndex];

  const easyReadSpeechText = useMemo(() => {
    const er = cached?.easyread;
    if (!er) return "";
    const bits = [];
    const title = typeof er.title === "string" ? er.title.trim() : "";
    if (title) bits.push(title);
    if (Array.isArray(er.sentences)) {
      er.sentences.forEach((s) => {
        const str = typeof s === "string" ? s : s != null ? String(s) : "";
        const line = str.replace(/\s+/g, " ").trim();
        if (line) bits.push(line);
      });
    }
    return bits.join(". ");
  }, [cached?.easyread]);

  // Easy Read JSON from the API is always Spanish (see backend generateEasyRead).
  // Using en-US for that text often fails or sounds broken on iOS; keep TTS locale aligned with content.
  const easyReadSpeechLanguage = "es-ES";

  const stopSpeaking = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
  }, []);

  const onReadOutPress = useCallback(() => {
    const text = easyReadSpeechText.trim();
    if (!text) return;

    if (isSpeaking) {
      stopSpeaking();
      return;
    }

    Speech.stop();
    setIsSpeaking(true);
    try {
      Speech.speak(text, {
        language: easyReadSpeechLanguage,
        rate: 0.72,
        pitch: 1,
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: (e) => {
          devWarn("expo-speech error:", e);
          setIsSpeaking(false);
          Alert.alert(getTranslation("error", language), getTranslation("speechUnavailable", language));
        }
      });
    } catch (e) {
      devWarn("Speech.speak threw:", e);
      setIsSpeaking(false);
      Alert.alert(getTranslation("error", language), getTranslation("speechUnavailable", language));
    }
  }, [easyReadSpeechText, easyReadSpeechLanguage, isSpeaking, stopSpeaking, language]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!docId || chunkCount == null) return;
      // If chunk is already cached, don't reload
      if (chunksCache[currentChunkIndex]) return;
      
      setError("");
      setLoading(true);
      try {
        // Prefer local storage: only this device's uploads should be visible.
        const local = await getLocalDocument(docId);
        const localChunk = local?.chunks?.[currentChunkIndex];
        const data = localChunk || (await fetchChunk(docId, currentChunkIndex));
        if (cancelled) return;
        setChunkInCache(currentChunkIndex, data);
      } catch (e) {
        if (cancelled) return;
        setError(e.message || getTranslation("failedToLoad", language));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [docId, chunkCount, currentChunkIndex, setChunkInCache, chunksCache, getLocalDocument, reloadToken, language]);

  // Reset expanded state and stop TTS when chunk changes
  useEffect(() => {
    setIsOriginalExpanded(false);
    setSelectedKeyTerm(null);
    Speech.stop();
    setIsSpeaking(false);
  }, [currentChunkIndex]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        Speech.stop();
        setIsSpeaking(false);
      };
    }, [])
  );

  const onKeyTermPress = ({ term, definition, sentenceIndex }) => {
    setSelectedKeyTerm({ term, definition, sentenceIndex });
  };

  const renderSentenceWithHighlights = (sentence, sentenceIndex) => {
    const keyTerms = cached?.easyread?.keyTerms || [];
    const matches = getNonOverlappingTermMatches(sentence, keyTerms, sentenceIndex);

    if (!matches.length) return sentence;

    const parts = [];
    let cursor = 0;

    matches.forEach((match, idx) => {
      if (match.start > cursor) {
        parts.push(
          <Text key={`plain-${idx}-${cursor}`}>
            {sentence.slice(cursor, match.start)}
          </Text>
        );
      }

      parts.push(
        <Text
          key={`term-${idx}-${match.start}`}
          style={[styles.termHighlight, !isDark && styles.termHighlightLight]}
          onPress={() =>
            onKeyTermPress({
              term: match.term,
              definition: match.definition,
              sentenceIndex
            })
          }
        >
          {sentence.slice(match.start, match.end)}
        </Text>
      );

      cursor = match.end;
    });

    if (cursor < sentence.length) {
      parts.push(
        <Text key={`plain-end-${cursor}`}>{sentence.slice(cursor)}</Text>
      );
    }

    return parts;
  };

  const onNextChunk = () => {
    if (!cached || !chunkCount) return;
    
    // Navigate to next chunk if available
    if (currentChunkIndex + 1 < chunkCount) {
      setCurrentChunkIndex(currentChunkIndex + 1);
      // Navigation will happen automatically via useEffect when currentChunkIndex changes
    } else {
      try {
        navigation.reset({
          index: 0,
          routes: [{ name: "Done" }]
        });
      } catch (e) {
        devWarn("Reader navigate to Done:", e);
        navigation.navigate("Done");
      }
    }
  };

  const onPrevChunk = () => {
    if (!cached || chunkCount == null) return;
    if (currentChunkIndex > 0) {
      setCurrentChunkIndex(currentChunkIndex - 1);
    }
  };

  // Check if we have enough data to show the button
  // Enable button as soon as we have chunk data (even if EasyRead is still generating)
  // The button should work even if EasyRead is being generated in the background
  const canShowButton = !!(cached && cached.originalText);

  if (!docId || chunkCount == null) {
    return (
      <View style={[styles.container, !isDark && styles.containerLight]}>
        <Text style={[styles.header, !isDark && styles.headerOnLight]}>
          {t("noDocumentLoaded")}
        </Text>
        <Text style={[styles.body, !isDark && styles.bodyOnLight]}>
          {t("goBackAndImport")}
        </Text>
        <TouchableOpacity
          style={styles.navPrimaryButton}
          onPress={() => navigation.navigate("Landing")}
          activeOpacity={0.85}
        >
          <Text style={styles.navPrimaryButtonText}>{t("backToHome")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (chunkCount === 0) {
    return (
      <View style={[styles.container, !isDark && styles.containerLight]}>
        <Text style={[styles.header, !isDark && styles.headerOnLight]}>
          {t("documentHasNoPages")}
        </Text>
        <TouchableOpacity
          style={styles.navPrimaryButton}
          onPress={() => navigation.navigate("Landing")}
          activeOpacity={0.85}
        >
          <Text style={styles.navPrimaryButtonText}>{t("backToHome")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const summaryKeyTerms = getUniqueKeyTerms(cached?.easyread?.keyTerms);

  const renderReadOutButton = () => {
    if (!cached?.easyread?.sentences?.length || !easyReadSpeechText.trim()) {
      return null;
    }
    return (
      <TouchableOpacity
        style={[styles.readOutButton, !isDark && styles.readOutButtonLight]}
        onPress={onReadOutPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={isSpeaking ? t("stopReading") : t("readOutLoud")}
      >
        <Text style={styles.readOutIcon} accessibilityLabel="">
          {isSpeaking ? "⏹" : "🔊"}
        </Text>
        <Text
          style={[styles.readOutButtonText, !isDark && styles.readOutButtonTextLight]}
        >
          {isSpeaking ? t("stopReading") : t("readOutLoud")}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, !isDark && styles.containerLight]}>
      <ChunkProgress current={currentChunkIndex} total={chunkCount} />
      <ErrorBanner message={error} />

      {loading && !cached && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8F2D12" />
          <Text style={[styles.loadingText, !isDark && styles.loadingTextLight]}>
            {t("loadingChunk")}
          </Text>
        </View>
      )}

      {error && !cached && !loading && (
        <View style={styles.center}>
          <TouchableOpacity
            style={[styles.actionButton, !isDark && styles.actionButtonLight]}
            onPress={() => {
              setError("");
              setReloadToken((n) => n + 1);
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.actionButtonText, !isDark && styles.actionButtonTextLight]}>
              {t("tryAgain")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ marginTop: 12 }}
            onPress={() => navigation.navigate("Landing")}
          >
            <Text style={[styles.body, !isDark && styles.bodyOnLight]}>{t("backToHome")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {cached && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={[styles.card, !isDark && styles.cardLight]}>
            {/* Original Text Section */}
            <View style={[styles.originalSection, !isDark && styles.originalSectionLight]}>
              <TouchableOpacity
                style={[styles.sectionHeader, !isDark && styles.sectionHeaderLight]}
                onPress={() => setIsOriginalExpanded(!isOriginalExpanded)}
                activeOpacity={0.7}
              >
                <Text style={[styles.sectionIcon, !isDark && styles.sectionIconLight]}>📄</Text>
                <Text style={[styles.sectionTitle, !isDark && styles.sectionTitleLight]}>
                  {t("originalText")}
                </Text>
                <View style={styles.expandButton}>
                  <Text style={[styles.expandIcon, !isDark && styles.expandIconLight]}>
                    {isOriginalExpanded ? "▼" : "▶"}
                  </Text>
                </View>
              </TouchableOpacity>
              {isOriginalExpanded && (
                <ScrollView style={styles.originalContent} nestedScrollEnabled>
                  <Text style={[styles.originalText, getTextSizeStyle(), !isDark && styles.textDark]}>
                    {cached.originalText}
                  </Text>
                </ScrollView>
              )}
              {!isOriginalExpanded && (
                <View style={styles.collapsedPreview}>
                  <Text
                    style={[styles.previewText, getTextSizeStyle(), !isDark && styles.textMutedDark]}
                    numberOfLines={2}
                  >
                    {cached.originalText}
                  </Text>
                  <Text style={[styles.expandHint, !isDark && styles.textMutedDark]}>
                    {t("tapToViewFull")}
                  </Text>
                </View>
              )}
            </View>

            {/* Simple Summary Section */}
            {isDark ? (
              <LinearGradient
                colors={["#B42318", "#8F2D12"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.summarySection}
              >
                <View style={styles.sectionHeader}>
                  <Text style={styles.summaryIcon}>⚖</Text>
                  <Text style={styles.summaryTitle}>{t("simpleSummary")}</Text>
                </View>
                <View style={styles.summaryContent}>
                  {renderReadOutButton()}
                  {!cached.easyread && loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color="white" />
                      <Text style={styles.loadingSummaryText}>{t("generatingEasyRead")}</Text>
                    </View>
                  ) : cached.easyread?.sentences?.length > 0 ? (
                    <>
                      {cached.easyread.sentences.map((s, idx) => (
                        <View key={idx.toString()} style={styles.bulletItem}>
                          <View style={styles.bullet} />
                          <Text style={[styles.summaryText, getTextSizeStyle()]}>
                            {renderSentenceWithHighlights(s, idx)}
                          </Text>
                        </View>
                      ))}

                      {summaryKeyTerms.length ? (
                        <Text style={styles.termHintText}>
                          {t("tapUnderlinedWordHint")}
                        </Text>
                      ) : null}

                      {summaryKeyTerms.length ? (
                        <View style={styles.termListSection}>
                          <Text style={styles.termListTitle}>{t("difficultWordsTitle")}</Text>
                          {summaryKeyTerms.map((item, idx) => (
                            <View key={`${item.term}-${idx}`} style={styles.termListItem}>
                              <Text style={[styles.termListTerm, getTextSizeStyle()]}>
                                {item.term}
                              </Text>
                              <Text style={[styles.termListDefinition, getTextSizeStyle()]}>
                                {item.definition}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.noSummaryText}>
                      {t("willBeGenerated")}
                    </Text>
                  )}
                </View>
              </LinearGradient>
            ) : (
              <View style={[styles.summarySection, styles.summarySectionLight]}>
                <View style={[styles.sectionHeader, styles.sectionHeaderLight]}>
                  <Text style={[styles.summaryIcon, styles.summaryIconLight]}>⚖</Text>
                  <Text style={[styles.summaryTitle, styles.summaryTitleLight]}>{t("simpleSummary")}</Text>
                </View>
                <View style={styles.summaryContent}>
                {renderReadOutButton()}
                {!cached.easyread && loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#8F2D12" />
                    <Text style={[styles.loadingSummaryText, styles.loadingSummaryTextLight]}>
                      {t("generatingEasyRead")}
                    </Text>
                  </View>
                ) : cached.easyread?.sentences?.length > 0 ? (
                  <>
                    {cached.easyread.sentences.map((s, idx) => (
                      <View key={idx.toString()} style={styles.bulletItem}>
                        <View style={[styles.bullet, styles.bulletLight]} />
                        <Text style={[styles.summaryText, getTextSizeStyle(), styles.summaryTextLight]}>
                          {renderSentenceWithHighlights(s, idx)}
                        </Text>
                      </View>
                    ))}

                    {summaryKeyTerms.length ? (
                      <Text style={[styles.termHintText, styles.termHintTextLight]}>
                        {t("tapUnderlinedWordHint")}
                      </Text>
                    ) : null}

                    {summaryKeyTerms.length ? (
                      <View style={[styles.termListSection, styles.termListSectionLight]}>
                        <Text style={[styles.termListTitle, styles.termListTitleLight]}>
                          {t("difficultWordsTitle")}
                        </Text>
                        {summaryKeyTerms.map((item, idx) => (
                          <View key={`${item.term}-${idx}`} style={styles.termListItem}>
                            <Text style={[styles.termListTerm, getTextSizeStyle(), styles.termListTermLight]}>
                              {item.term}
                            </Text>
                            <Text style={[styles.termListDefinition, getTextSizeStyle(), styles.termListDefinitionLight]}>
                              {item.definition}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Text style={[styles.noSummaryText, styles.noSummaryTextLight]}>
                    {t("willBeGenerated")}
                  </Text>
                )}
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  !isDark && styles.secondaryButtonLight,
                  (currentChunkIndex === 0 || !canShowButton) && styles.actionButtonDisabled
                ]}
                disabled={currentChunkIndex === 0 || !canShowButton}
                onPress={onPrevChunk}
              >
                <Text style={[styles.secondaryButtonText, !isDark && styles.secondaryButtonTextLight]}>
                  {t("previousChunk")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  !isDark && styles.actionButtonLight,
                  !canShowButton && styles.actionButtonDisabled
                ]}
                disabled={!canShowButton}
                onPress={onNextChunk}
              >
                <Text style={[styles.actionButtonText, !isDark && styles.actionButtonTextLight]}>
                  {currentChunkIndex + 1 < chunkCount ? t("nextChunk") : t("finishReading")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      <Modal
        visible={!!selectedKeyTerm}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedKeyTerm(null)}
      >
        <Pressable
          style={[
            styles.definitionModalBackdrop,
            !isDark && styles.definitionModalBackdropLight
          ]}
          onPress={() => setSelectedKeyTerm(null)}
        >
          <Pressable style={styles.definitionBubble} onPress={() => {}}>
            <Text style={styles.definitionBubbleLabel}>{t("difficultWordLabel")}</Text>
            <Text style={[styles.definitionBubbleTerm, getTextSizeStyle()]}>
              {selectedKeyTerm?.term}
            </Text>
            <Text style={[styles.definitionBubbleText, getTextSizeStyle()]}>
              {selectedKeyTerm?.definition}
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 24,
    backgroundColor: "#1E293B"
  },
  containerLight: {
    backgroundColor: "#F7F6F2"
  },
  header: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    color: "#F8FAFC"
  },
  headerOnLight: {
    color: "#2C2C2C",
    textAlign: "center"
  },
  body: {
    fontSize: 14,
    color: "#E2E8F0"
  },
  bodyOnLight: {
    color: "#4A4A4A",
    textAlign: "center"
  },
  navPrimaryButton: {
    marginTop: 24,
    backgroundColor: "#B42318",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 28,
    alignSelf: "center"
  },
  navPrimaryButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32
  },
  card: {
    backgroundColor: "transparent",
    borderRadius: 16,
    overflow: "hidden"
  },
  cardLight: {
    backgroundColor: "#F7F6F2"
  },
  originalSection: {
    backgroundColor: "#FAF9F6",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 16
  },
  originalSectionLight: {
    backgroundColor: "#FFFEFB",
    borderWidth: 1.5,
    borderColor: "#8F2D12",
    marginBottom: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12
  },
  sectionHeaderLight: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1D6CC"
  },
  expandButton: {
    marginLeft: "auto"
  },
  expandIcon: {
    fontSize: 12,
    color: "#5B6473",
    fontWeight: "600"
  },
  sectionIcon: {
    fontSize: 18,
    marginRight: 8
  },
  sectionIconLight: {
    backgroundColor: "#FBE4DD",
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: "hidden"
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    color: "#5B6473",
    textTransform: "uppercase"
  },
  sectionTitleLight: {
    color: "#1F2937"
  },
  expandIconLight: {
    color: "#8F2D12"
  },
  originalContent: {
    maxHeight: 300
  },
  originalText: {
    fontSize: 15,
    lineHeight: 24,
    color: "#1F2937",
    fontFamily: "serif"
  },
  collapsedPreview: {
    paddingTop: 8
  },
  previewText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
    fontStyle: "italic",
    marginBottom: 8
  },
  expandHint: {
    fontSize: 12,
    color: "#5B6473",
    fontStyle: "italic"
  },
  summarySection: {
    padding: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16
  },
  summaryIcon: {
    fontSize: 18,
    marginRight: 8
  },
  summaryTitle: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    color: "white",
    textTransform: "uppercase"
  },
  summaryContent: {
    marginTop: 8
  },
  readOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    marginBottom: 12
  },
  readOutButtonLight: {
    backgroundColor: "#FBE4DD",
    borderWidth: 1.5,
    borderColor: "#8F2D12"
  },
  readOutIcon: {
    fontSize: 18
  },
  readOutButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "white"
  },
  readOutButtonTextLight: {
    color: "#8F2D12"
  },
  summarySectionLight: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#8F2D12",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 4
  },
  summaryIconLight: {
    color: "#8F2D12",
    backgroundColor: "#FBE4DD",
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    overflow: "hidden"
  },
  summaryTitleLight: {
    color: "#111827",
    fontWeight: "700"
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "flex-start"
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FEC4B4",
    marginTop: 8,
    marginRight: 12
  },
  bulletLight: {
    backgroundColor: "#64748B"
  },
  summaryText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: "white"
  },
  summaryTextLight: {
    color: "#0F172A"
  },
  termHighlight: {
    textDecorationLine: "underline",
    textDecorationColor: "#FDE68A",
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 4,
    fontWeight: "700"
  },
  termHighlightLight: {
    textDecorationColor: "#8F2D12",
    backgroundColor: "rgba(143, 45, 18, 0.10)"
  },
  textDark: {
    color: "#111827"
  },
  textMutedDark: {
    color: "#475569"
  },
  termHintText: {
    marginTop: 8,
    color: "rgba(255, 255, 255, 0.95)",
    fontSize: 13,
    fontStyle: "italic"
  },
  termHintTextLight: {
    color: "#334155"
  },
  termListSection: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.25)"
  },
  termListSectionLight: {
    borderTopColor: "#E2E8F0"
  },
  termListTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "white",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8
  },
  termListTitleLight: {
    color: "#0F172A"
  },
  termListItem: {
    marginBottom: 8
  },
  termListTerm: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FEF3C7"
  },
  termListTermLight: {
    color: "#0F172A"
  },
  termListDefinition: {
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255, 255, 255, 0.96)"
  },
  termListDefinitionLight: {
    color: "#334155"
  },
  definitionModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    justifyContent: "center",
    padding: 24
  },
  definitionModalBackdropLight: {
    backgroundColor: "rgba(15, 23, 42, 0.25)"
  },
  definitionBubble: {
    backgroundColor: "rgba(255, 255, 255, 0.98)",
    borderRadius: 12,
    padding: 14
  },
  definitionBubbleLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9A3412",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4
  },
  definitionBubbleTerm: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4
  },
  definitionBubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#1F2937"
  },
  actionButton: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#8F2D12",
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  actionButtonLight: {
    borderColor: "#8F2D12",
    shadowOpacity: 0.04
  },
  actionButtonDisabled: {
    opacity: 0.5
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#8F2D12"
  },
  actionButtonTextLight: {
    color: "#8F2D12"
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "transparent",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.7)",
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: "center"
  },
  secondaryButtonLight: {
    borderColor: "#94A3B8"
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white"
  },
  secondaryButtonTextLight: {
    color: "#334155"
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  loadingText: {
    marginTop: 8,
    color: "#E2E8F0"
  },
  loadingTextLight: {
    color: "#475569"
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20
  },
  loadingSummaryText: {
    marginLeft: 8,
    color: "white",
    fontSize: 14
  },
  loadingSummaryTextLight: {
    color: "#334155"
  },
  noSummaryText: {
    color: "rgba(255, 255, 255, 0.92)",
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 20
  },
  noSummaryTextLight: {
    color: "#475569"
  }
});

