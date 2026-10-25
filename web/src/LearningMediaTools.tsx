import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import Modal from './Modal';
import { mediaSrc } from './QuestionMedia';

// Owner tools for adding your own pictures and sounds to Learning questions.
// Everything an owner picks is converted HERE, in the browser, to the one shape
// the app stores (and the server re-checks the bytes): pictures are exactly
// 800 x 600 (4:3), sounds are 44.1 kHz mono 16-bit WAV, at most 15 seconds.
// That is what keeps a custom picture from stretching, overflowing or
// shoving a question's layout around, on the app and the kiosk alike.

export const IMG_W = 800;
export const IMG_H = 600;
export const MAX_AUDIO_SEC = 15;
const MIN_AUDIO_SEC = 0.3;
const RATE = 44100;
const TEMPLATE_BASE = '/learning/templates/';

const readAsDataUri = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read that file'));
    r.readAsDataURL(blob);
  });

const btn = 'rounded border px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50';

// ---------------------------------------------------------------- pictures

type Fit = 'fill' | 'fit';
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function drawPicture(ctx: CanvasRenderingContext2D, img: ImageBitmap | HTMLImageElement, fit: Fit, zoom: number, panX: number, panY: number, bg: string) {
  const iw = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const ih = 'naturalHeight' in img ? img.naturalHeight : img.height;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, IMG_W, IMG_H);
  const base = fit === 'fill' ? Math.max(IMG_W / iw, IMG_H / ih) : Math.min(IMG_W / iw, IMG_H / ih);
  const dw = iw * base * zoom;
  const dh = ih * base * zoom;
  const maxX = Math.abs(dw - IMG_W) / 2;
  const maxY = Math.abs(dh - IMG_H) / 2;
  const x = (IMG_W - dw) / 2 + clamp(panX, -maxX, maxX);
  const y = (IMG_H - dh) / 2 + clamp(panY, -maxY, maxY);
  ctx.drawImage(img, x, y, dw, dh);
  return { maxX, maxY };
}

