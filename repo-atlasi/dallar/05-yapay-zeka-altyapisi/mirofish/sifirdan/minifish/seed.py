"""Aşama 1 — Tohum metinden varlık, ilişki ve tutum çıkarımı + basit ontoloji.

MiroFish'te bu iş iki parçadır:
  1. ontology_generator.py: LLM'e "sosyal medyada konuşabilen" varlık tiplerini ve ilişki tiplerini
     tasarlatır (tam 10 varlık tipi, son ikisi yedek tip Person ve Organization).
  2. graph_builder.py: metni parçalara bölüp Zep Cloud'a gönderir; varlık/ilişki çıkarımını Zep yapar
     (zaman bilgili bilgi grafiği). zep_entity_reader.py tanımlı tiplere uyan düğümleri geri okur.
Burada ikisinin yerine kural tabanlı, açıklanabilir bir çıkarıcı var.
"""

from __future__ import annotations

import dataclasses
import re

ORG_SUFFIX = {
    "Belediyesi": "GovernmentAgency",
    "Bakanlığı": "GovernmentAgency",
    "Valiliği": "GovernmentAgency",
    "Gazetesi": "MediaOutlet",
    "Postası": "MediaOutlet",
    "Televizyonu": "MediaOutlet",
    "Üniversitesi": "University",
    "Derneği": "NGO",
    "Girişimi": "NGO",
    "Vakfı": "NGO",
    "Odası": "NGO",
    "A.Ş.": "Company",
    "Holding": "Company",
}
FIRST_NAMES = {"Kerem", "Murat", "Selin", "Ayşe", "Hasan", "Elif", "Zeynep", "Mehmet", "Deniz", "Can"}
ROLE_WORDS = {"öğrenci", "esnaf", "emekli", "öğretim", "kafe", "gazeteci", "muhtar", "başkan", "öğretmen"}
STANCE_VERBS = {
    1.0: ("destekledi", "destekliyor", "nefes aldıracağını", "daha güvenli", "zarar vermediğini"),
    -1.0: ("karşı çıktı", "eleştirdi", "endişe", "sorununun büyüyeceğini", "zor durumda"),
}
REPORT_VERBS = ("haberleştirdi", "aktardı", "duyurdu")
PROPOSE_VERBS = ("planını açıkladı", "önerdi")

CAP = r"[A-ZÇĞİÖŞÜ][a-zçğıöşüA-ZÇĞİÖŞÜ.]*"
ORG_RE = re.compile(rf"((?:{CAP} )+(?:{'|'.join(map(re.escape, ORG_SUFFIX))}))")
PERSON_RE = re.compile(rf"\b({'|'.join(sorted(FIRST_NAMES))}) ({CAP})")


@dataclasses.dataclass
class Entity:
    name: str
    type: str
    role: str = ""
    stance: float = 0.0  # konuya (plana) karşı tutum: -1 karşı, +1 destek
    mentions: int = 0


@dataclasses.dataclass
class Relation:
    source: str
    target: str
    type: str  # SUPPORTS, OPPOSES, REPORTS_ON, PROPOSES, AFFILIATED_WITH, MENTIONS
    sentence: str


def split_sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def _stance_of(sentence):
    for value, cues in STANCE_VERBS.items():
        if any(c in sentence for c in cues):
            return value
    return 0.0


def extract(text):
    """Varlıklar (ad -> Entity) ve cümle düzeyinde ilişkiler döndürür."""
    entities: dict[str, Entity] = {}
    relations: list[Relation] = []
    stance_votes: dict[str, list[float]] = {}
    last_subject = None
    for sent in split_sentences(text):
        found = []
        for m in ORG_RE.finditer(sent):
            name = m.group(1).strip()
            suffix = name.split()[-1]
            found.append((m.start(), Entity(name, ORG_SUFFIX[suffix])))
        for m in PERSON_RE.finditer(sent):
            name = f"{m.group(1)} {m.group(2)}"
            before = sent[: m.start()].lower().split()[-3:]
            role = " ".join(w for w in before if w.strip(",.;") in ROLE_WORDS or w in ("sahibi", "üyesi", "yardımcısı"))
            found.append((m.start(), Entity(name, "Person", role=role)))
        found.sort(key=lambda x: x[0])
        names = []
        for _, ent in found:
            known = entities.setdefault(ent.name, ent)
            known.mentions += 1
            known.role = known.role or ent.role
            names.append(ent.name)
        # Türkçe SOV: cümlenin ilk varlığı çoğunlukla öznedir; varlıksız cümlede önceki özne sürer.
        # İstisna: "<Kurum> öğretim üyesi <Kişi>" kalıbında konuşan kişidir, kurum yalnızca bağlantısıdır.
        if len(found) >= 2 and found[0][1].type != "Person" and found[1][1].type == "Person" and found[1][1].role:
            relations.append(Relation(names[1], names[0], "AFFILIATED_WITH", sent))
            names = [names[1], names[0]] + names[2:]
        subject = names[0] if names else last_subject
        if subject is None:
            continue
        last_subject = subject
        stance = _stance_of(sent)
        if any(v in sent for v in PROPOSE_VERBS):
            stance = 1.0
            relations.append(Relation(subject, "PLAN", "PROPOSES", sent))
        if stance:
            stance_votes.setdefault(subject, []).append(stance)
            relations.append(Relation(subject, "PLAN", "SUPPORTS" if stance > 0 else "OPPOSES", sent))
        if any(v in sent for v in REPORT_VERBS) and entities[subject].type == "MediaOutlet":
            relations.append(Relation(subject, "PLAN", "REPORTS_ON", sent))
        for other in names[1:]:
            already = any(r.source == subject and r.target == other and r.sentence == sent for r in relations)
            if other != subject and not already:
                relations.append(Relation(subject, other, "MENTIONS", sent))
    for name, votes in stance_votes.items():
        entities[name].stance = sum(votes) / len(votes)
    return entities, relations


def build_ontology(entities, relations):
    """MiroFish'teki ontoloji çıktısının küçük karşılığı: kullanılan tipler + her zaman iki yedek tip."""
    types = sorted({e.type for e in entities.values()} - {"Person"})
    return {
        "entity_types": types + ["Person", "Organization"],
        "edge_types": sorted({r.type for r in relations}),
    }
