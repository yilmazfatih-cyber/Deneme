"""Tohumlu sentetik veri üreteçleri: örnekler ve testler dış veri indirmeden çalışsın diye.

  make_moons / make_circles   iki boyutlu, doğrusal olmayan iki sınıf (MLP örneği)
  make_blobs                  küme merkezleri etrafında normal dağılmış noktalar (k-means örneği)
  make_classification         bilgi taşıyan + gürültü sütunlu sınıflandırma verisi
  make_regression             doğrusal hedef + gürültü
  make_churn_table            Türkçe sütunlu müşteri kaybı tablosu (tarih, eksik değer, kimlik)
  make_shapes                 kare / daire / artı işareti görüntüleri (evrişim örneği)
Aynı tohum her makinede aynı veriyi üretir (numpy `default_rng`).
Genişletme: yeni bir üreteç `random_state` parametresi alan ve numpy dizisi ya da `Table`
döndüren bir fonksiyondur; buraya ekleyin ve `veri/__init__.py`'den dışa açın.
"""

from __future__ import annotations

import numpy as np

from ml_temel.ortak.table import Table
from ml_temel.ortak.types import Array, IntArray, Seed
from ml_temel.ortak.validation import make_rng


def make_moons(
    n_samples: int = 200, noise: float = 0.1, random_state: Seed = None
) -> tuple[Array, IntArray]:
    """İç içe geçmiş iki yarım ay."""
    rng = make_rng(random_state)
    n_out = n_samples // 2
    angles_out = np.linspace(0, np.pi, n_out)
    angles_in = np.linspace(0, np.pi, n_samples - n_out)
    outer = np.column_stack([np.cos(angles_out), np.sin(angles_out)])
    inner = np.column_stack([1 - np.cos(angles_in), 1 - np.sin(angles_in) - 0.5])
    X = np.vstack([outer, inner]) + rng.normal(scale=noise, size=(n_samples, 2))
    y = np.r_[np.zeros(n_out, dtype=np.int64), np.ones(n_samples - n_out, dtype=np.int64)]
    order = rng.permutation(n_samples)
    return X[order], y[order]


def make_circles(
    n_samples: int = 200, noise: float = 0.05, factor: float = 0.5, random_state: Seed = None
) -> tuple[Array, IntArray]:
    """Biri diğerinin içinde iki çember."""
    rng = make_rng(random_state)
    n_out = n_samples // 2
    angles = rng.uniform(0, 2 * np.pi, n_samples)
    radius = np.r_[np.ones(n_out), np.full(n_samples - n_out, factor)]
    X = np.column_stack([np.cos(angles), np.sin(angles)]) * radius[:, None]
    X += rng.normal(scale=noise, size=X.shape)
    y = np.r_[np.zeros(n_out, dtype=np.int64), np.ones(n_samples - n_out, dtype=np.int64)]
    return X, y


def make_blobs(
    n_samples: int = 300,
    centers: int = 3,
    n_features: int = 2,
    cluster_std: float = 1.0,
    random_state: Seed = None,
) -> tuple[Array, IntArray]:
    """`centers` adet merkez (-10..10 küpünde) etrafında küme."""
    rng = make_rng(random_state)
    middle = rng.uniform(-10, 10, size=(centers, n_features))
    labels = rng.integers(0, centers, n_samples)
    X = middle[labels] + rng.normal(scale=cluster_std, size=(n_samples, n_features))
    return X, labels


def make_classification(
    n_samples: int = 500,
    n_features: int = 10,
    n_informative: int = 3,
    n_classes: int = 2,
    class_sep: float = 1.0,
    random_state: Seed = None,
) -> tuple[Array, IntArray]:
    """İlk `n_informative` sütun sınıfa göre kayar; kalanlar saf gürültüdür."""
    rng = make_rng(random_state)
    labels = rng.integers(0, n_classes, n_samples)
    centers = rng.normal(scale=class_sep, size=(n_classes, n_informative))
    X = rng.standard_normal((n_samples, n_features))
    X[:, :n_informative] += centers[labels]
    return X, labels


def make_regression(
    n_samples: int = 300,
    n_features: int = 5,
    noise: float = 1.0,
    random_state: Seed = None,
) -> tuple[Array, Array, Array]:
    """(X, y, gerçek katsayılar): y = X·w + gürültü."""
    rng = make_rng(random_state)
    X = rng.standard_normal((n_samples, n_features))
    coef = rng.uniform(-3, 3, n_features)
    return X, X @ coef + rng.normal(scale=noise, size=n_samples), coef


