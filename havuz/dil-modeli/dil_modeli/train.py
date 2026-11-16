"""Ön eğitim döngüsü: hazırlanmış veriden dil modeli eğitir, denetim noktası yazar, sürdürür.

Bir adım: `grad_accum` küçük yığın üzerinde ileri+geri geçiş (karışık duyarlık yalnız CUDA'da),
gradyan kırpma, AdamW adımı. Öğrenme oranı, yığın seçimi ve dropout tohumu adım numarasının saf
işlevidir; bu yüzden `--surdur` ile yarıda kesilen eğitim bire bir aynı sonuca ulaşır
(tests/test_train.py). Çıktı klasörü (`out_dir`):
    egitim-durumu.pt   sürdürme için tam durum      gunluk.jsonl  adım adım ölçümler
    son/  en-iyi/      model klasörleri (model_io)  egitim-ayarlari.json  kullanılan ayarlar

Genişletme: Adım içine yeni bir şey (ör. EMA) eklerken durumunu `_state()` ve `_restore()` ile
kaydedip geri yükleyin; sürdürme testi bunu denetler.
"""

from __future__ import annotations

import json
import math
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch

from .batches import TokenData
from .data import TRAIN, VAL
from .device import autocast, pick_device, resolve_precision
from .evaluate import mean_loss
from .generate import TextStream
from .model import LanguageModel, lm_loss
from .model_io import load_tensors, model_tensors, save_model, write_atomic
from .optim import build_optimizer, lr_at, set_lr
from .sampling import SamplingConfig
from .tokenizer_api import load_tokenizer
from .train_config import TrainConfig
from .train_state import LOG_NAME, STATE_NAME, JsonlLogger, StopRequest, load_state, save_state

LAST_DIR, BEST_DIR, SETTINGS_NAME = "son", "en-iyi", "egitim-ayarlari.json"
Log = Callable[[str], None]


@dataclass(frozen=True)
class TrainResult:
    step: int  # tamamlanan adım sayısı
    finished: bool  # max_steps'e ulaşıldı mı (False: süre sınırı ya da ara durdurma)
    train_loss: float | None  # son günlük aralığındaki ortalama eğitim kaybı
    val_loss: float | None  # son doğrulama kaybı
    best_val_loss: float
    tokens: int  # bu eğitimde görülen toplam belirteç
    seconds: float  # toplam eğitim süresi (sürdürmeler dahil)


