"""Hazır bir TrOCR (VisionEncoderDecoder) modeline LoRA ile Osmanlıca öğretme.

Ne yapar:
1. Taban modeli ve işlemcisini indirir (örn. RayR1/trocr-base-arabic-handwritten).
2. Çözücü sözlüğünde eksik Osmanlıca harfleri (پ چ ژ گ ڭ ی, rakamlar vb.) **yeni token** olarak ekler ve
   gömme / çıkış katmanlarını büyütür. LoRA tek başına yeni harf üretemez: harf sözlükte yoksa model onu yazamaz.
3. Dikkat katmanlarına LoRA takar; gömme ve lm_head tam eğitilir (modules_to_save), geri kalan donuk kalır.
4. Bizim manifest biçimimizdeki satırlarla eğitir, CER ölçer, yalnızca LoRA ağırlıklarını (+ gömme) kaydeder.

Doğrulanan: RayR1/trocr-base-arabic-handwritten (610 M) yüklendi, CAMeL sözlüğü پ چ ژ گ ڭ harflerini zaten
içeriyor; LoRA takıldı, eğitilebilir pay %12 (gömme dahil), 4 adımlık CPU denemesi çalıştı ve adaptör kaydedildi.
Not: Hugging Face indirmeleri bazı ağlarda xet sunucusuna takılır; `HF_HUB_DISABLE_XET=1` ortam değişkeni çözer.

Kullanım (GPU önerilir; CPU'da yalnızca küçük denemeler):
    osm lora --taban RayR1/trocr-base-arabic-handwritten --manifest veri/veritabani.jsonl --cikti cikti/lora_ota \\
             --donem 3 --parti 8 --en-fazla 20000
    osm lora-tahmin --adaptor cikti/lora_ota satir.png

Not: Bu yol "en küçük model" hedefine ters düşer (TrOCR-large ≈ 600 M parametre). Önerilen kullanım: LoRA'lı büyük
modeli **öğretmen** yapıp (`osm lora-tahmin --manifest-yaz`) etiketsiz satırları sahte etiketlemek, küçük CRNN'i
bununla eğitmek (damıtma).
"""

from __future__ import annotations

import json
import math
import random
import time
from pathlib import Path

import torch
from PIL import Image

from .alfabe import TEMEL_ALFABE, normallestir
from .veri import kec_cer, manifest_oku

OSMANLI_EK_HARFLER = sorted(set(TEMEL_ALFABE) - {" ", "ـ"})  # tatvil normalleştirmede zaten atılır


def _yukle(taban: str, cihaz: str):
    from transformers import TrOCRProcessor, VisionEncoderDecoderModel

    islemci = TrOCRProcessor.from_pretrained(taban)
    model = VisionEncoderDecoderModel.from_pretrained(taban)
    model.to(cihaz)
    return islemci, model


def sozluk_genislet(islemci, model, gunluk=print) -> list[str]:
    """Tokenizer'da bilinmeyen (UNK'a düşen) Osmanlıca karakterleri ekler, gömmeleri yeniden boyutlar."""
    tok = islemci.tokenizer
    eksik = []
    for ch in OSMANLI_EK_HARFLER:
        ids = tok(ch, add_special_tokens=False)["input_ids"]
        if not ids or (tok.unk_token_id is not None and tok.unk_token_id in ids):
            eksik.append(ch)
        elif tok.decode(ids).strip() != ch:
            eksik.append(ch)
    if eksik:
        tok.add_tokens(eksik)
        model.decoder.resize_token_embeddings(len(tok))
        if getattr(model.config.decoder, "vocab_size", None) is not None:
            model.config.decoder.vocab_size = len(tok)
        gunluk(f"sözlüğe {len(eksik)} karakter eklendi: {''.join(eksik)}")
    else:
        gunluk("sözlük tüm Osmanlıca karakterleri zaten kapsıyor")
    return eksik


