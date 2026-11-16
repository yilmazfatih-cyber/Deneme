/**
 * Uygulama işareti (logo): üst üste iki yapı taşı. public/icon.svg ile aynı çizimdir.
 * Genişletme: kendi logonuzu koyarken bu SVG'yi ve public/icon.svg'yi birlikte değiştirin, `npm run icons` çalıştırın.
 */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 64 64" className="shrink-0">
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <rect x="14" y="34" width="36" height="14" rx="4" fill="var(--accent-ink)" />
      <rect x="20" y="16" width="24" height="14" rx="4" fill="var(--accent-ink)" opacity="0.72" />
    </svg>
  )
}
