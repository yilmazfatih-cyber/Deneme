/** YER TUTUCU — keşif ajanı koleksiyon, kişi ve tür sayfalarıyla değiştirecek. Dışa aktarım adları SABİT. */
import type { ReactElement } from 'react'
import { PagePlaceholder } from '../../app/PagePlaceholder'

/** #/koleksiyon/:collectionId */
export function CollectionPage(): ReactElement {
  return <PagePlaceholder title="Koleksiyon" />
}

/** #/kisi/:personId */
export function PersonPage(): ReactElement {
  return <PagePlaceholder title="Oyuncu ve ekip" />
}

/** #/tur/:genreId ("Çocuk" bağlantısı #/tur/783) */
export function GenrePage(): ReactElement {
  return <PagePlaceholder title="Tür" />
}
