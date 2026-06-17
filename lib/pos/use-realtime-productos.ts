'use client'

/**
 * Hook de Realtime para sincronizar productos del inventario.
 *
 * Cuando admin cambia precio, stock, foto, costo, etc. desde su celular,
 * el POS de Tania lo recibe al instante sin recargar la página.
 *
 * Eventos manejados:
 *   - UPDATE en inventario_productos → reemplaza el producto en el array
 *   - INSERT en inventario_productos → agrega al final
 *   - DELETE / activo=false → quita del array
 */

import { useEffect, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'

type Producto = {
  id: string; nombre: string; precio_mxn: number; stock: number
  categoria: string | null; codigo_barras: string | null
  costo_mxn: number | null
  foto_path: string | null; foto_signed_url: string | null
}

export function useRealtimeProductos(
  setProductos: (updater: (prev: Producto[]) => Producto[]) => void,
  onChange?: (tipo: 'update' | 'insert' | 'delete', nombre: string) => void,
) {
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  useEffect(() => {
    const supa = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const channel = supa
      .channel('pos-productos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventario_productos' },
        (payload) => {
          const tipo = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
          if (tipo === 'INSERT') {
            const nuevo = payload.new as unknown as Producto
            if ((nuevo as unknown as { activo: boolean }).activo === false) return
            setProductos(prev => {
              if (prev.some(p => p.id === nuevo.id)) return prev
              return [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre))
            })
            onChangeRef.current?.('insert', nuevo.nombre)
          } else if (tipo === 'UPDATE') {
            const updated = payload.new as unknown as Producto & { activo?: boolean }
            // Si lo desactivaron → quitar
            if (updated.activo === false) {
              setProductos(prev => prev.filter(p => p.id !== updated.id))
              onChangeRef.current?.('delete', updated.nombre)
              return
            }
            // Actualizar in-place
            setProductos(prev => prev.map(p => p.id === updated.id
              ? {
                  ...p,  // conserva foto_signed_url (que es signed, no de Realtime)
                  ...updated,
                  foto_path: updated.foto_path ?? (updated as unknown as { foto_url?: string | null }).foto_url ?? p.foto_path,
                }
              : p))
            onChangeRef.current?.('update', updated.nombre)
          } else if (tipo === 'DELETE') {
            const old = payload.old as unknown as Producto
            setProductos(prev => prev.filter(p => p.id !== old.id))
            onChangeRef.current?.('delete', old.nombre ?? 'Producto')
          }
        },
      )
      .subscribe()

    return () => {
      supa.removeChannel(channel)
    }
  }, [setProductos])
}
