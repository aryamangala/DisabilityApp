import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset Password</Text>
      <Text style={styles.body}>
        Password reset is not available yet. Please contact your administrator or create a new account.
      </Text>
      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate("Login")}>
        <Text style={styles.buttonText}>Back to Sign In</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, backgroundColor: "#F9FAFB" },
  title: { fontSize: 22, fontWeight: "800", color: "#1D3A5F", marginBottom: 16 },
  body: { fontSize: 15, color: "#6B7280", textAlign: "center", marginBottom: 32, lineHeight: 22 },
  button: { backgroundColor: "#1D3A5F", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
