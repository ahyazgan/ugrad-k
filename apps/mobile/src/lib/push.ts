/**
 * Push bildirim kaydı: izin istenir, Expo push token alınıp profile kaydedilir.
 * EAS projectId (app.json → extra.eas.projectId) yoksa veya cihaz emülatörse sessizce atlanır;
 * bu durumda bildirimler SMS ile gider.
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return null;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Sipariş bildirimleri",
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return null;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.savePushToken(token);
    return token;
  } catch (e) {
    console.warn("Push kaydı yapılamadı", e);
    return null;
  }
}
