import assert from 'node:assert/strict'
import { loginErrorMessage } from '../lib/supabase/login-error'

assert.match(loginErrorMessage({ code: 'invalid_credentials', status: 400 }), /incorrectos/)
assert.match(loginErrorMessage({ code: 'email_not_confirmed' }), /Confirma tu correo/)
assert.match(loginErrorMessage({ status: 429 }), /Demasiados intentos/)
assert.match(loginErrorMessage({ code: 'over_request_rate_limit' }), /Demasiados intentos/)
for (const error of [{ name: 'AuthRetryableFetchError', status: 0 }, { status: 503 }, {}]) {
  assert.match(loginErrorMessage(error), /servicio de acceso/)
  assert.doesNotMatch(loginErrorMessage(error), /incorrectos/)
}
console.log('Login: credenciales, confirmación, límite de intentos y fallas del servicio verificados.')
