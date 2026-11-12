"""LLM arayüzü, deterministik sahte LLM ve yanıt ayrıştırma yardımcıları.

MiroFish her aşamada OpenAI biçimli bir sohbet API'si çağırır (backend/app/utils/llm_client.py):
ontoloji, persona, simülasyon yapılandırması, ajan eylemleri (OASIS içinde) ve rapor.
Testler internetsiz çalışsın diye burada aynı arayüzü uygulayan kural tabanlı bir sahte LLM var.
Sistem mesajındaki [GÖREV:...] işareti sahte LLM'e hangi işi yaptığını söyler.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Protocol


class LLMClient(Protocol):
    def complete(self, messages: list[dict]) -> str: ...


def stable_hash(text: str) -> int:
    """Python'un hash()'i süreçten sürece değişir; tekrarlanabilirlik için sha256 kullanıyoruz."""
    return int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:12], 16)


def parse_json(text: str):
    """LLM çıktısından JSON çıkarır: ```json çitlerini ve <think> bloklarını temizler.

    MiroFish'teki karşılığı: llm_client.py (_clean_chat_text) ve oasis_profile_generator.py (_try_fix_json).
    """
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", text).strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
    raise ValueError("LLM yanıtında geçerli JSON yok")


TOOL_CALL_RE = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.S)


def parse_tool_calls(text: str) -> list[dict]:
    """<tool_call>{"name": ..., "parameters": {...}}</tool_call> biçimindeki araç çağrılarını bulur
    (MiroFish: report_agent.py, ReportAgent._parse_tool_calls)."""
    calls = []
    for m in TOOL_CALL_RE.finditer(text):
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and "name" in data:
            calls.append({"name": data["name"], "parameters": data.get("parameters", {})})
    return calls


class KuralliLLM:
    """Deterministik sahte LLM: aynı mesajlara her zaman aynı yanıtı verir."""

    def __init__(self):
        self.calls = 0

    def complete(self, messages: list[dict]) -> str:
        self.calls += 1
        system, user = messages[0]["content"], messages[-1]["content"]
        if "[GÖREV:persona]" in system:
            return self._persona(json.loads(user))
        if "[GÖREV:eylem]" in system:
            return self._eylem(json.loads(user))
        if "[GÖREV:rapor]" in system:
            return self._rapor(messages)
        return "Bilmiyorum."

    def _persona(self, ent):
        h = stable_hash(ent["name"])
        out = {
            "bio": f"{ent['name']} ({ent['type']}) Yalıkent tartışmasında söz sahibi.",
            "activity_level": round(0.3 + (h % 50) / 100, 2),
            "openness": round(0.1 + (h % 30) / 100, 2),
        }
        return "```json\n" + json.dumps(out, ensure_ascii=False) + "\n```"  # çitli yanıt: ayrıştırıcıyı sına

    def _eylem(self, ctx):
        feed = ctx["akis"]
        if not feed:
            return json.dumps({"eylem": "CREATE_POST"})
        best = max(feed, key=lambda p: -abs(p["tutum"] - ctx["tutum"]))  # en çok hemfikir olduğu gönderi
        if abs(best["tutum"] - ctx["tutum"]) < 0.5:
            return json.dumps({"eylem": "LIKE_POST", "gonderi": best["id"]})
        return json.dumps({"eylem": "CREATE_COMMENT", "gonderi": best["id"]})

    def _rapor(self, messages):
        observations = [m["content"] for m in messages if m["role"] == "user" and m["content"].startswith("Gözlem:")]
        if len(observations) == 0:
            return 'Önce sayılara bakalım.\n<tool_call>{"name": "istatistik", "parameters": {}}</tool_call>'
        if len(observations) == 1:
            stats = json.loads(observations[0][len("Gözlem:") :])
            hedef = stats["en_etkili"][0]["ajan_id"] if stats["en_etkili"] else 0
            return f'<tool_call>{{"name": "roportaj", "parameters": {{"ajan_id": {hedef}}}}}</tool_call>'
        return "Final Answer: " + " ".join(o[len("Gözlem:") :].strip() for o in observations[1:])
