import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { formatDate, type Task, type TaskStatus } from '../lib/types'
import { ErrorBox, Loading, StatusBadge } from '../components/ui'

const ORDER: TaskStatus[] = ['rework', 'new', 'in_progress', 'on_review', 'accepted']

export default function MyTasks() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    supabase
      .from('tasks')
      .select('*, object:objects(id, name)')
      .eq('assignee_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        const list = ((data as Task[]) ?? []).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
        setTasks(list)
      })
  }, [profile])

  return (
    <>
      <h1>Мои задачи</h1>
      <ErrorBox error={error} />
      {!tasks ? (
        <Loading />
      ) : tasks.length === 0 ? (
        <p className="muted">Вам пока не назначено ни одной задачи.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Задача</th>
              <th>Объект</th>
              <th>Статус</th>
              <th>Создана</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)}>
                <td>{t.title}</td>
                <td>{t.object?.name}</td>
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
