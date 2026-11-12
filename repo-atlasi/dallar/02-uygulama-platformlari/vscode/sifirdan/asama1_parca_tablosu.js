// Aşama 1 — Parça tablosu (piece table) metin arabelleği.
//
// VS Code'un metin modeli dosyayı tek bir dev string olarak tutmaz. Asıl metin salt okunur
// arabelleklerde durur; yazdıkların yalnızca sona eklenen bir "değişiklik arabelleğine" gider.
// Belge, bu arabelleklerin dilimlerini (parça = piece) sırayla dizen bir listedir.
// Gerçek depoda: src/vs/editor/common/model/pieceTreeTextBuffer/pieceTreeBase.ts
// (orada parçalar kırmızı-siyah ağaçta tutulur; burada sade bir dizi + önek toplamları kullanıyoruz).

/**
 * @typedef {{ metin: string, satirBaslari: number[] }} Arabellek
 * @typedef {{ arabellek: number, bas: number, uzunluk: number, satirSonu: number }} Parca
 * @typedef {{ lineNumber: number, column: number }} Konum
 */

/**
 * Bir metindeki satır başlarının ofsetlerini döndürür (gerçek: createLineStartsFast).
 * @param {string} metin
 * @returns {number[]}
 */
export function satirBaslari(metin) {
  const sonuc = [0]
  for (let i = 0; i < metin.length; i++) {
    if (metin.charCodeAt(i) === 10) sonuc.push(i + 1)
  }
  return sonuc
}

/**
 * Sıralı dizide `deger`den büyük ilk elemanın indeksini bulur (ikili arama).
 * @param {number[]} dizi
 * @param {number} deger
 */
function ustSinir(dizi, deger) {
  let alt = 0
  let ust = dizi.length
  while (alt < ust) {
    const orta = (alt + ust) >> 1
    if (dizi[orta] <= deger) alt = orta + 1
    else ust = orta
  }
  return alt
}

/** CRLF ve tek CR'yi LF'ye çevirir. Gerçek kod CRLF'yi parça sınırlarında ayrıca onarır (fixCRLF). */
function eolNormallestir(metin) {
  return metin.replace(/\r\n?/g, '\n')
}

export class ParcaTablosu {
  /** @type {Arabellek[]} 0 = değişiklik arabelleği (yalnızca sona eklenir), 1.. = özgün metin */
  #arabellekler
  /** @type {Parca[]} */
  #parcalar
  /** Önbellek: i. parçadan önceki toplam uzunluk ve satır sonu sayısı */
  #ofsetOnek = null
  #satirOnek = null
  /** Sürekli yazarken son parçayı büyütebilmek için (gerçek: _lastChangeBufferPos) */
  #sonEklenenParca = null

  /** @param {string} [ilkMetin] */
  constructor(ilkMetin = '') {
    // Belgenin satır sonu tercihini sakla; içeride her şey '\n' ile tutulur.
    this.eol = ilkMetin.includes('\r\n') ? '\r\n' : '\n'
    const metin = eolNormallestir(ilkMetin)
    this.#arabellekler = [{ metin: '', satirBaslari: [0] }]
    this.#parcalar = []
    if (metin.length > 0) {
      this.#arabellekler.push({ metin, satirBaslari: satirBaslari(metin) })
      this.#parcalar.push(this.#parcaYap(1, 0, metin.length))
    }
  }

