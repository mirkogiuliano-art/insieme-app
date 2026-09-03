-- Fix: la policy SELECT su group_members referenziava se stessa in una
-- subquery ("sei membro di questo gruppo?" interrogando group_members
-- dentro la RLS di group_members) — Postgres rivaluta la stessa policy
-- anche per la subquery interna, causando "infinite recursion detected in
-- policy for relation group_members". Si risolve con una funzione
-- SECURITY DEFINER che bypassa la RLS solo per questo controllo interno.

create function public.is_group_member(p_group_id text, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

grant execute on function public.is_group_member(text, uuid) to authenticated;

drop policy "group_members: roster solo membri" on public.group_members;

create policy "group_members: roster solo membri"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id, auth.uid()));
