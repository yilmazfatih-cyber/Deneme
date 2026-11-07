import { Link } from 'react-router-dom'
import { homePath, useAuth } from '../auth'

export function NotFoundPage() {
  const { user } = useAuth()
  return (
    <div className="center-page">
      <h1>Sayfa bulunamadı</h1>
      <p className="muted">Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir.</p>
      <Link className="btn btn-primary" to={homePath(user)}>
        Ana sayfaya dön
      </Link>
    </div>
  )
}
