/**
 * `sharp` yedeği: tarayıcıda yerel görüntü işleme yoktur. Durağan kipte görseller derleme anında üretilir
 * (scripts/build-pages-assets.ts); bu modüle ulaşan her çağrı açık bir hatayla düşer.
 */

class SharpUnavailable {
  constructor() {
    throw new Error('Görüntü işleme (sharp) tarayıcı kipinde yok; görseller derlemede üretilir.')
  }
}

export default function sharp(): never {
  return new SharpUnavailable() as never
}
