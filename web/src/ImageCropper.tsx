import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import Modal from './Modal';

export interface CropRect {
  x: number; // % of the image's natural width, left edge
  y: number; // % of the image's natural height, top edge
  w: number; // % width
  h: number; // % height
}

const DISPLAY_MAX = 420; // px - the modal's image preview box, either dimension
const MAX_ZOOM = 4; // how much tighter than the "largest that fits" box the crop can go

// Drag-to-position crop tool: the crop window is fixed at the largest size
// that fits the chosen aspect ratio inside the image (no zoom/resize handles
// - keeps this to a single interaction instead of a full pan+zoom widget),
// and the whole window drags around to choose which part of the image shows.
// Works for both mouse and touch via pointer events. Returns the chosen
// rectangle as percentages of the image's OWN natural dimensions, not
// display pixels - the caller decides what to do with it (crop for real, in
// pixels, for an avatar; or just save the rect as metadata for a prize card,
// leaving the source image untouched).
export default function ImageCropper({
  src,
  aspect,
  initial,
  title,
  onCancel,
  onConfirm,
}: {
  src: string;
  aspect: number; // crop box width / height
  initial?: CropRect | null;
  title?: string;
  onCancel: () => void;
  onConfirm: (rect: CropRect) => void;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [display, setDisplay] = useState<{ w: number; h: number }>({ w: DISPLAY_MAX, h: DISPLAY_MAX });
  // The zoom=1 box: largest at `aspect` that fits inside the displayed image.
  // Zooming shrinks the box toward this as a ceiling - box never grows past it.
  const [baseBox, setBaseBox] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number; x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ startX: number; startY: number; boxX: number; boxY: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      // DISPLAY_MAX (420px) is wider than the actual content area of a
      // phone-width modal card (~340px after Modal's own padding) - a wide
      // source image was overflowing straight past the edge of the card
      // instead of fitting inside it. Cap the WIDTH side by the real
      // viewport too; height stays DISPLAY_MAX since the modal's own
      // vertical scroll room is rarely the tighter constraint.
      const maxW = typeof window !== 'undefined' ? Math.min(DISPLAY_MAX, window.innerWidth - 80) : DISPLAY_MAX;
      const scale = Math.min(1, maxW / img.naturalWidth, DISPLAY_MAX / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      setDisplay({ w: dw, h: dh });

      // Crop box: largest at `aspect` that fits inside the displayed image.
      let bw = dw;
      let bh = bw / aspect;
      if (bh > dh) {
        bh = dh;
        bw = bh * aspect;
      }
      const baseW = bw;
      setBaseBox({ w: baseW, h: bh });
      // A saved rect may already be a zoomed-in (smaller) box than the base
      // size - rebuild the box from it directly instead of always starting
      // back at zoom 1, so re-opening the cropper shows what was actually
      // saved. zoom = baseW / savedW, since a box's width is baseW / zoom.
      if (initial && initial.w > 0) {
        bw = (initial.w / 100) * dw;
        bh = bw / aspect;
        setZoom(clamp(baseW / bw, 1, MAX_ZOOM));
      } else {
        setZoom(1);
      }
      const startX = initial ? (initial.x / 100) * dw : (dw - bw) / 2;
      const startY = initial ? (initial.y / 100) * dh : (dh - bh) / 2;
      setBox({ w: bw, h: bh, x: clamp(startX, 0, dw - bw), y: clamp(startY, 0, dh - bh) });
    };
    img.src = src;
  }, [src, aspect, initial]);

  // Slide the zoom control: box shrinks toward the image (tighter crop) as
  // zoom increases, growing back out toward baseBox at zoom 1. Recenters on
  // whatever the box's center currently is so zooming doesn't jump the crop
  // somewhere unexpected, then re-clamps into the display bounds.
  function applyZoom(z: number) {
    if (!baseBox || !box) return;
    const nz = clamp(z, 1, MAX_ZOOM);
    const nw = baseBox.w / nz;
    const nh = baseBox.h / nz;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    setZoom(nz);
    setBox({
      w: nw,
      h: nh,
      x: clamp(cx - nw / 2, 0, display.w - nw),
      y: clamp(cy - nh / 2, 0, display.h - nh),
    });
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (!box) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, boxX: box.x, boxY: box.y };
  }
  function onPointerMove(e: ReactPointerEvent) {
    if (!dragRef.current || !box) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setBox({
      ...box,
      x: clamp(dragRef.current.boxX + dx, 0, display.w - box.w),
      y: clamp(dragRef.current.boxY + dy, 0, display.h - box.h),
    });
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function confirm() {
    if (!box || !natural || display.w === 0 || display.h === 0) return;
    onConfirm({
      x: (box.x / display.w) * 100,
      y: (box.y / display.h) * 100,
      w: (box.w / display.w) * 100,
      h: (box.h / display.h) * 100,
    });
  }

  return (
    <Modal
      header={<h3 className="text-lg font-semibold">{title ?? 'Crop image'}</h3>}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded border px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!box}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Use this crop
          </button>
        </div>
      }
    >
      <p className="mb-2 text-xs text-slate-400">Drag the box to choose what shows on the card.</p>
      <div
        className="relative mx-auto touch-none select-none overflow-hidden rounded bg-slate-900"
        style={{ width: display.w, height: display.h }}
      >
        <img src={src} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
        {box && (
          <>
            {/* Darken everything outside the crop box - four bars around it rather
                than a mask/clip-path, so this stays plain divs. */}
            <div className="absolute inset-x-0 top-0 bg-black/50" style={{ height: box.y }} />
            <div className="absolute inset-x-0 bottom-0 bg-black/50" style={{ top: box.y + box.h }} />
            <div className="absolute bg-black/50" style={{ left: 0, top: box.y, width: box.x, height: box.h }} />
            <div className="absolute bg-black/50" style={{ left: box.x + box.w, top: box.y, right: 0, height: box.h }} />
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="absolute cursor-move border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
            />
          </>
        )}
      </div>
      {box && (
        <div className="mt-3 flex items-center gap-2 text-slate-400">
          <span className="text-sm">−</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.02}
            value={zoom}
            onChange={(e) => applyZoom(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-sm">🔍+</span>
        </div>
      )}
    </Modal>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max < min ? min : max);
}

