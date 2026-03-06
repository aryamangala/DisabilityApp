import React from "react";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";

export default function LoadingOverlay({ text }) {
  return (
    <View style={styles.overlay}>
      <View style={styles.box}>
        <ActivityIndicator size="large" color="#2563EB" />
        {text ? <Text style={styles.text}>{text}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center"
  },
  box: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    minWidth: 180
  },
  text: {
    marginTop: 8,
    color: "#374151",
    textAlign: "center"
  }
});


