import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const { forgotPassword, confirmForgotPassword } = useAuth();

  const [step, setStep] = useState("request"); // "request" | "confirm"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRequest() {
    setError("");
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      setStep("confirm");
    } catch (err) {
      setError(err?.message || "Failed to send reset code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setError("");
    if (!code.trim()) { setError("Please enter the verification code."); return; }
    if (newPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      await confirmForgotPassword(email.trim().toLowerCase(), code.trim(), newPassword);
      navigation.navigate("Login");
    } catch (err) {
      setError(err?.message || "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerSection}>
          <Text style={styles.title}>
            {step === "request" ? "Reset Password" : "New Password"}
          </Text>
          <Text style={styles.subtitle}>
            {step === "request"
              ? "Enter your email and we'll send a reset code"
              : `Enter the code sent to ${email} and choose a new password`}
          </Text>
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        {step === "request" ? (
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              placeholder="you@example.com"
              placeholderTextColor="#9CA3AF"
              editable={!loading}
              onSubmitEditing={handleRequest}
              returnKeyType="send"
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleRequest}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryButtonText}>Send Code</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate("Login")}
              disabled={loading}
            >
              <Text style={styles.linkText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.label}>Verification Code</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              placeholder="Enter 6-digit code"
              placeholderTextColor="#9CA3AF"
              editable={!loading}
            />

            <Text style={styles.label}>New Password</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              placeholder="Min. 8 characters"
              placeholderTextColor="#9CA3AF"
              editable={!loading}
              onSubmitEditing={handleConfirm}
              returnKeyType="done"
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryButtonText}>Reset Password</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setStep("request")}
              disabled={loading}
            >
              <Text style={styles.linkText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#F9FAFB" },
  container: { flexGrow: 1, justifyContent: "center", padding: 24 },
  headerSection: { alignItems: "center", marginBottom: 32 },
  title: { fontSize: 26, fontWeight: "800", color: "#1D3A5F", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  errorText: {
    backgroundColor: "#FEE2E2", color: "#B91C1C",
    borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 14,
  },
  form: { gap: 4 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10,
    padding: 14, fontSize: 16, backgroundColor: "#fff", color: "#111",
  },
  primaryButton: {
    backgroundColor: "#1D3A5F", borderRadius: 12,
    padding: 16, alignItems: "center", marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryButton: { alignItems: "center", marginTop: 16, padding: 8 },
  linkText: { color: "#1D3A5F", fontWeight: "600", fontSize: 14 },
});
