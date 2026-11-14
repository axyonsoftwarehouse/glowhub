import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "glowhub.session.token";
const CLIENT_TOKEN_KEY = "glowhub.client.token";

function webStorage() {
  if (typeof globalThis.localStorage === "undefined") return null;
  return globalThis.localStorage;
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return webStorage()?.getItem(TOKEN_KEY) ?? null;
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    webStorage()?.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") {
    webStorage()?.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getClientToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return webStorage()?.getItem(CLIENT_TOKEN_KEY) ?? null;
  }
  return SecureStore.getItemAsync(CLIENT_TOKEN_KEY);
}

export async function setClientToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    webStorage()?.setItem(CLIENT_TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(CLIENT_TOKEN_KEY, token);
}

export async function clearClientToken(): Promise<void> {
  if (Platform.OS === "web") {
    webStorage()?.removeItem(CLIENT_TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(CLIENT_TOKEN_KEY);
}
