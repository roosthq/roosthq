// Roost HQ brand lockup: pixel-owl mark (theme-aware) + wordmark. The mark is
// inline (not an <img>) so its fills can key off the same CSS variables as the
// rest of the app — one shape, automatically recolored for light/dark and for
// whichever per-person theme (see COLOR_THEMES in api.ts) is active.
//
// `size` is a design px value at the app's default 16px root font size; it's
// converted to rem here (not set as raw width/height attributes) so the whole
// lockup scales with data-font-size exactly like every other text-* element.
export default function Logo({ size = 28, wordmark = true }: { size?: number; wordmark?: boolean }) {
  const w = Math.round((size * 56) / 64);
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        viewBox="0 0 56 64"
        style={{ width: `${w / 16}rem`, height: `${size / 16}rem` }}
        role="img"
        aria-label="Roost HQ"
      >
        <title>Roost HQ</title>
        <rect x="8" y="0" width="8" height="8" className="owl-body" />
        <rect x="40" y="0" width="8" height="8" className="owl-body" />
        <rect x="8" y="8" width="8" height="8" className="owl-body" />
        <rect x="16" y="8" width="8" height="8" className="owl-body" />
        <rect x="24" y="8" width="8" height="8" className="owl-body" />
        <rect x="32" y="8" width="8" height="8" className="owl-body" />
        <rect x="40" y="8" width="8" height="8" className="owl-body" />
        <rect x="8" y="16" width="8" height="8" className="owl-eye" />
        <rect x="16" y="16" width="8" height="8" className="owl-eye" />
        <rect x="24" y="16" width="8" height="8" className="owl-body" />
        <rect x="32" y="16" width="8" height="8" className="owl-eye" />
        <rect x="40" y="16" width="8" height="8" className="owl-eye" />
        <rect x="10" y="18" width="4" height="4" className="owl-pupil" />
        <rect x="34" y="18" width="4" height="4" className="owl-pupil" />
        <rect x="8" y="24" width="8" height="8" className="owl-body" />
        <rect x="16" y="24" width="8" height="8" className="owl-body" />
        <rect x="24" y="24" width="8" height="8" className="owl-beak" />
        <rect x="32" y="24" width="8" height="8" className="owl-body" />
        <rect x="40" y="24" width="8" height="8" className="owl-body" />
        <rect x="0" y="32" width="8" height="8" className="owl-tuft" />
        <rect x="8" y="32" width="8" height="8" className="owl-body" />
        <rect x="16" y="32" width="8" height="8" className="owl-body" />
        <rect x="24" y="32" width="8" height="8" className="owl-body" />
        <rect x="32" y="32" width="8" height="8" className="owl-body" />
        <rect x="40" y="32" width="8" height="8" className="owl-body" />
        <rect x="48" y="32" width="8" height="8" className="owl-tuft" />
        <rect x="8" y="40" width="8" height="8" className="owl-body" />
        <rect x="16" y="40" width="8" height="8" className="owl-belly" />
        <rect x="24" y="40" width="8" height="8" className="owl-belly" />
        <rect x="32" y="40" width="8" height="8" className="owl-belly" />
        <rect x="40" y="40" width="8" height="8" className="owl-body" />
        <rect x="8" y="48" width="8" height="8" className="owl-body" />
        <rect x="16" y="48" width="8" height="8" className="owl-body" />
        <rect x="24" y="48" width="8" height="8" className="owl-body" />
        <rect x="32" y="48" width="8" height="8" className="owl-body" />
        <rect x="40" y="48" width="8" height="8" className="owl-body" />
        <rect x="8" y="56" width="8" height="8" className="owl-body" />
        <rect x="16" y="56" width="8" height="8" className="owl-body" />
        <rect x="32" y="56" width="8" height="8" className="owl-body" />
        <rect x="40" y="56" width="8" height="8" className="owl-body" />
      </svg>
      {wordmark && (
        <span className="font-bold tracking-tight" style={{ fontSize: `${(size * 0.57) / 16}rem` }}>
          Roost <span style={{ color: 'var(--accent)', fontWeight: 400 }}>HQ</span>
        </span>
      )}
    </span>
  );
}