def lora_tak(model, r: int = 16, alpha: int = 32, dropout: float = 0.05, yeni_token_var: bool = True):
    from peft import LoraConfig, get_peft_model

    hedefler = ["q_proj", "k_proj", "v_proj", "out_proj", "query", "key", "value", "fc1", "fc2"]
    mevcut = {n.split(".")[-1] for n, _ in model.named_modules()}
    hedefler = [h for h in hedefler if h in mevcut]
    kaydet = ["embed_tokens", "lm_head", "output_projection"] if yeni_token_var else None
    kaydet = [k for k in (kaydet or []) if any(n.endswith(k) for n, _ in model.named_modules())] or None
    cfg = LoraConfig(r=r, lora_alpha=alpha, lora_dropout=dropout, target_modules=hedefler, modules_to_save=kaydet, bias="none")
    pm = get_peft_model(model, cfg)
    return pm


class _VeriSeti(torch.utils.data.Dataset):
    def __init__(self, kayitlar, islemci, en_uzun: int = 128):
        self.k = kayitlar
        self.islemci = islemci
        self.en_uzun = en_uzun

    def __len__(self):
        return len(self.k)

    def __getitem__(self, i):
        k = self.k[i]
        img = Image.open(k["_yol"]).convert("RGB")
        piksel = self.islemci(images=img, return_tensors="pt").pixel_values[0]
        etiket = self.islemci.tokenizer(k["metin"], padding="max_length", max_length=self.en_uzun, truncation=True, return_tensors="pt").input_ids[0]
        etiket[etiket == self.islemci.tokenizer.pad_token_id] = -100
        return piksel, etiket, k["metin"]


def _topla(parca):
    p, e, m = zip(*parca)
    return torch.stack(p), torch.stack(e), list(m)


@torch.no_grad()
def _cer(model, islemci, loader, cihaz, en_fazla: int = 200):
    model.eval()
    d = u = n = 0
    for piksel, _, metinler in loader:
        cik = model.generate(pixel_values=piksel.to(cihaz), max_new_tokens=128, num_beams=1)
        for t, g in zip(islemci.batch_decode(cik, skip_special_tokens=True), metinler):
            dd, uu = kec_cer(normallestir(t), g)
            d += dd
            u += uu
            n += 1
        if n >= en_fazla:
            break
    model.train()
    return d / max(1, u)


