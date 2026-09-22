-- Spostare un posto in un'altra categoria, dal menu del posto.
--
-- `pins` non ha una regola di modifica per i client, di proposito: una
-- regola generica permetterebbe di cambiare anche nome, coordinate e
-- gruppo di qualunque posto. Qui si apre una sola porta, stretta: cambiare
-- la categoria, e solo verso una categoria dello stesso gruppo del posto.
--
-- SECURITY DEFINER per poter aggiornare nonostante le RLS; i controlli che
-- le RLS farebbero sono scritti qui dentro, uno per uno.

create or replace function public.sposta_posto(p_pin_id uuid, p_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id text;
begin
  select group_id into v_group_id from public.pins where id = p_pin_id;
  -- Posto inesistente o di un gruppo di cui non si fa parte: stessa
  -- risposta, per non rivelare a un estraneo che quel posto esiste.
  if v_group_id is null or not public.is_group_member(v_group_id, auth.uid()) then
    raise exception 'Posto non trovato.';
  end if;

  if not exists (
    select 1 from public.place_categories
    where id = p_category_id and group_id = v_group_id
  ) then
    raise exception 'Categoria non valida per questo gruppo.';
  end if;

  update public.pins set category_id = p_category_id where id = p_pin_id;
end;
$$;

revoke all on function public.sposta_posto(uuid, uuid) from public;
grant execute on function public.sposta_posto(uuid, uuid) to authenticated;
