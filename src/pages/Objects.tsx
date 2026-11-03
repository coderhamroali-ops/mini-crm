import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { TaskStatus } from '../lib/types'
import { ErrorBox, Loading } from '../components/ui'

interface Row {
  id: string
  name: string
  address: string
  tasks: { status: TaskStatus }[]
}

export default function Objects() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  async function load() {
    const { data, error } = await supabase
      .from('objects')
      .select('id, name, address, tasks(status)')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    setRows((data as unknown as Row[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.from('objects').insert({ name, address })
    if (error) return setError(error.message)
    setName('')
    setAddress('')
    load()
  }

  return (
    <>
      <h1>Объекты</h1>
      <ErrorBox error={error} />

      {isManager && (
        <form className="card inline-form" onSubmit={create}>
          <input placeholder="Название объекта" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Адрес" value={address} onChange={(e) => setAddress(e.target.value)} />
          <button className="btn btn-primary">Добавить объект</button>
        </form>
      )}

      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <p className="muted">{isManager ? 'Объектов пока нет.' : 'У вас пока нет задач ни на одном объекте.'}</p>
      ) : (
        <div className="grid">
          {rows.map((o) => {
            const open = o.tasks.filter((t) => t.status !== 'accepted').length
            return (
              <Link key={o.id} to={`/objects/${o.id}`} className="card object-card">
                <h3>{o.name}</h3>
                <p className="muted">{o.address || 'Адрес не указан'}</p>
                <p className="small">
                  {isManager ? 'Задач' : 'Ваших задач'}: {o.tasks.length} · открытых: {open}
                </p>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
