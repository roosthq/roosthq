import { useRef, useState } from 'react';
import type { ChoreClient } from './api';
import { resizeImageFile } from './Prize';
import { useDialog } from './Dialog';

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
  const { alert } = useDialog();
  // Guards against picking again mid-upload firing a second, overlapping
  // attempt - the input stays clickable while busy (disabling just the
  // button doesn't stop a second tap on the invisible file input itself).
  const inFlight = useRef(false);
  async function onPick(file: File | undefined) {
    if (!file || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const dataUri = await resizeImageFile(file, 800, 0.7);
      await client.attachProof(instanceId, dataUri);
      onChanged();
    } catch (e) {
      // This used to fail silently - a bad photo (HEIC a phone camera
      // couldn't decode, a flaky upload) left "Add photo" looking untouched
      // with no clue why Complete stayed blocked. Surface it instead.
      await alert((e as Error).message || "Couldn't add that photo - try again.");
    } finally {
      inFlight.current = false;
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
        // Some mobile browsers (notably iOS home-screen/standalone PWAs)
        // don't reliably fire `change` after returning from the camera/photo
        // picker, even though the file DID get selected - `input` is the
        // other event a file input fires on selection, so this is a free
        // second chance at the exact same handler rather than a real
        // difference in behavior. onPick's own inFlight guard keeps a
        // browser that fires BOTH from double-submitting.
        onInput={(e) => onPick((e.target as HTMLInputElement).files?.[0])}
      />
    </>
  );
}
