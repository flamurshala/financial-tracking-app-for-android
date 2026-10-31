-- Incremental migration: run on an existing Phase 6 database before using this app version.
begin;
create table public.transfers (
  user_id uuid not null references auth.users(id) on delete restrict,
  id uuid not null,
  from_account_id uuid not null,
  to_account_id uuid not null,
  amount_cents bigint not null check(amount_cents between 1 and 9007199254740991),
  transfer_date date not null,
  note text not null default '' check(length(note)<=2000),
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  sync_version bigint not null default 0,
  primary key(user_id,id),
  foreign key(user_id,from_account_id) references public.accounts(user_id,id) on delete restrict,
  foreign key(user_id,to_account_id) references public.accounts(user_id,id) on delete restrict,
  check(from_account_id <> to_account_id)
);
create trigger transfers_sync_stamp before insert or update on public.transfers for each row execute function public.finance_stamp_change();
alter table public.transfers enable row level security;
revoke all on public.transfers from anon, authenticated;
grant select,insert,update on public.transfers to authenticated;
create policy transfers_select on public.transfers for select to authenticated using ((select auth.uid())=user_id);
create policy transfers_insert on public.transfers for insert to authenticated with check ((select auth.uid())=user_id);
create policy transfers_update on public.transfers for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create index transfers_sync on public.transfers(user_id,sync_version,id);
create index transfers_from on public.transfers(user_id,from_account_id);
create index transfers_to on public.transfers(user_id,to_account_id);

-- Category deletion is terminal even if an older/offline client uploads a stale edit.
create function public.finance_keep_category_deleted() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.deleted_at is not null then new.deleted_at := old.deleted_at; end if;
  return new;
end;
$$;
revoke all on function public.finance_keep_category_deleted() from public,anon,authenticated;
create trigger categories_keep_deleted before update on public.categories for each row execute function public.finance_keep_category_deleted();
commit;