class Trainer:
    """Kullanım: `Trainer(ayarlar).run()`; sürdürmek için `Trainer(ayarlar, resume=True).run()`."""

    def __init__(
        self,
        config: TrainConfig,
        *,
        resume: bool = False,
        log: Log = print,
        clock: Callable[[], float] = time.perf_counter,
    ) -> None:
        self.config, self.log, self.clock = config, log, clock
        if config.threads:
            torch.set_num_threads(config.threads)
        self.device = pick_device(config.device)
        self.precision = resolve_precision(config.precision, self.device)
        self.out_dir = Path(config.out_dir)
        self.train_data = TokenData(config.data_dir, TRAIN)
        self.val_data = TokenData(config.data_dir, VAL)
        self.tokenizer = load_tokenizer(Path(config.data_dir) / "tokenizer.json")
        if self.tokenizer.fingerprint() != self.train_data.meta["tokenizer_fingerprint"]:
            raise ValueError(
                "Veri klasöründeki tokenizer.json, verinin hazırlandığı tokenizer değil."
            )
        self.model_config = config.model_config(self.tokenizer.vocab_size)
        self.seq_len = config.window(self.model_config)
        torch.manual_seed(config.seed)
        self.model = LanguageModel(self.model_config).to(self.device)
        self.optimizer = build_optimizer(
            self.model.parameters(),
            learning_rate=config.learning_rate,
            weight_decay=config.weight_decay,
            betas=(config.beta1, config.beta2),
            fused=self.device.type == "cuda",
        )
        self.scaler = torch.amp.GradScaler(self.device.type, enabled=self.precision.use_scaler)
        self.step, self.best_val, self.tokens, self.seconds = 0, math.inf, 0, 0.0
        self.window_loss, self.window_steps = 0.0, 0  # günlük aralığındaki kayıp toplamı
        if resume:
            self._restore(load_state(self.out_dir / STATE_NAME, self.device))
        self.forward: Callable[[torch.Tensor], torch.Tensor] = (
            torch.compile(self.model) if config.compile else self.model
        )
        self.logger = JsonlLogger(self.out_dir / LOG_NAME, keep_until=self.step if resume else None)
        write_atomic(self.out_dir / SETTINGS_NAME, json.dumps(config.to_dict(), indent=2) + "\n")

    # ---- durum ----------------------------------------------------------------------

    def _state(self) -> dict[str, Any]:
        return {
            "step": self.step,
            "best_val": self.best_val,
            "tokens": self.tokens,
            "seconds": self.seconds,
            "window": [self.window_loss, self.window_steps],
            "model": model_tensors(self.model),
            "optimizer": self.optimizer.state_dict(),
            "scaler": self.scaler.state_dict(),
            "config": self.config.to_dict(),
            "model_config": self.model_config.to_dict(),
        }

    def _restore(self, state: dict[str, Any]) -> None:
        if state["model_config"] != self.model_config.to_dict():
            raise ValueError(
                "Sürdürülen eğitimin model biçimi şimdiki ayarlardan farklı. Aynı yapılandırma "
                "dosyasını kullanın ya da yeni bir out_dir ile baştan başlayın."
            )
        changed = sorted(k for k, v in self.config.to_dict().items() if state["config"].get(k) != v)
        if changed:
            self.log(f"Not: sürdürmede değişen ayarlar: {', '.join(changed)}")
        load_tensors(self.model, state["model"])
        self.optimizer.load_state_dict(state["optimizer"])
        self.scaler.load_state_dict(state["scaler"])
        self.step, self.best_val = int(state["step"]), float(state["best_val"])
        self.tokens, self.seconds = int(state["tokens"]), float(state["seconds"])
        self.window_loss, self.window_steps = float(state["window"][0]), int(state["window"][1])
        self.log(f"Sürdürülüyor: adım {self.step}, en iyi doğrulama kaybı {self.best_val:.4f}")

    def _checkpoint(self) -> None:
        save_state(self.out_dir / STATE_NAME, self._state())
        save_model(self.out_dir / LAST_DIR, self.model, self.tokenizer, info=self._info())

    def _info(self) -> dict[str, Any]:
        return {"adim": self.step, "en_iyi_dogrulama_kaybi": self.best_val, "belirtec": self.tokens}

    # ---- adımlar --------------------------------------------------------------------

    def _train_step(self) -> tuple[float, float]:
        """Bir eniyileyici adımı -> (ortalama kayıp, kırpmadan önceki gradyan normu)."""
        config = self.config
        set_lr(self.optimizer, self._lr(self.step))
        torch.manual_seed(config.seed * 1_000_003 + self.step)  # dropout: adıma bağlı tohum
        total = 0.0
        for micro in range(config.grad_accum):
            rng = np.random.default_rng([config.seed, self.step, micro])
            inputs, targets = self.train_data.sample_batch(config.batch_size, self.seq_len, rng)
            inputs, targets = inputs.to(self.device), targets.to(self.device)
            with autocast(self.device, self.precision):
                loss = lm_loss(self.forward(inputs), targets) / config.grad_accum
            self.scaler.scale(loss).backward()
            total += float(loss.item())
        if not math.isfinite(total):
            raise FloatingPointError(
                f"Kayıp sayı olmaktan çıktı (NaN/sonsuz), adım {self.step}. Öğrenme oranını "
                "düşürün (ör. --ayar learning_rate=3e-4), grad_clip=1.0 kullanın; fp16 yerine "
                "bf16/fp32 deneyin."
            )
        self.scaler.unscale_(self.optimizer)
        limit = config.grad_clip if config.grad_clip > 0 else math.inf
        norm = float(torch.nn.utils.clip_grad_norm_(self.model.parameters(), limit))
        self.scaler.step(self.optimizer)
        self.scaler.update()
        self.optimizer.zero_grad(set_to_none=True)
        self.step += 1
        self.tokens += config.batch_size * config.grad_accum * self.seq_len
        return total, norm

    def _lr(self, step: int) -> float:
        config = self.config
        return lr_at(
            step,
            base_lr=config.learning_rate,
            warmup_steps=config.warmup_steps,
            max_steps=config.max_steps,
            min_lr_ratio=config.min_lr_ratio,
        )

    def evaluate(self) -> float:
        """Doğrulama kaybı; en iyiyse `en-iyi/` klasörüne kaydeder ve örnek üretir."""
        batches = self.val_data.eval_batches(
            self.config.batch_size, self.seq_len, self.config.eval_batches
        )
        val = mean_loss(self.model, batches, self.device, self.precision)
        improved = val < self.best_val
        if improved:
            self.best_val = val
            save_model(self.out_dir / BEST_DIR, self.model, self.tokenizer, info=self._info())
        record: dict[str, Any] = {"step": self.step, "val_loss": round(val, 5)}
        record["val_ppl"] = round(math.exp(min(val, 50.0)), 3)
        mark = " (en iyi)" if improved else ""
        self.log(
            f"adım {self.step:>6} | doğrulama kaybı {val:.4f} | şaşkınlık {record['val_ppl']}{mark}"
        )
        if self.config.sample_tokens > 0:
            record["sample"] = self._sample()
            self.log(f"  örnek: {record['sample']!r}")
        self.logger.write(record)
        return val

    def _sample(self) -> str:
        prompt = [self.tokenizer.bos_id, *self.tokenizer.encode(self.config.sample_prompt)]
        settings = SamplingConfig(
            max_new_tokens=self.config.sample_tokens,
            temperature=0.8,
            top_k=40,
            seed=self.config.seed,
        )
        return self.config.sample_prompt + "".join(
            TextStream(self.model, self.tokenizer, prompt, settings)
        )

    # ---- döngü ----------------------------------------------------------------------

    def run(self, stop_at: int | None = None) -> TrainResult:
        """`max_steps`e (ya da `stop_at` adımına, süre sınırına, Ctrl+C'ye) kadar eğitir."""
        config = self.config
        run_start = started = window_start = self.clock()
        window_tokens = 0
        train_loss: float | None = None
        val_loss: float | None = None
        params = self.model.num_parameters()
        self.log(
            f"Model: {params / 1e6:.2f} M parametre | aygıt: {self.device} | "
            f"duyarlık: {self.precision.name}"
        )
        self.model.train()
        with StopRequest(self.log) as stop:
            while self.step < config.max_steps and (stop_at is None or self.step < stop_at):
                loss, norm = self._train_step()
                self.window_loss, self.window_steps = self.window_loss + loss, self.window_steps + 1
                window_tokens += config.batch_size * config.grad_accum * self.seq_len
                if self.step % config.log_every == 0 or self.step == config.max_steps:
                    now = self.clock()
                    train_loss = self.window_loss / self.window_steps
                    speed = window_tokens / max(now - window_start, 1e-9)
                    self._log_train(train_loss, norm, speed, self.seconds + now - started)
                    self.window_loss, self.window_steps = 0.0, 0
                    window_tokens, window_start = 0, now
                if self.step % config.eval_every == 0 or self.step == config.max_steps:
                    paused = self.clock()
                    val_loss = self.evaluate()
                    now = self.clock()
                    self.seconds, started = self.seconds + now - started, now
                    self._checkpoint()
                    window_start += self.clock() - paused  # değerlendirme süresi hıza sayılmaz
                if stop.requested:
                    self.log("Durduruldu. Devam için aynı komuta --surdur ekleyin.")
                    break
                if config.max_minutes and self.clock() - run_start > config.max_minutes * 60:
                    self.log("Süre sınırı doldu; durum kaydedildi. Devam için: --surdur")
                    break
        self.seconds += self.clock() - started
        if self.step % config.eval_every != 0 and self.step != config.max_steps:
            self._checkpoint()  # son doğrulamadan sonraki adımlar da kaybolmasın
        return TrainResult(
            self.step,
            self.step >= config.max_steps,
            train_loss,
            val_loss,
            self.best_val,
            self.tokens,
            self.seconds,
        )

    def _log_train(self, loss: float, norm: float, speed: float, elapsed: float) -> None:
        lr = self._lr(self.step - 1)
        self.log(
            f"adım {self.step:>6} | kayıp {loss:.4f} | öo {lr:.2e} | gnorm {norm:.2f} | "
            f"{speed:,.0f} belirteç/sn | {elapsed / 60:.1f} dk"
        )
        self.logger.write(
            {
                "step": self.step,
                "loss": round(loss, 5),
                "lr": lr,
                "grad_norm": round(norm, 4),
                "tokens_per_sec": round(speed, 1),
                "elapsed_sec": round(elapsed, 2),
            }
        )


def train(config: TrainConfig, *, resume: bool = False, log: Log = print) -> TrainResult:
    """Tek çağrıyla eğitim (komut satırı bunu kullanır)."""
    return Trainer(config, resume=resume, log=log).run()
