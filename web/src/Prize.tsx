import { useState } from 'react';
import type { CropRect, Member, Redemption, StorePrize } from './api';
import TokenBadge from './TokenBadge';
import Modal from './Modal';
import LucideIcon from './LucideIcon';
import { cropBackgroundStyle } from './ImageCropper';
import { formatDate } from './dateFormat';

// Mirrors PrizesService.formatPassQuantity server-side exactly - "a 30
// minute pass" (TIME, qty 1), "a 1 hour pass" (TIME, qty 2 @ 30 min/unit),
// "3 cookies" (COUNT). Used both for the buy card's live preview and here,
// in purchase history, so the same purchase reads the same way everywhere.
export function formatPassQuantity(
  prize: { passUnitKind?: 'TIME' | 'COUNT' | null; passUnitMinutes?: number | null; passUnitLabel?: string | null; passUnitLabelPlural?: string | null },
  quantity: number,
): string {
  if (prize.passUnitKind === 'TIME' && prize.passUnitMinutes) {
    const totalMin = prize.passUnitMinutes * quantity;
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    const phrase = hrs === 0 ? `${mins} minute` : mins === 0 ? `${hrs} hour${hrs > 1 ? 's' : ''}` : `${hrs} hr ${mins} min`;
    return `a ${phrase} pass`;
  }
  if (prize.passUnitKind === 'COUNT' && prize.passUnitLabel) {
    const noun = quantity === 1 ? prize.passUnitLabel : prize.passUnitLabelPlural || `${prize.passUnitLabel}s`;
    return `${quantity} ${noun}`;
  }
  return `×${quantity}`;
}

// Every prize gets one of these - keeps the type row present on every card
// (instead of Event showing a tag and Item showing nothing) so card heights
// line up. `icon` is a Lucide icon name (see LucideIcon.tsx) - render via
// <LucideIcon name={TYPE_TAG[type].icon}/>, not as raw text.
export const TYPE_TAG: Record<StorePrize['type'], { icon: string; slot: string; label: string; className: string }> = {
  ITEM: { icon: 'gift', slot: 'prize.item', label: 'Item', className: 'text-slate-500' },
  EVENT: { icon: 'ticket', slot: 'prize.event', label: 'Event', className: 'text-purple-500' },
  PASS: { icon: 'zap', slot: 'prize.pass', label: 'Pass', className: 'text-slate-500' },
};

