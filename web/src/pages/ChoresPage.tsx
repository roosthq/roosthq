import type { Me } from '../api';
import ChoresPanel from '../ChoresPanel';
import ChoreHistoryPanel from '../ChoreHistoryPanel';
import ChoreAuditPanel from '../ChoreAuditPanel';

export default function ChoresPage({ me }: { me: Me }) {
  const isAdult = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER' || me.role === 'ADULT';
  const isTopManager = me.role === 'OWNER' || me.role === 'FAMILY_MANAGER';
  return (
    <>
      <ChoresPanel me={me} showPending />
      {isAdult && <ChoreHistoryPanel />}
      {isTopManager && <ChoreAuditPanel />}
    </>
  );
}
