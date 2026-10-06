-- GlowHub - Funcoes, triggers, RLS e grants (Neon)
-- Aplique DEPOIS de criar as tabelas (drizzle-kit push).
-- O app usa a role `glowhub_app` (sem BYPASSRLS) e injeta
-- `request.jwt.claims` = {"sub": "<user id>"} por transacao.

create extension if not exists btree_gist;

-- =========================================================
-- updated_at
-- =========================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- Helpers de identidade / tenant (leem os claims da transacao)
-- =========================================================
create or replace function public.auth_uid()
returns text language sql stable as $$
  select nullif(
    (nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'sub',
    ''
  )
$$;

create or replace function public.current_tenant_id()
returns uuid language sql stable as $$
  select nullif(
    (nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'tenant_id',
    ''
  )::uuid
$$;

create or replace function public.is_tenant_member(target_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = target_tenant and m.user_id = public.auth_uid()
  )
$$;

create or replace function public.has_tenant_role(target_tenant uuid, allowed public.tenant_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.tenant_id = target_tenant
      and m.user_id = public.auth_uid()
      and m.role = any (allowed)
  )
$$;

-- =========================================================
-- Triggers de updated_at
-- =========================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants', 'branches', 'profiles', 'categories', 'services',
    'service_branches', 'professionals', 'products', 'product_variants',
    'clients', 'appointments'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;

-- =========================================================
-- RLS
-- =========================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'tenants', 'branches', 'memberships', 'invitations',
    'categories', 'services', 'service_branches',
    'professionals', 'professional_branches', 'professional_services',
    'products', 'product_variants',
    'branch_hours', 'professional_hours', 'branch_closures',
    'clients', 'appointments',
    'ledger_accounts', 'journal_entries', 'journal_lines', 'accounting_periods',
    'charges', 'charge_items', 'payments', 'earnings', 'payouts',
    'wallet_transactions',
    'packages', 'package_items', 'client_packages', 'package_redemptions',
    'subscription_plans', 'plan_items', 'client_subscriptions',
    'subscription_redemptions',
    'coupons', 'coupon_redemptions', 'notifications'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- tenants
drop policy if exists tenants_public_read on public.tenants;
create policy tenants_public_read on public.tenants
  for select using (is_active = true);
drop policy if exists tenants_member_update on public.tenants;
create policy tenants_member_update on public.tenants
  for update using (public.has_tenant_role(id, array['owner', 'admin']::public.tenant_role[]));

-- branches
drop policy if exists branches_member_read on public.branches;
create policy branches_member_read on public.branches
  for select using (public.is_tenant_member(tenant_id));
drop policy if exists branches_member_write on public.branches;
create policy branches_member_write on public.branches
  for all using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'manager']::public.tenant_role[]))
  with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'manager']::public.tenant_role[]));

-- memberships
drop policy if exists memberships_read on public.memberships;
create policy memberships_read on public.memberships
  for select using (
    user_id = public.auth_uid()
    or public.has_tenant_role(tenant_id, array['owner', 'admin', 'manager']::public.tenant_role[])
  );
drop policy if exists memberships_write on public.memberships;
create policy memberships_write on public.memberships
  for all using (public.has_tenant_role(tenant_id, array['owner', 'admin']::public.tenant_role[]))
  with check (public.has_tenant_role(tenant_id, array['owner', 'admin']::public.tenant_role[]));

-- invitations
drop policy if exists invitations_manage on public.invitations;
create policy invitations_manage on public.invitations
  for all using (public.has_tenant_role(tenant_id, array['owner', 'admin']::public.tenant_role[]))
  with check (public.has_tenant_role(tenant_id, array['owner', 'admin']::public.tenant_role[]));

-- profiles
drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles
  for select using (id = public.auth_uid());
drop policy if exists profiles_read_tenant_colleagues on public.profiles;
create policy profiles_read_tenant_colleagues on public.profiles
  for select using (
    exists (
      select 1 from public.memberships me
      join public.memberships other on other.tenant_id = me.tenant_id
      where me.user_id = public.auth_uid() and other.user_id = public.profiles.id
    )
  );
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = public.auth_uid()) with check (id = public.auth_uid());
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (id = public.auth_uid());

-- Tabelas geridas por owner/admin/manager (leitura por membros)
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories', 'services', 'service_branches',
    'professionals', 'professional_branches', 'professional_services',
    'products', 'product_variants',
    'branch_hours', 'professional_hours', 'branch_closures',
    'ledger_accounts', 'payouts', 'packages', 'package_items',
    'subscription_plans', 'plan_items', 'coupons'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_member_read', t);
    execute format(
      'create policy %I on public.%I for select using (public.is_tenant_member(tenant_id))',
      t || '_member_read', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_member_write', t);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''manager'']::public.tenant_role[])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''manager'']::public.tenant_role[]))',
      t || '_member_write', t
    );
  end loop;
end;
$$;

-- clients e appointments (escrita tambem por staff)
do $$
declare
  t text;
