import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";

import { useDocument } from "../context/DocumentContext";
import { useSettings } from "../context/SettingsContext";
import { fetchChunk } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import ChunkProgress from "../components/ChunkProgress";
import { getTranslation } from "../utils/translations";

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

export default function ReaderScreen() {
  const {
    docId,
    chunkCount,
    currentChunkIndex,
    chunksCache,
    setChunkInCache,
    setCurrentChunkIndex
  } = useDocument();
  const { getTextSizeStyle, language } = useSettings();
  const navigation = useNavigation();
  const t = (key) => getTranslation(key, language);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOriginalExpanded, setIsOriginalExpanded] = useState(false);
  const [selectedKeyTerm, setSelectedKeyTerm] = useState(null);

  const cached = chunksCache[currentChunkIndex];

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!docId || chunkCount == null) return;
      // If chunk is already cached, don't reload
      if (chunksCache[currentChunkIndex]) return;
      
      // Always try to load/refresh the chunk when currentChunkIndex changes
      // This ensures we have the latest data, especially when navigating to a new chunk
      
      setError("");
      setLoading(true);
      try {
        const data = await fetchChunk(docId, currentChunkIndex);
        if (cancelled) return;
        setChunkInCache(currentChunkIndex, data);
      } catch (e) {
        if (cancelled) return;
        setError(e.message || "Failed to load chunk.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [docId, chunkCount, currentChunkIndex, setChunkInCache, chunksCache]);

  // Reset expanded state when chunk changes
  useEffect(() => {
    setIsOriginalExpanded(false);
    setSelectedKeyTerm(null);
  }, [currentChunkIndex]);

  const onKeyTermPress = ({ term, definition, sentenceIndex }) => {
    setSelectedKeyTerm((prev) => {
      const isSameTerm =
        prev &&
        prev.term === term &&
        prev.definition === definition &&
        prev.sentenceIndex === sentenceIndex;

      if (isSameTerm) {
        return null;
      }

      return { term, definition, sentenceIndex };
    });
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
          style={styles.termHighlight}
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
      // All chunks completed - navigate to Done screen
      navigation.reset({
        index: 0,
        routes: [{ name: "Done" }]
      });
    }
  };

  // Check if we have enough data to show the button
  // Enable button as soon as we have chunk data (even if EasyRead is still generating)
  // The button should work even if EasyRead is being generated in the background
  const canShowButton = !!(cached && cached.originalText);

  if (!docId || chunkCount == null) {
    return (
      <View style={styles.container}>
        <Text style={styles.header}>{t("noDocumentLoaded")}</Text>
        <Text style={styles.body}>
          {t("goBackAndImport")}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ChunkProgress current={currentChunkIndex} total={chunkCount} />
      <ErrorBanner message={error} />

      {loading && !cached && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>{t("loadingChunk")}</Text>
        </View>
      )}

      {cached && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.card}>
            {/* Original Text Section */}
            <View style={styles.originalSection}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => setIsOriginalExpanded(!isOriginalExpanded)}
                activeOpacity={0.7}
              >
                <Text style={styles.sectionIcon}>📄</Text>
                <Text style={styles.sectionTitle}>{t("originalText")}</Text>
                <View style={styles.expandButton}>
                  <Text style={styles.expandIcon}>
                    {isOriginalExpanded ? "▼" : "▶"}
                  </Text>
                </View>
              </TouchableOpacity>
              {isOriginalExpanded && (
                <ScrollView style={styles.originalContent} nestedScrollEnabled>
                  <Text style={[styles.originalText, getTextSizeStyle()]}>
                    {cached.originalText}
                  </Text>
                </ScrollView>
              )}
              {!isOriginalExpanded && (
                <View style={styles.collapsedPreview}>
                  <Text style={[styles.previewText, getTextSizeStyle()]} numberOfLines={2}>
                    {cached.originalText}
                  </Text>
                  <Text style={styles.expandHint}>{t("tapToViewFull")}</Text>
                </View>
              )}
            </View>

            {/* Simple Summary Section */}
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

                    {cached.easyread?.keyTerms?.length ? (
                      <Text style={styles.termHintText}>
                        {language === "es"
                          ? "Toca una palabra subrayada para ver su significado."
                          : "Tap an underlined word to see its meaning."}
                      </Text>
                    ) : null}

                    {selectedKeyTerm ? (
                      <View style={styles.termCard}>
                        <Text style={styles.termCardLabel}>
                          {language === "es" ? "Palabra dificil" : "Difficult word"}
                        </Text>
                        <Text style={[styles.termCardTerm, getTextSizeStyle()]}>
                          {selectedKeyTerm.term}
                        </Text>
                        <Text style={[styles.termCardDefinition, getTextSizeStyle()]}>
                          {selectedKeyTerm.definition}
                        </Text>
                        <TouchableOpacity
                          style={styles.termCardButton}
                          onPress={() => setSelectedKeyTerm(null)}
                        >
                          <Text style={styles.termCardButtonText}>
                            {language === "es" ? "Entendido" : "Got it"}
                          </Text>
                        </TouchableOpacity>
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

            {/* Action Button */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                !canShowButton && styles.actionButtonDisabled
              ]}
              disabled={!canShowButton}
              onPress={onNextChunk}
            >
              <Text style={styles.actionButtonText}>
                {currentChunkIndex + 1 < chunkCount ? t("nextChunk") : t("finishReading")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

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
  header: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    color: "#F8FAFC"
  },
  body: {
    fontSize: 14,
    color: "#E2E8F0"
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
  originalSection: {
    backgroundColor: "#FAF9F6",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 16
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12
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
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    color: "#5B6473",
    textTransform: "uppercase"
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
  summaryText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: "white"
  },
  termHighlight: {
    textDecorationLine: "underline",
    textDecorationColor: "#FDE68A",
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 4,
    fontWeight: "700"
  },
  termHintText: {
    marginTop: 8,
    color: "rgba(255, 255, 255, 0.95)",
    fontSize: 13,
    fontStyle: "italic"
  },
  termCard: {
    marginTop: 12,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 12,
    padding: 12
  },
  termCardLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9A3412",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4
  },
  termCardTerm: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4
  },
  termCardDefinition: {
    fontSize: 14,
    lineHeight: 20,
    color: "#1F2937"
  },
  termCardButton: {
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: "#8F2D12",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  termCardButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 13
  },
  actionButton: {
    backgroundColor: "white",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#8F2D12",
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  actionButtonDisabled: {
    opacity: 0.5
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#8F2D12"
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
  noSummaryText: {
    color: "rgba(255, 255, 255, 0.92)",
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 20
  }
});