// The kid-friendly "quick" card for a PASS prize - no modal for the common
// path (Casey's own instruction: "should be quick and kid friendly"), just
// a quantity stepper and one buy button right on the card. An adult gets a
// plain manage card instead (tap opens the same PrizeDetailModal every
// other prize type uses - editing a PASS isn't a "quick" action).
export function PassCard({
  prize,
  tokenIcon,
  isAdult,
  balance,
  canRedeem = true,
  presenceBlocked = false,
  onBuy,
  onManage,
  compact = false,
}: {
  prize: StorePrize;
  tokenIcon: string;
  isAdult: boolean;
  balance: number;
  canRedeem?: boolean;
  presenceBlocked?: boolean;
  onBuy: (quantity: number) => void;
  onManage: () => void;
  // Kiosk's Quick Passes are half-width, two to a row (see PrizesPanel) -
  // the full-size padding/button/text scale that's right on StorePage's
  // wide grid reads oversized there. Tightens padding/type/controls; the
  // aspect-[16/9] image itself is untouched, it already scales with width.
  compact?: boolean;
}) {
  const [qty, setQty] = useState(1);
  const pad = compact ? 'p-1.5' : 'p-3';
  const stepBtn = compact ? 'h-6 w-6 text-sm' : 'h-8 w-8 text-lg';

  if (isAdult) {
    return (
      <button onClick={onManage} className="flex w-full flex-col overflow-hidden rounded-xl border bg-white text-left hover:shadow-sm">
        {/* Same aspect-[16/9] box the main grid cards use (see StorePage) -
            the crop rect is chosen against THAT box, so matching it here is
            what makes the crop display correctly instead of squished. This
            is also just... big enough to actually see the picture. */}
        <PrizeImage src={prize.image} alt={prize.name} crop={prize.imageCrop} className="aspect-[16/9] w-full" />
        <div className={pad}>
          <p className={`truncate font-medium leading-tight ${compact ? 'text-xs' : ''}`} title={prize.name}>
            {prize.name}
          </p>
          {!compact && (
            <p className="mt-0.5 text-xs text-slate-400">
              {formatPassQuantity(prize, 1)} · <TokenBadge icon={tokenIcon} amount={prize.tokenCost} /> per unit
              {!prize.requiresApproval && ' · auto-grants'}
              {(prize.passDailyLimit || prize.passWeeklyLimit || prize.passMonthlyLimit) &&
                ` · max ${[
                  prize.passDailyLimit && `${prize.passDailyLimit}/day`,
                  prize.passWeeklyLimit && `${prize.passWeeklyLimit}/wk`,
                  prize.passMonthlyLimit && `${prize.passMonthlyLimit}/mo`,
                ]
                  .filter(Boolean)
                  .join(', ')}`}
            </p>
          )}
        </div>
      </button>
    );
  }

  // Capped by whatever's tighter: the balance, the day/week/month limit
  // (remainingNow, computed server-side in PrizesService.list so it can
  // never disagree with what redeem() actually enforces), or a flat 20 as
  // a sane absolute ceiling on the stepper regardless of either.
  const balanceMax = prize.tokenCost > 0 ? Math.floor(balance / prize.tokenCost) : 20;
  const limitMax = prize.remainingNow ?? Infinity;
  const maxQty = Math.max(0, Math.min(balanceMax, limitMax, 20));
  const clampedQty = Math.min(Math.max(1, qty), Math.max(1, maxQty));
  const totalCost = prize.tokenCost * clampedQty;
  const limitReached = maxQty === 0 && limitMax === 0;
  const cantAfford = maxQty === 0 && !limitReached;
  const disabled = maxQty === 0 || !canRedeem || presenceBlocked;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-white">
      {/* Same aspect-[16/9] box the main grid cards use (see StorePage) -
          the crop rect is chosen against THAT box, so matching it here is
          what makes the crop display correctly instead of squished. This
          is also just... big enough to actually see the picture. */}
      <PrizeImage src={prize.image} alt={prize.name} crop={prize.imageCrop} className="aspect-[16/9] w-full" />

      <div className={`flex flex-col ${compact ? 'gap-1' : 'gap-2'} ${pad}`}>
        <div>
          <p className={`truncate font-medium leading-tight ${compact ? 'text-xs' : ''}`} title={prize.name}>
            {prize.name}
          </p>
          {!compact && (
            <p className="text-xs text-slate-400">
              <TokenBadge icon={tokenIcon} amount={prize.tokenCost} /> per unit
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={clampedQty <= 1}
              aria-label="Fewer"
              className={`flex items-center justify-center rounded-full border font-semibold disabled:opacity-30 ${stepBtn}`}
            >
              −
            </button>
            <span className={`text-center font-semibold ${compact ? 'w-4 text-sm' : 'w-6 text-lg'}`}>{clampedQty}</span>
            <button
              onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              disabled={clampedQty >= maxQty}
              aria-label="More"
              className={`flex items-center justify-center rounded-full border font-semibold disabled:opacity-30 ${stepBtn}`}
            >
              +
            </button>
          </div>
          <TokenBadge icon={tokenIcon} amount={totalCost} />
        </div>

        <p className={`text-center font-medium text-slate-500 ${compact ? 'text-[10px] leading-tight' : 'text-xs'}`}>
          You're purchasing {formatPassQuantity(prize, clampedQty)}
        </p>

        <button
          onClick={() => onBuy(clampedQty)}
          disabled={disabled}
          title={canRedeem ? undefined : 'Ask a grown-up to redeem this for you'}
          className={`rounded-lg bg-slate-800 font-semibold text-white hover:bg-slate-700 disabled:opacity-40 ${compact ? 'py-1 text-xs' : 'py-2 text-sm'}`}
        >
          {!canRedeem ? 'Ask a grown-up' : limitReached ? 'Limit reached' : cantAfford ? 'Not enough' : prize.requiresApproval ? 'Ask for it' : 'Get it now'}
        </button>
      </div>
    </div>
  );
}

// Purchase history display, collapsed to one line per person per day - a
// repeatable prize (e.g. "30 min of screen time") bought several times in
// one day would otherwise flood this list with identical-looking rows. Same
// person + same calendar day (viewer's local time) + same status, and for
// an EVENT also the same used/not-used state (so "mark as used" toggling
// the whole group stays unambiguous) collapse into one group; anything else
// stays its own row.
function groupHistory(history: Redemption[]): Redemption[][] {
  const groups = new Map<string, Redemption[]>();
  const order: string[] = [];
  for (const r of history) {
    const d = new Date(r.requestedAt);
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const key = [r.userId, dayKey, r.status, r.prize.type === 'EVENT' ? String(!!r.usedAt) : ''].join('|');
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(r);
  }
  // `history` arrives sorted newest-first, so within each group the first
  // item encountered is already that group's most recent - no re-sort needed.
  return order.map((key) => groups.get(key)!);
}

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
  members,
  memberName,
  onClose,
  onRedeem,
  canRedeem = true,
  presenceBlocked = false,
  onEdit,
  onDelete,
  onToggleArchive,
  onMarkUsed,
  onChargeCoViewer,
}: {
  prize: StorePrize;
  tokenName: string;
  tokenIcon: string;
  isAdult: boolean;
  balance: number;
  // Purchase history for this prize - adults/owners only; omit entirely for kids.
  history?: Redemption[];
  // Family roster, for the "who watched along?" picker below - adults only,
  // same gate as history. Omit to leave that action off entirely (e.g. no
  // onChargeCoViewer wired at this call site).
  members?: Member[];
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
  // Charges a family member for watching/using a FULFILLED redemption along
  // with whoever actually paid for it (see PLANNING.md's fairness note).
  onChargeCoViewer?: (redemptionId: string, userId: string, tokens: number) => void | Promise<void>;
}) {
  // Which redemption row currently has its "charge a co-viewer" picker open -
  // at most one at a time, reset whenever it's submitted or dismissed.
  const [chargingRow, setChargingRow] = useState<string | null>(null);
  const [coViewerId, setCoViewerId] = useState('');
  const [coViewerTokens, setCoViewerTokens] = useState(prize.tokenCost);

  function openCharger(redemptionId: string) {
    setChargingRow(redemptionId);
    setCoViewerId('');
    setCoViewerTokens(prize.tokenCost);
  }

  return (
    <Modal
      maxWidthClass="max-w-lg"
      // View-only (Edit/Delete below just open a DIFFERENT modal, nothing
      // here is itself being typed into) - safe to dismiss by tapping
      // outside, unlike a form where that would silently drop a draft.
      onBackdropClick={onClose}
      header={<h3 className="min-w-0 flex-1 break-words text-lg font-semibold">{prize.name}</h3>}
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
                {groupHistory(history).map((group) => {
                  const r = group[0]; // most recent in the group - represents it for name/date/status/type
                  const totalSpent = group.reduce((sum, g) => sum + g.tokensSpent, 0);
                  const totalQty = group.reduce((sum, g) => sum + (g.quantity || 1), 0);
                  const coViewers = group.flatMap((g) => g.coViewers ?? []);
                  // A new co-view charge attaches to the group's most recent
                  // purchase - which specific one of the day's purchases it's
                  // "for" doesn't really mean anything; it's just bookkeeping.
                  const anchorId = r.id;
                  // Anyone but the redeemer, and never someone whose tokens
                  // are turned off (charging them would just 400 server-side -
                  // don't offer a button that's guaranteed to fail).
                  const candidates = (members ?? []).filter((m) => m.id !== r.userId && !m.tokensDisabled);
                  const alreadyCharged = coViewerId ? coViewers.find((cv) => cv.userId === coViewerId) : undefined;
                  return (
                    <li key={anchorId} className="flex flex-col gap-1.5 border-b py-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 break-words">
                          <strong className="font-medium">{r.user?.displayName ?? memberName?.(r.userId) ?? 'Someone'}</strong>{' '}
                          <span className="text-xs text-slate-400">
                            {formatDate(r.requestedAt)} · {r.status.toLowerCase()}
                            {r.prize.type === 'PASS' ? ` · ${formatPassQuantity(prize, totalQty)}` : group.length > 1 ? ` · ${group.length}×` : ''}
                            {r.usedAt ? ` · used ${formatDate(r.usedAt)}` : ''}
                          </span>{' '}
                          <span className="text-xs font-medium text-slate-500">
                            {totalSpent} {tokenName}
                          </span>
                        </span>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {onMarkUsed && r.status === 'FULFILLED' && r.prize.type === 'EVENT' && (
                            <button
                              onClick={() => group.forEach((g) => onMarkUsed(g.id, !r.usedAt))}
                              className="rounded border px-2 py-1 text-xs hover:bg-slate-50"
                            >
                              {r.usedAt ? 'Mark not used' : 'Mark as used'}
                            </button>
                          )}
                          {onChargeCoViewer && r.status === 'FULFILLED' && candidates.length > 0 && (
                            <button
                              onClick={() => (chargingRow === anchorId ? setChargingRow(null) : openCharger(anchorId))}
                              className="rounded border px-2 py-1 text-xs hover:bg-slate-50"
                            >
                              {chargingRow === anchorId ? 'Cancel' : '+ Charge a co-viewer'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Shown regardless of which adult logged it, and
                          regardless of which of the group's purchases it's
                          attached to - the whole point is a second adult
                          sees this before charging the same person again. */}
                      {coViewers.length > 0 && (
                        <ul className="ml-0.5 space-y-0.5 text-xs text-slate-400">
                          {coViewers.map((cv) => (
                            <li key={cv.id}>
                              Also charged <strong className="font-medium text-slate-500">{cv.displayName}</strong> {cv.tokens} {tokenName}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Deliberately inline, not a nested modal - a second
                          modal stacked on top of this one is awkward on a
                          phone (two headers, two backdrops) for what's just
                          two fields. Grows the row instead. */}
                      {chargingRow === anchorId && (
                        <div className="mt-0.5 flex flex-wrap items-end gap-2 rounded-lg border bg-slate-50 p-2.5">
                          <label className="text-xs">
                            <span className="mb-0.5 block text-slate-500">Who watched?</span>
                            <select
                              value={coViewerId}
                              onChange={(e) => setCoViewerId(e.target.value)}
                              className="rounded border px-2 py-1.5 text-sm"
                            >
                              <option value="">Choose…</option>
                              {candidates.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.displayName}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs">
                            <span className="mb-0.5 block text-slate-500">{tokenName}</span>
                            <input
                              type="number"
                              min={1}
                              value={coViewerTokens}
                              onChange={(e) => setCoViewerTokens(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                              onFocus={(e) => e.target.select()}
                              className="w-20 rounded border px-2 py-1.5 text-sm"
                            />
                          </label>
                          <button
                            disabled={!coViewerId}
                            onClick={async () => {
                              if (!onChargeCoViewer) return;
                              await onChargeCoViewer(anchorId, coViewerId, coViewerTokens);
                              setChargingRow(null);
                            }}
                            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-40"
                          >
                            Charge
                          </button>
                          {alreadyCharged && (
                            <p className="w-full text-xs text-amber-600">
                              Already charged {alreadyCharged.tokens} {tokenName} for this - charging again adds another entry.
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
    </Modal>
  );
}
