-- Esteira de Repertório: cole tudo no Supabase > SQL Editor > Run.
-- Todas as tabelas têm o prefixo esteira_ para conviver com outros projetos no mesmo banco.

create sequence if not exists esteira_criativo_numero_seq;

create or replace function esteira_proximo_numero() returns bigint
language sql as $$ select nextval('esteira_criativo_numero_seq') $$;

create table if not exists esteira_usuarios (
  id text primary key,
  nome text not null,
  pin text not null,
  papel text not null default 'operador' check (papel in ('operador', 'admin'))
);

create table if not exists esteira_criativos (
  id text primary key,
  numero bigint unique not null,
  data date not null,
  criado_em timestamptz not null default now(),
  operador text not null references esteira_usuarios(id),
  operador_nome text not null,
  nicho text not null,
  faixa text not null check (faixa in ('Core', 'Adjacente', 'Aleatório')),
  anunciante text,
  link_biblioteca text unique not null,
  formato text not null,
  hook_visual text not null,
  retencao text not null,
  impressoes text,
  ficha jsonb not null,
  video jsonb
);
create index if not exists esteira_criativos_data_idx on esteira_criativos (data);

create table if not exists esteira_listas (
  tipo text not null check (tipo in ('nicho', 'formato')),
  valor text not null,
  criado_em timestamptz not null default now(),
  primary key (tipo, valor)
);

create table if not exists esteira_config (
  chave text primary key,
  valor jsonb
);

-- Segurança: ninguém acessa pelo navegador; só a função da Netlify (com a service role key).
alter table esteira_usuarios enable row level security;
alter table esteira_criativos enable row level security;
alter table esteira_listas enable row level security;
alter table esteira_config enable row level security;

insert into esteira_usuarios (id, nome, pin, papel) values
  ('joao', 'João Guerra', '1111', 'operador'),
  ('jeff', 'Jeff Figueredo', '2222', 'operador'),
  ('kaian', 'Kaian', '0000', 'admin')
on conflict (id) do nothing;

insert into esteira_listas (tipo, valor) values
  ('nicho', 'Psicologia / Terapia'), ('nicho', 'Espiritualidade / Holístico'), ('nicho', 'Relacionamento'),
  ('nicho', 'Desenvolvimento pessoal'), ('nicho', 'Saúde / Emagrecimento'), ('nicho', 'Renda extra'), ('nicho', 'Outro')
on conflict do nothing;

insert into esteira_config (chave, valor) values
  ('metaDiaria', '20'), ('horarioLimite', '"16:00"'), ('fuso', '"America/Sao_Paulo"'), ('modelo', '"claude-sonnet-5-5"')
on conflict (chave) do nothing;

-- ============================================================ Ofertas (Mineração e Modelagem)
-- Uma ficha por oferta (OF-0001). A mesma ficha nasce na caixa e segue até a manutenção.

create sequence if not exists esteira_oferta_numero_seq;

create or replace function esteira_proxima_oferta() returns bigint
language sql as $$ select nextval('esteira_oferta_numero_seq') $$;

create table if not exists esteira_ofertas (
  id text primary key,
  numero bigint unique not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por text references esteira_usuarios(id),
  criado_por_nome text,
  frase text not null,
  notas text,
  origem text not null,
  link text,
  mae_link text,
  mae_id text,
  nicho text,
  ticket numeric,
  anunciantes int,
  classe text check (classe in ('A', 'B', 'C', 'D')),
  score int,
  status text not null default 'caixa',
  monitorar_ate date,
  motivo_descarte text,
  teimosia boolean not null default false,
  trilha text check (trilha in ('oferta_nova', 'mecanismo', 'lateralizacao')),
  idioma text,
  cacador jsonb,
  etapas jsonb not null default '{}'::jsonb,
  checklist jsonb not null default '{}'::jsonb,
  teste jsonb,
  funil jsonb,
  escalou text check (escalou in ('sim', 'nao')),
  historico jsonb not null default '[]'::jsonb
);
create index if not exists esteira_ofertas_status_idx on esteira_ofertas (status);
create unique index if not exists esteira_ofertas_cacador_idx on esteira_ofertas ((cacador->>'chave')) where cacador is not null;

alter table esteira_ofertas enable row level security;
