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

export default function SignUpScreen() {
  const navigation = useNavigation();
  const { signUp, confirmSignUp, signIn } = useAuth();

  const [step, setStep] = useState("register"); // "register" | "confirm"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignUp() {
    setError("");
    if (!email.trim()) { setError("Email is required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password);
      setStep("confirm");
    } catch (err) {
      const msg = err?.message || "Sign up failed.";
      setError(msg.includes("UsernameExistsException")
        ? "An account with this email already exists."
        : msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setError("");
    if (!code.trim()) { setError("Please enter the verification code."); return; }

    setLoading(true);
    try {
      await confirmSignUp(email.trim().toLowerCase(), code.trim());
      // Auto sign in after confirmation
      await signIn(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(err?.message || "Confirmation failed. Please try again.");
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
          <View style={styles.iconBackground}>
            <Text style={styles.iconText}>⚖</Text>
          </View>
          <Text style={styles.title}>
            {step === "register" ? "Create Account" : "Verify Email"}
          </Text>
          <Text style={styles.subtitle}>
            {step === "register"
              ? "Sign up to save and sync your documents"
              : `We sent a code to ${email}`}
          </Text>
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        {step === "register" ? (
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
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Min. 8 characters"
              placeholderTextColor="#9CA3AF"
              editable={!loading}
            />

            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#9CA3AF"
              editable={!loading}
              onSubmitEditing={handleSignUp}
              returnKeyType="done"
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleSignUp}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryButtonText}>Create Account</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate("Login")}
              disabled={loading}
            >
              <Text style={styles.secondaryButtonText}>
                Already have an account? <Text style={styles.linkText}>Sign In</Text>
              </Text>
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
                : <Text style={styles.primaryButtonText}>Verify & Sign In</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setStep("register")}
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
  iconBackground: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: "#1D3A5F", justifyContent: "center", alignItems: "center",
    marginBottom: 16,
  },
  iconText: { fontSize: 36, color: "#fff" },
  title: { fontSize: 26, fontWeight: "800", color: "#1D3A5F", marginBottom: 4 },
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
  secondaryButtonText: { fontSize: 14, color: "#6B7280" },
  linkText: { color: "#1D3A5F", fontWeight: "600" },
});
