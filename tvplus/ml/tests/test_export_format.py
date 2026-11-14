import json

import numpy as np
import pytest

from mediafm_mini.export_format import check_vectors_file, fmt_vec, manifest, model_line, video_line


def test_fmt_vec_deterministic_and_rounded():
    assert fmt_vec(np.array([0.1234567, -0.0, 1.0, -2.5e-7])) == "[0.123457,0,1,0]"
    assert json.loads(fmt_vec(np.array([0.5, -0.25]))) == [0.5, -0.25]


def test_lines_match_server_format(tmp_path):
    shots = np.array([[0.6, 0.8], [1.0, 0.0]])
    head = json.loads(model_line("mediafm-mini", "v1", 2))
    assert head == {"kind": "model", "id": "mediafm-mini", "version": "v1", "dims": 2}
    row = json.loads(video_line(80010001, 80010001, shots, np.array([0.8, 0.6])))
    assert row["kind"] == "video" and row["videoId"] == 80010001 and row["titleId"] == 80010001
    assert row["shots"] == [[0.6, 0.8], [1, 0]] and row["pooled"] == [0.8, 0.6]
    f = tmp_path / "vectors.jsonl"
    f.write_text(model_line("mediafm-mini", "v1", 2) + "\n" + video_line(1, 1, shots, shots[0]) + "\n")
    assert check_vectors_file(f, {1: 2}) == {"model": head, "videos": 1, "shots": 2}
    with pytest.raises(AssertionError):
        check_vectors_file(f, {1: 3})


def test_manifest_schema_rules():
    m = manifest("mediafm-mini", "2026.11.13", 128, "2026-11-13T12:00:00Z", "x", ["vectors.jsonl"])
    assert m["format"] == "tvplus-embedding/1" and m["files"] == ["vectors.jsonl"]
    with pytest.raises(ValueError):
        manifest("MediaFM", "v", 128, "2026-11-13T12:00:00Z", "", ["vectors.jsonl"])
    with pytest.raises(ValueError):
        manifest("mediafm-mini", "v", 1, "2026-11-13T12:00:00Z", "", ["vectors.jsonl"])
