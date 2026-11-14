/** `node:os` karşılığı: tarayıcıda ağ arayüzü yoktur (yerel ağ adresi aranmaz). */

export const EOL = '\n'
export const networkInterfaces = (): Record<string, never[]> => ({})
export const hostname = (): string => 'tarayici'
export const platform = (): string => 'browser'
export const type = (): string => 'Browser'
export const release = (): string => ''
export const arch = (): string => 'wasm'
export const tmpdir = (): string => '/tmp'
export const homedir = (): string => '/'
export const cpus = (): { model: string; speed: number }[] =>
  Array.from({ length: Math.max(1, globalThis.navigator?.hardwareConcurrency ?? 1) }, () => ({
    model: 'tarayici',
    speed: 0,
  }))
export const totalmem = (): number =>
  ((globalThis.navigator as Navigator & { deviceMemory?: number })?.deviceMemory ?? 2) * 2 ** 30
export const freemem = (): number => totalmem() / 2
export const availableParallelism = (): number => cpus().length
export const uptime = (): number => performance.now() / 1000

export default {
  EOL,
  networkInterfaces,
  hostname,
  platform,
  type,
  release,
  arch,
  tmpdir,
  homedir,
  cpus,
  totalmem,
  freemem,
  availableParallelism,
  uptime,
}
