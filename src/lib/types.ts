export type Role = 'manager' | 'executor'
export type TaskStatus = 'new' | 'in_progress' | 'on_review' | 'accepted' | 'rework'

export interface Profile {
  id: string
  full_name: string
  role: Role
}

export interface CrmObject {
  id: string
  name: string
  address: string
  created_at: string
}

export interface Task {
  id: string
  title: string
  description: string
  object_id: string
  assignee_id: string
  status: TaskStatus
  author_id: string
  created_at: string
  object?: { id: string; name: string } | null
  assignee?: { full_name: string } | null
  author?: { full_name: string } | null
}

export interface HistoryItem {
  id: number
  from_status: TaskStatus | null
  to_status: TaskStatus
  comment: string | null
  created_at: string
  changed_by_profile?: { full_name: string } | null
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  on_review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
}

export const ROLE_LABEL: Record<Role, string> = {
  manager: 'Постановщик',
  executor: 'Исполнитель',
}

export interface StatusAction {
  to: TaskStatus
  label: string
  needsComment?: boolean
  tone?: 'primary' | 'danger'
}

// Только для отображения кнопок. Настоящая проверка — в базе (change_task_status).
export function availableActions(task: Task, me: Profile): StatusAction[] {
  const isAssignee = task.assignee_id === me.id
  const isManager = me.role === 'manager'
  switch (task.status) {
    case 'new':
      return isAssignee ? [{ to: 'in_progress', label: 'Взять в работу', tone: 'primary' }] : []
    case 'in_progress':
      return isAssignee ? [{ to: 'on_review', label: 'Отправить на проверку', tone: 'primary' }] : []
    case 'on_review':
      return isManager
        ? [
            { to: 'accepted', label: 'Принять', tone: 'primary' },
            { to: 'rework', label: 'Вернуть на доработку', needsComment: true, tone: 'danger' },
          ]
        : []
    case 'rework':
      return isAssignee ? [{ to: 'in_progress', label: 'Взять в работу', tone: 'primary' }] : []
    default:
      return []
  }
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}
