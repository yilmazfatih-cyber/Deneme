// Çekirdek mantığın (Parcalayici, DalgaDosyasi) testleri.
// calistir.sh, CeviriApp.swift içindeki ">>> CEKIRDEK … <<< CEKIRDEK" bölümünü bu dosyayla birlikte derler.

import Foundation

var hataSayisi = 0
var testSayisi = 0

func bekle<T: Equatable>(_ gelen: T, _ beklenen: T, _ ad: String, satir: Int = #line) {
    testSayisi += 1
    if gelen != beklenen {
        hataSayisi += 1
        print("✗ \(ad) (satır \(satir))\n    beklenen: \(beklenen)\n    gelen:    \(gelen)")
    }
}

/// Bir ara sonuç dizisini sırayla verir; her adımda çıkan parçaları toplar.
func akit(_ parcalayici: inout Parcalayici, _ adimlar: [String]) -> [String] {
    var hepsi: [String] = []
    for adim in adimlar { hepsi.append(contentsOf: parcalayici.guncelle(adim)) }
    return hepsi
}

/// Bir cümleyi kelime kelime büyüyen ara sonuçlara çevirir.
func buyuyen(_ metin: String, onEk: String = "") -> [String] {
    let kelimeler = metin.split(separator: " ").map(String.init)
    return (1...kelimeler.count).map { adet in
        (onEk.isEmpty ? "" : onEk + " ") + kelimeler.prefix(adet).joined(separator: " ")
    }
}

// MARK: Cümle sonu: ardından iki kelime gelince gönderilir

do {
    var p = Parcalayici()
    bekle(p.guncelle("Hello"), [], "tek kelime beklenir")
    bekle(p.guncelle("Hello everyone."), [], "nokta gelince hemen gönderilmez")
    bekle(p.guncelle("Hello everyone. Today"), [], "bir kelime koruma payına yetmez")
    bekle(p.guncelle("Hello everyone. Today we"), ["Hello everyone."], "iki kelime sonra cümle gönderilir")
    bekle(p.canli, "Today we", "canlı kısım kalan sözdür")
    bekle(p.kapat(), "Today we", "duraklamada kalan gönderilir")
    bekle(p.canli, "", "kapattıktan sonra canlı kısım boş")
    bekle(p.kapat(), nil, "ikinci kapatma bir şey döndürmez")
}

// MARK: Tanıyıcı metni büyütmeye devam ederse (sıfırlamadan) yalnızca yeni kısım gider

do {
    var p = Parcalayici()
    _ = akit(&p, buyuyen("Hello everyone."))
    bekle(p.kapat(), "Hello everyone.", "duraklama")
    bekle(p.guncelle("Hello everyone. Today"), [], "devam: aynı başlangıç")
    bekle(p.canli, "Today", "yalnızca yeni kelime canlı")
    bekle(akit(&p, buyuyen("we will talk about history.", onEk: "Hello everyone. Today")), [], "cümle sonu bekleniyor")
    bekle(p.kapat(), "Today we will talk about history.", "ikinci söz baştan tekrar edilmez")
}

// MARK: Tanıyıcı duraklamadan sonra metni sıfırlarsa yeni söz baştan sayılır

do {
    var p = Parcalayici()
    _ = akit(&p, buyuyen("Thank you very much."))
    bekle(p.kapat(), "Thank you very much.", "ilk söz")
    bekle(akit(&p, buyuyen("How are you today")), [], "yeni söz, cümle sonu yok")
    bekle(p.canli, "How are you today", "yeni söz baştan sayıldı")
    bekle(p.kapat(), "How are you today", "yeni söz eksiksiz")
}

// Duraklama süresi dolmadan sıfırlanırsa eski söz kaybolmaz.
do {
    var p = Parcalayici()
    _ = akit(&p, buyuyen("Thank you very much"))
    bekle(p.guncelle("How"), ["Thank you very much"], "kısalan ve farklı başlayan metin yeni sözdür")
    bekle(p.canli, "How", "yeni söz canlı")
}

// Boş ara sonuç gelirse eldeki söz gönderilir.
do {
    var p = Parcalayici()
    _ = akit(&p, buyuyen("See you tomorrow"))
    bekle(p.guncelle(""), ["See you tomorrow"], "boş sonuç kuyruğu kapatır")
    bekle(p.canli, "", "boş sonuçtan sonra canlı kısım boş")
    bekle(akit(&p, buyuyen("Good night")), [], "sonraki söz")
    bekle(p.kapat(), "Good night", "sonraki söz eksiksiz")
}

