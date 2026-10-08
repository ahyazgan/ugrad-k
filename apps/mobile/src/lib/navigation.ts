import { Linking, Platform } from "react-native";

/** Telefonun harita uygulamasında yol tarifi açar. */
export function openDirections(lat: number, lng: number, label: string) {
  const q = encodeURIComponent(label);
  const url =
    Platform.OS === "ios"
      ? `http://maps.apple.com/?daddr=${lat},${lng}&q=${q}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  return Linking.openURL(url);
}

export const callPhone = (phone: string) => Linking.openURL(`tel:${phone.replace(/\s/g, "")}`);
