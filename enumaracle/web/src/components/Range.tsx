import { fmtTN } from '../format'

/** A number or range where each number stays on one line and the range may break at the dash. */
export function Range({ start, end }: { start: string; end: string }) {
  if (start === end) return <span className="nowrap">{fmtTN(start)}</span>
  return (
    <>
      <span className="nowrap">{fmtTN(start)}</span> – <span className="nowrap">{fmtTN(end)}</span>
    </>
  )
}
