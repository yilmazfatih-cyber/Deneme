// sanal_liste — değişken yükseklikli sanallaştırılmış liste: Fenwick ağacıyla O(log n) yükseklik dizini,
// görünür aralık hesabı, ölçüm sonrası kaydırma çapası, erişilebilir DOM denetleyicisi.
// Ayrıntılı anlatım: README.md.
// Genişletme: yeni parça (ör. ızgara sanallaştırma) ayrı dosyada yazılıp buradan dışa aktarılır.
export { HeightIndex } from './height_index.ts'
export { visibleRange, anchorAdjustment, type VisibleRange } from './range.ts'
export { VirtualList, type VirtualListOptions } from './virtual_list.ts'
