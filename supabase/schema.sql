-- Phase 6. Run once in a FRESH Supabase project using Dashboard > SQL Editor.
-- Money is cents within JavaScript's exact integer range. Financial dates are DATE.
-- Composite identity permits the same built-in category UUID for different users.
begin;
create table public.finance_sync_heads (
  user_id uuid primary key references auth.users(id) on delete restrict,
  version bigint not null check (version between 0 and 9007199254740991)
);
alter table public.finance_sync_heads enable row level security;
revoke all on public.finance_sync_heads from anon, authenticated;

create table public.accounts (
  user_id uuid not null references auth.users(id) on delete restrict,
  id uuid not null,
  name text not null check (length(trim(name)) between 1 and 100),
  type text not null check (type in ('cash','bank','card','savings','other')),
  currency text not null default 'EUR' check (currency = 'EUR'),
  initial_balance_cents bigint not null check (initial_balance_cents between -9007199254740991 and 9007199254740991),
  is_archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  sync_version bigint not null default 0,
  primary key (user_id, id)
);
create table public.categories (
  user_id uuid not null references auth.users(id) on delete restrict,
  id uuid not null,
  name text not null check (length(trim(name)) between 1 and 100),
  type text not null check (type in ('expense','income','both')),
  icon text check (icon is null or length(icon) between 1 and 100),
  is_default boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  sync_version bigint not null default 0,
  primary key (user_id, id)
);
create table public.transactions (
  user_id uuid not null references auth.users(id) on delete restrict,
  id uuid not null,
  account_id uuid not null,
  category_id uuid,
  type text not null check (type in ('expense','income')),
  amount_cents bigint not null check (amount_cents between 1 and 9007199254740991),
  description text not null check (length(trim(description)) between 1 and 2000),
  transaction_date date not null,
  is_balance_adjustment boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  sync_version bigint not null default 0,
  primary key (user_id, id),
  foreign key (user_id, account_id) references public.accounts(user_id, id) on delete restrict,
  foreign key (user_id, category_id) references public.categories(user_id, id) on delete restrict,
  check ((is_balance_adjustment and category_id is null) or (not is_balance_adjustment and category_id is not null))
);
-- The head row is locked until the enclosing transaction COMMITs. Thus a published
-- cursor cannot jump past an earlier uncommitted mutation from the same user.
-- Server acceptance order, rather than device clock, determines last-write-wins.
create function public.finance_stamp_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'Unauthorized financial owner' using errcode = '42501';
  end if;
  if TG_OP = 'UPDATE' then
    if new.user_id <> old.user_id or new.id <> old.id then
      raise exception 'Financial identity is immutable';
    end if;
    new.created_at := old.created_at;
  end if;
  insert into public.finance_sync_heads(user_id, version) values (new.user_id, 1)
    on conflict (user_id) do update set version = public.finance_sync_heads.version + 1
    returning version into new.sync_version;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.finance_stamp_change() from public, anon, authenticated;
create trigger accounts_sync_stamp before insert or update on public.accounts for each row execute function public.finance_stamp_change();
create trigger categories_sync_stamp before insert or update on public.categories for each row execute function public.finance_stamp_change();
create trigger transactions_sync_stamp before insert or update on public.transactions for each row execute function public.finance_stamp_change();

-- Only the caller's published cursor is accessible, never another user's head.
create function public.finance_sync_cursor() returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce((select version from public.finance_sync_heads where user_id = auth.uid()), 0);
$$;
revoke all on function public.finance_sync_cursor() from public, anon;
grant execute on function public.finance_sync_cursor() to authenticated;

-- Authorize every operation. DELETE intentionally denied: tombstones must remain
-- available to offline devices. Never hard-delete rows via the ordinary sync API.
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
revoke all on public.accounts, public.categories, public.transactions from anon, authenticated;
grant select, insert, update on public.accounts, public.categories, public.transactions to authenticated;
create policy accounts_select on public.accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy accounts_insert on public.accounts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy accounts_update on public.accounts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy categories_select on public.categories for select to authenticated using ((select auth.uid()) = user_id);
create policy categories_insert on public.categories for insert to authenticated with check ((select auth.uid()) = user_id);
create policy categories_update on public.categories for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy transactions_select on public.transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy transactions_insert on public.transactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy transactions_update on public.transactions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index accounts_sync on public.accounts(user_id, sync_version, id);
create index categories_sync on public.categories(user_id, sync_version, id);
create index transactions_sync on public.transactions(user_id, sync_version, id);
create index transactions_date on public.transactions(user_id, transaction_date) where deleted_at is null;
create index transactions_account on public.transactions(user_id, account_id);
create index transactions_category on public.transactions(user_id, category_id);
commit;
