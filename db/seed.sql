-- GlowHub - Dados de exemplo (tenant + filiais)
-- Aplique depois de criar o schema (drizzle-kit push) e o db/rls.sql.

insert into public.tenants (slug, name, logo_url)
values ('demo', 'GlowHub Demo', null)
on conflict (slug) do nothing;

insert into public.branches (tenant_id, slug, name, address, timezone)
select t.id, 'centro', 'Unidade Centro', 'Rua Exemplo, 100 - Centro', 'America/Sao_Paulo'
from public.tenants t
where t.slug = 'demo'
on conflict (tenant_id, slug) do nothing;

insert into public.branches (tenant_id, slug, name, address, timezone)
select t.id, 'zona-sul', 'Unidade Zona Sul', 'Av. Exemplo, 500 - Zona Sul', 'America/Sao_Paulo'
from public.tenants t
where t.slug = 'demo'
on conflict (tenant_id, slug) do nothing;

-- Vincular um usuario (criado via Better Auth) como owner do tenant demo:
-- insert into public.memberships (tenant_id, user_id, role)
-- select t.id, u.id, 'owner'
-- from public.tenants t, public."user" u
-- where t.slug = 'demo' and u.email = 'voce@exemplo.com'
-- on conflict (tenant_id, user_id) do update set role = 'owner';
