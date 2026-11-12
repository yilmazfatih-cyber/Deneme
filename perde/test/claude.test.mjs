// Çalıştır: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BETAS, buildParams } from '../lib/claude.mjs'

const input = { action: 'continue', script: '.İÇ. MUTFAK - GECE\n\nAyşe çay koyar.\n', sceneIndex: 0 }

test('yedek model yalnızca destekleyen modellerde istenir', () => {
  const opus = buildParams('claude-opus-5-5', input)
  assert.equal(opus.fallbacks, 'default')
  assert.deepEqual(opus.betas, BETAS)

  const haiku = buildParams('claude-haiku-5-5', input)
  assert.equal('fallbacks' in haiku, false)
  assert.equal('betas' in haiku, false)
  assert.equal(haiku.model, 'claude-haiku-5-5')
  assert.equal(haiku.output_config?.effort, 'low')
})
