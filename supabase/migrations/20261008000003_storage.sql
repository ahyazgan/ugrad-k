-- Teslim kanıtları (fotoğraf + imza). Özel bucket; dosya yolu: <order_id>/<dosya>
insert into storage.buckets (id, name, public)
values ('pod', 'pod', false)
on conflict (id) do nothing;

create policy pod_courier_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'pod'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and o.courier_id = auth.uid()
        and o.status in ('kuryeye_atandi', 'alindi', 'yolda', 'sorunlu')
    )
  );

create policy pod_read on storage.objects
  for select to authenticated using (
    bucket_id = 'pod'
    and (
      public.is_admin() or exists (
        select 1 from public.orders o
        where o.id::text = (storage.foldername(name))[1]
          and (o.customer_id = auth.uid() or o.courier_id = auth.uid())
      )
    )
  );
