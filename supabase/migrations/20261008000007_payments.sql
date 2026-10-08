-- Online kart ödemesi (iyzico Checkout Form) alanları
alter type public.payment_status add value if not exists 'iade_bekliyor';

alter table public.orders
  add column payment_token text,
  add column paid_kurus integer check (paid_kurus >= 0),
  add column paid_at timestamptz,
  add column payment_error text;

create index orders_payment_token_idx on public.orders (payment_token) where payment_token is not null;