  /** Arabellekteki [bas, bas+uzunluk) aralığında kaç '\n' olduğunu satır başı dizisinden hesaplar. */
  #satirSonuSay(arabellekNo, bas, uzunluk) {
    const sb = this.#arabellekler[arabellekNo].satirBaslari
    // '\n' p konumundaysa satır başı p+1'dir: (bas, bas+uzunluk] aralığına düşen satır başlarını say.
    return ustSinir(sb, bas + uzunluk) - ustSinir(sb, bas)
  }

  /** @returns {Parca} */
  #parcaYap(arabellek, bas, uzunluk) {
    return { arabellek, bas, uzunluk, satirSonu: this.#satirSonuSay(arabellek, bas, uzunluk) }
  }

  #parcaMetni(p) {
    return this.#arabellekler[p.arabellek].metin.slice(p.bas, p.bas + p.uzunluk)
  }

  #onbellegiBoz() {
    this.#ofsetOnek = null
    this.#satirOnek = null
  }

  /** Önek toplamlarını gerektiğinde yeniden kurar. Gerçek ağaç bunu düğümlerde (size_left, lf_left) tutar. */
  #onekler() {
    if (!this.#ofsetOnek) {
      const ofset = [0]
      const satir = [0]
      for (const p of this.#parcalar) {
        ofset.push(ofset[ofset.length - 1] + p.uzunluk)
        satir.push(satir[satir.length - 1] + p.satirSonu)
      }
      this.#ofsetOnek = ofset
      this.#satirOnek = satir
    }
    return { ofset: this.#ofsetOnek, satir: /** @type {number[]} */ (this.#satirOnek) }
  }

  /** Ofsetin düştüğü parçayı ve parça içindeki kalanı bulur (gerçek: nodeAt). */
  #parcaBul(ofset) {
    const { ofset: onek } = this.#onekler()
    // ofset'i içeren son parça: onek[i] <= ofset < onek[i+1]
    let i = ustSinir(onek, ofset) - 1
    if (i >= this.#parcalar.length) i = this.#parcalar.length - 1
    return { indeks: i, kalan: ofset - onek[i] }
  }

  getLength() {
    const { ofset } = this.#onekler()
    return ofset[ofset.length - 1]
  }

  getLineCount() {
    const { satir } = this.#onekler()
    return satir[satir.length - 1] + 1
  }

  /** @param {string} [eol] Belgeyi verilen satır sonuyla birleştirir. */
  getValue(eol = '\n') {
    const metin = this.#parcalar.map((p) => this.#parcaMetni(p)).join('')
    return eol === '\n' ? metin : metin.replace(/\n/g, eol)
  }

  /**
   * @param {number} ofset
   * @param {string} metin
   */
  insert(ofset, metin) {
    metin = eolNormallestir(metin)
    if (metin.length === 0) return
    ofset = Math.max(0, Math.min(ofset, this.getLength()))
    const degisiklik = this.#arabellekler[0]
    const yeniBas = degisiklik.metin.length

    // Arka arkaya yazarken (ör. her tuşta bir harf) yeni parça açmak yerine son parçayı uzat.
    const son = this.#sonEklenenParca
    if (son && this.#parcalar.includes(son) && son.bas + son.uzunluk === yeniBas) {
      const { ofset: onek } = this.#onekler()
      const sonIndeks = this.#parcalar.indexOf(son)
      if (onek[sonIndeks] + son.uzunluk === ofset) {
        this.#arabellegeEkle(metin)
        const buyuk = this.#parcaYap(0, son.bas, son.uzunluk + metin.length)
        this.#parcalar[sonIndeks] = buyuk
        this.#sonEklenenParca = buyuk
        this.#onbellegiBoz()
        return
      }
    }

    this.#arabellegeEkle(metin)
    const yeni = this.#parcaYap(0, yeniBas, metin.length)
    if (this.#parcalar.length === 0) {
      this.#parcalar.push(yeni)
    } else if (ofset === this.getLength()) {
      this.#parcalar.push(yeni)
    } else {
      const { indeks, kalan } = this.#parcaBul(ofset)
      const p = this.#parcalar[indeks]
      if (kalan === 0) {
        this.#parcalar.splice(indeks, 0, yeni)
      } else {
        // Parçayı ikiye böl, araya yeni parçayı koy. Arabelleklere dokunulmaz!
        const sol = this.#parcaYap(p.arabellek, p.bas, kalan)
        const sag = this.#parcaYap(p.arabellek, p.bas + kalan, p.uzunluk - kalan)
        this.#parcalar.splice(indeks, 1, sol, yeni, sag)
      }
    }
    this.#sonEklenenParca = yeni
    this.#onbellegiBoz()
  }

  #arabellegeEkle(metin) {
    const a = this.#arabellekler[0]
    const eskiUzunluk = a.metin.length
    a.metin += metin
    for (let i = 0; i < metin.length; i++) {
      if (metin.charCodeAt(i) === 10) a.satirBaslari.push(eskiUzunluk + i + 1)
    }
  }

  /**
   * @param {number} ofset
   * @param {number} adet
   */
  delete(ofset, adet) {
    const uzunluk = this.getLength()
    ofset = Math.max(0, Math.min(ofset, uzunluk))
    adet = Math.min(adet, uzunluk - ofset)
    if (adet <= 0) return
    const bas = this.#parcaBul(ofset)
    const bit = this.#parcaBul(ofset + adet)
    const ilk = this.#parcalar[bas.indeks]
    const sonP = this.#parcalar[bit.indeks]
    /** @type {Parca[]} */
    const yerine = []
    if (bas.kalan > 0) yerine.push(this.#parcaYap(ilk.arabellek, ilk.bas, bas.kalan))
    if (bit.kalan < sonP.uzunluk) {
      yerine.push(this.#parcaYap(sonP.arabellek, sonP.bas + bit.kalan, sonP.uzunluk - bit.kalan))
    }
    this.#parcalar.splice(bas.indeks, bit.indeks - bas.indeks + 1, ...yerine)
    this.#sonEklenenParca = null
    this.#onbellegiBoz()
  }

  /** k. satır sonundan hemen sonraki ofset (k = 0 → belge başı). */
  #satirBasiOfseti(k) {
    if (k === 0) return 0
    const { ofset, satir } = this.#onekler()
    // k. '\n' hangi parçada? satir[i] < k <= satir[i+1]
    const i = ustSinir(satir, k - 1) - 1
    const p = this.#parcalar[i]
    const kalanSatir = k - satir[i]
    const sb = this.#arabellekler[p.arabellek].satirBaslari
    const ilkSatirBasi = ustSinir(sb, p.bas)
    return ofset[i] + (sb[ilkSatirBasi + kalanSatir - 1] - p.bas)
  }

  /** [bas, bit) ofset aralığındaki metin (gerçek: getValueInRange). */
  getValueInRange(bas, bit) {
    if (bit <= bas) return ''
    const parcalar = []
    let { indeks, kalan } = this.#parcaBul(bas)
    let kalanUzunluk = bit - bas
    while (kalanUzunluk > 0 && indeks < this.#parcalar.length) {
      const p = this.#parcalar[indeks]
      const al = Math.min(p.uzunluk - kalan, kalanUzunluk)
      const a = this.#arabellekler[p.arabellek].metin
      parcalar.push(a.slice(p.bas + kalan, p.bas + kalan + al))
      kalanUzunluk -= al
      indeks++
      kalan = 0
    }
    return parcalar.join('')
  }

  /** @param {number} lineNumber 1'den başlar */
  getLineContent(lineNumber) {
    const bas = this.#satirBasiOfseti(lineNumber - 1)
    const bit = lineNumber < this.getLineCount() ? this.#satirBasiOfseti(lineNumber) - 1 : this.getLength()
    return this.getValueInRange(bas, bit)
  }

  /** (satır, sütun) → ofset; ikisi de 1'den başlar. */
  getOffsetAt(lineNumber, column) {
    const satir = Math.max(1, Math.min(lineNumber, this.getLineCount()))
    const bas = this.#satirBasiOfseti(satir - 1)
    const satirUzunlugu = this.getLineContent(satir).length
    return bas + Math.max(0, Math.min(column - 1, satirUzunlugu))
  }

  /**
   * Ofset → (satır, sütun).
   * @param {number} ofset
   * @returns {Konum}
   */
  getPositionAt(ofset) {
    ofset = Math.max(0, Math.min(ofset, this.getLength()))
    if (this.#parcalar.length === 0) return { lineNumber: 1, column: 1 }
    const { indeks, kalan } = this.#parcaBul(ofset)
    const { satir } = this.#onekler()
    const p = this.#parcalar[indeks]
    const oncekiSatirlar = satir[indeks] + this.#satirSonuSay(p.arabellek, p.bas, kalan)
    const satirBasi = this.#satirBasiOfseti(oncekiSatirlar)
    return { lineNumber: oncekiSatirlar + 1, column: ofset - satirBasi + 1 }
  }

  /**
   * Ucuz anlık görüntü: arabellekler yalnızca büyüdüğü için parça listesini kopyalamak yeter.
   * (Gerçek: PieceTreeSnapshot — dosyayı kaydederken yazmaya devam edebilmenin sırrı.)
   */
  createSnapshot() {
    const parcalar = this.#parcalar.map((p) => ({ ...p }))
    const arabellekler = this.#arabellekler.map((a) => a.metin.length)
    const kaynak = this.#arabellekler
    return {
      read: () => parcalar.map((p) => kaynak[p.arabellek].metin.slice(p.bas, p.bas + p.uzunluk)).join(''),
      arabellekBoylari: arabellekler,
    }
  }

  /** Öğretim amaçlı iç durum özeti. */
  istatistik() {
    return {
      parcaSayisi: this.#parcalar.length,
      degisiklikArabellegi: this.#arabellekler[0].metin.length,
      arabellekSayisi: this.#arabellekler.length,
    }
  }
}
