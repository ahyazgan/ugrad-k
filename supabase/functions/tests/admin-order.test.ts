import { assert, assertEquals } from "jsr:@std/assert@1";
import { MOCK_PLACES } from "../../../packages/shared/index.ts";
import { handleAdminOrder } from "../_shared/admin-order.ts";
import { handler } from "../_shared/http.ts";
import { fakeCtx } from "./fake.ts";

// deno-lint-ignore no-explicit-any
type Json = any;
const place = (id: string) => MOCK_PLACES.find((p) => p.placeId === id)!;
const post = (body: unknown) =>
  new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { Authorization: "Bearer t" } });
const order = { pickup: place("mock-beykoz"), dropoff: place("mock-kadikoy"), paymentMethod: "nakit", packageDescription: "Evrak" };

function setup(extra: Record<string, Json[]> = {}) {
  const tables: Record<string, Json[]> = {
    profiles: [{ id: "admin1", role: "admin" }],
    current_consents: [],
    orders: [],
    ...extra,
  };
  const f = fakeCtx({ userId: "admin1", tables });
  const created: Json[] = [];
  (f.ctx.admin as Json).auth = {
    admin: {
      createUser: (args: Json) => {
        created.push(args);
        // Gerçekte handle_new_user tetikleyicisi profili oluşturur
        tables.profiles.push({ id: "newcust", role: "musteri", phone: args.phone, full_name: args.user_metadata?.full_name ?? null, corporate_account_id: null });
        return Promise.resolve({ data: { user: { id: "newcust" } }, error: null });
      },
    },
  };
  return { ...f, tables, created };
}

Deno.test("admin-order: yönetici olmayan 403", async () => {
  const { ctx } = fakeCtx({ userId: "u1", tables: { profiles: [{ id: "u1", role: "musteri" }] } });
  const res = await handler((r) => handleAdminOrder(r, ctx))(post({ action: "lookup", phone: "05321112233" }));
  assertEquals(res.status, 403);
});

Deno.test("admin-order: kayıtlı müşteri ve son adresleri", async () => {
  const { ctx } = setup({
    profiles: [
      { id: "admin1", role: "admin" },
      { id: "c1", role: "musteri", phone: "905321112233", full_name: "Ayşe", email: null, corporate_account_id: null, deleted_at: null },
    ],
    current_consents: [
      { profile_id: "c1", consent_type: "kvkk_aydinlatma", granted: true },
      { profile_id: "c1", consent_type: "acik_riza_konum", granted: true },
    ],
    orders: [
      { customer_id: "c1", pickup_address: "Beykoz", pickup_details: "Kat 2", pickup_lat: 41.1, pickup_lng: 29.1, dropoff_address: "Levent", dropoff_lat: 41.08, dropoff_lng: 29.01 },
      { customer_id: "c1", pickup_address: "Beykoz", pickup_lat: 41.1, pickup_lng: 29.1, dropoff_address: "Kadıköy", dropoff_lat: 40.99, dropoff_lng: 29.03 },
    ],
  });
  const data = await (await handler((r) => handleAdminOrder(r, ctx))(post({ action: "lookup", phone: "0532 111 22 33" }))).json();
  assertEquals(data.customer.fullName, "Ayşe");
  assertEquals(data.customer.hasConsent, true);
  assertEquals(data.customer.recentAddresses.map((a: Json) => a.address), ["Beykoz", "Levent", "Kadıköy"]);
});

Deno.test("admin-order: bilinmeyen numara null; geçersiz numara 400", async () => {
  const { ctx } = setup();
  const r1 = await (await handler((r) => handleAdminOrder(r, ctx))(post({ action: "lookup", phone: "05329998877" }))).json();
  assertEquals(r1.customer, null);
  const r2 = await handler((r) => handleAdminOrder(r, ctx))(post({ action: "lookup", phone: "0216 123 45 67" }));
  assertEquals(r2.status, 400);
});

Deno.test("admin-order: yeni müşteri — sözlü onay olmadan 400, onayla sipariş", async () => {
  const s1 = setup();
  const res1 = await handler((r) => handleAdminOrder(r, s1.ctx))(post({ action: "create", phone: "05329998877", fullName: "Yeni Müşteri", order }));
  assertEquals(res1.status, 400);
  assertEquals((await res1.json()).field, "verbalConsent");

  const s2 = setup();
  // Sözlü onay kaydedildikten sonra createOrderForCustomer rızayı görmeli
  const origInsert = s2.ctx.admin.from;
  (s2.ctx.admin as Json).from = (table: string) => {
    const q = origInsert(table);
    if (table === "consents") {
      const ins = q.insert;
      q.insert = (rows: Json[]) => {
        for (const r of rows) s2.tables.current_consents.push({ profile_id: r.profile_id, consent_type: r.consent_type, granted: true });
        return ins(rows);
      };
    }
    return q;
  };
  const res2 = await handler((r) => handleAdminOrder(r, s2.ctx))(
    post({ action: "create", phone: "05329998877", fullName: "Yeni Müşteri", verbalConsent: true, order }),
  );
  assertEquals(res2.status, 201);
  const data = await res2.json();
  assertEquals(data.isNewCustomer, true);
  assertEquals(s2.created[0].phone, "905329998877");
  assertEquals(s2.created[0].user_metadata.full_name, "Yeni Müşteri");
  const consents = s2.inserted.consents!;
  assertEquals(consents.length, 2);
  assertEquals(consents[0]!.recorded_by, "admin1");
  assert(String(consents[0]!.user_agent).includes("sözlü"));
  assertEquals(s2.inserted.orders![0]!.customer_id, "newcust");
});

Deno.test("admin-order: kartla ödeme ve kurye numarası reddedilir", async () => {
  const s = setup({ profiles: [{ id: "admin1", role: "admin" }, { id: "k1", role: "kurye", phone: "905551110001" }] });
  const card = await handler((r) => handleAdminOrder(r, s.ctx))(
    post({ action: "create", phone: "05321112233", verbalConsent: true, order: { ...order, paymentMethod: "kart" } }),
  );
  assertEquals(card.status, 400);
  const courier = await handler((r) => handleAdminOrder(r, s.ctx))(
    post({ action: "create", phone: "0555 111 00 01", verbalConsent: true, order }),
  );
  assertEquals(courier.status, 409);
});