def lora_egit(
    taban: str,
    manifestler: list[Path],
    cikti: Path,
    donem: int = 3,
    parti: int = 8,
    ogrenme_orani: float = 2e-4,
    r: int = 16,
    en_fazla: int | None = None,
    dogrulama: int = 300,
    cihaz: str | None = None,
    tohum: int = 0,
    gunluk=print,
    en_fazla_adim: int | None = None,
) -> Path:
    random.seed(tohum)
    torch.manual_seed(tohum)
    cihaz = cihaz or ("cuda" if torch.cuda.is_available() else "cpu")
    cikti = Path(cikti)
    cikti.mkdir(parents=True, exist_ok=True)
    islemci, model = _yukle(taban, cihaz)
    eksik = sozluk_genislet(islemci, model, gunluk)
    model.config.decoder_start_token_id = model.config.decoder_start_token_id or islemci.tokenizer.cls_token_id or islemci.tokenizer.bos_token_id
    model.config.pad_token_id = islemci.tokenizer.pad_token_id
    model.config.eos_token_id = model.config.eos_token_id or islemci.tokenizer.sep_token_id or islemci.tokenizer.eos_token_id
    pm = lora_tak(model, r=r, yeni_token_var=bool(eksik))
    egitilebilir = sum(p.numel() for p in pm.parameters() if p.requires_grad)
    toplam = sum(p.numel() for p in pm.parameters())
    gunluk(f"taban {taban}: {toplam / 1e6:.0f} M parametre, eğitilebilir {egitilebilir / 1e6:.1f} M (%{100 * egitilebilir / toplam:.1f})")

    kayitlar = []
    for m in manifestler:
        kayitlar += manifest_oku(Path(m))
    kayitlar = [k for k in kayitlar if k["metin"]]
    random.shuffle(kayitlar)
    if en_fazla:
        kayitlar = kayitlar[:en_fazla]
    dog = kayitlar[: min(dogrulama, max(1, len(kayitlar) // 10))]
    egit = kayitlar[len(dog) :]
    gunluk(f"eğitim {len(egit)} / doğrulama {len(dog)} satır")
    dl_e = torch.utils.data.DataLoader(_VeriSeti(egit, islemci), batch_size=parti, shuffle=True, collate_fn=_topla, num_workers=2)
    dl_d = torch.utils.data.DataLoader(_VeriSeti(dog, islemci), batch_size=parti, shuffle=False, collate_fn=_topla)

    opt = torch.optim.AdamW([p for p in pm.parameters() if p.requires_grad], lr=ogrenme_orani, weight_decay=0.01)
    adimlar = donem * len(dl_e) if en_fazla_adim is None else min(en_fazla_adim, donem * len(dl_e))
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / max(1, adimlar * 0.06)) * max(0.0, 0.5 * (1 + math.cos(math.pi * min(1.0, s / max(1, adimlar))))))
    pm.train()
    adim = 0
    en_iyi = float("inf")
    for d in range(1, donem + 1):
        t0 = time.time()
        top = 0.0
        for piksel, etiket, _ in dl_e:
            cik = pm(pixel_values=piksel.to(cihaz), labels=etiket.to(cihaz))
            cik.loss.backward()
            torch.nn.utils.clip_grad_norm_(pm.parameters(), 1.0)
            opt.step()
            sched.step()
            opt.zero_grad(set_to_none=True)
            top += cik.loss.item()
            adim += 1
            if adim % 50 == 0:
                gunluk(f"  adım {adim}/{adimlar} kayıp {top / 50:.3f}")
                top = 0.0
            if en_fazla_adim and adim >= en_fazla_adim:
                break
        cer = _cer(pm, islemci, dl_d, cihaz)
        gunluk(f"dönem {d}/{donem}: doğrulama CER %{cer * 100:.2f} ({time.time() - t0:.0f} sn)")
        if cer < en_iyi:
            en_iyi = cer
            pm.save_pretrained(cikti)
            islemci.save_pretrained(cikti)
            (cikti / "taban.json").write_text(json.dumps({"taban": taban, "eklenen": eksik, "cer": cer}, ensure_ascii=False), encoding="utf-8")
        if en_fazla_adim and adim >= en_fazla_adim:
            break
    gunluk(f"en iyi CER %{en_iyi * 100:.2f} → {cikti}")
    return cikti


def lora_yukle(adaptor: Path, cihaz: str | None = None):
    from peft import PeftModel
    from transformers import TrOCRProcessor, VisionEncoderDecoderModel

    cihaz = cihaz or ("cuda" if torch.cuda.is_available() else "cpu")
    bilgi = json.loads((Path(adaptor) / "taban.json").read_text(encoding="utf-8"))
    islemci = TrOCRProcessor.from_pretrained(adaptor)
    model = VisionEncoderDecoderModel.from_pretrained(bilgi["taban"])
    if bilgi.get("eklenen"):
        model.decoder.resize_token_embeddings(len(islemci.tokenizer))
    model = PeftModel.from_pretrained(model, adaptor).to(cihaz).eval()
    return islemci, model, cihaz


@torch.no_grad()
def lora_tahmin(adaptor: Path, goruntuler: list[Path], secenek: int = 3):
    islemci, model, cihaz = lora_yukle(adaptor)
    sonuc = []
    for g in goruntuler:
        piksel = islemci(images=Image.open(g).convert("RGB"), return_tensors="pt").pixel_values.to(cihaz)
        cik = model.generate(pixel_values=piksel, max_new_tokens=128, num_beams=max(3, secenek), num_return_sequences=secenek, output_scores=True, return_dict_in_generate=True)
        metinler = [normallestir(t) for t in islemci.batch_decode(cik.sequences, skip_special_tokens=True)]
        puan = torch.softmax(cik.sequences_scores, 0).tolist() if cik.sequences_scores is not None else [1.0 / secenek] * secenek
        sonuc.append({"dosya": str(g), "secenekler": [{"metin": m, "guven": round(p, 3)} for m, p in zip(metinler, puan)]})
    return sonuc
