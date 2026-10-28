type LoginError = { code?: string; status?: number; name?: string }

// No exponer mensajes internos del proveedor ni confundir fallas de red
// con una contraseña equivocada.
export function loginErrorMessage(error: LoginError): string {
  if (error.code === 'invalid_credentials') {
    return 'Email o contraseña incorrectos.'
  }
  if (error.code === 'email_not_confirmed') {
    return 'Confirma tu correo antes de entrar.'
  }
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return 'Demasiados intentos. Espera unos minutos antes de volver a entrar.'
  }
  return 'No se pudo conectar con el servicio de acceso. Intenta más tarde; si continúa, revisa el estado de Supabase.'
}
