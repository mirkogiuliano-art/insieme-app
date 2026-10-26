-- Insieme — le «Cose da sapere» di un gruppo pubblico si vedono da fuori,
-- con il resto delle info. Restano dentro solo la chat e i membri.
-- Solo lettura: scrivere resta dei membri, con le regole di sempre.
create policy "group_facts: pubblici in lettura" on public.group_facts for select to authenticated
  using (public.gruppo_pubblico(group_id));
