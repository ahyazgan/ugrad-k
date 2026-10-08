-- Telefonda sözlü alınan KVKK onaylarında onayı kaydeden yönetici
alter table public.consents add column recorded_by uuid references public.profiles (id) on delete set null;