// Yeni söz eskisiyle aynı kelimeyle başlarsa en fazla o kelime kaybolur, söz yinelenmez.
do {
    var p = Parcalayici()
    _ = akit(&p, buyuyen("I think so."))
    bekle(p.kapat(), "I think so.", "ilk söz")
    bekle(akit(&p, ["I", "I will", "I will go", "I will go now"]), [], "aynı kelimeyle başlayan yeni söz")
    bekle(p.kapat(), "will go now", "yalnızca ortak ilk kelime düşer")
}

// MARK: Sayı biçimlenince metin kısalır; söz yeniden çevrilmez

do {
    var p = Parcalayici()
    _ = akit(&p, buyuyen("I paid one hundred and twenty five dollars"))
    bekle(p.guncelle("I paid $125"), [], "kısalan ama aynı başlayan metin aynı sözdür")
    bekle(p.guncelle("I paid $125 for it"), [], "devam")
    bekle(p.kapat(), "I paid $125 for it", "tek parça, yineleme yok")
}

do {
    var p = Parcalayici()
    _ = akit(&p, buyuyen("We met in nineteen ninety five."))
    bekle(p.kapat(), "We met in nineteen ninety five.", "gönderildi")
    // Gönderilmiş kısım sonradan kısalarak düzeltilirse yeniden gönderilmez.
    bekle(p.guncelle("We met in 1995."), [], "gönderilmiş kısmın düzeltilmesi yeni parça üretmez")
    bekle(p.guncelle("We met in 1995. It was"), [], "henüz iki kelime")
    bekle(p.kapat(), "It was", "yalnızca yeni kısım")
}

// Sözün başındaki sayı biçimlenirse (ilk kelime değişir) söz yeni sayılmaz.
do {
    var p = Parcalayici()
    _ = akit(&p, buyuyen("Twenty five people are waiting"))
    bekle(p.guncelle("25 people are waiting"), [], "baştaki sayı düzeltmesi yeni söz değildir")
    bekle(p.kapat(), "25 people are waiting", "düzeltilmiş hâli tek parça")
}

// Çevrilmiş kısım içinde kelime sayısı azalırsa, kalan söz kaybolmaz ve yinelenmez.
do {
    var p = Parcalayici()
    bekle(akit(&p, buyuyen("Twenty five people are here. We are")), ["Twenty five people are here."], "ilk cümle gitti")
    bekle(p.guncelle("25 people are here. We are"), [], "çevrilmiş kısmın düzeltmesi yeniden gönderilmez")
    bekle(p.canli, "We are", "kalan söz yerinde")
    bekle(p.kapat(), "We are", "kalan söz eksiksiz")
}

// Duraklamadan sonra, eski sözle tek ortak kelimesi olan kısa bir başlangıç yeni sözdür.
do {
    var p = Parcalayici()
    _ = akit(&p, buyuyen("I went to the store yesterday"))
    bekle(p.kapat(), "I went to the store yesterday", "ilk söz")
    bekle(akit(&p, ["the", "the shop", "the shop was closed"]), [], "yeni söz")
    bekle(p.kapat(), "the shop was closed", "yeni söz eksiksiz")
}

bekle(Parcalayici.duzeltmeGibi(["twenty", "five", "people"], ["25", "people"]), true, "çoğu ortak: düzeltme")
bekle(Parcalayici.duzeltmeGibi(["Thank", "you", "very", "much"], ["How"]), false, "ortak yok: yeni söz")
bekle(Parcalayici.duzeltmeGibi(["I", "went", "to", "the", "store"], ["the"]), false, "çok kısa: yeni söz")
bekle(Parcalayici.duzeltmeGibi([], ["a"]), false, "boş eski")
bekle(Parcalayici.hizala(["a", "b.", "c"], 2, ["a", "b.", "c", "d"]), 2, "değişmeyen önek")
bekle(Parcalayici.hizala(["x", "y", "b."], 3, ["xy", "b.", "c"]), 2, "son çevrilen kelime bulunur")
bekle(Parcalayici.hizala(["a", "b"], 2, ["c"]), 1, "bulunamazsa yeni boyla sınırlanır")
bekle(Parcalayici.hizala(["a", "b"], 0, ["a"]), 0, "hiç çevrilmemiş")

// MARK: Noktalama gelmezse uzunluk sınırı

