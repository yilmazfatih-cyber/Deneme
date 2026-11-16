"""Başvuru çözümü: formatCompactTr / format_compact_tr (tam sayı aritmetiğiyle) + ortak vektör örnekleri.

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: modül dosyalarının sonu değişirse ekleme yerini (dosya sonu) gözden geçirin.
"""

from pathlib import Path

from exam.edit import insert_before, read, replace, run, write

TS = """
const COMPACT_SCALES: readonly (readonly [bigint, string])[] = [
  [10n ** 12n, 'trilyon'],
  [10n ** 9n, 'milyar'],
  [10n ** 6n, 'milyon'],
  [1000n, 'bin'],
]

/**
 * Büyük tam sayıyı kısaltarak yazar (panolar için): 1200 → "1,2 bin", 2500000 → "2,5 milyon",
 * 999999 → "1 milyon". En fazla bir ondalık, yarım yukarı (sıfırdan uzağa); 1000'den küçük sayı aynen yazılır.
 */
export function formatCompactTr(value: number | bigint): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new NumberFormatError(`Tam sayı verin: ${String(value)}`)
  }
  const n = BigInt(value)
  const sign = n < 0n ? '-' : ''
  const amount = n < 0n ? -n : n
  if (amount < 1000n) return `${sign}${amount.toString()}`
  let index = COMPACT_SCALES.findIndex(([scale]) => amount >= scale)
  let [scale, name] = COMPACT_SCALES[index] ?? [1000n, 'bin']
  let tenths = (amount * 10n + scale / 2n) / scale
  if (tenths >= 10_000n && index > 0) {
    index -= 1
    ;[scale, name] = COMPACT_SCALES[index] ?? [scale, name]
    tenths = (amount * 10n + scale / 2n) / scale
  }
  const fraction = tenths % 10n
  const number = formatNumberTr(tenths / 10n) + (fraction === 0n ? '' : `,${fraction.toString()}`)
  return `${sign}${number} ${name}`
}
"""

PY = '''

_COMPACT_SCALES = [(10**12, "trilyon"), (10**9, "milyar"), (10**6, "milyon"), (10**3, "bin")]


def format_compact_tr(value: int) -> str:
    """Büyük tam sayıyı kısaltarak yazar: 1200 → "1,2 bin", 999999 → "1 milyon" (yarım yukarı, en çok 1 ondalık)."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise NumberFormatError(f"Tam sayı verin: {value!r}")
    sign = "-" if value < 0 else ""
    amount = abs(value)
    if amount < 1000:
        return f"{sign}{amount}"
    index = next(i for i, (scale, _) in enumerate(_COMPACT_SCALES) if amount >= scale)
    scale, name = _COMPACT_SCALES[index]
    tenths = (amount * 10 + scale // 2) // scale
    if tenths >= 10_000 and index > 0:
        scale, name = _COMPACT_SCALES[index - 1]
        tenths = (amount * 10 + scale // 2) // scale
    whole, fraction = divmod(tenths, 10)
    number = format_number_tr(whole) + (f",{fraction}" if fraction else "")
    return f"{sign}{number} {name}"
'''

VECTORS = """    "formatCompactTr": [
      { "girdi": [999], "cikti": "999" },
      { "girdi": [-45], "cikti": "-45" },
      { "girdi": [1200], "cikti": "1,2 bin" },
      { "girdi": [15000], "cikti": "15 bin" },
      { "girdi": [1150], "cikti": "1,2 bin" },
      { "girdi": [-1250], "cikti": "-1,3 bin" },
      { "girdi": [999999], "cikti": "1 milyon" },
      { "girdi": [2500000], "cikti": "2,5 milyon" },
      { "girdi": [7300000000], "cikti": "7,3 milyar" },
      { "girdi": [2500000000000000], "cikti": "2.500 trilyon" },
      { "girdi": [1.5], "hata": true }
    ],
"""


def coz(kopya: Path) -> None:
    ts = kopya / "ts/src/sayi_yazi.ts"
    write(ts, read(ts) + TS)
    py = kopya / "py/kutuphane/sayi_yazi.py"
    write(py, read(py) + PY)
    replace(py, '    "decimal_to_words",\n', '    "decimal_to_words",\n    "format_compact_tr",\n')
    insert_before(kopya / "vektorler/sayi_yazi.json", '    "formatNumberTr": [', VECTORS)
    run(
        ["npx", "prettier", "--write", "src/sayi_yazi.ts", "../vektorler/sayi_yazi.json"],
        kopya / "ts",
    )
    run(
        [str(kopya / "py/.venv/bin/python"), "-m", "ruff", "format", "kutuphane/sayi_yazi.py"],
        kopya / "py",
    )
