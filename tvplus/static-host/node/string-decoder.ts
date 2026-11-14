/** `node:string_decoder` karşılığı (UTF-8; yarım çok baytlı karakterleri sonraki parçaya taşır). */

export class StringDecoder {
  #dec: TextDecoder
  constructor(encoding: string = 'utf8') {
    this.#dec = new TextDecoder(encoding === 'utf8' ? 'utf-8' : encoding)
  }
  write(chunk: Uint8Array): string {
    return this.#dec.decode(chunk, { stream: true })
  }
  end(chunk?: Uint8Array): string {
    return (chunk ? this.#dec.decode(chunk, { stream: true }) : '') + this.#dec.decode()
  }
}

export default { StringDecoder }
