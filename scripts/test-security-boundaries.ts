import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { validWhatsAppSignature } from '../lib/auth/webhook-signature'

const body = '{"entry":[]}'
const secret = 'test-secret-only'
const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
assert.equal(validWhatsAppSignature(body, signature, secret), true)
assert.equal(validWhatsAppSignature(body + ' ', signature, secret), false)
assert.equal(validWhatsAppSignature(body, null, secret), false)
assert.equal(validWhatsAppSignature(body, 'sha256=bad', secret), false)
assert.equal(validWhatsAppSignature(body, signature, ''), false)

let actions = 0
function inspect(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) { inspect(file); continue }
    if (!/\.tsx?$/.test(file)) continue
    const text = readFileSync(file, 'utf8')
    if (!/^['"]use server['"]/.test(text)) continue
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    for (const node of source.statements) {
      if (!ts.isFunctionDeclaration(node) || !node.body || !node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue
      assert.equal(node.body.statements[0]?.getText(source), 'await requireOwner()', `${file}: la autorización debe ejecutarse antes de cualquier operación`)
      actions++
    }
  }
}
inspect('app/(app)')
assert.ok(actions >= 119)
console.log(`Seguridad: ${actions} acciones protegidas antes de operar y firma de webhook verificada.`)
