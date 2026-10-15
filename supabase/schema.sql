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

-- Dias que o anúncio estava ativo na Biblioteca quando entrou no Swipe (mostra se o criativo é validado).
alter table esteira_criativos add column if not exists dias_ativos int;

-- ================================================================ App Testes (A/B de páginas)
create sequence if not exists esteira_teste_numero_seq;
create or replace function esteira_proximo_teste() returns bigint language sql as $$ select nextval('esteira_teste_numero_seq') $$;

create table if not exists esteira_testes (
  id text primary key,
  numero bigint,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por text,
  nome text not null,
  oferta_id text,
  host text not null,
  status text not null default 'rascunho',      -- rascunho, ativo, pausado, encerrado
  variantes jsonb not null default '[]',         -- [{id:'a', nome, arquivo:'/', peso:50}]
  inicio timestamptz,
  fim timestamptz,
  vencedora text,
  gasto jsonb,                                   -- {total, em, por}
  produtos jsonb not null default '[]',          -- IDs de produto da Lastlink aprendidos nas vendas
  notas text,
  historico jsonb not null default '[]'
);
create index if not exists esteira_testes_host on esteira_testes (host, status);

-- Visitas únicas e cliques no checkout, por dia e página.
create table if not exists esteira_testes_contagem (
  teste_id text not null,
  dia date not null,
  variante text not null,
  visitas int not null default 0,
  ics int not null default 0,
  primary key (teste_id, dia, variante)
);
create or replace function esteira_teste_contar(p_teste text, p_variante text, p_tipo text) returns void language sql as $$
  insert into esteira_testes_contagem (teste_id, dia, variante, visitas, ics)
  values (p_teste, (now() at time zone 'America/Sao_Paulo')::date, p_variante,
          case when p_tipo = 'visita' then 1 else 0 end, case when p_tipo = 'ic' then 1 else 0 end)
  on conflict (teste_id, dia, variante) do update
    set visitas = esteira_testes_contagem.visitas + excluded.visitas,
        ics = esteira_testes_contagem.ics + excluded.ics
$$;

-- ID do visitante da Stape (cookie "index", que vai no sck) ligado à página que ele viu.
create table if not exists esteira_testes_visitantes (
  teste_id text not null,
  visitante text not null,
  variante text not null,
  criado_em timestamptz not null default now(),
  primary key (teste_id, visitante)
);
create index if not exists esteira_testes_visitantes_v on esteira_testes_visitantes (visitante);

-- Vendas da Lastlink (sem dados do comprador).
create table if not exists esteira_testes_vendas (
  id text primary key,                           -- PaymentId da Lastlink
  teste_id text,
  variante text,
  via text,                                      -- vtid ou sck
  evento text,
  valor numeric,
  produto_id text,
  produto text,
  oferta_lastlink text,
  upsell boolean not null default false,
  reembolso boolean not null default false,
  is_test boolean not null default false,
  utm_content text,
  pago_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists esteira_testes_vendas_t on esteira_testes_vendas (teste_id);

-- Registro de cada envio do webhook, para conferir que está chegando.
create table if not exists esteira_testes_webhooks (
  id bigserial primary key,
  recebido_em timestamptz not null default now(),
  evento text, is_test boolean, pagamento text, teste_id text, variante text, via text,
  vtid text, tem_sck boolean, valor numeric, produto text, resultado text
);

alter table esteira_testes enable row level security;
alter table esteira_testes_contagem enable row level security;
alter table esteira_testes_visitantes enable row level security;
alter table esteira_testes_vendas enable row level security;
alter table esteira_testes_webhooks enable row level security;
