import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  availableActions,
  formatDate,
  STATUS_LABEL,
  type HistoryItem,
  type Profile,
  type StatusAction,
  type Task,
} from '../lib/types'
import { ErrorBox, Loading, StatusBadge } from '../components/ui'

const TASK_SELECT =
  '*, object:objects(id, name), assignee:profiles!tasks_assignee_id_fkey(full_name), author:profiles!tasks_author_id_fkey(full_name)'

export default function TaskPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'
  const [task, setTask] = useState<Task | null | undefined>(undefined)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [executors, setExecutors] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<StatusAction | null>(null)
  const [comment, setComment] = useState('')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', assignee_id: '' })

  async function load() {
    const [t, h] = await Promise.all([
      supabase.from('tasks').select(TASK_SELECT).eq('id', id!).maybeSingle(),
      supabase
        .from('task_history')
        .select('id, from_status, to_status, comment, created_at, changed_by_profile:profiles(full_name)')
        .eq('task_id', id!)
        .order('id', { ascending: true }),
    ])
    if (t.error || h.error) setError((t.error ?? h.error)!.message)
    const data = t.data as Task | null
    setTask(data)
    setHistory((h.data as unknown as HistoryItem[]) ?? [])
    if (data) setForm({ title: data.title, description: data.description, assignee_id: data.assignee_id })
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

  async function changeStatus(action: StatusAction, text?: string) {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('change_task_status', {
      p_task_id: id,
      p_to: action.to,
      p_comment: text ?? null,
    })
    setBusy(false)
    if (error) return setError(error.message)
    setPending(null)
    setComment('')
    load()
  }

  function onAction(action: StatusAction) {
    if (action.needsComment) setPending(action)
    else changeStatus(action)
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault()
    if (pending) changeStatus(pending, comment)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('tasks').update(form).eq('id', id!)
    if (error) return setError(error.message)
    setEditing(false)
    load()
  }

  async function remove() {
    if (!task || !confirm('Удалить задачу?')) return
    const { error } = await supabase.from('tasks').delete().eq('id', id!)
    if (error) return setError(error.message)
    navigate(`/objects/${task.object_id}`)
  }

  if (task === undefined) return <Loading />
  if (task === null) return <p>Задача не найдена или у вас нет к ней доступа.</p>

  const actions = profile ? availableActions(task, profile) : []

  return (
    <>
      <Link to={`/objects/${task.object_id}`} className="back">
        ← {task.object?.name ?? 'Объект'}
      </Link>
      <ErrorBox error={error} />

      <div className="card">
        {editing ? (
          <form className="stack" onSubmit={save}>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
              {executors.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <div className="row">
              <button className="btn btn-primary">Сохранить</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                Отмена
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="row between">
              <h1>{task.title}</h1>
              <StatusBadge status={task.status} />
            </div>
            <p className="description">{task.description || <span className="muted">Без описания</span>}</p>
            <dl className="meta">
              <dt>Объект</dt>
              <dd>{task.object?.name}</dd>
              <dt>Исполнитель</dt>
              <dd>{task.assignee?.full_name}</dd>
              <dt>Автор</dt>
              <dd>{task.author?.full_name}</dd>
              <dt>Создана</dt>
              <dd>{formatDate(task.created_at)}</dd>
            </dl>

            <div className="row">
              {actions.map((a) => (
                <button
                  key={a.to}
                  className={`btn ${a.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                  disabled={busy}
                  onClick={() => onAction(a)}
                >
                  {a.label}
                </button>
              ))}
              {isManager && (
                <>
                  <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                    Редактировать
                  </button>
                  <button className="btn btn-ghost danger-text" onClick={remove}>
                    Удалить
                  </button>
                </>
              )}
            </div>

            {pending && (
              <form className="stack comment-form" onSubmit={submitComment}>
                <label>
                  Комментарий (обязательно): что нужно доработать?
                  <textarea value={comment} onChange={(e) => setComment(e.target.value)} required autoFocus />
                </label>
                <div className="row">
                  <button className="btn btn-danger" disabled={busy || !comment.trim()}>
                    {pending.label}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setPending(null)}>
                    Отмена
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>

      <h2>История</h2>
      <ol className="history">
        {history.map((h) => (
          <li key={h.id}>
            <div>
              <b>{h.changed_by_profile?.full_name}</b>{' '}
              {h.from_status ? (
                <>
                  {STATUS_LABEL[h.from_status]} → <b>{STATUS_LABEL[h.to_status]}</b>
                </>
              ) : (
                <>создал(а) задачу</>
              )}
              <span className="muted small"> · {formatDate(h.created_at)}</span>
            </div>
            {h.comment && <div className="history-comment">«{h.comment}»</div>}
          </li>
        ))}
      </ol>
    </>
  )
}
