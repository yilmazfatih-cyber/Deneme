import pino, { type Logger } from 'pino'

/** Pretty logs on a TTY, JSON otherwise (so `npm start > bot.log` stays machine-readable). */
export function createLogger(level: string): Logger {
  const pretty = process.stdout.isTTY
  return pino({
    level,
    ...(pretty
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } } }
      : {}),
  })
}
