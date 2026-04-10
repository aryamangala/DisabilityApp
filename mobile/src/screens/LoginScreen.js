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

export default function LoginScreen() {
  const navigation = useNavigation();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignIn() {
    setError("");
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      // Navigation handled automatically by App.js auth state change
    } catch (err) {
      const msg = err?.message || "Sign in failed. Please try again.";
      setError(msg.includes("UserNotFoundException") || msg.includes("NotAuthorizedException")
        ? "Incorrect email or password."
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
          <Text style={styles.title}>ClaroDoc</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
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
            placeholder="••••••••"
            placeholderTextColor="#9CA3AF"
            editable={!loading}
            onSubmitEditing={handleSignIn}
            returnKeyType="done"
          />

          <TouchableOpacity
            onPress={() => navigation.navigate("ForgotPassword")}
            style={styles.forgotLink}
          >
            <Text style={styles.linkText}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryButtonText}>Sign In</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate("SignUp")}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>
              Don't have an account? <Text style={styles.linkText}>Sign Up</Text>
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
  title: { fontSize: 28, fontWeight: "800", color: "#1D3A5F", marginBottom: 4 },
  subtitle: { fontSize: 15, color: "#6B7280" },
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
  forgotLink: { alignSelf: "flex-end", marginTop: 8, marginBottom: 4 },
  linkText: { color: "#1D3A5F", fontWeight: "600" },
  primaryButton: {
    backgroundColor: "#1D3A5F", borderRadius: 12,
    padding: 16, alignItems: "center", marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryButton: { alignItems: "center", marginTop: 16, padding: 8 },
  secondaryButtonText: { fontSize: 14, color: "#6B7280" },
});
