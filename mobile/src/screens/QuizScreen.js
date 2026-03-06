import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { useDocument } from "../context/DocumentContext";
import { fetchChunk, submitQuizAnswer } from "../api";
import ErrorBanner from "../components/ErrorBanner";
import ChunkProgress from "../components/ChunkProgress";

export default function QuizScreen() {
  const {
    docId,
    chunkCount,
    currentChunkIndex,
    chunksCache,
    setChunkInCache,
    setCurrentChunkIndex
  } = useDocument();
  const navigation = useNavigation();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [correct, setCorrect] = useState(null);

  const cached = chunksCache[currentChunkIndex];

  useEffect(() => {
    let cancelled = false;
    async function ensureQuiz() {
      if (!docId || chunkCount == null) return;
      if (chunksCache[currentChunkIndex]?.quiz) return;

      try {
        setLoading(true);
        setError("");
        const data = await fetchChunk(docId, currentChunkIndex);
        if (cancelled) return;
        setChunkInCache(currentChunkIndex, data);
      } catch (e) {
        if (cancelled) return;
        setError(e.message || "Failed to load quiz.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    ensureQuiz();
    return () => {
      cancelled = true;
    };
  }, [docId, chunkCount, currentChunkIndex, chunksCache, setChunkInCache]);

  if (!docId || chunkCount == null) {
    return (
      <View style={styles.container}>
        <Text style={styles.header}>No document loaded</Text>
      </View>
    );
  }

  const quiz = cached?.quiz;
  const question = quiz?.questions?.[0];

  const onSubmit = async () => {
    if (!quiz || selectedChoice == null) {
      setError("Please select an answer.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setFeedback("");

    try {
      const result = await submitQuizAnswer(
        docId,
        currentChunkIndex,
        0,
        selectedChoice
      );
      setCorrect(result.correct);
      setFeedback(result.feedback || "");
      // Don't update currentChunkIndex here - let onContinue handle navigation
    } catch (e) {
      setError(e.message || "Failed to submit answer.");
    } finally {
      setSubmitting(false);
    }
  };

  const onContinue = () => {
    if (correct) {
      // If there's a next chunk, navigate to Reader to show it
      if (currentChunkIndex + 1 < chunkCount) {
        // Update to next chunk index and navigate to Reader
        const nextIndex = currentChunkIndex + 1;
        setCurrentChunkIndex(nextIndex);
        // Clear the quiz state so we can see the new chunk
        setSelectedChoice(null);
        setFeedback("");
        setCorrect(null);
        navigation.navigate("Reader");
      } else {
        // All chunks completed
        navigation.reset({
          index: 0,
          routes: [{ name: "Done" }]
        });
      }
    } else {
      // Wrong answer - go back to Reader to re-read the same chunk
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      <ChunkProgress current={currentChunkIndex} total={chunkCount} />
      <Text style={styles.header}>Quiz</Text>
      <ErrorBanner message={error} />

      {loading && !quiz && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading quiz...</Text>
        </View>
      )}

      {quiz && question && (
        <View style={styles.quizBox}>
          <Text style={styles.question}>{question.question}</Text>
          {question.choices.map((c, idx) => (
            <TouchableOpacity
              key={idx.toString()}
              style={[
                styles.choice,
                selectedChoice === idx && styles.choiceSelected
              ]}
              onPress={() => {
                setSelectedChoice(idx);
                setFeedback("");
                setCorrect(null);
              }}
            >
              <Text
                style={[
                  styles.choiceText,
                  selectedChoice === idx && styles.choiceTextSelected
                ]}
              >
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {feedback ? (
        <Text
          style={[
            styles.feedback,
            correct ? styles.feedbackCorrect : styles.feedbackIncorrect
          ]}
        >
          {feedback}
        </Text>
      ) : null}

      <View style={styles.buttonsRow}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            submitting && styles.primaryButtonDisabled
          ]}
          disabled={submitting || !quiz}
          onPress={onSubmit}
        >
          <Text style={styles.primaryButtonText}>
            {submitting ? "Submitting..." : "Submit answer"}
          </Text>
        </TouchableOpacity>
      </View>

      {feedback !== "" && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onContinue}
        >
          <Text style={styles.secondaryButtonText}>
            {correct ? "Next chunk" : "Back to reading"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 24,
    backgroundColor: "#F9FAFB"
  },
  header: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    color: "#111827"
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  loadingText: {
    marginTop: 8,
    color: "#4B5563"
  },
  quizBox: {
    marginTop: 8,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB"
  },
  question: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    color: "#111827"
  },
  choice: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    marginBottom: 6
  },
  choiceSelected: {
    backgroundColor: "#DBEAFE",
    borderColor: "#2563EB"
  },
  choiceText: {
    fontSize: 14,
    color: "#111827"
  },
  choiceTextSelected: {
    fontWeight: "700"
  },
  buttonsRow: {
    marginTop: 12
  },
  primaryButton: {
    backgroundColor: "#2563EB",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center"
  },
  primaryButtonDisabled: {
    opacity: 0.7
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16
  },
  secondaryButton: {
    marginTop: 10,
    alignSelf: "center"
  },
  secondaryButtonText: {
    color: "#2563EB",
    fontWeight: "600",
    fontSize: 15
  },
  feedback: {
    marginTop: 10,
    fontSize: 14
  },
  feedbackCorrect: {
    color: "#15803D"
  },
  feedbackIncorrect: {
    color: "#B91C1C"
  }
});

