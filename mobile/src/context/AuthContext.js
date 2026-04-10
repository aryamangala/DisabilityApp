import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import {
  CognitoUser,
  CognitoUserPool,
  CognitoUserAttribute,
  AuthenticationDetails,
  CognitoRefreshToken,
} from "amazon-cognito-identity-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

// expo-secure-store only works on native; fall back to AsyncStorage on web
let SecureStore = null;
if (Platform.OS !== "web") {
  SecureStore = require("expo-secure-store");
}

const USER_POOL_ID = process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID;

const userPool = new CognitoUserPool({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
});

const SECURE_KEY_ACCESS = "cognito_access_token";
const SECURE_KEY_REFRESH = "cognito_refresh_token";
const SECURE_KEY_EMAIL = "cognito_email";

// Storage abstraction: SecureStore on native, AsyncStorage on web
const storage = {
  async set(key, value) {
    if (SecureStore) {
      await SecureStore.setItemAsync(key, value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  },
  async get(key) {
    if (SecureStore) {
      return await SecureStore.getItemAsync(key);
    } else {
      return await AsyncStorage.getItem(key);
    }
  },
  async remove(key) {
    if (SecureStore) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  },
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [restoring, setRestoring] = useState(true);

  async function _clearStorage() {
    await Promise.allSettled([
      storage.remove(SECURE_KEY_ACCESS),
      storage.remove(SECURE_KEY_REFRESH),
      storage.remove(SECURE_KEY_EMAIL),
    ]);
  }

  // Restore session on app launch
  useEffect(() => {
    (async () => {
      try {
        const storedEmail = await storage.get(SECURE_KEY_EMAIL);
        const storedRefresh = await storage.get(SECURE_KEY_REFRESH);

        if (storedEmail && storedRefresh) {
          const cognitoUser = new CognitoUser({ Username: storedEmail, Pool: userPool });
          const refreshToken = new CognitoRefreshToken({ RefreshToken: storedRefresh });

          await new Promise((resolve, reject) => {
            cognitoUser.refreshSession(refreshToken, async (err, session) => {
              if (err) {
                reject(err);
              } else {
                const newAccess = session.getAccessToken().getJwtToken();
                setUser(cognitoUser);
                setAccessToken(newAccess);
                await storage.set(SECURE_KEY_ACCESS, newAccess).catch(() => {});
                resolve();
              }
            });
          });
        }
      } catch {
        await _clearStorage();
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  const signIn = useCallback((email, password) => {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      const authDetails = new AuthenticationDetails({ Username: email, Password: password });

      cognitoUser.authenticateUser(authDetails, {
        onSuccess: async (session) => {
          const access = session.getAccessToken().getJwtToken();
          const refresh = session.getRefreshToken().getToken();
          await Promise.all([
            storage.set(SECURE_KEY_ACCESS, access),
            storage.set(SECURE_KEY_REFRESH, refresh),
            storage.set(SECURE_KEY_EMAIL, email),
          ]);
          setUser(cognitoUser);
          setAccessToken(access);
          resolve(session);
        },
        onFailure: (err) => reject(err),
      });
    });
  }, []);

  const signUp = useCallback((email, password) => {
    return new Promise((resolve, reject) => {
      const attributes = [
        new CognitoUserAttribute({ Name: "email", Value: email }),
      ];
      userPool.signUp(email, password, attributes, null, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }, []);

  const confirmSignUp = useCallback((email, code) => {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      cognitoUser.confirmRegistration(code, true, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }, []);

  const forgotPassword = useCallback((email) => {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      cognitoUser.forgotPassword({
        onSuccess: resolve,
        onFailure: reject,
      });
    });
  }, []);

  const confirmForgotPassword = useCallback((email, code, newPassword) => {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      cognitoUser.confirmPassword(code, newPassword, {
        onSuccess: resolve,
        onFailure: reject,
      });
    });
  }, []);

  const getValidToken = useCallback(async () => {
    if (!user) return null;
    return new Promise((resolve, reject) => {
      user.getSession(async (err, session) => {
        if (err) {
          await _clearStorage();
          setUser(null);
          setAccessToken(null);
          reject(err);
          return;
        }
        const token = session.getAccessToken().getJwtToken();
        setAccessToken(token);
        await storage.set(SECURE_KEY_ACCESS, token).catch(() => {});
        resolve(token);
      });
    });
  }, [user]);

  const signOut = useCallback(async () => {
    if (user) user.signOut();
    await _clearStorage();
    setUser(null);
    setAccessToken(null);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user,
        restoring,
        signIn,
        signUp,
        confirmSignUp,
        forgotPassword,
        confirmForgotPassword,
        getValidToken,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
