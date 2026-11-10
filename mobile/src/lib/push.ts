import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { registerPushToken } from "@/lib/api";

export type PushStatus =
  | "ok"
  | "denied"
  | "unsupported"
  | "missing_project"
  | "error";

function projectId(): string | null {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    null
  );
}

/**
 * Pede permissão e registra o token Expo Push no usuário/tenant ativo.
 * Web, emulador sem Google Play e builds sem projectId EAS são tratados como
 * indisponíveis — o app continua funcionando sem push.
 */
export async function enablePush(token: string): Promise<PushStatus> {
  if (Platform.OS === "web" || !Device.isDevice) return "unsupported";

  try {
    const Notifications = await import("expo-notifications");

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Agenda",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#A21CAF",
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return "denied";

    const id = projectId();
    if (!id) return "missing_project";

    const pushToken = await Notifications.getExpoPushTokenAsync({
      projectId: id,
    });
    await registerPushToken(
      token,
      pushToken.data,
      Platform.OS === "ios" || Platform.OS === "android"
        ? Platform.OS
        : "unknown",
    );
    return "ok";
  } catch {
    return "error";
  }
}
