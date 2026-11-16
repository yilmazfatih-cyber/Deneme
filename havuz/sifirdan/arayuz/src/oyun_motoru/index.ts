// oyun_motoru — 2B oyun çekirdeği: sabit adımlı döngü, ECS, girdi soyutlaması, çarpışma (AABB/daire),
// uzamsal karma, basit fizik, karo haritası, kamera, parçacıklar, animasyon, sahneler, ses, tekrar oynatma.
// Örnek oyun "Damla": game/droplet.ts (mantık) + game/render.ts (çizim). Ayrıntılı anlatım: README.md.
// Genişletme: yeni parça ayrı dosyada yazılıp buradan dışa aktarılır.
export { Rng } from './rng.ts'
export { FixedLoop, type LoopOptions } from './loop.ts'
export { World, defineComponent, type ComponentType, type Entity } from './ecs.ts'
export {
  ActionMap,
  InputState,
  frameFromMasks,
  attachKeyboard,
  attachPointerButtons,
  pollGamepads,
  type InputFrame,
  type KeyBindings,
  type GamepadBindings,
} from './input.ts'
export {
  aabbOverlap,
  aabbManifold,
  circleManifold,
  circleAabbManifold,
  circleBounds,
  type Aabb,
  type Circle,
  type Manifold,
} from './collision.ts'
export { SpatialHash } from './spatial_hash.ts'
export { createBody, integrate, resolveStatic, freeFall, type Body, type Vec } from './physics.ts'
export { TileMap, type MoveResult } from './tilemap.ts'
export { Camera } from './camera.ts'
export { ParticlePool, type EmitOptions } from './particles.ts'
export { Animation, bakeFrames, type FrameCanvas } from './sprite.ts'
export { SceneManager, type Scene } from './scene.ts'
export { Sound, type ToneOptions } from './audio.ts'
export { Recorder, hashNumbers, parseRecording, type Recording } from './replay.ts'
export {
  DropletGame,
  simulate,
  actions,
  ACTIONS,
  STEP,
  PHYSICS,
  MAX_HEALTH,
  KindOf,
  Position,
  Motion,
  type Action,
  type GameEvent,
  type Status,
} from './game/droplet.ts'
export { DropletRenderer, DARK_PALETTE, type Palette } from './game/render.ts'
export { LEVEL_1, LEVELS, TILE } from './game/level.ts'