def make_shapes(
    n_images: int = 300, size: int = 12, noise: float = 0.1, random_state: Seed = None
) -> tuple[Array, IntArray]:
    """(görüntüler (n, 1, size, size), etiketler) — 0 = kare, 1 = daire, 2 = artı işareti."""
    rng = make_rng(random_state)
    images = np.zeros((n_images, 1, size, size))
    labels = rng.integers(0, 3, n_images)
    rows, cols = np.mgrid[0:size, 0:size]
    for i, label in enumerate(labels.tolist()):
        radius = int(rng.integers(size // 5, size // 3 + 1))
        cy, cx = rng.integers(radius, size - radius, 2)
        if label == 0:
            shape = (np.abs(rows - cy) <= radius) & (np.abs(cols - cx) <= radius)
            shape &= ~((np.abs(rows - cy) < radius) & (np.abs(cols - cx) < radius))
        elif label == 1:
            distance = np.sqrt((rows - cy) ** 2 + (cols - cx) ** 2)
            shape = np.abs(distance - radius) < 0.7
        else:
            shape = ((rows == cy) & (np.abs(cols - cx) <= radius)) | (
                (cols == cx) & (np.abs(rows - cy) <= radius)
            )
        images[i, 0] = shape + rng.normal(scale=noise, size=(size, size))
    return images, labels


_CITIES = ["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Konya", "Diyarbakır", "Iğdır"]
_CITY_WEIGHTS = [0.35, 0.15, 0.13, 0.1, 0.09, 0.08, 0.06, 0.04]
_COMPLAINTS = [
    "internet yavaş",
    "fatura yüksek",
    "bağlantı kopuyor",
    "müşteri hizmetleri ulaşılmıyor",
    "kurulum gecikti",
    "şikâyet yok",
]


def make_churn_table(n_customers: int = 2000, random_state: Seed = None) -> Table:
    """Kurgusal bir internet sağlayıcısının müşteri tablosu; hedef: `kayip` ("evet"/"hayır").

    Kayıp olasılığını artıranlar: aylık sözleşme, çok destek çağrısı, gecikmeli ödeme, düşük
    memnuniyet, kısa abonelik süresi. Bilgi taşımayan bir sütun (`musteri_no`) da vardır.
    """
    rng = make_rng(random_state)
    n = n_customers
    package = rng.choice(["Temel", "Standart", "Premium"], n, p=[0.45, 0.35, 0.2])
    contract = rng.choice(["Aylık", "1 yıl", "2 yıl"], n, p=[0.5, 0.3, 0.2])
    base_fee = np.select([package == "Temel", package == "Standart"], [199.9, 289.9], 429.9)
    fee = np.round(base_fee + rng.normal(0, 25, n), 2)
    tenure = np.minimum(rng.exponential(22, n).astype(int) + 1, 96)
    calls = rng.poisson(1.2, n)
    late = rng.choice([0, 1, 2, 3], n, p=[0.7, 0.18, 0.08, 0.04])
    satisfaction = np.clip(np.round(rng.normal(3.6, 1.0, n) - 0.3 * calls), 1, 5)
    usage = np.round(rng.gamma(4.0, 60.0, n) * np.select([package == "Premium"], [1.6], 1.0), 1)
    logit = (
        -2.2
        + 1.3 * (contract == "Aylık")
        - 0.9 * (contract == "2 yıl")
        + 0.45 * calls
        + 0.6 * late
        - 0.55 * (satisfaction - 3)
        - 0.025 * tenure
        + 0.004 * (fee - 280)
    )
    churn = rng.random(n) < 1.0 / (1.0 + np.exp(-logit))
    signup_day = np.datetime64("2026-01-01") - (tenure * 30.4).astype("timedelta64[D]")
    signup = [str(day)[8:10] + "." + str(day)[5:7] + "." + str(day)[:4] for day in signup_day]
    complaint = np.where(
        calls > 0,
        rng.choice(_COMPLAINTS[:-1], n),
        np.array(_COMPLAINTS[-1], dtype=object),
    ).astype(object)
    usage_with_gaps = np.where(rng.random(n) < 0.05, np.nan, usage)
    satisfaction_with_gaps = np.where(rng.random(n) < 0.1, np.nan, satisfaction)
    return Table(
        {
            "musteri_no": np.array([f"M{100000 + i}" for i in range(n)], dtype=object),
            "kayit_tarihi": np.array(signup, dtype=object),
            "sehir": rng.choice(_CITIES, n, p=_CITY_WEIGHTS).astype(object),
            "paket": package.astype(object),
            "sozlesme": contract.astype(object),
            "aylik_ucret": fee,
            "abonelik_ay": tenure.astype(np.float64),
            "kullanim_gb": usage_with_gaps,
            "destek_cagrisi": calls.astype(np.float64),
            "gecikmeli_odeme": late.astype(np.float64),
            "memnuniyet": satisfaction_with_gaps,
            "son_sikayet": complaint,
            "kayip": np.where(churn, "evet", "hayır").astype(object),
        }
    )
