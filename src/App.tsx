import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Objects from './pages/Objects'
import ObjectPage from './pages/ObjectPage'
import TaskPage from './pages/TaskPage'
import MyTasks from './pages/MyTasks'
import { Loading } from './components/ui'

function AppRoutes() {
  const { session, profile, loading, signOut } = useAuth()

  if (loading) return <div className="main"><Loading /></div>
  if (!session) return <Login />
  if (!profile)
    return (
      <div className="login">
        <div className="card login-card">
          <p>У вашей учётной записи нет роли. Обратитесь к администратору.</p>
          <button className="btn btn-ghost" onClick={signOut}>Выйти</button>
        </div>
      </div>
    )

  const home = profile.role === 'executor' ? '/my-tasks' : '/objects'
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/objects" element={<Objects />} />
        <Route path="/objects/:id" element={<ObjectPage />} />
        <Route path="/tasks/:id" element={<TaskPage />} />
        <Route path="/my-tasks" element={<MyTasks />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
