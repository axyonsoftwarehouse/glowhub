import { useEffect } from "react";
import { Platform } from "react-native";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "@/theme";

function useNotificationObserver() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    let subscription: { remove: () => void } | undefined;
    let active = true;

    import("expo-notifications")
      .then((Notifications) => {
        if (!active) return;
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });

        const redirect = (notification: {
          request: { content: { data?: Record<string, unknown> } };
        }) => {
          const url = notification.request.content.data?.url;
          if (typeof url === "string" && url.startsWith("/")) {
            router.push(url as never);
          }
        };

        const last = Notifications.getLastNotificationResponse();
        if (last?.notification) redirect(last.notification);

        subscription =
          Notifications.addNotificationResponseReceivedListener((response) => {
            redirect(response.notification);
          });
      })
      .catch(() => undefined);

    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);
}

export default function RootLayout() {
  useNotificationObserver();

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </SafeAreaProvider>
  );
}
