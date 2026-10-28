begin;
do $$
begin
  if exists(select 1 from cabo_private.reinicios_operacion where clave='pendientes_auditor_2026_10_28') then return; end if;
  insert into cabo_private.reinicios_operacion(clave,respaldo)
    select 'pendientes_auditor_2026_10_28',
      jsonb_build_object('auditor_pendientes',
        coalesce(jsonb_agg(to_jsonb(p)) filter(where p.estado='abierta'),'[]'::jsonb))
    from public.auditor_pendientes p;
  update public.auditor_pendientes set estado='descartada',contestada_at=now()
    where estado='abierta';
end $$;
commit;
