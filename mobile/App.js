import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { DocumentProvider } from "./src/context/DocumentContext";
import { SettingsProvider } from "./src/context/SettingsContext";
import LandingScreen from "./src/screens/LandingScreen";
import ImportScreen from "./src/screens/ImportScreen";
import ProcessingScreen from "./src/screens/ProcessingScreen";
import ReaderScreen from "./src/screens/ReaderScreen";
import DoneScreen from "./src/screens/DoneScreen";
import PreviousFilesScreen from "./src/screens/PreviousFilesScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SettingsProvider>
      <DocumentProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen
              name="Landing"
              component={LandingScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Import"
              component={ImportScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Processing"
              component={ProcessingScreen}
              options={{ headerTitle: "Processing" }}
            />
            <Stack.Screen
              name="Reader"
              component={ReaderScreen}
              options={{ headerTitle: "Reader" }}
            />
            <Stack.Screen
              name="Done"
              component={DoneScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="PreviousFiles"
              component={PreviousFilesScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ headerShown: false }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </DocumentProvider>
    </SettingsProvider>
  );
}

