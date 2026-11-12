// Canlı bağlama (live binding) örneği: içe aktaran taraf değerin KOPYASINI değil, bağlantısını alır.
export let sayac = 0

export function arttir() {
  sayac++
}

export default function sifirla() {
  sayac = 0
}
