// Günlük kayıt seçenekleri. Her seçenek: anahtar + Türkçe etiket + simge (emoji).

export interface Option {
  key: string
  label: string
  icon: string
}

export const FLOW: Option[] = [
  { key: 'spotting', label: 'Lekelenme', icon: '·' },
  { key: 'light', label: 'Hafif', icon: '💧' },
  { key: 'medium', label: 'Orta', icon: '💧💧' },
  { key: 'heavy', label: 'Yoğun', icon: '💧💧💧' },
]

export const SYMPTOMS: Option[] = [
  { key: 'cramps', label: 'Kramp', icon: '🌀' },
  { key: 'headache', label: 'Baş ağrısı', icon: '🤕' },
  { key: 'bloating', label: 'Şişkinlik', icon: '🎈' },
  { key: 'breast', label: 'Göğüs hassasiyeti', icon: '🫧' },
  { key: 'fatigue', label: 'Yorgunluk', icon: '🥱' },
  { key: 'acne', label: 'Sivilce', icon: '🔴' },
  { key: 'backache', label: 'Bel ağrısı', icon: '🦴' },
  { key: 'nausea', label: 'Mide bulantısı', icon: '🤢' },
  { key: 'insomnia', label: 'Uykusuzluk', icon: '🌙' },
  { key: 'cravings', label: 'Aşerme', icon: '🍫' },
  { key: 'hotflash', label: 'Sıcak basması', icon: '🔥' },
  { key: 'ok', label: 'Her şey yolunda', icon: '✨' },
]

export const MOODS: Option[] = [
  { key: 'calm', label: 'Sakin', icon: '😌' },
  { key: 'happy', label: 'Mutlu', icon: '😊' },
  { key: 'energetic', label: 'Enerjik', icon: '⚡' },
  { key: 'irritable', label: 'Sinirli', icon: '😤' },
  { key: 'sad', label: 'Üzgün', icon: '😢' },
  { key: 'anxious', label: 'Kaygılı', icon: '😟' },
  { key: 'sensitive', label: 'Hassas', icon: '🥺' },
  { key: 'moody', label: 'Değişken', icon: '🎭' },
]

export const DISCHARGE: Option[] = [
  { key: 'none', label: 'Yok', icon: '○' },
  { key: 'sticky', label: 'Yapışkan', icon: '◔' },
  { key: 'creamy', label: 'Kremsi', icon: '◑' },
  { key: 'eggwhite', label: 'Yumurta akı', icon: '◕' },
  { key: 'watery', label: 'Sulu', icon: '●' },
]

export const SEX: Option[] = [
  { key: 'protected', label: 'Korunmalı', icon: '🛡️' },
  { key: 'unprotected', label: 'Korunmasız', icon: '💞' },
  { key: 'desire', label: 'Yüksek istek', icon: '🔥' },
  { key: 'none', label: 'Olmadı', icon: '—' },
]

export const PHASE_LABEL: Record<string, string> = {
  period: 'Adet',
  follicular: 'Foliküler evre',
  fertile: 'Doğurgan pencere',
  ovulation: 'Yumurtlama',
  luteal: 'Luteal evre',
}

export const CHANCE_LABEL: Record<string, string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
}

export const PHASE_TIPS: Record<string, string> = {
  period:
    'Vücudun dinlenme istiyor olabilir. Ilık bir duş, hafif yürüyüş ve bol su kramplara iyi gelir. Demir içeren besinler bu günlerde önemli.',
  follicular:
    'Östrojen yükseliyor; enerji ve odaklanma genelde artar. Yeni işlere başlamak, daha yoğun antrenman için iyi bir dönem.',
  fertile: 'Doğurgan penceredesin. Gebelik planlıyorsan en uygun günler; planlamıyorsan korunmaya özellikle dikkat et.',
  ovulation:
    'Tahmini yumurtlama günü. Hafif kasık ağrısı, yumurta akı kıvamında akıntı ve vücut ısısında küçük bir artış görülebilir.',
  luteal:
    'Progesteron yükseliyor; şişkinlik, iştah değişimi ve duygusal dalgalanma olabilir. Uyku düzeni ve dengeli beslenme yardımcı olur.',
}
