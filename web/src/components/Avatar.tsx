export default function Avatar({ user, size = 40 }: { user: { displayName: string; avatarUrl: string | null }; size?: number }) {
  const initials = user.displayName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return user.avatarUrl
    ? <img className="avatar" src={user.avatarUrl} alt="" style={{ width: size, height: size }} />
    : <span className="avatar avatar-initials" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</span>;
}
