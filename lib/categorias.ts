export const CATEGORIAS_GASTO = [
  'ads', 'renta', 'sueldo', 'comida', 'gasolina', 'servicios',
  'producto', 'suministros', 'mantenimiento', 'marketing',
  'transporte', 'comisión', 'impuestos', 'otro',
] as const

export const CATEGORIAS_INGRESO = [
  'venta', 'servicio', 'consulta', 'consultoría', 'comisión',
  'corte_diario', 'devolución', 'otro',
] as const

export const METODOS_PAGO = [
  { value: 'stripe',                  label: 'Stripe' },
  { value: 'mp_terminal',             label: 'MP Terminal' },
  { value: 'mp_transferencia',        label: 'MP Transferencia' },
  { value: 'mp_link',                 label: 'MP Link' },
  { value: 'efectivo_mxn',            label: 'Efectivo MXN' },
  { value: 'efectivo_usd',            label: 'Efectivo USD' },
  { value: 'transferencia_bancaria',  label: 'Transferencia' },
  { value: 'tarjeta',                 label: 'Tarjeta' },
  { value: 'domiciliado',             label: 'Domiciliado' },
  { value: 'otro',                    label: 'Otro' },
] as const

// Sugerencia de método de pago según el tipo de cuenta
export function metodoPagoDefault(cuentaTipo?: string | null): string | null {
  switch (cuentaTipo) {
    case 'stripe':       return 'stripe'
    case 'mercado_pago': return 'mp_transferencia'
    case 'efectivo':     return null // se decide por moneda
    case 'banco':        return 'transferencia_bancaria'
    case 'tarjeta':      return 'tarjeta'
    default:             return null
  }
}
