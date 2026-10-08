-- Yapay zeka asistanı (WhatsApp botu / sesli asistan) konuşmaları.
-- messages: Claude Messages API geçmişi, YALNIZCA SONUNA EKLENİR (düşünme bloklarının
-- geçerli kalması için geçmiş asla düzenlenmez). Uzayan veya 6 saat sessiz kalan
-- konuşma kapatılır ve yenisi açılır.

create type public.assistant_channel as enum ('whatsapp', 'voice', 'app');
create type public.conversation_status as enum ('active', 'closed', 'handoff');

create table public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  channel public.assistant_channel not null,
  external_id text not null, -- WhatsApp numarası / arama kimliği
  profile_id uuid references public.profiles (id) on delete set null,
  status public.conversation_status not null default 'active',
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  handoff_reason text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index assistant_conversations_lookup on public.assistant_conversations (channel, external_id, last_message_at desc);
create index assistant_conversations_handoff on public.assistant_conversations (status) where status = 'handoff';

-- WhatsApp aynı mesajı tekrar gönderebilir; işlenenler kaydedilir
create table public.assistant_inbound (
  message_id text primary key,
  received_at timestamptz not null default now()
);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_inbound enable row level security;
create policy assistant_conversations_admin on public.assistant_conversations
  for all using (public.is_admin()) with check (public.is_admin());

-- Konuşmayı kilitle (aynı müşteriden ardışık mesajlar sırayla işlenir)
create or replace function public.lock_conversation(p_id uuid)
returns boolean language sql security definer set search_path = public as $$
  with u as (
    update public.assistant_conversations
       set locked_at = now()
     where id = p_id and (locked_at is null or locked_at < now() - interval '2 minutes')
    returning 1
  )
  select exists (select 1 from u);
$$;

-- Yeni mesajları geçmişin SONUNA ekler (düzenleme yok) ve kilidi bırakır
create or replace function public.append_conversation(p_id uuid, p_messages jsonb, p_status public.conversation_status default null, p_handoff_reason text default null)
returns void language sql security definer set search_path = public as $$
  update public.assistant_conversations
     set messages = messages || p_messages,
         last_message_at = now(),
         locked_at = null,
         status = coalesce(p_status, status),
         handoff_reason = coalesce(p_handoff_reason, handoff_reason)
   where id = p_id;
$$;

revoke execute on function public.lock_conversation from public, anon, authenticated;
revoke execute on function public.append_conversation from public, anon, authenticated;
grant execute on function public.lock_conversation to service_role;
grant execute on function public.append_conversation to service_role;
