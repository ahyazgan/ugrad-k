/**
 * Kurye konum paylaşımı — yalnızca vardiya açıkken (KVKK: amaçla sınırlı işleme).
 * Arka plan izni verilirse uygulama kapalıyken de (Android'de bildirimli ön plan
 * servisiyle) konum gönderilir; verilmezse yalnızca uygulama açıkken gönderilir.
 * Arka plan konumu Expo Go'da çalışmaz; development/production build gerekir.
 */
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { BRAND } from "@yazgan/shared";
import { api } from "./api";

export const LOCATION_TASK = "yazgan-kurye-konum";
const INTERVAL_MS = 30_000;
const DISTANCE_M = 50;

/** Konumun bağlanacağı aktif iş (yolda/alındı olan) */
let activeOrderId: string | null = null;
export const setActiveOrderForLocation = (id: string | null) => {
  activeOrderId = id;
};

async function send(loc: Location.LocationObject) {
  try {
    await api.pushLocation(
      {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
        heading: loc.coords.heading,
        speed: loc.coords.speed,
      },
      activeOrderId,
    );
  } catch (e) {
    console.warn("Konum gönderilemedi", e);
  }
}

// Görev tanımı modül yüklenirken yapılmalı (uygulama kökünden import edilir)
if (Platform.OS !== "web" && !TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    await send(data.locations[data.locations.length - 1]!);
  });
}

let foregroundSub: Location.LocationSubscription | null = null;

export type TrackingMode = "background" | "foreground" | "off";

export async function startTracking(): Promise<{ mode: TrackingMode; message?: string }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    return { mode: "off", message: "Konum izni verilmedi. Vardiya için konum paylaşımı gereklidir." };
  }

  if (Platform.OS !== "web") {
    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status === "granted") {
        if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: INTERVAL_MS,
            distanceInterval: DISTANCE_M,
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: `${BRAND.name} — vardiya açık`,
              notificationBody: "Konumunuz yalnızca vardiya süresince paylaşılıyor.",
              notificationColor: "#0F3D6E",
            },
          });
        }
        return { mode: "background" };
      }
    } catch (e) {
      console.warn("Arka plan konumu başlatılamadı, ön plana düşülüyor", e);
    }
  }

  foregroundSub?.remove();
  foregroundSub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: INTERVAL_MS, distanceInterval: DISTANCE_M },
    send,
  );
  return {
    mode: "foreground",
    message: "Konum yalnızca uygulama açıkken paylaşılıyor. Arka plan izni için ayarlardan 'Her zaman' seçin.",
  };
}

export async function stopTracking() {
  foregroundSub?.remove();
  foregroundSub = null;
  if (Platform.OS !== "web") {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      }
    } catch {
      // görev hiç başlamadıysa
    }
  }
}

/** Vardiya başlangıç/bitiş noktası için tek seferlik konum (alınamazsa null) */
export async function currentPosition() {
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null };
  } catch {
    return null;
  }
}

/** İzin istemeden son bilinen konum (vardiyada izin zaten verilmiştir); yoksa null */
export async function lastKnownPosition() {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;
    const p = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    return p ? { lat: p.coords.latitude, lng: p.coords.longitude } : null;
  } catch {
    return null;
  }
}
