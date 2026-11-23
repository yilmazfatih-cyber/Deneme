"""Hugging Face Xet depolamasına ulaşılamazsa klasik HTTP indirmesine geri düşme (ağ kullanmaz)."""

from __future__ import annotations

import asyncio

import huggingface_hub
import pytest
from huggingface_hub import constants

from aiplatform.catalog import load_catalog
from aiplatform.config import reset_settings
from aiplatform.installer import hf

XET_ERR = RuntimeError(
    "Task error: File reconstruction error: CAS Client Error: Request middleware error: error sending request "
    "for url (https://cas-server.xethub.hf.co/v2/reconstructions/abc)"
)


@pytest.fixture
def artifact():
    model = load_catalog().models["gliner-multi-pii-v1"]
    return model, model.artifact("default")


@pytest.fixture(autouse=True)
def _restore_xet(monkeypatch):
    monkeypatch.setattr(hf, "expected_total_bytes", lambda a: 0)
    monkeypatch.delenv("HF_HUB_DISABLE_XET", raising=False)
    before = constants.HF_HUB_DISABLE_XET
    constants.HF_HUB_DISABLE_XET = False
    yield
    constants.HF_HUB_DISABLE_XET = before


def test_is_xet_error():
    assert hf.is_xet_error(XET_ERR)
    assert not hf.is_xet_error(RuntimeError("404 Client Error: Repository Not Found"))


def test_retries_without_xet_on_xet_error(monkeypatch, tmp_path, artifact):
    calls = []

    def fake_snapshot(repo_id, **kw):
        calls.append(constants.HF_HUB_DISABLE_XET)
        if len(calls) == 1:
            raise XET_ERR
        (tmp_path / "pytorch_model.bin").write_bytes(b"x" * 10)
        return str(tmp_path)

    monkeypatch.setattr(huggingface_hub, "snapshot_download", fake_snapshot)
    out = asyncio.run(hf.download_artifact(*artifact, tmp_path))
    assert out == tmp_path
    assert calls == [False, True]  # ilk deneme Xet ile, ikincisi Xet kapalı


def test_other_errors_are_not_retried(monkeypatch, tmp_path, artifact):
    calls = []

    def fake_snapshot(repo_id, **kw):
        calls.append(1)
        raise RuntimeError("404 Client Error: Repository Not Found")

    monkeypatch.setattr(huggingface_hub, "snapshot_download", fake_snapshot)
    with pytest.raises(RuntimeError, match="Repository Not Found"):
        asyncio.run(hf.download_artifact(*artifact, tmp_path))
    assert calls == [1]


def test_setting_disables_xet_up_front(monkeypatch, tmp_path, artifact):
    monkeypatch.setenv("AIP_HF_DISABLE_XET", "true")
    reset_settings()
    seen = []

    def fake_snapshot(repo_id, **kw):
        seen.append(constants.HF_HUB_DISABLE_XET)
        return str(tmp_path)

    monkeypatch.setattr(huggingface_hub, "snapshot_download", fake_snapshot)
    asyncio.run(hf.download_artifact(*artifact, tmp_path))
    assert seen == [True]
