'use server'
import { requireOwner } from '@/lib/auth/require-owner'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
export async function anularVenta(id: string, motivo: string) {
  await requireOwner()
  const d = z.object({ id:z.string().uuid(),motivo:z.string().trim().min(5).max(500) }).safeParse({id,motivo})
  if (!d.success) return { error:'Escribe un motivo de al menos 5 caracteres.' }
  const user = await requireOwner()
  const {error} = await createAdminClient().rpc('anular_venta_atomica',{p:{...d.data,usuario_id:user.id}})
  if (error) return {error:error.message}
  for (const path of ['/transacciones','/dashboard','/inventario','/pos',`/transacciones/${id}`]) revalidatePath(path)
  return {ok:true}
}
