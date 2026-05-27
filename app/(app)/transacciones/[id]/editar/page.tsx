import { redirect } from 'next/navigation'

// Ruta legacy: /transacciones/[id] ahora es el formulario de edición directo
// con historial al final. Esta ruta solo redirige.
export default async function EditarRedirect(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params
  redirect(`/transacciones/${id}`)
}
