import type { Me } from '../api';
import ChoresPanel from '../ChoresPanel';
import ChoreHistoryPanel from '../ChoreHistoryPanel';

export default function ChoresPage({ me }: { me: Me }) {
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  return (
    <>
      <ChoresPanel me={me} showPending />
      {isAdult && <ChoreHistoryPanel />}
    </>
  );
}
