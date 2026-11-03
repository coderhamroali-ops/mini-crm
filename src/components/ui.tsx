import type { ReactNode } from 'react'
import { STATUS_LABEL, type TaskStatus } from '../lib/types'

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null
  return <div className="error">{error}</div>
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>
}

export function Loading() {
  return <p className="muted">Загрузка…</p>
}