do {
    var p = Parcalayici()
    let uzun = (1...30).map { "w\($0)" }.joined(separator: " ")
    let cikan = akit(&p, buyuyen(uzun))
    bekle(cikan.count, 1, "30 kelimede bir kesim")
    bekle(cikan.first?.split(separator: " ").count ?? 0, 21, "son iki kelime bırakılır: 23 - 2")
    bekle(p.kapat(), (22...30).map { "w\($0)" }.joined(separator: " "), "kalan kelimeler sırayla")
}

do {
    var p = Parcalayici()
    let uzun = "one two three four five six seven eight nine ten, eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour"
    let cikan = akit(&p, buyuyen(uzun))
    bekle(cikan, ["one two three four five six seven eight nine ten,"], "sınır aşılınca son virgülden kesilir")
}

// Hiçbir kelime kaybolmaz ve yinelenmez: çıkan parçalar birleşince asıl metni verir.
do {
    var p = Parcalayici()
    let metin = "So today we are going to look at three things. First, the history of the city, which is long and complicated, second the people who live there and what they do for a living and third the food. Any questions? No. Good, then let us start with the oldest part of town and walk slowly towards the river"
    var cikan = akit(&p, buyuyen(metin))
    if let kalan = p.kapat() { cikan.append(kalan) }
    bekle(cikan.joined(separator: " "), metin, "parçalar asıl metni eksiksiz ve sırayla verir")
    bekle(cikan.first ?? "", "So today we are going to look at three things.", "ilk cümle ayrı parça")
    bekle(cikan.contains("Any questions?"), true, "soru cümlesi ayrı parça")
    bekle(cikan.allSatisfy { $0.split(separator: " ").count <= 23 }, true, "hiçbir parça sınırı aşmaz")
}

// MARK: Cümle sonu kuralları

bekle(Parcalayici.cumleSonu("everyone."), true, "nokta")
bekle(Parcalayici.cumleSonu("really?"), true, "soru işareti")
bekle(Parcalayici.cumleSonu("wow!"), true, "ünlem")
bekle(Parcalayici.cumleSonu("هل؟"), true, "Arapça soru işareti")
bekle(Parcalayici.cumleSonu("said.\""), true, "tırnaktan önceki nokta")
bekle(Parcalayici.cumleSonu("well..."), true, "üç nokta")
bekle(Parcalayici.cumleSonu("Dr."), false, "kısaltma")
bekle(Parcalayici.cumleSonu("Mrs."), false, "kısaltma")
bekle(Parcalayici.cumleSonu("U.S."), false, "noktalı kısaltma")
bekle(Parcalayici.cumleSonu("e.g."), false, "noktalı kısaltma")
bekle(Parcalayici.cumleSonu("A."), false, "tek harf")
bekle(Parcalayici.cumleSonu("3."), false, "sıra sayısı")
bekle(Parcalayici.cumleSonu("1995."), true, "yıl ile biten cümle")
bekle(Parcalayici.cumleSonu("3.5"), false, "ondalık sayı")
bekle(Parcalayici.cumleSonu("hello,"), false, "virgül cümle sonu değil")
bekle(Parcalayici.cumleSonu("."), false, "yalnız nokta")
bekle(Parcalayici.cumleSonu(""), false, "boş")
bekle(Parcalayici.araNoktalama("hello,"), true, "virgül")
bekle(Parcalayici.araNoktalama("hello"), false, "noktalamasız")
bekle(Parcalayici.anlamli("..."), false, "yalnız noktalama anlamsız")
bekle(Parcalayici.anlamli("ok"), true, "harf içeren anlamlı")

// Yalnız noktalamadan oluşan söz gönderilmez.
do {
    var p = Parcalayici()
    bekle(p.guncelle("..."), [], "noktalama parça üretmez")
    bekle(p.kapat(), nil, "noktalama kapatılınca da gönderilmez")
}

// "Dr." cümleyi bölmez.
do {
    var p = Parcalayici()
    let cikan = akit(&p, buyuyen("Dr. Smith is here. He is waiting for you"))
    bekle(cikan, ["Dr. Smith is here."], "kısaltma cümleyi bölmez")
}

// sifirla: yeni tanıma görevi
do {
    var p = Parcalayici()
    _ = akit(&p, buyuyen("Hello there my friend"))
    p.sifirla()
    bekle(p.canli, "", "sıfırlanınca boş")
    bekle(akit(&p, buyuyen("Hello again")), [], "sıfırlamadan sonra baştan")
    bekle(p.kapat(), "Hello again", "sıfırlamadan sonra eksiksiz")
}

