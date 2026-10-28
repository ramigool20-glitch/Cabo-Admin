// Cuenta única solicitada por el propietario. No se toma de metadatos editables.
export const OWNER_EMAIL = 'ramigool20@gmail.com'

export function isOwnerEmail(email?: string | null): boolean {
  return email?.trim().toLowerCase() === OWNER_EMAIL
}

export function isActiveOwner(
  user: { email?: string | null; email_confirmed_at?: string | null },
  profile: { activo?: boolean | null } | null,
): boolean {
  return isOwnerEmail(user.email) && Boolean(user.email_confirmed_at) && profile?.activo === true
}
