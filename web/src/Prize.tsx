import type { StorePrize } from './api';
import TokenBadge from './TokenBadge';

// Every prize gets one of these — keeps the type row present on every card
// (instead of Event showing a tag and Item showing nothing) so card heights
// line up.
export const TYPE_TAG: Record<StorePrize['type'], { icon: string; label: string; className: string }> = {
  ITEM: { icon: '📦', label: 'Item', className: 'text-slate-500' },
  EVENT: { icon: '🎟', label: 'Event', className: 'text-purple-500' },
};

// Downscale + re-encode client-side so an uploaded photo doesn't blow up the
// request body or the database row — this app stores images as data: URIs,
// no separate file storage.
export function resizeImageFile(file: File, maxDim = 480, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function PrizeImage({ src, alt, className }: { src?: string | null; alt: string; className: string }) {
  if (src) return <img src={src} alt={alt} className={`${className} object-cover`} />;
  return (
    <div className={`${className} flex items-center justify-center bg-slate-100 text-slate-300`}>
      <span className="text-4xl">🎁</span>
    </div>
  );
}

export function PrizeDetailModal({
  prize,
  tokenName,
  tokenIcon,
  isAdult,
  balance,
  onClose,
  onRedeem,
  onEdit,
  onDelete,
}: {
  prize: StorePrize;
  tokenName: string;
  tokenIcon: string;
  isAdult: boolean;
  balance: number;
  onClose: () => void;
  onRedeem: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-lg bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 break-words text-lg font-semibold">{prize.name}</h3>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <PrizeImage src={prize.image} alt={prize.name} className="mt-3 h-56 w-full rounded" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TokenBadge icon={tokenIcon} amount={prize.tokenCost} label={tokenName} size="lg" />
          <span className={`text-sm ${TYPE_TAG[prize.type].className}`}>
            {TYPE_TAG[prize.type].icon} {TYPE_TAG[prize.type].label}
          </span>
          {prize.location && <span className="text-sm text-slate-400">📍 {prize.location.name}</span>}
        </div>
        {prize.description ? (
          <p className="mt-3 text-sm text-slate-600">{prize.description}</p>
        ) : (
          <p className="mt-3 text-sm italic text-slate-300">No description</p>
        )}
        {isAdult && prize.realPrice != null && (
          <p className="mt-2 text-xs text-slate-400">Real price: ${String(prize.realPrice)}</p>
        )}
        {prize.url && (
          <a href={prize.url} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-blue-600 hover:underline">
            View product ↗
          </a>
        )}
        <div className="mt-5 flex justify-end gap-2">
          {!isAdult ? (
            <button
              onClick={onRedeem}
              disabled={balance < prize.tokenCost}
              className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-40"
            >
              {balance < prize.tokenCost ? 'Not enough' : 'Redeem'}
            </button>
          ) : (
            <>
              {onDelete && (
                <button onClick={onDelete} className="rounded border px-4 py-1.5 text-sm text-red-500 hover:bg-red-50">
                  Delete
                </button>
              )}
              {onEdit && (
                <button onClick={onEdit} className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700">
                  Edit
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
