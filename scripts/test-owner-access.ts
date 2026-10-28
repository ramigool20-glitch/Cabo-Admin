import assert from 'node:assert/strict'
import { isActiveOwner, isOwnerEmail } from '../lib/auth/owner'

const owner = { email: 'ramigool20@gmail.com', email_confirmed_at: '2026-01-01' }
assert.equal(isOwnerEmail(' RAMIGOOL20@gmail.com '), true)
assert.equal(isOwnerEmail('ramigool20gmail.com'), false)
assert.equal(isActiveOwner(owner, { activo: true }), true)
assert.equal(isActiveOwner(owner, { activo: false }), false)
assert.equal(isActiveOwner(owner, null), false)
assert.equal(isActiveOwner({ ...owner, email_confirmed_at: null }, { activo: true }), false)
assert.equal(isActiveOwner({ ...owner, email: 'otro@example.com' }, { activo: true }), false)
console.log('Acceso: propietario confirmado y activo; otras cuentas y perfiles ausentes/inactivos rechazados.')
