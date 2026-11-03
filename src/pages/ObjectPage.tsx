import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { formatDate, type CrmObject, type Profile, type Task } from '../lib/types'
import { ErrorBox, Loading, StatusBadge } from '../components/ui'

export default function ObjectPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'
  const [obj, setObj] = useState<CrmObject | null | undefined>(undefined)
  const [tasks, setTasks] = useState<Task[]>([])
  const [executors, setExecutors] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', address: '' })
  const [task, setTask] = useState({ title: '', description: '', assignee_id: '' })

  async function load() {
    const [o, t] = await Promise.all([
      supabase.from('objects').select('*').eq('id', id!).maybeSingle(),
      supabase
        .from('tasks')
        .select('*, assignee:profiles!tasks_assignee_id_fkey(full_name)')
        .eq('object_id', id!)
        .order('created_at', { ascending: false }),
    ])
    if (o.error || t.error) setError((o.error ?? t.error)!.message)
    setObj(o.data as CrmObject | null)
    setTasks((t.data as Task[]) ?? [])
    if (o.data) setForm({ name: o.data.name, address: o.data.address })
  }

  useEffect(() => {
    load()
    if (isManager) {
      supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('role', 'executor')
        .order('full_name')
        .then(({ data }) => setExecutors((data as Profile[]) ?? []))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isManager])

  async function save(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('objects').update(form).eq('id', id!)
    if (error) return setError(error.message)
    setEditing(false)
    load()
  }

  async function remove() {
    if (!confirm('Удалить объект вместе со всеми задачами?')) return
    const { error } = await supabase.from('objects').delete().eq('id', id!)
    if (error) return setError(error.message)
    navigate('/objects')
  }

  async function createTask(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.from('tasks').insert({ ...task, object_id: id })
    if (error) return setError(error.message)
    setTask({ title: '', description: '', assignee_id: '' })
    load()
  }

  if (obj === undefined) return <Loading />
  if (obj === null) return <p>Объект не найден или у вас нет к нему доступа.</p>

  return (
    <>
      <Link to="/objects" className="back">
        ← Объекты
      </Link>
      <ErrorBox error={error} />

      <div className="card">
        {editing ? (
          <form className="stack" onSubmit={save}>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <div className="row">
              <button className="btn btn-primary">Сохранить</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                Отмена
              </button>
            </div>
          </form>
        ) : (
          <div className="row between">
            <div>
              <h1>{obj.name}</h1>
              <p className="muted">{obj.address || 'Адрес не указан'}</p>
            </div>
            {isManager && (
              <div className="row">
                <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                  Редактировать
                </button>
                <button className="btn btn-danger" onClick={remove}>
                  Удалить
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {isManager && (
        <form className="card stack" onSubmit={createTask}>
          <h3>Новая задача</h3>
          <input
            placeholder="Название"
            value={task.title}
            onChange={(e) => setTask({ ...task, title: e.target.value })}
            required
          />
          <textarea
            placeholder="Описание"
            value={task.description}
            onChange={(e) => setTask({ ...task, description: e.target.value })}
          />
          <select value={task.assignee_id} onChange={(e) => setTask({ ...task, assignee_id: e.target.value })} required>
            <option value="">— Исполнитель —</option>
            {executors.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <button className="btn btn-primary">Создать задачу</button>
        </form>
      )}

      <h2>Задачи {isManager ? '' : '(ваши)'}</h2>
      {tasks.length === 0 ? (
        <p className="muted">Задач пока нет.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Задача</th>
              <th>Исполнитель</th>
              <th>Статус</th>
              <th>Создана</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)}>
                <td>{t.title}</td>
                <td>{t.assignee?.full_name}</td>
                <td>
                  <StatusBadge status={t.status} />
                </td>
                <td className="muted">{formatDate(t.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
