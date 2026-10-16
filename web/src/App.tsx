import { lazy, Suspense } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Welcome from './pages/Welcome';
import Register from './pages/Register';
import Login from './pages/Login';
import Feed from './pages/Feed';
import PostPage from './pages/PostPage';
import Profile from './pages/Profile';
import Rooms from './pages/Rooms';
import Invites from './pages/Invites';
import Notifications from './pages/Notifications';
import Moderation from './pages/Moderation';
import Rules from './pages/Rules';

// La parte video (LiveKit) è pesante: si scarica solo quando si entra in una Piazza.
const RoomPage = lazy(() => import('./pages/RoomPage'));

export default function App() {
  const { me, loading, unread } = useAuth();
  const location = useLocation();

  if (loading) return <div className="center-screen"><div className="spinner" /></div>;

  if (!me) {
    return (
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/entra" element={<Login />} />
        <Route path="/iscriviti" element={<Register />} />
        <Route path="/regole" element={<Rules />} />
        <Route path="*" element={<Navigate to={`/entra?dopo=${encodeURIComponent(location.pathname)}`} replace />} />
      </Routes>
    );
  }

  const inRoom = /^\/piazze\/\d+/.test(location.pathname);
  return (
    <div className={`app ${inRoom ? 'app-room' : ''}`}>
      <main className="content">
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/post/:id" element={<PostPage />} />
          <Route path="/u/:username" element={<Profile />} />
          <Route path="/piazze" element={<Rooms />} />
          <Route path="/piazze/:id" element={<Suspense fallback={<div className="spinner" />}><RoomPage /></Suspense>} />
          <Route path="/inviti" element={<Invites />} />
          <Route path="/notifiche" element={<Notifications />} />
          <Route path="/moderazione" element={me.role === 'member' ? <Navigate to="/" /> : <Moderation />} />
          <Route path="/regole" element={<Rules />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!inRoom && (
        <nav className="tabbar">
          <NavLink to="/" end><span className="ico">◎</span>Feed</NavLink>
          <NavLink to="/piazze"><span className="ico">◉</span>Piazze</NavLink>
          <NavLink to="/inviti"><span className="ico">✦</span>Inviti</NavLink>
          <NavLink to="/notifiche"><span className="ico">♥</span>Avvisi{unread > 0 && <b className="badge">{unread}</b>}</NavLink>
          <NavLink to={`/u/${me.username}`}><span className="ico">☺</span>Profilo</NavLink>
        </nav>
      )}
    </div>
  );
}
