"""`sohbet dogrula`: veriyi doğrular, ayrımı ve uzunluk istatistiğini gösterir, maskeyi örnekler.

Kim kullanır: `tasks/chat/cli.py`. Eğitimden önce **her zaman** çalıştırın: hatalar satır
numarasıyla listelenir; ilk örneğin kayıp maskesi ⟦…⟧ içinde gösterilir ki modelin neyi
öğreneceğini gözle görebilesiniz.

Genişletme: yeni bir denetim için `check_chat_data` sonuna bir bölüm ekleyin.
"""

from __future__ import annotations

from ince_ayar import console
from ince_ayar.config import TINY_MODEL
from ince_ayar.errors import UserError
from ince_ayar.messages import t
from ince_ayar.tasks.chat.config import ChatConfig
from ince_ayar.tasks.chat.data import encode_examples, load_examples
from ince_ayar.tasks.chat.masking import describe_mask
from ince_ayar.tasks.chat.modeling import load_tokenizer
from ince_ayar.tasks.chat.plan import length_report
from ince_ayar.tiny import train_chat_tokenizer


def check_chat_data(config: ChatConfig) -> int:
    """Doğrulama raporunu yazar; veri hatası varsa `UserError` yükselir (çıkış kodu 1)."""
    data = load_examples(config.veri)
    console.result(
        t(
            "dogrula.ozet",
            egitim=len(data.train),
            dogrulama=len(data.validation),
            dosya=config.veri.egitim,
        )
    )
    if data.split_report is not None:
        report = data.split_report
        console.result(
            t(
                "dogrula.ayrim",
                grup=report.group_count,
                tam=report.exact_duplicates,
                yakin=report.near_duplicates,
            )
        )
    for note in data.notes:
        console.warn(note)
    if config.model.taban == TINY_MODEL:
        texts = [m["content"] for ex in data.train + data.validation for m in ex.messages]
        tokenizer = train_chat_tokenizer(texts)
    else:
        try:
            tokenizer = load_tokenizer(config.model.taban, config.model)
        except UserError as exc:
            console.warn(t("dogrula.tokenizer_yok", ayrinti=str(exc)))
            return 0
    train_set = encode_examples(tokenizer, data.train, config.veri, "eğitim")
    eval_set = (
        encode_examples(tokenizer, data.validation, config.veri, "doğrulama")
        if data.validation
        else None
    )
    console.result("\n" + length_report(train_set, eval_set))
    for note in [*train_set.notes, *(eval_set.notes if eval_set else [])]:
        console.warn(note)
    console.result("\n" + t("dogrula.maske_baslik"))
    console.result(describe_mask(tokenizer, train_set.encoded[0]))
    console.result("\n" + t("dogrula.tamam"))
    return 0
