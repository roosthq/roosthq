import type { CropRect, Redemption, StorePrize } from './api';
import TokenBadge from './TokenBadge';
import Modal from './Modal';
import LucideIcon from './LucideIcon';
import { cropBackgroundStyle } from './ImageCropper';
import { formatDate } from './dateFormat';

// Every prize gets one of these - keeps the type row present on every card
// (instead of Event showing a tag and Item showing nothing) so card heights
// line up. `icon` is a Lucide icon name (see LucideIcon.tsx) - render via
// <LucideIcon name={TYPE_TAG[type].icon}/>, not as raw text.
export const TYPE_TAG: Record<StorePrize['type'], { icon: string; slot: string; label: string; className: string }> = {
  ITEM: { icon: 'gift', slot: 'prize.item', label: 'Item', className: 'text-slate-500' },
  EVENT: { icon: 'ticket', slot: 'prize.event', label: 'Event', className: 'text-purple-500' },
};

// Downscale + re-encode client-side so an uploaded photo doesn't blow up the
// request body or the database row - this app stores images as data: URIs,
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

// Two render modes: no `crop` (the full/uncropped detail view) uses
// object-contain so the whole image is always visible - a taller box with
// letterboxing beats a cropped one there. With a `crop` (the small store
// card) renders as a sized+positioned background instead of an <img> -
// shows only the saved rect, at whatever size this box is, without ever
// touching the source image/URL (see Prize.imageCrop in schema.prisma).
export function PrizeImage({
  src,
  alt,
  className,
  crop,
}: {
  src?: string | null;
  alt: string;
  className: string;
  crop?: CropRect | null;
}) {
  if (src && crop) {
    // NOT the bg-slate-100 class here - the theme bridge remaps it to a
    // `background` SHORTHAND with !important (see index.css), which resets
    // every background-* longhand including the ones set below, `!important`
    // stylesheet rules beating inline styles regardless of shorthand vs
    // longhand. Same fallback tint, just via backgroundColor directly so it
    // can't collide.
    return (
      <div
        role="img"
        aria-label={alt}
        className={className}
        style={{ backgroundColor: '#f1f5f9', backgroundImage: `url(${JSON.stringify(src)})`, ...cropBackgroundStyle(crop) }}
      />
    );
  }
  if (src) return <img src={src} alt={alt} className={`${className} bg-slate-100 object-contain`} />;
  return (
    <div className={`${className} flex items-center justify-center bg-slate-100 text-slate-300`}>
      <LucideIcon name="gift" size={36} />
    </div>
  );
}

export function PrizeDetailModal({
  prize,
  tokenName,
  tokenIcon,
  isAdult,
  balance,
  history,
  memberName,
  onClose,
  onRedeem,
  canRedeem = true,
  presenceBlocked = false,
  onEdit,
  onDelete,
  onToggleArchive,
  onMarkUsed,
}: {
  prize: StorePrize;
  tokenName: string;
  tokenIcon: string;
  isAdult: boolean;
  balance: number;
  // Purchase history for this prize - adults/owners only; omit entirely for kids.
  history?: Redemption[];
  memberName?: (id: string) => string;
  onClose: () => void;
  onRedeem: () => void;
  // false when a kid's "redeem prizes" permission is switched off - they can
  // still browse, they just can't spend (server enforces it as well).
  canRedeem?: boolean;
  // #9 - true when this person is away/on vacation right now. Deliberately
  // separate from canRedeem: it disables the same button without changing
  // its label - no "ask a grown-up"-style explanation, the presence badge
  // elsewhere on the page is the only signal.
  presenceBlocked?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleArchive?: () => void;
  onMarkUsed?: (redemptionId: string, used: boolean) => void;
}) {
  return (
    <Modal
      maxWidthClass="max-w-lg"
      // View-only (Edit/Delete below just open a DIFFERENT modal, nothing
      // here is itself being typed into) - safe to dismiss by tapping
      // outside, unlike a form where that would silently drop a draft.
      onBackdropClick={onClose}
      header={
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 break-words text-lg font-semibold">{prize.name}</h3>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2">
          {!isAdult ? (
            <button
              onClick={onRedeem}
              disabled={balance < prize.tokenCost || !canRedeem || presenceBlocked}
              title={canRedeem ? undefined : 'Ask a grown-up to redeem this for you'}
              className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-40"
            >
              {!canRedeem ? 'Ask a grown-up' : balance < prize.tokenCost ? 'Not enough' : 'Redeem'}
            </button>
          ) : (
            <>
              {onDelete && (
                <button onClick={onDelete} className="btn-delete rounded px-4 py-1.5 text-sm">
                  Delete
                </button>
              )}
              {onToggleArchive && (
                <button onClick={onToggleArchive} className="rounded border px-4 py-1.5 text-sm hover:bg-slate-50">
                  {prize.archived ? 'Revive' : 'Archive'}
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
      }
    >
        <PrizeImage src={prize.image} alt={prize.name} className="h-72 w-full rounded" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TokenBadge icon={tokenIcon} amount={prize.tokenCost} label={tokenName} size="lg" />
          <span className={`flex items-center gap-1 text-sm ${TYPE_TAG[prize.type].className}`}>
            <LucideIcon name={TYPE_TAG[prize.type].icon} slot={TYPE_TAG[prize.type].slot} size={14} /> {TYPE_TAG[prize.type].label}
          </span>
          {prize.location && <span className="text-sm text-slate-400">📍 {prize.location.name}</span>}
          {prize.archived && <span className="text-sm font-medium text-amber-600">Archived</span>}
        </div>
        {prize.description ? (
          <p className="mt-3 text-sm text-slate-600">{prize.description}</p>
        ) : (
          <p className="mt-3 text-sm italic text-slate-300">No description</p>
        )}
        {isAdult && prize.realPrice != null && (
          <p className="mt-2 text-xs text-slate-400">Real price: ${String(prize.realPrice)}</p>
        )}
        {isAdult && (
          <p className="mt-1 text-xs text-slate-400">
            {prize.repeatable ? 'Repeats - stays in the store after purchase.' : 'One-off - archives itself once bought.'}
          </p>
        )}
        {prize.createdByName && <p className="mt-1 text-xs text-slate-400">Added by {prize.createdByName}</p>}
        {prize.url && (
          <a href={prize.url} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-blue-600 hover:underline">
            View product ↗
          </a>
        )}

        {isAdult && history && (
          <div className="mt-4 border-t pt-3">
            <h4 className="text-sm font-semibold">Purchase history</h4>
            {history.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">Nobody's bought this yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {history.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 border-b py-1">
                    <span className="min-w-0 flex-1 break-words">
                      <strong className="font-medium">{r.user?.displayName ?? memberName?.(r.userId) ?? 'Someone'}</strong>{' '}
                      <span className="text-xs text-slate-400">
                        {formatDate(r.requestedAt)} · {r.status.toLowerCase()}
                        {r.usedAt ? ` · used ${formatDate(r.usedAt)}` : ''}
                      </span>
                    </span>
                    {onMarkUsed && r.status === 'FULFILLED' && r.prize.type === 'EVENT' && (
                      <button
                        onClick={() => onMarkUsed(r.id, !r.usedAt)}
                        className="shrink-0 rounded border px-2 py-0.5 text-xs hover:bg-slate-50"
                      >
                        {r.usedAt ? 'Mark not used' : 'Mark as used'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
    </Modal>
  );
}
