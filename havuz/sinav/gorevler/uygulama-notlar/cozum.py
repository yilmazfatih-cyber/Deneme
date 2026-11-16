"""Başvuru çözümü: üreteç + alan düzenlemeleri + sortNotes + "Sabitle" onay kutusu.

Ajana verilmez. Kim kullanır: `sinav.py dogrula`.
Genişletme: üretecin çıktısı değişirse aşağıdaki aranan metinleri güncelleyin (`dogrula` gösterir).
"""

from pathlib import Path

from exam.edit import insert_before, replace, run, write

LOGIC = """/**
 * Notlar özelliğinin saf mantığı: sabitlenmiş notlar üstte, her grup kendi içinde `order`a göre.
 * React'ten ve veritabanından bağımsızdır; testi: test/features/notes.test.tsx.
 */
import type { Rec } from '../../lib/store/records.ts'

export type Note = Rec<'notes'>

/** Sabitlenmişler önce; eşitlikte küçük `order` üstte, o da eşitse kimliğe göre (belirlenimci). */
export function sortNotes(notes: readonly Note[]): Note[] {
  return notes.toSorted(
    (a, b) =>
      Number(b.data.pinned) - Number(a.data.pinned) ||
      a.data.order - b.data.order ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}
"""


def coz(kopya: Path) -> None:
    ozellik(kopya)
    # Yedek özeti her varlığı sayar: yeni varlık özete eklenir (beklenti gevşetilmez, genişletilir).
    insert_before(
        kopya / "web/test/lib/backup.test.ts",
        "      tasks: { added: 1, updated: 0, unchanged: 0 },\n    })",
        "      notes: { added: 0, updated: 0, unchanged: 0 },\n",
    )


def ozellik(kopya: Path) -> None:
    """Özelliğin kendisi (hile.py de kullanır)."""
    run(["npm", "run", "gen", "--", "entity", "notes", "--etiket", "Not,Notlar"], kopya)
    entity = kopya / "shared/src/entities/notes.ts"
    replace(entity, ".max(200, 'Başlık en çok 200 karakter olabilir.')", ".max(120, 'Başlık en çok 120 karakter olabilir.')")
    insert_before(
        entity,
        "    /** Sıralama anahtarı",
        "    /** Sabitlenmiş not listede hep üstte durur. */\n    pinned: z.boolean().default(false),\n",
    )
    write(kopya / "web/src/features/notes/logic.ts", LOGIC)
    page = kopya / "web/src/features/notes/NotesPage.tsx"
    replace(page, "const visible = (items ?? []).filter(", "const visible = sortNotes(items ?? []).filter(")
    insert_before(page, "\nexport function NotesPage()", "import { sortNotes } from './logic.ts'\n")
    edit = kopya / "web/src/features/notes/NotesEditPage.tsx"
    replace(edit, "initial: { title: string; note: string }", "initial: { title: string; note: string; pinned: boolean }")
    replace(
        edit,
        "useState({ title: initial.title, note: initial.note })",
        "useState({ title: initial.title, note: initial.note, pinned: initial.pinned })",
    )
    replace(edit, "import { Button, EmptyState,", "import { Button, Checkbox, EmptyState,")
    insert_before(
        edit,
        "      {workspace.canWrite && (\n        <div",
        "      <Checkbox\n"
        "        label={t('notes.form.pinned')}\n"
        "        checked={values.pinned}\n"
        "        disabled={!workspace.canWrite}\n"
        "        onChange={(event) => setValues((current) => ({ ...current, pinned: event.target.checked }))}\n"
        "      />\n",
    )
    replace(kopya / "web/src/i18n/tr.json", '"notes.form.note": "Not"', '"notes.form.note": "Not",\n  "notes.form.pinned": "Sabitle"')
    replace(
        kopya / "shared/DEGISIKLIKLER.md",
        "## Günlük\n\n",
        "## Günlük\n\n- 2026-11-16 — EKLENDİ, geriye uyumlu: `notes` varlığı (title, note, pinned, order).\n",
    )
    run(["npx", "prettier", "--write", "shared/src/entities/notes.ts", "web/src/features/notes", "web/src/i18n/tr.json"], kopya)
