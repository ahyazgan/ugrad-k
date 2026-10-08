-- Asistan konuşma tablosu: kilit ve yalnızca sona ekleme
insert into public.assistant_conversations (id, channel, external_id, messages)
values ('30000000-0000-0000-0000-000000000001', 'whatsapp', '905321112233', '[{"role":"user","content":"merhaba"}]');

do $$ begin
  if not public.lock_conversation('30000000-0000-0000-0000-000000000001') then raise exception 'kilit alınmalı'; end if;
  if public.lock_conversation('30000000-0000-0000-0000-000000000001') then raise exception 'ikinci kilit alınmamalı'; end if;
end $$;

select public.append_conversation('30000000-0000-0000-0000-000000000001',
  '[{"role":"assistant","content":[{"type":"text","text":"Merhaba!"}]}]'::jsonb);

do $$
declare m jsonb;
begin
  select messages into m from public.assistant_conversations where id = '30000000-0000-0000-0000-000000000001';
  if jsonb_array_length(m) <> 2 then raise exception 'mesaj sona eklenmeli: %', m; end if;
  if m -> 0 ->> 'content' <> 'merhaba' then raise exception 'eski mesaj değişmemeli'; end if;
  if not public.lock_conversation('30000000-0000-0000-0000-000000000001') then raise exception 'ekleme kilidi bırakmalı'; end if;
end $$;

set role authenticated;
do $$ begin
  perform public.append_conversation('30000000-0000-0000-0000-000000000001', '[]'::jsonb);
  raise exception 'BEKLENMEDİ: kullanıcı konuşmaya yazdı';
exception when insufficient_privilege then null;
end $$;
reset role;
\echo '  40_assistant.test.sql: tüm kontroller geçti'
