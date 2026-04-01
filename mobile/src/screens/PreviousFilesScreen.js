import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { fetchAllDocuments, fetchDocumentDetails, deleteAllDocuments, deleteDocument } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import { useDocument } from "../context/DocumentContext";
import { useSettings } from "../context/SettingsContext";
import { getTranslation } from "../utils/translations";

export default function PreviousFilesScreen() {
  const navigation = useNavigation();
  const { setDocId, setChunkCount, setCurrentChunkIndex } = useDocument();
  const { language } = useSettings();
  const t = (key) => getTranslation(key, language);
  
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [docDetails, setDocDetails] = useState({});

  // Refresh when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log("PreviousFilesScreen focused, loading documents");
      loadDocuments();
    }, [])
  );

  const loadDocuments = async () => {
    setLoading(true);
    setError("");
    try {
      console.log("Loading all documents...");
      const result = await fetchAllDocuments();
      console.log("Documents loaded:", result);
      setDocuments(result.documents || []);
      if (!result.documents || result.documents.length === 0) {
        console.log("No documents found in database");
      }
    } catch (e) {
      console.error("Error loading documents:", e);
      setError(e.message || "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  };

  const loadDocumentDetails = async (docId) => {
    if (docDetails[docId]) return; // Already loaded
    
    try {
      console.log("Loading document details for:", docId);
      const details = await fetchDocumentDetails(docId);
      console.log("Document details loaded:", details);
      setDocDetails(prev => ({ ...prev, [docId]: details }));
    } catch (e) {
      console.error("Failed to load document details:", e);
      setError(`Failed to load details: ${e.message}`);
    }
  };

  const onToggleExpand = (docId) => {
    if (expandedDoc === docId) {
      setExpandedDoc(null);
    } else {
      setExpandedDoc(docId);
      loadDocumentDetails(docId);
    }
  };

  const onResumeDocument = (doc) => {
    setDocId(doc.docId);
    setChunkCount(docDetails[doc.docId]?.chunkCount || 0);
    // Find first unread chunk or start at 0
    const chunks = docDetails[doc.docId]?.chunks || [];
    const firstIncomplete = chunks.findIndex(c => !c.completed);
    setCurrentChunkIndex(firstIncomplete >= 0 ? firstIncomplete : 0);
    navigation.navigate("Reader");
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleClearAll = async () => {
    console.log("handleClearAll called, documents.length:", documents.length);
    if (documents.length === 0) {
      console.log("No documents to delete");
      return;
    }
    
    const confirmDelete = () => {
      if (Platform.OS === "web" && window.confirm) {
        return window.confirm(t("clearAllConfirm"));
      } else {
        return new Promise((resolve) => {
          Alert.alert(
            t("clearAll"),
            t("clearAllConfirm"),
            [
              {
                text: t("cancel"),
                style: "cancel",
                onPress: () => resolve(false)
              },
              {
                text: t("delete"),
                style: "destructive",
                onPress: () => resolve(true)
              }
            ],
            { cancelable: true, onDismiss: () => resolve(false) }
          );
        });
      }
    };

    const shouldDelete = await confirmDelete();
    if (!shouldDelete) {
      console.log("Clear all cancelled");
      return;
    }

    try {
      console.log("Deleting all documents...");
      setError("");
      await deleteAllDocuments();
      console.log("All documents deleted successfully");
      setDocuments([]);
      setDocDetails({});
    } catch (e) {
      console.error("Error deleting documents:", e);
      setError(e.message || t("clearAllError"));
    }
  };

  const handleDeleteDocument = async (docId, docTitle) => {
    console.log("handleDeleteDocument called:", docId, docTitle);
    
    const confirmDelete = () => {
      if (Platform.OS === "web" && window.confirm) {
        return window.confirm(t("deleteDocumentConfirm"));
      } else {
        return new Promise((resolve) => {
          Alert.alert(
            t("deleteDocument"),
            t("deleteDocumentConfirm"),
            [
              {
                text: t("cancel"),
                style: "cancel",
                onPress: () => resolve(false)
              },
              {
                text: t("delete"),
                style: "destructive",
                onPress: () => resolve(true)
              }
            ],
            { cancelable: true, onDismiss: () => resolve(false) }
          );
        });
      }
    };

    const shouldDelete = await confirmDelete();
    if (!shouldDelete) {
      console.log("Delete cancelled");
      return;
    }

    try {
      console.log("Deleting document:", docId);
      setError("");
      await deleteDocument(docId);
      console.log("Document deleted successfully:", docId);
      
      // Remove from local state
      setDocuments(prev => prev.filter(doc => doc.docId !== docId));
      
      // Remove from details cache
      setDocDetails(prev => {
        const newDetails = { ...prev };
        delete newDetails[docId];
        return newDetails;
      });
      
      // If this was the expanded doc, collapse it
      if (expandedDoc === docId) {
        setExpandedDoc(null);
      }
    } catch (e) {
      console.error("Error deleting document:", e);
      setError(e.message || t("deleteDocumentError"));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>{t("back")}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("previousFilesTitle")}</Text>
        <View style={styles.headerRight}>
          {documents.length > 0 && (
            <TouchableOpacity onPress={handleClearAll} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>{t("clearAll")}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={loadDocuments}>
            <Text style={styles.refreshButton}>↻</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ErrorBanner message={error} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#8F2D12" />
          <Text style={styles.loadingText}>{t("loading")}</Text>
        </View>
      ) : documents.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t("noFiles")}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {documents.map((doc) => {
            const details = docDetails[doc.docId];
            const isExpanded = expandedDoc === doc.docId;
            
            return (
              <View key={doc.docId} style={styles.documentCard}>
                <View style={styles.documentHeader}>
                  <View style={styles.documentHeaderLeft}>
                    <Text style={styles.documentTitle}>{doc.title || "Untitled"}</Text>
                    <Text style={styles.documentDate}>{formatDate(doc.createdAt)}</Text>
                  </View>
                  <View style={styles.documentHeaderRight}>
                    <TouchableOpacity
                      onPress={() => {
                        console.log("Delete button pressed for:", doc.docId);
                        handleDeleteDocument(doc.docId, doc.title);
                      }}
                      style={styles.deleteButton}
                      hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                      activeOpacity={0.5}
                    >
                      <Text style={styles.deleteIcon}>🗑️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onToggleExpand(doc.docId)}
                      style={styles.expandButton}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.expandIcon}>{isExpanded ? "▼" : "▶"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {isExpanded && details && (
                  <View style={styles.chunksContainer}>
                    {details.chunks?.map((chunk) => (
                      <View key={chunk.chunkIndex} style={styles.chunkCard}>
                        <View style={styles.chunkHeader}>
                          <Text style={styles.chunkTitle}>
                            {t("chunk")} {chunk.chunkIndex + 1}: {chunk.heading || "Untitled"}
                          </Text>
                          <View style={styles.chunkBadges}>
                            {chunk.completed ? (
                              <Text style={styles.completedBadge}>✓ {t("read")}</Text>
                            ) : (
                              <Text style={styles.incompleteBadge}>○ {t("notRead")}</Text>
                            )}
                          </View>
                        </View>
                        {chunk.easyread && chunk.easyread.sentences && chunk.easyread.sentences.length > 0 ? (
                          <View style={styles.easyreadContainer}>
                            {chunk.easyread.title && (
                              <Text style={styles.easyreadTitle}>{chunk.easyread.title}</Text>
                            )}
                            {chunk.easyread.sentences.map((sentence, idx) => (
                              <View key={idx} style={styles.bulletItem}>
                                <Text style={styles.bullet}>•</Text>
                                <Text style={styles.easyreadSentence}>{sentence}</Text>
                              </View>
                            ))}
                            {chunk.easyread.keyTerms && chunk.easyread.keyTerms.length > 0 && (
                              <View style={styles.keyTermsContainer}>
                                {chunk.easyread.keyTerms.map((term, idx) => (
                                  <Text key={idx} style={styles.keyTerm}>
                                    <Text style={styles.keyTermLabel}>{term.term}:</Text> {term.definition}
                                  </Text>
                                ))}
                              </View>
                            )}
                            {chunk.easyread.warnings && chunk.easyread.warnings.length > 0 && (
                              <View style={styles.warningsContainer}>
                                {chunk.easyread.warnings.map((warning, idx) => (
                                  <Text key={idx} style={styles.warningText}>⚠️ {warning}</Text>
                                ))}
                              </View>
                            )}
                          </View>
                        ) : (
                          <Text style={styles.chunkSummary}>{chunk.summary}</Text>
                        )}
                      </View>
                    ))}
                    <TouchableOpacity
                      style={styles.resumeButton}
                      onPress={() => onResumeDocument(doc)}
                    >
                      <Text style={styles.resumeButtonText}>{t("resumeReading")}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
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
    fontWeight: "600",
    minWidth: 60
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "700",
    color: "#2C2C2C",
    flex: 1,
    textAlign: "center"
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#DC2626",
    borderRadius: 12
  },
  clearButtonText: {
    fontSize: 14,
    color: "white",
    fontWeight: "600"
  },
  refreshButton: {
    fontSize: 24,
    color: "#2C2C2C",
    fontWeight: "600",
    width: 40,
    textAlign: "center"
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  loadingText: {
    marginTop: 8,
    color: "#4A4A4A",
    fontSize: 16
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#4A4A4A",
    marginBottom: 4
  },
  emptySubtext: {
    fontSize: 14,
    color: "#5B6473"
  },
  scroll: {
    flex: 1
  },
  scrollContent: {
    padding: 24
  },
  documentCard: {
    backgroundColor: "#E8DCC6",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  documentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16
  },
  documentHeaderLeft: {
    flex: 1,
    paddingRight: 12
  },
  documentHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  deleteButton: {
    padding: 8,
    minWidth: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center"
  },
  deleteIcon: {
    fontSize: 20
  },
  expandButton: {
    padding: 8,
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center"
  },
  documentTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2C2C2C",
    marginBottom: 4
  },
  documentDate: {
    fontSize: 12,
    color: "#4A4A4A"
  },
  expandIcon: {
    fontSize: 14,
    color: "#475467",
    marginLeft: 12
  },
  chunksContainer: {
    borderTopWidth: 1,
    borderTopColor: "#D1D5DB",
    padding: 16
  },
  chunkCard: {
    backgroundColor: "#F5F1E8",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  chunkHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8
  },
  chunkTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2C2C2C",
    flex: 1
  },
  chunkBadges: {
    flexDirection: "row",
    gap: 8,
    marginLeft: 8
  },
  completedBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: "#166534",
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  incompleteBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4B5563",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  attemptsBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1D4ED8",
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  chunkSummary: {
    fontSize: 13,
    color: "#4A4A4A",
    lineHeight: 18
  },
  easyreadContainer: {
    marginTop: 8
  },
  easyreadTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2C2C2C",
    marginBottom: 12
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 8,
    alignItems: "flex-start"
  },
  bullet: {
    fontSize: 16,
    color: "#8F2D12",
    marginRight: 8,
    marginTop: 2
  },
  easyreadSentence: {
    flex: 1,
    fontSize: 14,
    color: "#2C2C2C",
    lineHeight: 20
  },
  keyTermsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#D1D5DB"
  },
  keyTerm: {
    fontSize: 13,
    color: "#4A4A4A",
    marginBottom: 6,
    lineHeight: 18
  },
  keyTermLabel: {
    fontWeight: "600",
    color: "#2C2C2C"
  },
  warningsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#D1D5DB"
  },
  warningText: {
    fontSize: 13,
    color: "#B42318",
    marginBottom: 6,
    lineHeight: 18
  },
  resumeButton: {
    backgroundColor: "#B42318",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  resumeButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 14
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: 20
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: "#5B6473"
  }
});
