-- =====================================================================
-- Тестовые данные. Запускать в Supabase → SQL Editor ПОСЛЕ миграции и
-- ПОСЛЕ создания трёх пользователей в Authentication → Users
-- (Add user → Create new user, галочка «Auto Confirm User»).
-- Замените email-адреса ниже на те, что вы создали.
-- =====================================================================
do $$
declare
  m  uuid := (select id from auth.users where email = 'manager@mini-crm.test');
  e1 uuid := (select id from auth.users where email = 'ivanov@mini-crm.test');
  e2 uuid := (select id from auth.users where email = 'petrov@mini-crm.test');
  o1 uuid; o2 uuid; o3 uuid;
  t  uuid;
begin
  if m is null or e1 is null or e2 is null then
    raise exception 'Сначала создайте трёх пользователей в Authentication → Users';
  end if;

  insert into public.profiles (id, full_name, role) values
    (m,  'Алексей Смирнов (постановщик)', 'manager'),
    (e1, 'Иван Иванов (исполнитель)',     'executor'),
    (e2, 'Пётр Петров (исполнитель)',     'executor')
  on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

  insert into public.objects (name, address, created_by) values ('ЖК «Солнечный»', 'г. Бишкек, ул. Ленина, 12', m) returning id into o1;
  insert into public.objects (name, address, created_by) values ('Склад «Север»', 'г. Бишкек, ул. Жибек Жолу, 45', m) returning id into o2;
  insert into public.objects (name, address, created_by) values ('Коттедж на Иссык-Куле', 'с. Чолпон-Ата, ул. Береговая, 3', m) returning id into o3;

  -- Задачи в разных статусах. Статус выставляем через тот же механизм, что и приложение,
  -- и пишем историю, чтобы она выглядела как настоящая.
  perform set_config('app.status_change', 'on', true);

  insert into public.tasks (title, description, object_id, assignee_id, author_id)
  values ('Залить фундамент', 'Бетон М300, проверить опалубку', o1, e1, m);

  insert into public.tasks (title, description, object_id, assignee_id, author_id)
  values ('Установить окна 2 этажа', '12 окон, профиль REHAU', o1, e1, m) returning id into t;
  update public.tasks set status = 'in_progress' where id = t;
  insert into public.task_history (task_id, changed_by, from_status, to_status) values (t, e1, 'new', 'in_progress');

  insert into public.tasks (title, description, object_id, assignee_id, author_id)
  values ('Проложить электрику', 'Кабель ВВГнг 3x2.5, по проекту', o1, e2, m) returning id into t;
  update public.tasks set status = 'on_review' where id = t;
  insert into public.task_history (task_id, changed_by, from_status, to_status) values
    (t, e2, 'new', 'in_progress'), (t, e2, 'in_progress', 'on_review');

  insert into public.tasks (title, description, object_id, assignee_id, author_id)
  values ('Покрасить ворота', 'Цвет RAL 7016', o2, e2, m) returning id into t;
  update public.tasks set status = 'rework' where id = t;
  insert into public.task_history (task_id, changed_by, from_status, to_status, comment) values
    (t, e2, 'new', 'in_progress', null), (t, e2, 'in_progress', 'on_review', null),
    (t, m, 'on_review', 'rework', 'Остались подтёки на левой створке, перекрасить');

  insert into public.tasks (title, description, object_id, assignee_id, author_id)
  values ('Вывезти строительный мусор', '2 контейнера', o2, e1, m) returning id into t;
  update public.tasks set status = 'accepted' where id = t;
  insert into public.task_history (task_id, changed_by, from_status, to_status) values
    (t, e1, 'new', 'in_progress'), (t, e1, 'in_progress', 'on_review'), (t, m, 'on_review', 'accepted');

  insert into public.tasks (title, description, object_id, assignee_id, author_id)
  values ('Замер участка', 'Подготовить план для проекта', o3, e2, m);

  perform set_config('app.status_change', 'off', true);
end $$;
