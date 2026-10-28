// Inicio acordado de la operación individual.
export const OPERATION_START = '2026-10-28'
export const OPERATION_RESET_AT = '2026-10-28T14:35:08Z'
export function desdeOperacion(fecha: string) {
  return fecha < OPERATION_START ? OPERATION_START : fecha
}