// MARK: WAV onarımı

func wav(riff: UInt32, data: UInt32, ornek: Int, ekParca: Bool = false) -> Data {
    func le(_ deger: UInt32) -> [UInt8] {
        [UInt8(deger & 0xFF), UInt8((deger >> 8) & 0xFF), UInt8((deger >> 16) & 0xFF), UInt8((deger >> 24) & 0xFF)]
    }
    var b: [UInt8] = []
    b.append(contentsOf: Array("RIFF".utf8))
    b.append(contentsOf: le(riff))
    b.append(contentsOf: Array("WAVE".utf8))
    b.append(contentsOf: Array("fmt ".utf8))
    b.append(contentsOf: le(16))
    b.append(contentsOf: [1, 0, 1, 0] as [UInt8])
    b.append(contentsOf: le(48000))
    b.append(contentsOf: le(96000))
    b.append(contentsOf: [2, 0, 16, 0] as [UInt8])
    if ekParca {
        // Tek boyutlu parça ve ardından dolgu baytı.
        b.append(contentsOf: Array("LIST".utf8))
        b.append(contentsOf: le(5))
        b.append(contentsOf: [1, 2, 3, 4, 5, 0] as [UInt8])
    }
    b.append(contentsOf: Array("data".utf8))
    b.append(contentsOf: le(data))
    b.append(contentsOf: [UInt8](repeating: 7, count: ornek))
    return Data(b)
}

func oku32(_ veri: Data, _ konum: Int) -> UInt32 {
    let b = [UInt8](veri)
    return UInt32(b[konum]) | UInt32(b[konum + 1]) << 8 | UInt32(b[konum + 2]) << 16 | UInt32(b[konum + 3]) << 24
}

do {
    let saglam = wav(riff: 36 + 1000, data: 1000, ornek: 1000)
    bekle(DalgaDosyasi.duzelt(saglam), saglam, "sağlam WAV değişmez")

    let akis = wav(riff: 0xFFFF_FFFF, data: 0xFFFF_FFFF, ornek: 1000)
    let onarilan = DalgaDosyasi.duzelt(akis)
    bekle(onarilan.count, akis.count, "boyut aynı kalır")
    bekle(oku32(onarilan, 4), UInt32(36 + 1000), "RIFF boyutu dolduruldu")
    bekle(oku32(onarilan, 40), UInt32(1000), "data boyutu dolduruldu")
    bekle(onarilan, saglam, "onarılan dosya sağlam olanla aynı")

    let sifir = DalgaDosyasi.duzelt(wav(riff: 0, data: 0, ornek: 480))
    bekle(oku32(sifir, 4), UInt32(36 + 480), "sıfır RIFF boyutu dolduruldu")
    bekle(oku32(sifir, 40), UInt32(480), "sıfır data boyutu dolduruldu")

    let fazla = DalgaDosyasi.duzelt(wav(riff: 36 + 9999, data: 9999, ornek: 100))
    bekle(oku32(fazla, 40), UInt32(100), "gerçekten büyük yazılmış data boyutu düzeltildi")

    // Araya başka parça girmişse "data" yine bulunur (tek boyutlu parçanın dolgu baytı atlanır).
    let ekli = DalgaDosyasi.duzelt(wav(riff: 0xFFFF_FFFF, data: 0xFFFF_FFFF, ornek: 200, ekParca: true))
    bekle(oku32(ekli, 40 + 14), UInt32(200), "ek parçadan sonraki data boyutu dolduruldu")

    let mp3 = Data([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0] + [UInt8](repeating: 0, count: 100))
    bekle(DalgaDosyasi.duzelt(mp3), mp3, "WAV olmayan veriye dokunulmaz")
    bekle(DalgaDosyasi.duzelt(Data([1, 2, 3])), Data([1, 2, 3]), "kısa veriye dokunulmaz")
    bekle(DalgaDosyasi.duzelt(Data()), Data(), "boş veriye dokunulmaz")

    // Başlangıcı sıfır olmayan veri dilimi de doğru işlenir.
    let dilim = (Data([9, 9, 9]) + akis).dropFirst(3)
    bekle(DalgaDosyasi.duzelt(dilim), saglam, "veri dilimi")
}

print(hataSayisi == 0 ? "✓ çekirdek: \(testSayisi) denetim geçti" : "✗ çekirdek: \(hataSayisi)/\(testSayisi) denetim başarısız")
exit(hataSayisi == 0 ? 0 : 1)
