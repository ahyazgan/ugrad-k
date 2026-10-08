import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { api } from "./api";

/**
 * iyzico ödeme sayfasını uygulama içi tarayıcıda açar. Ödeme sonucu sunucuda
 * (payment-callback) doğrulanır; burada yalnızca sayfa kapanana kadar beklenir.
 */
export async function payOrder(orderId: string) {
  const r = await api.startPayment(orderId);
  if (!r) return; // demo: anında ödendi
  await WebBrowser.openAuthSessionAsync(r.paymentPageUrl, Linking.createURL("odeme"));
}
