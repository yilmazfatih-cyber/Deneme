/** `node:timers/promises` karşılığı. */
import { promises } from './timers'

export const setTimeout = promises.setTimeout
export const setImmediate = promises.setImmediate
export default promises
