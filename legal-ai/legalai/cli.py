"""Komut satırı: legalai ingest | embed | search | analyze | serve | status | probe | sources."""

from __future__ import annotations

import asyncio
import logging
import sys
from datetime import date, datetime
from typing import Annotated

import typer
from rich.console import Console
from rich.markdown import Markdown
from rich.table import Table

from legalai.config import get_settings
from legalai.models import SourceId

app = typer.Typer(
    help="Türkiye hukuk kaynakları: topla, depola, ara, kaynak bağlantılı analiz et.", no_args_is_help=True
)
console = Console()


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    from legalai.text import parse_tr_date

    d = parse_tr_date(value)
    if d is None:
        raise typer.BadParameter(f"Tarih anlaşılmadı: {value} (örn. 2025-10-31 veya 31.10.2025)")
    return d


def _parse_sources(value: str | None) -> list[SourceId] | None:
    if not value or value.strip().lower() in ("all", "hepsi", "*"):
        return None
    out = []
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(SourceId(part))
        except ValueError as exc:
            raise typer.BadParameter(
                f"Bilinmeyen kaynak: {part}. Geçerli: {', '.join(s.value for s in SourceId)}"
            ) from exc
    return out


def _open_db():
    from legalai.db import Database

    settings = get_settings()
    settings.ensure_dirs()
    return settings, Database(settings.db_path)


def _embedder(settings):
    from legalai.embeddings import make_embedder

    return make_embedder(settings.embedder, settings.embed_model)


@app.callback()
def _main(verbose: Annotated[bool, typer.Option("--verbose", "-v", help="Ayrıntılı günlük")] = False) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)


@app.command()
def sources() -> None:
    """Desteklenen kaynakları listeler."""
    from legalai.analysis import source_label

    table = Table("kimlik", "ad")
    for s in SourceId:
        table.add_row(s.value, source_label(s))
    console.print(table)


@app.command()
def ingest(
    source: Annotated[str, typer.Argument(help="Kaynak kimliği (virgülle birden çok) ya da 'all'")],
    since: Annotated[str | None, typer.Option(help="Başlangıç tarihi")] = None,
    until: Annotated[str | None, typer.Option(help="Bitiş tarihi")] = None,
    query: Annotated[
        str | None, typer.Option("--query", "-q", help="Karar aramaları için terim; mevzuat için kanun no")
    ] = None,
    limit: Annotated[int | None, typer.Option(help="En fazla belge")] = None,
    refetch: Annotated[bool, typer.Option(help="Var olan belgeleri yeniden indir")] = False,
    embed: Annotated[bool, typer.Option(help="Bitince gömme üret (LEGALAI_EMBEDDER ayarına göre)")] = True,
) -> None:
    """Kaynaklardan belge toplar ve veritabanına yazar."""
    from legalai.ingest import embed_pending, ingest_many

    settings, db = _open_db()
    ids = _parse_sources(source) or list(SourceId)

    def progress(report, doc):
        console.print(f"  [green]+[/] {doc.title[:90]}  [dim]{doc.url}[/]")

    reports = asyncio.run(
        ingest_many(
            db,
            ids,
            settings,
            since=_parse_date(since),
            until=_parse_date(until),
            query=query,
            limit=limit,
            refetch=refetch,
            on_progress=progress,
        )
    )
    for r in reports:
        style = "red" if r.failed and not r.fetched else "bold"
        console.print(f"[{style}]{r.summary()}[/]")
        for err in r.errors[:5]:
            console.print(f"  [yellow]![/] {err}")
    if embed:
        emb = _embedder(settings)
        if emb is not None:
            n = embed_pending(db, emb, on_progress=lambda d: console.print(f"  gömme: {d}", end="\r"))
            console.print(f"\nGömme tamamlandı: {n} parça ({emb.model_name})")


@app.command()
def embed() -> None:
    """Gömmesi olmayan parçaları gömer (LEGALAI_EMBEDDER=voyage|local)."""
    from legalai.ingest import embed_pending

    settings, db = _open_db()
    emb = _embedder(settings)
    if emb is None:
        console.print("[yellow]LEGALAI_EMBEDDER=none; gömme kapalı. voyage veya local seçin.[/]")
        raise typer.Exit(1)
    n = embed_pending(db, emb, on_progress=lambda d: console.print(f"  gömme: {d}", end="\r"))
    console.print(f"\nTamamlandı: {n} parça ({emb.model_name})")


