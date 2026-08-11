// Global "are tokens even a thing here" flag, set once after login/kiosk
// load (App.tsx/Display.tsx) from familyFeatureEnabled(family, 'tokens') -
// same global-mutable-flag pattern celebrate.ts already uses for its sound
// on/off toggle. TokenBadge is the single canonical place a token amount
// renders (chore costs, balances, prize costs, ledger entries, award
// values, redemption costs - see the doc comment below) so gating HERE
// hides every one of those site-wide the instant tokens are turned off,
// instead of threading familyFeatureEnabled through every component that
// happens to render one. Doesn't touch any actual data/balance - purely
// visual.
let tokensVisible = true;
export function setTokensBadgeEnabled(on: boolean) {
  tokensVisible = on;
}

// Single canonical look for a token amount, wherever it shows up - chore cost
// tags, balances, prize costs, ledger entries. Two sizes: 'sm' for an inline
// tag next to other content, 'lg' for a standalone "you have N" display.
export default function TokenBadge({
  icon,
  amount,
  label,
  size = 'sm',
}: {
  icon: string;
  amount: number | string;
  label?: string;
  size?: 'sm' | 'lg';
}) {
  if (!tokensVisible) return null;
  const cls =
    size === 'lg'
      ? 'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-700'
      : 'inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700';
  return (
    <span className={cls}>
      <span>{icon}</span>
      <span>{amount}</span>
      {label && <span className="font-normal">{label}</span>}
    </span>
  );
}
