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
  const { signUp } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      // AuthContext auto signs in after registration — navigation handled by App.js auth state
    } catch (err) {
      const msg = err?.message || "Sign up failed.";
      setError(err?.code === "UsernameExistsException"
        ? "An account with this email already exists."
        : msg);
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
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Sign up to save and sync your documents</Text>
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

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
