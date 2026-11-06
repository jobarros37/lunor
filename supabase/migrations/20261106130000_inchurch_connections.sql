-- Conexão da API inChurch por igreja (fase 1: exclusivamente leitura).
-- Segredos são cifrados em AES-256-GCM pela aplicação antes de gravar.
-- Somente o backend com service_role acessa esta tabela; nenhuma política RLS
-- permite que credenciais sejam lidas no navegador, nem por admins da igreja.

create table if not exists public.inchurch_connections (
  church_id uuid primary key references public.churches(id) on delete cascade,
  api_key_ciphertext text not null,
  api_secret_ciphertext text not null,
  status text not null default 'connected'
    check (status in ('connected', 'error')),
  last_checked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inchurch_key_ciphertext_length
    check (char_length(api_key_ciphertext) between 20 and 8000),
  constraint inchurch_secret_ciphertext_length
    check (char_length(api_secret_ciphertext) between 20 and 8000)
);

drop trigger if exists inchurch_connections_updated_at on public.inchurch_connections;
create trigger inchurch_connections_updated_at
  before update on public.inchurch_connections
  for each row execute function public.set_updated_at();

alter table public.inchurch_connections enable row level security;
revoke all on public.inchurch_connections from anon, authenticated;
grant all on public.inchurch_connections to service_role;

comment on table public.inchurch_connections is
  'Credenciais cifradas inChurch por igreja. Acessível somente ao backend service_role.';
