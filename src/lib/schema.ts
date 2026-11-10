/**
 * Database schema. Safe to run on every start.
 *
 * The ledger is append-only at the database level: triggers refuse to delete
 * calls or events, to change an event, or to change what a call originally said.
 * Only grading fields on a call may be updated.
 */
export const SCHEMA = /* sql */ `
create table if not exists companies (
  id            text primary key,
  name          text not null,
  slug          text not null unique,
  analyst_name  text not null default 'Analyst',
  is_public     boolean not null default true,
  plan          text not null default 'trial',
  chain_head    text not null default 'genesis',
  chain_seq     bigint not null default 0,
  created_ms    bigint not null
);

create table if not exists calls (
  id              text primary key,
  company_id      text not null references companies(id),
  seq             bigint not null,
  prev_hash       text not null,
  hash            text not null,
  analyst_name    text not null,
  author_user_id  text not null,
  symbol          text not null,
  side            text not null check (side in ('long','short')),
  entry_type      text not null check (entry_type in ('market','limit')),
  entry           numeric,
  stop            numeric not null,
  targets         jsonb not null,
  note            text not null default '',
  created_ms      bigint not null,
  fill_expiry_ms  bigint not null,
  max_open_ms     bigint not null,
  -- grading fields (the only columns that may change)
  status          text not null default 'pending',
  outcome         text,
  final_r         numeric,
  closed_ms       bigint,
  state           jsonb,
  last_candle_t   bigint
);
create index if not exists calls_company_idx on calls (company_id, created_ms desc);
create index if not exists calls_active_idx on calls (status) where status <> 'closed';

create table if not exists call_events (
  id          text primary key,
  call_id     text not null references calls(id),
  company_id  text not null references companies(id),
  seq         bigint not null,
  prev_hash   text not null,
  hash        text not null,
  type        text not null check (type in ('edit_stop','edit_targets','close')),
  payload     jsonb not null default '{}'::jsonb,
  created_ms  bigint not null
);
create index if not exists events_call_idx on call_events (call_id, created_ms);

create or replace function cp_forbid() returns trigger language plpgsql as $$
begin
  raise exception 'CallProof ledger rows cannot be changed or deleted';
end $$;

create or replace function cp_calls_guard() returns trigger language plpgsql as $$
begin
  if new.id is distinct from old.id
     or new.company_id is distinct from old.company_id
     or new.seq is distinct from old.seq
     or new.prev_hash is distinct from old.prev_hash
     or new.hash is distinct from old.hash
     or new.analyst_name is distinct from old.analyst_name
     or new.author_user_id is distinct from old.author_user_id
     or new.symbol is distinct from old.symbol
     or new.side is distinct from old.side
     or new.entry_type is distinct from old.entry_type
     or new.entry is distinct from old.entry
     or new.stop is distinct from old.stop
     or new.targets is distinct from old.targets
     or new.note is distinct from old.note
     or new.created_ms is distinct from old.created_ms
     or new.fill_expiry_ms is distinct from old.fill_expiry_ms
     or new.max_open_ms is distinct from old.max_open_ms then
    raise exception 'CallProof: the original terms of a call are immutable';
  end if;
  if old.status = 'closed' then
    raise exception 'CallProof: a closed call cannot be regraded in place';
  end if;
  return new;
end $$;

drop trigger if exists calls_no_delete on calls;
create trigger calls_no_delete before delete on calls
  for each row execute function cp_forbid();

drop trigger if exists calls_guard on calls;
create trigger calls_guard before update on calls
  for each row execute function cp_calls_guard();

drop trigger if exists events_immutable on call_events;
create trigger events_immutable before update or delete on call_events
  for each row execute function cp_forbid();
`;