// Physically crops+re-encodes - for an avatar, where the app already always
// stores a fresh downscaled copy (never the original), so there's no "keep
// the original intact" requirement to preserve. NOT used for prizes: those
// keep the crop as metadata only (see StorePage's imageCrop), since a prize
// image can be a URL with no local pixels to touch.
export function cropImageToDataUri(src: string, rect: CropRect, maxDim = 320, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('Could not read that image'));
    img.onload = () => {
      const sx = (rect.x / 100) * img.naturalWidth;
      const sy = (rect.y / 100) * img.naturalHeight;
      const sw = (rect.w / 100) * img.naturalWidth;
      const sh = (rect.h / 100) * img.naturalHeight;
      const scale = Math.min(1, maxDim / Math.max(sw, sh));
      const dw = Math.round(sw * scale);
      const dh = Math.round(sh * scale);
      const canvas = document.createElement('canvas');
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = src;
  });
}

// CSS technique for a NON-destructive crop preview: a background-image sized
// and positioned so only the saved rect shows, at whatever size the caller's
// container is - the source pixels/URL are never touched. Spread this onto
// a container div's style (with backgroundImage additionally set to the
// image src) instead of rendering an <img>.
export function cropBackgroundStyle(rect: CropRect | null | undefined): CSSProperties {
  if (!rect || rect.w <= 0 || rect.h <= 0) return { backgroundSize: 'cover', backgroundPosition: 'center' };
  const bgWidthPct = 10000 / rect.w; // background-size width needed so the rect's own width fills the box
  const bgHeightPct = 10000 / rect.h;
  // background-position: 0% means the rect's left edge is at the box's left
  // edge; 100% means the rect's right edge is at the box's right edge -
  // interpolate by how far into the (background-size - box-size) span the
  // rect's offset sits.
  const posX = rect.w >= 100 ? 0 : (rect.x / (100 - rect.w)) * 100;
  const posY = rect.h >= 100 ? 0 : (rect.y / (100 - rect.h)) * 100;
  return {
    backgroundSize: `${bgWidthPct}% ${bgHeightPct}%`,
    backgroundPosition: `${posX}% ${posY}%`,
    backgroundRepeat: 'no-repeat',
  };
}
