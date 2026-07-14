import type { Me } from '../api';
import ChoresPanel from '../ChoresPanel';

export default function ChoresPage({ me }: { me: Me }) {
  return <ChoresPanel me={me} />;
}