@app.command()
def search(
    query: Annotated[str, typer.Argument()],
    source: Annotated[str | None, typer.Option("--source", "-s", help="Kaynak filtresi (virgülle)")] = None,
    since: Annotated[str | None, typer.Option()] = None,
    until: Annotated[str | None, typer.Option()] = None,
    k: Annotated[int, typer.Option()] = 10,
) -> None:
    """Veritabanında hibrit arama yapar; her sonuç doğrudan bağlantı taşır."""
    from legalai.retrieval import Retriever

    settings, db = _open_db()
    hits = Retriever(db, _embedder(settings)).search(
        query, sources=_parse_sources(source), since=_parse_date(since), until=_parse_date(until), k=k
    )
    if not hits:
        console.print("[yellow]Sonuç yok.[/]")
        raise typer.Exit(0)
    for i, h in enumerate(hits, 1):
        d = h.document
        meta = " · ".join(
            x
            for x in [
                d.court,
                d.case_no and f"E. {d.case_no}",
                d.decision_no and f"K. {d.decision_no}",
                (d.decision_date or d.published_at) and str(d.decision_date or d.published_at),
            ]
            if x
        )
        console.print(f"[bold]{i}. {d.title}[/] [dim]{h.chunk.heading or ''}[/]")
        if meta:
            console.print(f"   [dim]{meta}[/]")
        console.print(f"   {h.chunk.text[:300].replace(chr(10), ' ')}…")
        console.print(f"   [blue underline]{h.link}[/]\n")


@app.command()
def analyze(
    question: Annotated[str, typer.Argument()],
    source: Annotated[str | None, typer.Option("--source", "-s")] = None,
    since: Annotated[str | None, typer.Option()] = None,
    until: Annotated[str | None, typer.Option()] = None,
    k: Annotated[int, typer.Option(help="Modele verilecek parça sayısı")] = 12,
    model: Annotated[str | None, typer.Option(help="Claude modeli (varsayılan LEGALAI_MODEL)")] = None,
    out: Annotated[str | None, typer.Option(help="Markdown çıktısını dosyaya yaz")] = None,
) -> None:
    """Soruyu veritabanındaki kaynaklara dayanarak analiz eder; alıntılar bağlantılıdır."""
    from legalai.analysis import Analyzer
    from legalai.retrieval import Retriever

    settings, db = _open_db()
    analyzer = Analyzer(
        Retriever(db, _embedder(settings)), model=model or settings.model, effort=settings.effort
    )
    with console.status("Kaynaklar aranıyor ve analiz üretiliyor…"):
        result = analyzer.analyze(
            question, sources=_parse_sources(source), since=_parse_date(since), until=_parse_date(until), k=k
        )
    console.print(Markdown(result.answer_markdown))
    console.print(f"\n[dim]{result.disclaimer} · model: {result.model} · jeton: {result.usage}[/]")
    if out:
        from pathlib import Path

        Path(out).write_text(
            f"# {question}\n\n{result.answer_markdown}\n\n_{result.disclaimer}_\n", encoding="utf-8"
        )
        console.print(f"[green]Yazıldı:[/] {out}")


@app.command()
def status() -> None:
    """Veritabanı istatistikleri."""
    settings, db = _open_db()
    s = db.stats()
    console.print(f"Veritabanı: {settings.db_path}")
    console.print(
        f"Belge: {s['documents']}  Parça: {s['chunks']}  Son indirme: {s['last_fetched_at'] or '-'}"
    )
    table = Table("kaynak", "belge")
    for k, v in s["by_source"].items():
        table.add_row(k, str(v))
    console.print(table)
    if s["embeddings"]:
        console.print(f"Gömmeler: {s['embeddings']}")


@app.command()
def serve(
    host: Annotated[str | None, typer.Option()] = None,
    port: Annotated[int | None, typer.Option()] = None,
) -> None:
    """Web arayüzünü başlatır."""
    import uvicorn

    from legalai.web.app import create_app

    settings = get_settings()
    uvicorn.run(create_app(), host=host or settings.host, port=port or settings.port)


@app.command()
def probe(
    source: Annotated[str, typer.Argument(help="Kaynak kimliği")],
    query: Annotated[str | None, typer.Option("--query", "-q")] = None,
) -> None:
    """Canlı siteye karşı adaptörü dener: 1 belge keşfet + indir, meta alanlarını göster. Hiçbir şey yazmaz."""
    from legalai.sources.registry import get_source

    async def run():
        adapter = get_source(source)
        try:
            today = date.today()
            since = date(today.year, today.month, 1)
            async for ref in adapter.discover(since=since, until=today, query=query, limit=1):
                console.print(f"[bold]Keşif:[/] {ref.doc_id}  {ref.url}")
                doc = await adapter.fetch(ref)
                console.print(f"[bold]Başlık:[/] {doc.title}")
                console.print(
                    f"[bold]Tür:[/] {doc.doc_type}  [bold]Tarih:[/] {doc.published_at or doc.decision_date}"
                )
                console.print(
                    f"[bold]Mahkeme:[/] {doc.court}  E. {doc.case_no}  K. {doc.decision_no}  No {doc.law_no}"
                )
                console.print(f"[bold]Metin ({len(doc.text)} karakter):[/] {doc.text[:600]}…")
                return
            console.print("[yellow]Keşif boş döndü (tarih aralığı/sorgu gerekebilir).[/]")
        finally:
            await adapter.aclose()

    started = datetime.now()
    asyncio.run(run())
    console.print(f"[dim]{(datetime.now() - started).total_seconds():.1f}s[/]")


if __name__ == "__main__":
    app()
