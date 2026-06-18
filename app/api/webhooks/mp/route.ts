/**
 * Alias del webhook de Mercado Pago.
 * URL corta: /api/webhooks/mp → reenvía al handler real /api/webhooks/mercadopago
 */

import { POST as mpPost, GET as mpGet } from '../mercadopago/route'

export const runtime = 'nodejs'
export const maxDuration = 30

export const POST = mpPost
export const GET = mpGet
