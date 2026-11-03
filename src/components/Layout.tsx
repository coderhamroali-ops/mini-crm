import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ROLE_LABEL } from '../lib/types'

export default function Layout() {
  const { profile, signOut } = useAuth()
  return (
    <div className="app">
      <header className="header">
        <div className="brand">Мини-CRM</div>
        <nav className="nav">
          <NavLink to="/objects">Объекты</NavLink>
          {profile?.role === 'executor' && <NavLink to="/my-tasks">Мои задачи</NavLink>}
        </nav>
        <div className="user">
          <span>
            {profile?.full_name} · <b>{profile ? ROLE_LABEL[profile.role] : ''}</b>
          </span>
          <button className="btn btn-ghost" onClick={signOut}>
            Выйти
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
