// Sahne yönetimi: menü, oyun, duraklatma, bitiş gibi ekranlar bir yığında durur. Yalnız en üstteki sahne
// güncellenir; çizim alttan üste yapılır (duraklatma ekranı oyunun üstüne yarı saydam çizilebilsin).
// Genişletme: sahne geçiş efekti için `replace`'e bir süre ve `animasyon` sistemiyle karartma eklenebilir.

export interface Scene {
  readonly name: string
  enter?(): void
  exit?(): void
  update(dt: number): void
  render(alpha: number): void
}

export class SceneManager {
  private readonly stack: Scene[] = []

  get top(): Scene | undefined {
    return this.stack[this.stack.length - 1]
  }

  get depth(): number {
    return this.stack.length
  }

  push(scene: Scene): void {
    this.stack.push(scene)
    scene.enter?.()
  }

  pop(): Scene | undefined {
    const scene = this.stack.pop()
    scene?.exit?.()
    return scene
  }

  replace(scene: Scene): void {
    while (this.stack.length > 0) this.pop()
    this.push(scene)
  }

  update(dt: number): void {
    this.top?.update(dt)
  }

  render(alpha: number): void {
    for (const scene of this.stack) scene.render(alpha)
  }
}
