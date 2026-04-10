import React from "react";
import { View, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { DocumentProvider } from "./src/context/DocumentContext";
import { SettingsProvider } from "./src/context/SettingsContext";

import LoginScreen from "./src/screens/LoginScreen";
import SignUpScreen from "./src/screens/SignUpScreen";
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import LandingScreen from "./src/screens/LandingScreen";
import ImportScreen from "./src/screens/ImportScreen";
import ProcessingScreen from "./src/screens/ProcessingScreen";
import ReaderScreen from "./src/screens/ReaderScreen";
import DoneScreen from "./src/screens/DoneScreen";
import PreviousFilesScreen from "./src/screens/PreviousFilesScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

const AuthStack = createNativeStackNavigator();
const AppStack = createNativeStackNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

function AppNavigator() {
  return (
    <DocumentProvider>
      <AppStack.Navigator>
        <AppStack.Screen name="Landing" component={LandingScreen} options={{ headerShown: false }} />
        <AppStack.Screen name="Import" component={ImportScreen} options={{ headerShown: false }} />
        <AppStack.Screen name="Processing" component={ProcessingScreen} options={{ headerTitle: "Processing" }} />
        <AppStack.Screen name="Reader" component={ReaderScreen} options={{ headerTitle: "Reader" }} />
        <AppStack.Screen name="Done" component={DoneScreen} options={{ headerShown: false }} />
        <AppStack.Screen name="PreviousFiles" component={PreviousFilesScreen} options={{ headerShown: false }} />
        <AppStack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
      </AppStack.Navigator>
    </DocumentProvider>
  );
}

function RootNavigator() {
  const { isAuthenticated, restoring } = useAuth();

  if (restoring) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F9FAFB" }}>
        <ActivityIndicator size="large" color="#1D3A5F" />
      </View>
    );
  }

  return isAuthenticated ? <AppNavigator /> : <AuthNavigator />;
}

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SettingsProvider>
  );
}
