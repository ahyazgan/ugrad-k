import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { api } from "./api";

/**
 * iyzico ödeme sayfasını uygulama içi tarayıcıda açar. Ödeme sonucu sunucuda
 * (payment-callback) doğrulanır; burada yalnızca sayfa kapanana kadar beklenir.
 */
export async function payOrder(orderId: string) {
  const redirect = Linking.createURL("odeme");
  // Tarayıcıdan siparişte iyzico, ödeme sonrası bu web adresine döner (uygulama şeması tarayıcıda açılmaz)
  const r = await api.startPayment(orderId, Platform.OS === "web" ? redirect : undefined);
  if (!r) return; // demo: anında ödendi
  await WebBrowser.openAuthSessionAsync(r.paymentPageUrl, redirect);
}
