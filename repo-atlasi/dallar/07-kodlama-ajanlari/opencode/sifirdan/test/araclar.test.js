import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import {
  bashTool,
  editTool,
  globToRegExp,
  globTool,
  grepTool,
  readTool,
  resolveInWorkspace,
  splitCommands,
  ToolError,
  validateInput,
  writeTool,
} from '../asama2_araclar.js'
import { agents, evaluate } from '../asama3_izinler.js'

let root
const asked = []
const ctx = () => ({
  root,
  permission: {
    assert: async (request) => {
      asked.push(request)
      return 'allow'
    },
  },
})

before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'mini-araclar-'))
  await mkdir(path.join(root, 'src', 'alt'), { recursive: true })
  await writeFile(path.join(root, 'src', 'a.js'), 'const a = 1\nconst b = 2\nconst a2 = a\n')
  await writeFile(path.join(root, 'src', 'alt', 'b.js'), 'export const b = 2\n')
  await writeFile(path.join(root, 'notlar.md'), '# Notlar\nyapılacak: test\n')
})

after(async () => rm(root, { recursive: true, force: true }))

test('read satır numaralı döner; offset ve limit uygular; izin sorar', async () => {
  const output = await readTool.execute({ path: 'src/a.js', offset: 2, limit: 1 }, ctx())
  assert.equal(output, '2: const b = 2')
  assert.deepEqual(asked.at(-1), { action: 'read', resources: ['src/a.js'] })
  await assert.rejects(readTool.execute({ path: 'yok.txt' }, ctx()), ToolError)
})

test('çalışma alanı dışına çıkan yol için external_directory izni istenir', async () => {
  asked.length = 0
  await readTool.execute({ path: path.join(root, 'notlar.md') }, ctx()) // mutlak ama içeride: sorun yok
  assert.equal(asked[0].action, 'read')
  await assert.rejects(readTool.execute({ path: '../../../etc/hosts-yok' }, ctx()))
  assert.equal(asked.at(-2).action, 'external_directory')
  assert.equal(resolveInWorkspace('/a/b', '../c').external, true)
  assert.equal(resolveInWorkspace('/a/b', 'c/d').relative, 'c/d')
})

test('write iç içe klasör açar ve geçici dosya bırakmaz', async () => {
  const output = await writeTool.execute({ path: 'yeni/klasor/x.txt', content: 'merhaba' }, ctx())
  assert.match(output, /yeni\/klasor\/x\.txt yazıldı/)
  assert.equal(await readFile(path.join(root, 'yeni', 'klasor', 'x.txt'), 'utf8'), 'merhaba')
  assert.deepEqual(await readdir(path.join(root, 'yeni', 'klasor')), ['x.txt'])
  assert.equal(asked.at(-1).action, 'edit')
})

test('edit: tek eşleşme, çoklu eşleşme hatası, replaceAll ve ipucu', async () => {
  await editTool.execute({ path: 'src/a.js', oldString: 'const b = 2', newString: 'const b = 3' }, ctx())
  assert.match(await readFile(path.join(root, 'src', 'a.js'), 'utf8'), /const b = 3/)

  await assert.rejects(
    editTool.execute({ path: 'src/a.js', oldString: 'const a', newString: 'let a' }, ctx()),
    /2 yerde geçiyor/,
  )
  await editTool.execute({ path: 'src/a.js', oldString: 'const a', newString: 'let a', replaceAll: true }, ctx())
  assert.equal(await readFile(path.join(root, 'src', 'a.js'), 'utf8'), 'let a = 1\nconst b = 3\nlet a2 = a\n')

  await assert.rejects(
    editTool.execute({ path: 'src/a.js', oldString: 'const b = 3\nyok', newString: 'z' }, ctx()),
    /En yakın satır 2/,
  )
  await assert.rejects(editTool.execute({ path: 'src/a.js', oldString: 'x', newString: 'x' }, ctx()), /aynı/)
})

test('glob deseni ** ve * ayrımını yapar', async () => {
  assert.ok(globToRegExp('**/*.js').test('a.js'))
  assert.ok(globToRegExp('**/*.js').test('src/alt/b.js'))
  assert.ok(!globToRegExp('src/*.js').test('src/alt/b.js'))
  const output = await globTool.execute({ pattern: 'src/**/*.js' }, ctx())
  assert.deepEqual(output.split('\n'), ['src/a.js', 'src/alt/b.js'])
})

