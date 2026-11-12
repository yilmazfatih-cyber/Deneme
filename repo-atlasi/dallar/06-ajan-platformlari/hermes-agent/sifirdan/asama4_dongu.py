"""Aşama 4 — Ajan döngüsü ve öğrenme döngüsü.

Gerçek karşılıkları: run_agent.py (AIAgent cephesi), agent/conversation_loop.py
(run_conversation, _run_conversation_turn), agent/turn_iteration_prep.py (_iters_since_skill),
agent/turn_context.py (_turns_since_memory), agent/turn_finalizer.py (tur sonu kararı),
agent/background_review.py (çatallanmış "gözden geçirme" ajanı).

Öğrenme döngüsü üç parçadır:
  1. Sayaçlar: her model çağrısında iters_since_skill, her kullanıcı turunda turns_since_memory artar.
     Ajan kendiliğinden skill_manage / memory çağırırsa ilgili sayaç sıfırlanır.
  2. Tur bitince sayaç eşiği aştıysa "arka plan gözden geçirmesi" çalışır: konuşmanın kopyasıyla,
     yalnızca hafıza ve beceri araçlarına izin verilen ikinci bir ajan "kaydedilecek bir şey var mı?" diye bakar.
  3. Sonraki oturumda sistem istemi yeni beceri dizinini ve hafızayı içerir; model skill_view ile okur.
Sistem istemi oturum boyunca DEĞİŞMEZ: mesaj ortasında yazılan hafıza/beceri bir sonraki oturuma kalır.
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from asama1_hafiza import MemoryStore, SessionDB
from asama2_araclar import ToolRegistry, registry
from asama3_beceriler import SkillStore


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMResponse:
    content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)


class ScriptedLLM:
    """Ağsız sahte model. Her adım bir LLMResponse ya da (mesajlar, araçlar) → LLMResponse fonksiyonudur."""

    def __init__(self, adimlar: list[LLMResponse | Callable[[list, list], LLMResponse]]):
        self.adimlar = list(adimlar)
        self.istekler: list[dict[str, Any]] = []  # testler modele ne gittiğini buradan okur

    def chat(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> LLMResponse:
        self.istekler.append({"messages": [dict(m) for m in messages], "tools": [t["function"]["name"] for t in tools]})
        if not self.adimlar:
            return LLMResponse(content="(senaryo bitti)")
        adim = self.adimlar.pop(0)
        return adim(messages, tools) if callable(adim) else adim


def arac(cid: str, ad: str, **args: Any) -> LLMResponse:
    """Test/demolar için kısa yol: tek araç çağrısı içeren model cevabı."""
    return LLMResponse(tool_calls=[ToolCall(cid, ad, args)])


REVIEW_PROMPT = (
    "Yukarıdaki konuşmayı gözden geçir. Tekrar kullanılabilir, birkaç adımlı bir yöntem çıktıysa "
    "skill_manage ile beceri olarak kaydet. Kullanıcı hakkında kalıcı bir bilgi öğrendiysen memory ile kaydet. "
    "Kaydedecek bir şey yoksa yalnızca 'Kaydedilecek bir şey yok.' yaz."
)


class AIAgent:
    def __init__(
        self,
        llm: Any,
        home: Path,
        session_db: SessionDB,
        *,
        enabled_toolsets: set[str] | None = None,
        max_iterations: int = 12,
        skill_nudge_interval: int = 10,
        memory_nudge_interval: int = 10,
        platform: str = "cli",
        session_id: str | None = None,
        skip_memory: bool = False,
        review_llm: Any = None,
        persist: bool = True,
        tool_registry: ToolRegistry = registry,
        tool_context: dict[str, Any] | None = None,
    ):
        self.llm, self.home, self.db = llm, Path(home), session_db
        self.registry = tool_registry
        self.tool_context = tool_context or {}  # ör. {"cron_store": ...}: araçlara verilen ek bağlam
        self.enabled_toolsets = enabled_toolsets or {"hesap", "memory", "session_search", "skills"}
        self.max_iterations = max_iterations
        self.skill_nudge_interval, self.memory_nudge_interval = skill_nudge_interval, memory_nudge_interval
        self.iters_since_skill = self.turns_since_memory = 0
        self.platform, self.skip_memory, self.review_llm, self.persist = platform, skip_memory, review_llm, persist
        self.memory_store = None if skip_memory else MemoryStore(self.home)
        self.skill_store = SkillStore(self.home / "skills")
        if persist:  # gözden geçirme ajanı gibi geçici ajanlar veritabanında oturum açmaz
            self.session_id = session_db.create_session(platform, session_id)
        else:
            self.session_id = session_id or "gecici"
        # Araç listesi ve sistem istemi oturum başında BİR KEZ kurulur (istem önbelleği değişmez).
        self.tools = self.registry.get_definitions(self.enabled_toolsets)
        self.valid_tool_names = {t["function"]["name"] for t in self.tools}
        self.system_prompt = self._build_system_prompt()
        self.review_threads: list[threading.Thread] = []

    def _build_system_prompt(self) -> str:
        parcalar = ["Sen yardımsever bir kişisel ajansın. Araçları gerektiğinde kullan; kısa ve doğru cevap ver."]
        if self.memory_store and (hafiza := self.memory_store.snapshot()):
            parcalar.append(hafiza)
        if "skills" in self.enabled_toolsets and (dizin := self.skill_store.index_for_prompt()):
            parcalar.append("## BECERİLER (ilgili olanı skill_view ile oku)\n" + dizin)
        return "\n\n".join(parcalar)

    def _kaydet(self, mesaj: dict[str, Any]) -> None:
        if self.persist:
            self.db.append_message(self.session_id, mesaj)

    def run_conversation(self, user_message: str) -> dict[str, Any]:
        messages = self.db.get_messages(self.session_id) if self.persist else list(getattr(self, "_gecmis", []))
        messages.append({"role": "user", "content": user_message})
        self._kaydet(messages[-1])
        review_memory = self._tick_memory_nudge()
        api_calls, final = 0, None
        while api_calls < self.max_iterations:
            if self.skill_nudge_interval > 0 and "skill_manage" in self.valid_tool_names:
                self.iters_since_skill += 1  # gerçek depodaki gibi: her döngü adımında
            cevap = self.llm.chat([{"role": "system", "content": self.system_prompt}, *messages], self.tools)
            api_calls += 1
            if not cevap.tool_calls:
                final = cevap.content or ""
                messages.append({"role": "assistant", "content": final})
                self._kaydet(messages[-1])
                break
            messages.append(
                {
                    "role": "assistant",
                    "content": cevap.content or "",
                    "tool_calls": [{"id": t.id, "name": t.name, "arguments": t.arguments} for t in cevap.tool_calls],
                }
            )
            self._kaydet(messages[-1])
            for cagri in cevap.tool_calls:
                messages.append(self._run_tool(cagri))
                self._kaydet(messages[-1])
        if final is None:
            final = "(iterasyon sınırına ulaşıldı; iş yarım kaldı)"
        if not self.persist:
            self._gecmis = messages
        review_skills = (
            self.skill_nudge_interval > 0
            and self.iters_since_skill >= self.skill_nudge_interval
            and "skill_manage" in self.valid_tool_names
        )
        if review_skills:
            self.iters_since_skill = 0
        reviewed = False
        if (review_skills or review_memory) and self.review_llm is not None:
            run_background_review(self, list(messages), review_memory, review_skills)
            reviewed = True
        return {"final_response": final, "messages": messages, "api_calls": api_calls, "reviewed": reviewed}

    def chat(self, message: str) -> str:
        return self.run_conversation(message)["final_response"]

    def _tick_memory_nudge(self) -> bool:
        if self.memory_nudge_interval > 0 and "memory" in self.valid_tool_names and self.memory_store:
            self.turns_since_memory += 1
            if self.turns_since_memory >= self.memory_nudge_interval:
                self.turns_since_memory = 0
                return True
        return False

    def _run_tool(self, cagri: ToolCall) -> dict[str, Any]:
        if cagri.name not in self.valid_tool_names:  # modele gösterilmeyen araç çağrılamaz
            sonuc = json.dumps({"error": f"bu oturumda olmayan araç: {cagri.name}"}, ensure_ascii=False)
        else:
            if cagri.name == "skill_manage":
                self.iters_since_skill = 0  # ajan zaten kendisi beceri yazıyor; dürtmeye gerek yok
            elif cagri.name == "memory":
                self.turns_since_memory = 0
            sonuc = self.registry.dispatch(
                cagri.name,
                cagri.arguments,
                memory_store=self.memory_store,
                session_db=self.db,
                skill_store=self.skill_store,
                session_id=self.session_id,
                **self.tool_context,
            )
        return {"role": "tool", "tool_call_id": cagri.id, "name": cagri.name, "content": sonuc}


def _ozet_metni(messages: list[dict[str, Any]]) -> str:
    satirlar = []
    for m in messages:
        if m["role"] == "tool":
            satirlar.append(f"[araç {m['name']} sonucu] {m['content'][:300]}")
        elif m.get("tool_calls"):
            satirlar.append("[asistan araç çağırdı] " + ", ".join(t["name"] for t in m["tool_calls"]))
        else:
            satirlar.append(f"[{m['role']}] {m['content'][:500]}")
    return "\n".join(satirlar)


def run_background_review(
    parent: AIAgent, messages: list[dict[str, Any]], review_memory: bool, review_skills: bool, background: bool = False
) -> AIAgent:
    """Konuşmanın kopyasıyla, yalnızca hafıza + beceri araçlarına izin verilen ikinci bir ajan çalıştırır.
    Ana konuşmaya ve onun sistem istemine dokunmaz. background=True ise ayrı bir iş parçacığında koşar."""
    araclar = ({"memory"} if review_memory else set()) | ({"skills"} if review_skills else set())
    gozden_geciren = AIAgent(
        parent.review_llm,
        parent.home,
        parent.db,
        enabled_toolsets=araclar,
        max_iterations=4,
        skill_nudge_interval=0,  # gözden geçiren kendi gözden geçirmesini tetiklemesin
        memory_nudge_interval=0,
        platform="review",
        persist=False,
        tool_registry=parent.registry,
    )
    istem = f"{_ozet_metni(messages)}\n\n{REVIEW_PROMPT}"
    if background:
        is_parcacigi = threading.Thread(target=gozden_geciren.run_conversation, args=(istem,), daemon=True)
        is_parcacigi.start()
        parent.review_threads.append(is_parcacigi)
    else:
        gozden_geciren.run_conversation(istem)
    return gozden_geciren
