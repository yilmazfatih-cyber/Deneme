/**
 * Worker'ın küresel Node ortamı: `Buffer`, `process`, `global`, `setImmediate` ve `.unref()` taşıyan zamanlayıcılar.
 * Sunucu modüllerinden ÖNCE yüklenmelidir (main.ts ilk içe aktarım).
 */
import { Buffer } from '../node/buffer'
import { process } from '../node/process'
import { installTimers } from '../node/timers'

const scope = globalThis as unknown as Record<string, unknown>
scope.global ??= globalThis
scope.Buffer = Buffer
scope.process = process
installTimers(scope)
