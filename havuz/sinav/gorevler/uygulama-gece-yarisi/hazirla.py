"""Başlangıç: `toIsoDate` yerel gün yerine UTC gününü verir (`toISOString().slice(0, 10)`).

Gece yarısına yakın saatleri sınayan test çıkarılır; böylece makinenin saat dilimi ne olursa olsun
başlangıçta denetim yeşildir (hata gizlidir). Kim kullanır: `sinav.py hazirla` ve `dogrula`.
Genişletme: temelin date.ts'i değişirse aşağıdaki metinleri güncelleyin; `dogrula` hemen gösterir.
"""

from pathlib import Path

from exam.edit import remove_between, replace


def hazirla(kopya: Path) -> None:
    replace(
        kopya / "web/src/lib/date.ts",
        "  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`\n",
        "  return date.toISOString().slice(0, 10)\n",
    )
    test = kopya / "web/test/lib/date.test.ts"
    remove_between(test, "  it('bugün YEREL güne göre hesaplanır", "  it('gün ekleme ay ve yıl")
    replace(
        test,
        "import { addDays, dueState, formatDay, formatRelative, formatWeekday, toIsoDate } from",
        "import { addDays, dueState, formatDay, formatRelative, formatWeekday } from",
    )
