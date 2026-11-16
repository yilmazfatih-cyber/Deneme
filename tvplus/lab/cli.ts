/**
 * TV+ Lab komut satırı: `npm run lab -- <komut> [alt] [--bayrak değer]` (yardım: `npm run lab -- yardim`).
 * Komutlar lab/src/cli/commands.ts içindedir; aynı komutlar MCP aracıyla (lab/mcp.ts) da çağrılır.
 */
import { parseArgs } from './src/cli/args'
import { execute } from './src/cli/commands'
import { EXTRA_COMMANDS } from './src/cli/extra'

execute(process.argv.slice(2), parseArgs, EXTRA_COMMANDS).then(
  (out) => {
    process.stdout.write(`${out}\n`)
  },
  (err: unknown) => {
    process.stderr.write(`Hata: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  },
)
