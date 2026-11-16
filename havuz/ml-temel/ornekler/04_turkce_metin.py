"""Örnek (d): Türkçe kısa metin sınıflandırma — TF-IDF + lojistik regresyon.

48 satırlık el yazımı müşteri iletisi (4 konu) üzerinde: Türkçe'ye duyarlı belirteçleme ("İADE",
"iade" ve "İade'yi" aynı belirtece iner), TF-IDF ile vektörleme, lojistik regresyon ve katmanlı
çapraz doğrulama. Kelime ve karakter n-gramları karşılaştırılır (karakter n-gramları Türkçe'nin
eklerine karşı daha dayanıklıdır). Son olarak her konunun en belirleyici terimleri ve yeni
iletiler için tahminler yazdırılır.
Çalıştırma: python ornekler/04_turkce_metin.py   (birkaç saniye)
"""

from __future__ import annotations

import _setup_path  # noqa: F401
import numpy as np

from ml_temel.klasik import LogisticRegression
from ml_temel.onisleme import TfidfVectorizer, make_pipeline, tokenize
from ml_temel.secim import StratifiedKFold, cross_val_score

MESSAGES = {
    "kargo": [
        "Kargom hâlâ gelmedi, nerede acaba?",
        "Sipariş üç gündür kargoda bekliyor",
        "KARGO TAKİP NUMARASI ÇALIŞMIYOR",
        "Paketim yanlış adrese teslim edilmiş",
        "Kurye kapıya gelmeden 'teslim edildi' yazmış",
        "Teslimat ne zaman yapılacak?",
        "Kargo şubesinde bekleyen paketimi kim alacak",
        "Gönderim gecikti, dağıtıma ne zaman çıkar",
        "Paket hasarlı geldi, kutu ezilmişti",
        "Iğdır'a kargo kaç günde ulaşır?",
        "Kargo firması paketi kaybetmiş",
        "Siparişim hangi kargoyla gönderildi",
    ],
    "iade": [
        "Ürünü iade etmek istiyorum",
        "İADE KODU NASIL ALINIR",
        "Beden olmadı, değişim yapabilir miyim?",
        "İade ettiğim ürünün parası ne zaman yatacak",
        "Hatalı ürün geldi, geri göndermek istiyorum",
        "İade süresi kaç gün?",
        "Değişim talebim onaylanmadı",
        "Ürünü beğenmedim, iadesini yapmak istiyorum",
        "İade'yi kargoya verdim, takip edebilir miyim",
        "Kusurlu ürün için değişim istiyorum",
        "İade formunu nereden doldururum",
        "Geri gönderdiğim paket ulaştı mı",
    ],
    "odeme": [
        "Kartımdan iki kez çekim yapılmış",
        "Ödeme sırasında hata aldım",
        "Taksit seçeneği görünmüyor",
        "Havale ile ödeme yapabilir miyim?",
        "FATURA BİLGİLERİM YANLIŞ ÇIKMIŞ",
        "Kredi kartı ödemem onaylanmadı",
        "Kapıda ödeme seçeneği var mı",
        "Hesabımdan para çekildi ama sipariş oluşmadı",
        "İndirim kodu ödemede uygulanmadı",
        "Faturamı e-posta ile almak istiyorum",
        "Ödeme sayfası açılmıyor",
        "Bankadan provizyon iadesi ne zaman düşer",
    ],
    "memnuniyet": [
        "Ürün harika, çok teşekkür ederim",
        "Hızlı ve özenli paketleme için sağ olun",
        "Çok memnun kaldım, tekrar alacağım",
        "Müşteri hizmetleri çok ilgiliydi, teşekkürler",
        "Kalitesi beklediğimden de iyi",
        "Annem hediyeye bayıldı, ellerinize sağlık",
        "Her şey için teşekkürler, harika bir deneyim",
        "Tavsiye ederim, çok güzel bir ürün",
        "Fiyatına göre çok kaliteli",
        "İlginiz için çok teşekkür ederim",
        "Mükemmel hizmet, memnun kaldım",
        "Sorunumu hemen çözdünüz, sağ olun",
    ],
}


def main() -> None:
    texts = [text for texts in MESSAGES.values() for text in texts]
    labels = np.array([label for label, texts in MESSAGES.items() for _ in texts])
    print(f"{len(texts)} ileti, {len(MESSAGES)} konu.")
    print("Belirteçleme örneği:", tokenize("İADE'yi IĞDIR şubesine verdim"))

    folds = StratifiedKFold(4, shuffle=True, random_state=0)
    variants = {
        "kelime (1-2 gram)": TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True),
        "karakter (2-4 gram)": TfidfVectorizer(
            analyzer="char_wb", ngram_range=(2, 4), sublinear_tf=True
        ),
    }
    for name, vectorizer in variants.items():
        pipeline = make_pipeline(vectorizer, LogisticRegression(C=10.0))
        scores = cross_val_score(pipeline, texts, labels, cv=folds, scoring="accuracy")
        print(f"Çapraz doğrulama doğruluğu, {name}: {scores.mean():.3f} ± {scores.std():.3f}")

    pipeline = make_pipeline(
        TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), sublinear_tf=True),
        LogisticRegression(C=10.0),
    ).fit(texts, labels)
    words = make_pipeline(TfidfVectorizer(), LogisticRegression(C=10.0)).fit(texts, labels)
    vocabulary = np.array(words.named_steps["tfidfvectorizer"].get_feature_names_out())
    model = words.named_steps["logisticregression"]
    print("\nKonu başına en belirleyici kelimeler:")
    for row, label in enumerate(model.classes_):
        top = vocabulary[np.argsort(-model.coef_[row])[:4]]
        print(f"  {label:<10s} {', '.join(top)}")

    new = ["İadem ne zaman onaylanır?", "kargom gecikti", "Ödememi yapamadım", "Çok teşekkürler!"]
    print("\nYeni iletiler:")
    for text, label, proba in zip(
        new, pipeline.predict(new), pipeline.predict_proba(new), strict=True
    ):
        print(f"  {text:<30s} → {label} ({proba.max():.2f})")


if __name__ == "__main__":
    main()
