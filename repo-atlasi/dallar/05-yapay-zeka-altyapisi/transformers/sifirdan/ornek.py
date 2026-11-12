"""Uçtan uca örnek: belirteçleyici eğit -> modeli eğit -> yerel hub'a yayınla -> pipeline ile üret.

Çalıştır: python3 ornek.py   (internet gerekmez; ~10-20 saniye sürer)
"""

import os
import tempfile

import minitransformers as mt
from minitransformers import hub

KOK = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(KOK, "veri", "turkce.txt"), encoding="utf-8") as f:
    metin = f.read()

tok = mt.ByteLevelBPETokenizer.train([metin], vocab_size=400)
print("sözlük:", tok.vocab_size, "| örnek belirteçler:", tok.convert_ids_to_tokens(tok.encode(" kütüphaneye gittim")))

config = mt.GPTConfig(vocab_size=tok.vocab_size, n_positions=64, n_embd=32, n_layer=2, n_head=4, eos_token_id=tok.eos_token_id)
model = mt.GPTForCausalLM(config)
print("parametre sayısı:", model.num_parameters())

args = mt.TrainingArguments(max_steps=300, batch_size=8, block_size=32, learning_rate=5e-3)
trainer = mt.Trainer(model, args, tok.encode(metin))
trainer.train()
for kayit in trainer.log_history[::60] + trainer.log_history[-1:]:
    print(f"adım {kayit['step']:3d}  kayıp={kayit['loss']:.3f}")

with tempfile.TemporaryDirectory() as hub_dir:
    hub.publish(model, tok, "atlas/mini-gpt-tr", hub_dir)
    print("yayınlanan dosyalar:", sorted(os.listdir(os.path.join(hub_dir, "atlas", "mini-gpt-tr"))))
    uretici = mt.pipeline("text-generation", model="atlas/mini-gpt-tr", hub_dir=hub_dir)

print("\naçgözlü :", uretici("Vapur", max_new_tokens=30)[0]["generated_text"])
print("örnekleme:", uretici("Akşam", max_new_tokens=30, do_sample=True, top_k=8, temperature=0.8, seed=3)[0]["generated_text"])
