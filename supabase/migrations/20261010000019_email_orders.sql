-- E-postayla sipariş: asistan için "email" kanalı ve e-postadan müşteri bulma
alter type public.assistant_channel add value if not exists 'email';

create index if not exists profiles_email_lower_idx on public.profiles (lower(email)) where email is not null and deleted_at is null;
