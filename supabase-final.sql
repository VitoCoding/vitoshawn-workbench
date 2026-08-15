-- 天蓬 VitoShawn 工作台 FINAL
-- 已经执行过之前的 workbench_state SQL，可不重复执行。
-- 新项目才需要运行本文件。

create table if not exists public.workbench_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workbench_state enable row level security;

drop policy if exists "workbench_select_own" on public.workbench_state;
drop policy if exists "workbench_insert_own" on public.workbench_state;
drop policy if exists "workbench_update_own" on public.workbench_state;
drop policy if exists "workbench_own_row" on public.workbench_state;

create policy "workbench_own_row"
on public.workbench_state
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update on public.workbench_state to authenticated;

create or replace function public.set_workbench_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workbench_set_updated_at on public.workbench_state;
create trigger workbench_set_updated_at
before update on public.workbench_state
for each row execute function public.set_workbench_updated_at();