// Pick a file, frame it inside the exact picture shape (zoom + drag), and
// upload the result. What you see in the box is precisely what is stored.
function PictureEditor({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (path: string) => void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [img, setImg] = useState<ImageBitmap | HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fit, setFit] = useState<Fit>('fill');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [bg, setBg] = useState('#ffffff');
  const [guides, setGuides] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (typeof createImageBitmap === 'function') {
          const bmp = await createImageBitmap(file);
          if (alive) setImg(bmp);
          return;
        }
      } catch {
        /* fall through to <img> */
      }
      const url = URL.createObjectURL(file);
      const el = new Image();
      el.onload = () => alive && setImg(el);
      el.onerror = () => alive && setLoadError("That file can't be read as a picture. Use a JPG, PNG or WebP (phone HEIC photos need converting first).");
      el.src = url;
    })().catch(() => alive && setLoadError("That file can't be read as a picture. Use a JPG, PNG or WebP."));
    return () => {
      alive = false;
    };
  }, [file]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    const ctx = c.getContext('2d');
    if (ctx) drawPicture(ctx, img, fit, zoom, pan.x, pan.y, bg);
  }, [img, fit, zoom, pan, bg]);

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    const c = canvas.current;
    if (!d || !c) return;
    const scale = IMG_W / c.getBoundingClientRect().width;
    setPan({ x: d.px + (e.clientX - d.x) * scale, y: d.py + (e.clientY - d.y) * scale });
  }

  async function use() {
    const c = canvas.current;
    if (!c || !img) return;
    setBusy(true);
    setError(null);
    try {
      // WebP is small and sharp; Safari can't encode it and silently hands back
      // PNG, so ask for JPEG explicitly in that case to stay under the size cap.
      const toBlob = (type: string, q: number) => new Promise<Blob | null>((res) => c.toBlob(res, type, q));
      let blob = await toBlob('image/webp', 0.86);
      if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.88);
      if (!blob) throw new Error('Could not prepare that picture');
      const up = await api.uploadEduMedia('IMAGE', await readAsDataUri(blob));
      onDone(up.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed - try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      maxWidthClass="max-w-xl"
      onClose={onCancel}
      header={<h3 className="text-lg font-semibold">Frame your picture</h3>}
      footer={
        <div className="flex w-full justify-end gap-2">
          <button onClick={onCancel} className={btn}>
            Cancel
          </button>
          <button onClick={use} disabled={!img || busy} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50">
            {busy ? 'Saving…' : 'Use this picture'}
          </button>
        </div>
      }
    >
      {loadError ? (
        <p className="text-sm text-red-500">{loadError}</p>
      ) : !img ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Drag to move the picture. The box below is exactly what gets saved ({IMG_W} x {IMG_H}, 4:3) and exactly how kids see it.
          </p>
          <div className="relative mx-auto aspect-[4/3] w-full max-w-md overflow-hidden rounded-lg border bg-slate-100">
            <canvas
              ref={canvas}
              width={IMG_W}
              height={IMG_H}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
            />
            {guides && <div className="pointer-events-none absolute inset-[5%] rounded border-2 border-dashed border-green-500/80" />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">
              Zoom
              <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="mt-1 block w-full" />
            </label>
            <div className="text-xs text-slate-500">
              Shape
              <div className="mt-1 flex rounded border p-0.5 text-xs">
                {(['fill', 'fit'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setFit(f);
                      setZoom(1);
                      setPan({ x: 0, y: 0 });
                    }}
                    className={`flex-1 rounded px-2 py-1 ${fit === f ? 'bg-slate-800 text-white' : 'hover:bg-slate-50'}`}
                  >
                    {f === 'fill' ? 'Fill the box' : 'Show the whole picture'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
              Show safe-area guide
            </label>
            {fit === 'fit' && (
              <span className="flex items-center gap-1.5">
                Background
                {['#ffffff', '#f1f5f9', '#0f172a'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBg(c)}
                    aria-label={`Background ${c}`}
                    className={`h-5 w-5 rounded-full border ${bg === c ? 'ring-2 ring-slate-800' : ''}`}
                    style={{ background: c }}
                  />
                ))}
              </span>
            )}
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

// One picture slot: shows the current picture in the real 4:3 shape, lets the
// owner choose / replace / remove it.
export function PictureSlot({
  label,
  hint,
  path,
  onChange,
  compact,
}: {
  label: string;
  hint?: string;
  path: string | null | undefined;
  onChange: (path: string | null) => void;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        {path && (
          <button type="button" onClick={() => onChange(null)} className="text-[11px] text-slate-400 hover:text-red-500">
            Remove
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="relative mt-1 block aspect-[4/3] w-full overflow-hidden rounded-lg border-2 border-dashed bg-slate-50 hover:bg-slate-100"
        aria-label={path ? `Replace ${label}` : `Add ${label}`}
      >
        {path ? (
          <img src={mediaSrc(path)} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-slate-400">
            <span className="text-xl">🖼️</span>
            <span className={compact ? 'text-[10px]' : 'text-xs'}>Add picture</span>
          </span>
        )}
      </button>
      {hint && !compact && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) setFile(f);
        }}
      />
      {file && (
        <PictureEditor
          file={file}
          onCancel={() => setFile(null)}
          onDone={(p) => {
            setFile(null);
            onChange(p);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ sounds

function encodeWav(samples: Float32Array): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const tag = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  tag(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.round(clamp(samples[i], -1, 1) * 32767), true);
  return new Blob([buf], { type: 'audio/wav' });
}

// Trim, mix to mono, resample to 44.1 kHz, tiny fades (no clicks), and bring the
// loudest peak to a consistent level so no sound is far quieter than another.
async function renderSound(buf: AudioBuffer, start: number, end: number, normalize: boolean): Promise<Blob> {
  const dur = end - start;
  const frames = Math.max(1, Math.round(dur * RATE));
  const off = new OfflineAudioContext(1, frames, RATE);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start(0, start, dur);
  const out = (await off.startRendering()).getChannelData(0).slice();
  const fade = Math.min(Math.round(RATE * 0.01), Math.floor(out.length / 2));
  for (let i = 0; i < fade; i++) {
    out[i] *= i / fade;
    out[out.length - 1 - i] *= i / fade;
  }
  if (normalize) {
    let peak = 0;
    for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
    if (peak > 0.001) {
      const gain = 0.89 / peak;
      for (let i = 0; i < out.length; i++) out[i] *= gain;
    }
  }
  return encodeWav(out);
}

function SoundEditor({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (path: string) => void }) {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [normalize, setNormalize] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      try {
        const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
        if (!alive) return;
        setBuffer(decoded);
        setStart(0);
        setEnd(Math.min(decoded.duration, MAX_AUDIO_SEC));
      } finally {
        ctx.close().catch(() => undefined);
      }
    })().catch(() => alive && setLoadError("That file can't be read as a sound. Use an MP3, WAV, M4A or OGG."));
    return () => {
      alive = false;
    };
  }, [file]);

  const len = end - start;
  const tooLong = len > MAX_AUDIO_SEC + 0.001;
  const tooShort = len < MIN_AUDIO_SEC;

  async function preview() {
    if (!buffer || tooLong || tooShort) return;
    setError(null);
    try {
      const blob = await renderSound(buffer, start, end, normalize);
      const a = player.current ?? new Audio();
      player.current = a;
      a.src = URL.createObjectURL(blob);
      await a.play();
    } catch {
      setError("Couldn't play that preview.");
    }
  }

  async function use() {
    if (!buffer || tooLong || tooShort) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await renderSound(buffer, start, end, normalize);
      const up = await api.uploadEduMedia('AUDIO', await readAsDataUri(blob));
      onDone(up.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed - try again.');
    } finally {
      setBusy(false);
    }
  }

  const total = buffer?.duration ?? 0;
  return (
    <Modal
      maxWidthClass="max-w-md"
      onClose={onCancel}
      header={<h3 className="text-lg font-semibold">Prepare your sound</h3>}
      footer={
        <div className="flex w-full justify-end gap-2">
          <button onClick={onCancel} className={btn}>
            Cancel
          </button>
          <button
            onClick={use}
            disabled={!buffer || busy || tooLong || tooShort}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Use this sound'}
          </button>
        </div>
      }
    >
      {loadError ? (
        <p className="text-sm text-red-500">{loadError}</p>
      ) : !buffer ? (
        <p className="text-sm text-slate-400">Reading the sound…</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-slate-500">
            Sounds are saved as {MAX_AUDIO_SEC} seconds or less, converted to one clear mono format and levelled so every sound plays at a similar volume.
            Your file is {total.toFixed(1)} seconds long.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">
              Start at (seconds)
              <input
                type="number"
                min={0}
                max={Math.max(0, total - MIN_AUDIO_SEC)}
                step={0.1}
                value={start}
                onChange={(e) => setStart(clamp(Number(e.target.value) || 0, 0, Math.max(0, total - MIN_AUDIO_SEC)))}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-slate-500">
              End at (seconds)
              <input
                type="number"
                min={MIN_AUDIO_SEC}
                max={total}
                step={0.1}
                value={Number(end.toFixed(2))}
                onChange={(e) => setEnd(clamp(Number(e.target.value) || 0, 0, total))}
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <p className={`text-xs ${tooLong || tooShort ? 'text-red-500' : 'text-slate-500'}`}>
            Using {Math.max(0, len).toFixed(1)} seconds
            {tooLong && ` - too long, trim it to ${MAX_AUDIO_SEC} seconds or less`}
            {tooShort && ' - too short'}
          </p>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} />
            Even out the volume (recommended)
          </label>
          <button type="button" onClick={preview} disabled={tooLong || tooShort} className={btn}>
            ▶ Preview
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

export function SoundSlot({ path, onChange }: { path: string | null | undefined; onChange: (path: string | null) => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">Sound (optional)</span>
        {path && (
          <button type="button" onClick={() => onChange(null)} className="text-[11px] text-slate-400 hover:text-red-500">
            Remove
          </button>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {path && <audio controls preload="none" src={mediaSrc(path)} className="h-9 max-w-full" />}
        <button type="button" onClick={() => input.current?.click()} className={btn}>
          🔊 {path ? 'Replace sound' : 'Add sound'}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Plays when the question appears; kids can tap to hear it again. Up to {MAX_AUDIO_SEC} seconds.</p>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) setFile(f);
        }}
      />
      {file && (
        <SoundEditor
          file={file}
          onCancel={() => setFile(null)}
          onDone={(p) => {
            setFile(null);
            onChange(p);
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- guide

export function MediaGuide() {
  const dl = 'rounded border px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50';
  const card = 'rounded-lg border p-3';
  return (
    <details className="rounded-lg border p-2.5">
      <summary className="cursor-pointer text-sm font-medium">📐 Picture &amp; sound guide (sizes and templates)</summary>
      <p className="mt-1.5 text-xs text-slate-500">
        Pictures and sounds you add are converted to one fixed shape so they can never stretch, overflow or move a question around. Follow these and what
        you see in the preview is what kids see, on the app and the kiosk.
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <div className={card}>
          <h4 className="text-sm font-semibold">Question picture</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-500">
            <li>
              <b>{IMG_W} x {IMG_H} px, 4:3 landscape</b> (shown about 320 x 240)
            </li>
            <li>JPG, PNG or WebP in; saved as WebP</li>
            <li>Keep the subject inside the green safe box (5% in from every edge)</li>
            <li>No small text - it will be tiny on a phone</li>
            <li>Real photos or real illustrations read best</li>
            <li>Describe it in the alt text without giving away the answer</li>
          </ul>
          <a className={`${dl} mt-2 inline-block`} href={`${TEMPLATE_BASE}question-picture-800x600.png`} download>
            ⬇ Template (PNG)
          </a>
        </div>
        <div className={card}>
          <h4 className="text-sm font-semibold">Picture answers (2 to 4)</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-500">
            <li>
              Same <b>{IMG_W} x {IMG_H}, 4:3</b> as the question picture
            </li>
            <li>The A / B / C / D badge covers the top-left corner - keep it empty</li>
            <li>Match style, brightness and framing across all the answers</li>
            <li>No letters or words inside the pictures</li>
            <li>Make the right one clearly different from the others, not a near copy</li>
          </ul>
          <a className={`${dl} mt-2 inline-block`} href={`${TEMPLATE_BASE}picture-answer-800x600.png`} download>
            ⬇ Template (PNG)
          </a>
        </div>
        <div className={card}>
          <h4 className="text-sm font-semibold">Sound</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-500">
            <li>
              <b>Up to {MAX_AUDIO_SEC} seconds</b>, one clear sound or phrase
            </li>
            <li>MP3, WAV, M4A or OGG in; saved as 44.1 kHz mono 16-bit WAV</li>
            <li>Trim the silence at the start - it plays the moment the question shows</li>
            <li>Record close and quiet-room; volume is levelled for you</li>
            <li>For spoken questions, speak slowly and clearly</li>
          </ul>
          <a className={`${dl} mt-2 inline-block`} href={`${TEMPLATE_BASE}sample-sound-44100hz-mono-16bit.wav`} download>
            ⬇ Sample sound (WAV)
          </a>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Tip: open a template in any image editor, put your picture on a layer underneath it, then export just your picture (without the template layer).
      </p>
    </details>
  );
}
