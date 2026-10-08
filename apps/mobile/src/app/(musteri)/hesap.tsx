import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Share } from "react-native";
import { DeleteAccount } from "@/components/DeleteAccount";
import { Button, Card, ErrorBox, Field, Muted, Screen, Title } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { COMPANY } from "@/lib/kvkk";
import { useSession } from "@/lib/session";

export default function Hesap() {
  const { profile } = useSession();
  // Profil yüklendiğinde form başlangıç değerleriyle yeniden kurulur
  return <HesapForm key={profile ? `${profile.id}-${profile.fullName}-${profile.email}` : "yok"} />;
}

function HesapForm() {
  const { profile, refresh } = useSession();
  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [referral, setReferral] = useState<string | null>(null);
  useEffect(() => {
    if (!profile?.corporateAccountId) api.myReferralCode().then(setReferral, () => undefined);
  }, [profile?.corporateAccountId]);

  async function save() {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      await api.updateProfile({ fullName: fullName.trim(), email: email.trim() || undefined });
      await refresh();
      setMsg("Kaydedildi");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Title>Bilgilerim</Title>
        <Muted>{profile?.phone}</Muted>
        <Field label="Ad Soyad" value={fullName} onChangeText={setFullName} />
        <Field label="E-posta (fatura ve e-postayla sipariş için)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <ErrorBox message={error} />
        {msg ? <Muted>{msg}</Muted> : null}
        <Button title="Kaydet" onPress={save} loading={saving} />
      </Card>
      {referral ? (
        <Card>
          <Title>Davet kodunuz: {referral}</Title>
          <Muted>
            Arkadaşınız ilk siparişinde bu kodu girerse indirim kazanır; gönderisi teslim edilince size de kredi tanımlanır ve sonraki
            siparişinizden düşülür.
          </Muted>
          <Button
            title="Davet kodunu paylaş"
            variant="secondary"
            testID="share-referral"
            onPress={() => Share.share({ message: `Kurye gönderilerinde ilk siparişine indirim: davet kodum ${referral}` })}
          />
        </Card>
      ) : null}
      {profile?.corporateAccountId ? (
        <Card>
          <Title>Kurumsal hesap</Title>
          <Muted>Ayda 20+ teslimatta %15, 50+ teslimatta %25 indirim ay sonu faturanıza yansır.</Muted>
        </Card>
      ) : (
        <Card>
          <Title>Kurumsal müşteri misiniz?</Title>
          <Muted>Aylık tek fatura ve hacim indirimi için bizimle iletişime geçin.</Muted>
        </Card>
      )}
      <Button
        title="Çıkış yap"
        variant="secondary"
        onPress={async () => {
          await api.signOut();
          router.replace("/giris");
        }}
      />
      <DeleteAccount />
      <Muted style={{ textAlign: "center", fontSize: 12 }}>
        {COMPANY.title}
        {"\n"}
        {COMPANY.address}
      </Muted>
    </Screen>
  );
}
