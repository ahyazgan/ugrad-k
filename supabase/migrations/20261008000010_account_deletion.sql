-- Hesap silme (App Store 5.1.1(v) ve Google Play gereği; KVKK m.7 silme hakkı).
-- Siparişler ve faturalar vergi mevzuatı gereği saklanır; profil ve kişisel veriler
-- anonimleştirilir, kimlik doğrulama kaydı account-delete fonksiyonunda soft-delete edilir.

alter table public.profiles add column deleted_at timestamptz;

create or replace function public.anonymize_profile(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.orders
     where (customer_id = p_id or courier_id = p_id)
       and status in ('beklemede', 'onaylandi', 'kuryeye_atandi', 'alindi', 'yolda', 'sorunlu')
  ) then
    raise exception 'Devam eden siparişiniz varken hesap silinemez' using errcode = '22023';
  end if;

  update public.profiles
     set full_name = null, phone = null, email = null, push_token = null, deleted_at = now()
   where id = p_id;
  delete from public.addresses where profile_id = p_id;
  update public.couriers set active = false, is_on_shift = false, last_lat = null, last_lng = null where id = p_id;
  -- Konum geçmişi silinir; vardiya kayıtları (BTK yükümlülüğü) saklanır
  delete from public.courier_locations where courier_id = p_id;
  update public.assistant_conversations set messages = '[]'::jsonb, status = 'closed', external_id = 'silindi'
   where profile_id = p_id;
  -- Geçmiş siparişlerdeki alıcı/gönderici iletişim bilgileri korunur (fatura ve uyuşmazlık için),
  -- ancak bu kişiye ait takip bağlantıları geçersiz kılınır
  update public.orders set tracking_token = encode(gen_random_bytes(16), 'hex') where customer_id = p_id;
end $$;

revoke execute on function public.anonymize_profile from public, anon, authenticated;
grant execute on function public.anonymize_profile to service_role;
