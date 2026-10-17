import { lazy, Suspense, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAuth } from './auth';
import { DEMO } from './api';
import Icon from './components/Icon';
import CreateSheet from './components/CreateSheet';
import Welcome from './pages/Welcome';
import Register from './pages/Register';
import Login from './pages/Login';
import Feed from './pages/Feed';
import PostPage from './pages/PostPage';
import Profile from './pages/Profile';
import Rooms from './pages/Rooms';
import Search from './pages/Search';
import Tag from './pages/Tag';
import Invites from './pages/Invites';
import Notifications from './pages/Notifications';
import Moderation from './pages/Moderation';
import Admin from './pages/Admin';
import Account from './pages/Account';
import AdminUsers from './pages/AdminUsers';
import OwnerSettings from './pages/OwnerSettings';
import { Privacy, Terms } from './pages/Legal';
import { ForgotPassword, ResetPassword } from './pages/Password';
import Rules from './pages/Rules';
import Journal from './pages/Journal';
import ChallengePage from './pages/ChallengePage';

// La parte video (LiveKit) è pesante: si scarica solo quando si entra in una Live.
const RoomPage = lazy(() => import('./pages/RoomPage'));

function OldRoomLink() {
  const { id } = useParams();
  return <Navigate to={`/live/${id}`} replace />;
}

export default function App() {
  const { me, loading, unread } = useAuth();
  const location = useLocation();
  const [creating, setCreating] = useState(false);

  const banner = DEMO && <div className="demo-banner">Anteprima con dati di esempio: niente viene salvato</div>;

  if (loading) return <div className="center-screen"><div className="spinner" /></div>;

  if (!me) {
    return (
      <>
        {banner}
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/entra" element={<Login />} />
          <Route path="/iscriviti" element={<Register />} />
          <Route path="/regole" element={<Rules />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/condizioni" element={<Terms />} />
          <Route path="/password-dimenticata" element={<ForgotPassword />} />
          <Route path="/reimposta-password" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to={`/entra?dopo=${encodeURIComponent(location.pathname)}`} replace />} />
        </Routes>
      </>
    );
  }

  const inRoom = /^\/live\/\d+/.test(location.pathname);
  return (
    <div className={`app ${inRoom ? 'app-room' : ''}`}>
      {banner}
      <main className="content">
        <Routes>
          <Route path="/" element={<Feed onCompose={() => setCreating(true)} />} />
          <Route path="/post/:id" element={<PostPage />} />
          <Route path="/u/:username" element={<Profile />} />
          <Route path="/live" element={<Rooms />} />
          {/* Le "Piazze" ora si chiamano "Live": i vecchi link continuano a funzionare. */}
          <Route path="/piazze" element={<Navigate to="/live" replace />} />
          <Route path="/piazze/:id" element={<OldRoomLink />} />
          <Route path="/live/:id" element={<Suspense fallback={<div className="spinner" />}><RoomPage /></Suspense>} />
          <Route path="/inviti" element={<Invites />} />
          <Route path="/cerca" element={<Search />} />
          <Route path="/tag/:tag" element={<Tag />} />
          <Route path="/diario" element={<Journal />} />
          <Route path="/sfida" element={<ChallengePage />} />
          <Route path="/notifiche" element={<Notifications />} />
          <Route path="/moderazione" element={me.role === 'member' ? <Navigate to="/" /> : <Moderation />} />
          <Route path="/admin" element={me.role === 'admin' ? <Admin /> : <Navigate to="/" />} />
          <Route path="/admin/utenti" element={me.role === 'admin' ? <AdminUsers /> : <Navigate to="/" />} />
          <Route path="/regole" element={<Rules />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/condizioni" element={<Terms />} />
          <Route path="/account" element={<Account />} />
          <Route path="/impostazioni" element={me.isOwner ? <OwnerSettings /> : <Navigate to="/" />} />
          <Route path="/reimposta-password" element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!inRoom && (
        <nav className="tabbar" aria-label="Menu principale">
          <NavLink to="/" end><Icon name="home" /><span>Home</span></NavLink>
          <NavLink to="/live"><Icon name="live" /><span>Live</span></NavLink>
          <button className="tab-create" onClick={() => setCreating(true)} aria-label="Crea"><Icon name="plus" size={26} /></button>
          <NavLink to="/notifiche"><Icon name="bell" /><span>Avvisi</span>{unread > 0 && <b className="badge">{unread}</b>}</NavLink>
          <NavLink to={`/u/${me.username}`}><Icon name="user" /><span>Profilo</span></NavLink>
        </nav>
      )}
      <CreateSheet open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
