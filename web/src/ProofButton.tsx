import { useRef, useState } from 'react';
import type { ChoreClient } from './api';
import { resizeImageFile } from './Prize';

// Photo-proof attach/replace button for an OPEN occurrence of a
// requireProof chore. `capture` hints phone/tablet cameras straight to the
// rear lens; desktop browsers fall back to a normal file picker.
export default function ProofButton({
  client,
  instanceId,
  hasProof,
  onChanged,
}: {
  client: ChoreClient;
  instanceId: string;
  hasProof: boolean;
  onChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const dataUri = await resizeImageFile(file, 800, 0.7);
      await client.attachProof(instanceId, dataUri);
      onChanged();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }
  return (
    <>
      <button
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={`rounded-md border px-3 py-1 text-xs disabled:opacity-50 ${hasProof ? 'text-green-600' : 'hover:bg-slate-50'}`}
      >
        {busy ? 'Uploading…' : hasProof ? '📷 Photo added ✓' : '📷 Add photo'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
    </>
  );
}
