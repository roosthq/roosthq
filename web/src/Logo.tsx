// Roost HQ brand lockup: pixel-owl mark (theme-aware) + wordmark.
export default function Logo({ size = 28, wordmark = true }: { size?: number; wordmark?: boolean }) {
  const w = Math.round((size * 56) / 64);
  return (
    <span className="inline-flex items-center gap-2">
      <img src="/logo-mark.svg" className="owl-light" width={w} height={size} alt="Roost HQ" />
      <img src="/logo-mark-dark.svg" className="owl-dark" width={w} height={size} alt="Roost HQ" />
      {wordmark && (
        <span className="font-bold tracking-tight" style={{ fontSize: size * 0.57 }}>
          Roost <span style={{ color: 'var(--accent)', fontWeight: 400 }}>HQ</span>
        </span>
      )}
    </span>
  );
}