begin
  foreach t in array array['clients', 'appointments', 'charges', 'charge_items', 'payments', 'earnings', 'wallet_transactions', 'client_packages', 'package_redemptions', 'client_subscriptions', 'subscription_redemptions', 'coupon_redemptions', 'notifications']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_member_read', t);
    execute format(
      'create policy %I on public.%I for select using (public.is_tenant_member(tenant_id))',
      t || '_member_read', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_member_write', t);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''manager'', ''staff'']::public.tenant_role[])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''manager'', ''staff'']::public.tenant_role[]))',
      t || '_member_write', t
    );
  end loop;
end;
$$;

-- journal_entries / journal_lines (ledger append-only)
drop policy if exists journal_entries_member_read on public.journal_entries;
create policy journal_entries_member_read on public.journal_entries
  for select using (public.is_tenant_member(tenant_id));
drop policy if exists journal_entries_member_insert on public.journal_entries;
create policy journal_entries_member_insert on public.journal_entries
  for insert with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'manager', 'staff']::public.tenant_role[]));

drop policy if exists journal_lines_member_read on public.journal_lines;
create policy journal_lines_member_read on public.journal_lines
  for select using (public.is_tenant_member(tenant_id));
drop policy if exists journal_lines_member_insert on public.journal_lines;
create policy journal_lines_member_insert on public.journal_lines
  for insert with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'manager', 'staff']::public.tenant_role[]));

-- accounting_periods (fechamento contabil): leitura por membros, escrita owner/admin.
drop policy if exists accounting_periods_member_read on public.accounting_periods;
create policy accounting_periods_member_read on public.accounting_periods
  for select using (public.is_tenant_member(tenant_id));
drop policy if exists accounting_periods_admin_write on public.accounting_periods;
create policy accounting_periods_admin_write on public.accounting_periods
  for all using (public.has_tenant_role(tenant_id, array['owner', 'admin']::public.tenant_role[]))
  with check (public.has_tenant_role(tenant_id, array['owner', 'admin']::public.tenant_role[]));

-- Ledger e append-only: nunca editar/apagar lancamentos.
create or replace function public.prevent_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'ledger is append-only';
end;
$$;

drop trigger if exists journal_entries_append_only on public.journal_entries;
create trigger journal_entries_append_only
  before update on public.journal_entries
  for each row execute function public.prevent_ledger_mutation();

drop trigger if exists journal_lines_append_only on public.journal_lines;
create trigger journal_lines_append_only
  before update on public.journal_lines
  for each row execute function public.prevent_ledger_mutation();

-- Todo lancamento tem debitos = creditos (validado no commit).
create or replace function public.assert_entry_balanced()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_entry uuid;
  v_debits bigint;
  v_credits bigint;
begin
  v_entry := coalesce(new.entry_id, old.entry_id);
  select coalesce(sum(amount_cents) filter (where direction = 'debit'), 0),
         coalesce(sum(amount_cents) filter (where direction = 'credit'), 0)
    into v_debits, v_credits
  from public.journal_lines
  where entry_id = v_entry;

  if v_debits <> v_credits then
    raise exception 'journal entry % is not balanced (debits=%, credits=%)',
      v_entry, v_debits, v_credits;
  end if;
  return null;
end;
$$;

drop trigger if exists journal_lines_balanced on public.journal_lines;
create constraint trigger journal_lines_balanced
  after insert or update on public.journal_lines
  deferrable initially deferred
  for each row execute function public.assert_entry_balanced();

-- =========================================================
-- Aceite de convite (security definer)
-- =========================================================
create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_invitation public.invitations%rowtype;
  v_user_id text;
  v_email text;
begin
  v_user_id := public.auth_uid();
  if v_user_id is null then
    raise exception 'invitation_not_authenticated';
  end if;

  select * into v_invitation from public.invitations where token = p_token;
  if not found then raise exception 'invitation_not_found'; end if;
  if v_invitation.expires_at < now() then raise exception 'invitation_expired'; end if;

  select email into v_email from public."user" where id = v_user_id;
  if lower(coalesce(v_email, '')) <> lower(v_invitation.email) then
    raise exception 'invitation_email_mismatch';
  end if;

  insert into public.memberships (tenant_id, user_id, role)
  values (v_invitation.tenant_id, v_user_id, v_invitation.role)
  on conflict (tenant_id, user_id) do nothing;

  delete from public.invitations where id = v_invitation.id;
  return v_invitation.tenant_id;
end;
$$;

-- =========================================================
-- Grants para a role do app (aplica RLS)
-- =========================================================
grant usage on schema public to glowhub_app;
grant select, insert, update, delete on all tables in schema public to glowhub_app;
alter default privileges in schema public
  grant select, insert, update, delete on tables to glowhub_app;
grant usage, select on all sequences in schema public to glowhub_app;
grant execute on all functions in schema public to glowhub_app;

-- Ledger e append-only tambem via permissoes.
revoke update, delete on public.journal_entries from glowhub_app;
revoke update, delete on public.journal_lines from glowhub_app;

-- webhook_events e rate_limits sao internos (sem tenant_id; so admin).
revoke all on public.webhook_events from glowhub_app;
revoke all on public.rate_limits from glowhub_app;

-- Tabelas do Better Auth sao geridas pela conexao admin (sem RLS). Revogar o
-- acesso da role do app evita consultas via withUser sem isolamento.
revoke all on public."user" from glowhub_app;
revoke all on public.session from glowhub_app;
revoke all on public.account from glowhub_app;
revoke all on public.verification from glowhub_app;