test('grep dosya:satır döner ve include filtresine uyar', async () => {
  const output = await grepTool.execute({ pattern: 'b = ', include: '*.js' }, ctx())
  assert.deepEqual(output.split('\n'), ['src/a.js:2: const b = 3', 'src/alt/b.js:1: export const b = 2'])
  await assert.rejects(grepTool.execute({ pattern: '(' }, ctx()), /Geçersiz düzenli ifade/)
})

test('bash çıktı ve çıkış kodu döner; alt komutlar ayrı izin kaynağıdır', async () => {
  const output = await bashTool.execute({ command: 'echo merhaba && ls src | sort' }, ctx())
  assert.match(output, /merhaba/)
  assert.match(output, /\[çıkış kodu: 0\]/)
  assert.deepEqual(asked.at(-1).resources, ['echo merhaba', 'ls src', 'sort'])
  assert.deepEqual(splitCommands('a; b || c'), ['a', 'b', 'c'])
})

test('bölücü: & ve satır sonu ayraçtır; tırnak ve yönlendirme bölünmez; ikame reddedilir', async () => {
  assert.deepEqual(splitCommands('ls & rm -rf x'), ['ls', 'rm -rf x'])
  assert.deepEqual(splitCommands('ls\nrm -rf x'), ['ls', 'rm -rf x'])
  assert.deepEqual(splitCommands('echo "a;b" && ls 2>&1 | sort'), ['echo "a;b"', 'ls 2>&1', 'sort'])
  assert.deepEqual(splitCommands("echo 'tek $(tırnak)'"), ["echo 'tek $(tırnak)'"]) // tek tırnakta ikame yok
  assert.equal(splitCommands('echo $(rm -rf x)'), null)
  assert.equal(splitCommands('echo "`rm -rf x`"'), null)
  assert.equal(splitCommands('(cd alt && rm -rf x)'), null)
  assert.equal(splitCommands('for f in *; do rm $f; done'), null)
  assert.equal(splitCommands('echo "kapanmadı'), null)
  await assert.rejects(bashTool.execute({ command: 'echo $(whoami)' }, ctx()), /ayrıştırılamadı/)
})

test('bölücü bir güvenlik sınırı değildir: sarmalayıcı komut tek kaynak görünür', () => {
  // build ajanının `rm *` kuralı doğrudan çağrıyı sorar...
  assert.equal(evaluate('bash', 'rm -rf x', agents.build.rules).effect, 'ask')
  // ...ama aynı iş `bash -c` ile sarılınca kaynak "bash -c '…'" olur ve kural eşleşmez.
  const [wrapped] = splitCommands("bash -c 'rm -rf x'")
  assert.equal(evaluate('bash', wrapped, agents.build.rules).effect, 'allow')
})

test('bash çıktısı parça sınırında bölünen Türkçe karakteri bozmaz', async () => {
  // "ş" = C5 9F (sekizlik 305 237). İki baytı ayrı parçalar hâlinde gönderiyoruz.
  const output = await bashTool.execute({ command: "printf 'deği\\305'; sleep 0.2; printf '\\237iklik'" }, ctx())
  assert.match(output, /^değişiklik/)
})

test('bash zaman aşımında süreç grubunu öldürür', async () => {
  const started = Date.now()
  const output = await bashTool.execute({ command: 'sleep 5; echo bitmedi', timeout: 200 }, ctx())
  assert.ok(Date.now() - started < 4000)
  assert.match(output, /zaman aşımıyla durduruldu/)
  assert.doesNotMatch(output, /bitmedi/)
})

test('argüman doğrulama: eksik alan, yanlış tip, bozuk JSON', () => {
  const schema = readTool.parameters
  assert.equal(validateInput(schema, {}), 'Zorunlu argüman eksik: path')
  assert.match(validateInput(schema, { path: 3 }), /string bekleniyordu/)
  assert.match(validateInput(schema, { __invalidJson: '{' }), /geçerli JSON değil/)
  assert.equal(validateInput(schema, { path: 'a', limit: 5 }), null)
})
