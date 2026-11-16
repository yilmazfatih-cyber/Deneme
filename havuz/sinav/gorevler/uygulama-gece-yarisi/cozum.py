"""Başvuru çözümü: `toIsoDate` yerel takvim alanlarından (getFullYear/getMonth/getDate) gün üretir.

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: çözüm değişirse gizli testin iki saat diliminde de geçtiğini `dogrula` ile doğrulayın.
"""

from pathlib import Path

from exam.edit import replace


def coz(kopya: Path) -> None:
    replace(
        kopya / "web/src/lib/date.ts",
        "  return date.toISOString().slice(0, 10)\n",
        "  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`\n",
    )
    replace(
        kopya / "web/test/lib/date.test.ts",
        "  it('gün ekleme ay ve yıl",
        "  it('bugün yerel güne göre (gece yarısından sonra da)', () => {\n"
        "    expect(toIsoDate(new Date(2026, 10, 16, 0, 30))).toBe('2026-11-16')\n"
        "  })\n\n"
        "  it('gün ekleme ay ve yıl",
    )
    replace(
        kopya / "web/test/lib/date.test.ts",
        "import { addDays, dueState, formatDay, formatRelative, formatWeekday } from",
        "import { addDays, dueState, formatDay, formatRelative, formatWeekday, toIsoDate } from",
    )
