import Icon from './Icon';

// Badge dei membri esperti, dato dal proprietario o da un amministratore.
export default function MentorBadge({ big = false }: { big?: boolean }) {
  return (
    <span className={`mentor-badge ${big ? 'big' : ''}`} title="Mentore: un membro esperto della comunità">
      <Icon name="mentor" size={big ? 16 : 13} /> Mentore
    </span>
  );
}
