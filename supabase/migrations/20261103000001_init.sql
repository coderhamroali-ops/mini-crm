-- =====================================================================
-- Mini-CRM «Объекты и задачи» — схема, права доступа (RLS) и логика статусов
-- Все правила работают на уровне базы: обойти их через API нельзя.
-- =====================================================================

-- ---------- Типы ----------
create type public.user_role as enum ('manager', 'executor');           -- постановщик / исполнитель
create type public.task_status as enum ('new', 'in_progress', 'on_review', 'accepted', 'rework');

-- ---------- Таблицы ----------

-- Профиль пользователя (1:1 с auth.users). Роль задаётся вручную администратором.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null,
  role       public.user_role not null,
  created_at timestamptz not null default now()
);

-- Объект = стройка
create table public.objects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  address    text not null default '',
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Задача по объекту
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) > 0),
  description text not null default '',
  object_id   uuid not null references public.objects (id) on delete cascade,
  assignee_id uuid not null references public.profiles (id),
  status      public.task_status not null default 'new',
  author_id   uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tasks_object_id_idx   on public.tasks (object_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);

-- История смены статусов (только добавление, никаких правок)
create table public.task_history (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  changed_by  uuid not null references public.profiles (id),
  from_status public.task_status,               -- null = задача только что создана
  to_status   public.task_status not null,
  comment     text,
  created_at  timestamptz not null default now()
);
create index task_history_task_id_idx on public.task_history (task_id);

-- ---------- Вспомогательные функции ----------

-- Роль текущего пользователя. SECURITY DEFINER, чтобы не зациклиться на RLS profiles.
create or replace function public.app_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

revoke execute on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

create or replace function public.is_manager()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.app_role() = 'manager', false) $$;

-- Может ли текущий пользователь видеть объект (исполнитель — только если там есть его задача)
create or replace function public.can_see_object(p_object uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_manager()
      or exists (select 1 from public.tasks t
                 where t.object_id = p_object and t.assignee_id = auth.uid())
$$;

-- ---------- Триггеры ----------

-- Исполнителем задачи может быть только пользователь с ролью executor
create or replace function public.tasks_check_assignee()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = new.assignee_id and role = 'executor') then
    raise exception 'Исполнителем может быть только пользователь с ролью «исполнитель»';
  end if;
  return new;
end $$;

create trigger tasks_check_assignee
before insert or update of assignee_id on public.tasks
for each row execute function public.tasks_check_assignee();

-- При создании задачи: статус всегда «Новая», автор — текущий пользователь
create or replace function public.tasks_before_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.status     := 'new';
  -- автор = текущий пользователь (через API uid всегда есть; без него — только сид от администратора)
  new.author_id  := coalesce(auth.uid(), new.author_id);
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;

create trigger tasks_before_insert
before insert on public.tasks
for each row execute function public.tasks_before_insert();

-- Первая запись истории: «— → Новая»
create or replace function public.tasks_after_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.task_history (task_id, changed_by, from_status, to_status)
  values (new.id, new.author_id, null, 'new');
  return new;
end $$;

create trigger tasks_after_insert
after insert on public.tasks
for each row execute function public.tasks_after_insert();

-- Прямая смена статуса и автора через UPDATE запрещена — только через change_task_status()
create or replace function public.tasks_before_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('app.status_change', true), '') <> 'on' then
    raise exception 'Статус меняется только через change_task_status()';
  end if;
  new.author_id  := old.author_id;   -- автора и дату создания подменить нельзя
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

create trigger tasks_before_update
before update on public.tasks
for each row execute function public.tasks_before_update();

-- ---------- Смена статуса (единственный путь) ----------
--   Новая       → В работе      : назначенный исполнитель
--   В работе    → На проверке   : назначенный исполнитель
--   На проверке → Принята       : постановщик
--   На проверке → На доработке  : постановщик, комментарий обязателен
--   На доработке→ В работе      : назначенный исполнитель
create or replace function public.change_task_status(
  p_task_id uuid,
  p_to      public.task_status,
  p_comment text default null
)
returns public.tasks
language plpgsql security definer set search_path = public
as $$
declare
  v_task    public.tasks;
  v_uid     uuid := auth.uid();
  v_manager boolean := public.is_manager();
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_allowed boolean := false;
  v_from    public.task_status;
begin
  if v_uid is null then
    raise exception 'Требуется вход в систему';
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or (not v_manager and v_task.assignee_id <> v_uid) then
    raise exception 'Задача не найдена';
  end if;
  v_from := v_task.status;

  v_allowed := case
    when v_task.status = 'new'         and p_to = 'in_progress' then v_task.assignee_id = v_uid
    when v_task.status = 'in_progress' and p_to = 'on_review'   then v_task.assignee_id = v_uid
    when v_task.status = 'on_review'   and p_to = 'accepted'    then v_manager
    when v_task.status = 'on_review'   and p_to = 'rework'      then v_manager
    when v_task.status = 'rework'      and p_to = 'in_progress' then v_task.assignee_id = v_uid
    else false
  end;

  if not v_allowed then
    raise exception 'Переход «%» → «%» недоступен для вас', v_task.status, p_to;
  end if;

  if p_to = 'rework' and v_comment is null then
    raise exception 'При возврате на доработку комментарий обязателен';
  end if;

  perform set_config('app.status_change', 'on', true);
  update public.tasks set status = p_to where id = p_task_id returning * into v_task;
  perform set_config('app.status_change', 'off', true);

  insert into public.task_history (task_id, changed_by, from_status, to_status, comment)
  values (p_task_id, v_uid, v_from, p_to, v_comment);

  return v_task;
end $$;

-- ---------- RLS ----------
alter table public.profiles     enable row level security;
alter table public.objects      enable row level security;
alter table public.tasks        enable row level security;
alter table public.task_history enable row level security;

-- profiles: читать имена могут все вошедшие (нужно для «автор» / «исполнитель»), менять — никто через API
create policy profiles_select on public.profiles
  for select to authenticated using (true);

-- objects: постановщик — всё; исполнитель — только объекты, где есть его задачи
create policy objects_select on public.objects
  for select to authenticated using (public.can_see_object(id));
create policy objects_insert on public.objects
  for insert to authenticated with check (public.is_manager());
create policy objects_update on public.objects
  for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy objects_delete on public.objects
  for delete to authenticated using (public.is_manager());

-- tasks: постановщик — всё; исполнитель — только свои и только чтение
create policy tasks_select on public.tasks
  for select to authenticated using (public.is_manager() or assignee_id = auth.uid());
create policy tasks_insert on public.tasks
  for insert to authenticated with check (public.is_manager());
create policy tasks_update on public.tasks
  for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy tasks_delete on public.tasks
  for delete to authenticated using (public.is_manager());

-- task_history: только чтение (тому, кто видит задачу). Нет политик insert/update/delete —
-- значит через API запись невозможна; пишут только функции выше.
create policy task_history_select on public.task_history
  for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id
                 and (public.is_manager() or t.assignee_id = auth.uid())));

-- ---------- Права на уровне таблиц (второй слой защиты) ----------
revoke all on public.profiles, public.objects, public.tasks, public.task_history from anon;
revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete, truncate on public.task_history from authenticated;
grant select on public.profiles, public.task_history to authenticated;
grant select, insert, update, delete on public.objects, public.tasks to authenticated;

revoke all on function public.change_task_status(uuid, public.task_status, text) from public, anon;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;
