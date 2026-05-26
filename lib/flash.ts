import { redirect } from 'next/navigation'

/**
 * Mensajes flash que pop-up como toast en la siguiente página.
 * Keys cortas para mantener URLs legibles.
 */
export const FLASH_MESSAGES: Record<string, { variant: 'success' | 'error' | 'info' | 'warning'; title: string; description?: string }> = {
  // Transacciones
  tx_creada:        { variant: 'success', title: 'Transacción guardada' },
  tx_actualizada:   { variant: 'success', title: 'Cambios guardados' },
  tx_eliminada:     { variant: 'info',    title: 'Transacción eliminada' },

  // Gastos fijos
  gf_creado:        { variant: 'success', title: 'Gasto fijo creado' },
  gf_actualizado:   { variant: 'success', title: 'Gasto fijo actualizado' },
  gf_eliminado:     { variant: 'info',    title: 'Gasto fijo eliminado' },
  gf_pagado:        { variant: 'success', title: 'Pago registrado', description: 'El próximo vencimiento se actualizó.' },

  // Por pagar
  cpp_creada:       { variant: 'success', title: 'Cuenta por pagar creada' },
  cpp_pago:         { variant: 'success', title: 'Pago aplicado a la deuda' },
  cpp_pagada:       { variant: 'success', title: '✅ Cuenta saldada', description: 'Esta deuda quedó pagada por completo.' },
  cpp_eliminada:    { variant: 'info',    title: 'Cuenta eliminada' },

  // Tareas
  tarea_creada:     { variant: 'success', title: 'Tarea creada' },
  tarea_completada: { variant: 'success', title: 'Tarea completada' },
  tarea_eliminada:  { variant: 'info',    title: 'Tarea eliminada' },

  // Multas
  multa_resuelta:   { variant: 'success', title: 'Multa resuelta' },
  multa_creada:     { variant: 'warning', title: 'Multa propuesta' },

  // Nómina
  empleado_creado:  { variant: 'success', title: 'Empleado registrado' },
  pago_nomina:      { variant: 'success', title: 'Pago de nómina registrado' },
  compensacion:     { variant: 'success', title: 'Compensación guardada' },

  // Eventos (Rancho McCoy)
  evento_creado:    { variant: 'success', title: 'Evento creado' },
  evento_pago:      { variant: 'success', title: 'Pago del evento registrado' },

  // Cobros Stripe
  cobro_creado:     { variant: 'success', title: 'Link de cobro creado', description: 'Link y QR listos para compartir.' },
  cobro_eliminado:  { variant: 'info',    title: 'Cobro eliminado' },
}

/**
 * Redirige y aplica un toast flash en la página de destino.
 * Uso: en server actions, sustituye `redirect(path)` por `flashOk(path, 'tx_creada')`.
 */
export function flashOk(path: string, key: keyof typeof FLASH_MESSAGES): never {
  const sep = path.includes('?') ? '&' : '?'
  redirect(`${path}${sep}ok=${encodeURIComponent(String(key))}`)
}

export function flashErr(path: string, msg: string): never {
  const sep = path.includes('?') ? '&' : '?'
  redirect(`${path}${sep}err=${encodeURIComponent(msg)}`)
}
