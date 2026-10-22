-- Insieme — limiti di lunghezza anche sul server.
--
-- L'app limita già quello che si scrive (nome del gruppo 40 caratteri,
-- nome visualizzato 24, messaggio 500...), ma il database accettava
-- qualunque lunghezza: chi scrivesse direttamente all'interfaccia del
-- server, senza passare dall'app, potrebbe salvare un nome di gruppo di un
-- megabyte, che poi l'app di tutti gli altri membri dovrebbe disegnare.
--
-- I limiti qui sono larghi di proposito, ben sopra quelli dell'app: non
-- servono a decidere quanto può essere lungo un nome (quello lo decide
-- l'interfaccia), ma a tenere fuori l'abuso. Un messaggio arriva fino a
-- 4000 caratteri perché la condivisione da altre app può portare testi più
-- lunghi di quelli scritti a mano.
--
-- Prima di scriverli si è controllato che nessun dato esistente li superi.

alter table public.groups
  add constraint groups_nome_lunghezza check (char_length(btrim(name)) between 1 and 80);

alter table public.profiles
  add constraint profiles_nome_lunghezza check (display_name is null or char_length(display_name) <= 40);

alter table public.pins
  add constraint pins_nome_lunghezza check (char_length(btrim(name)) between 1 and 200);

alter table public.links
  add constraint links_titolo_lunghezza check (char_length(title) <= 300),
  add constraint links_url_lunghezza check (char_length(url) <= 2048);

alter table public.messages
  add constraint messages_testo_lunghezza check (text is null or char_length(text) <= 4000),
  add constraint messages_nome_file_lunghezza check (attachment_name is null or char_length(attachment_name) <= 255);

alter table public.link_categories
  add constraint link_categories_nome_lunghezza check (char_length(btrim(name)) between 1 and 40);

alter table public.place_categories
  add constraint place_categories_nome_lunghezza check (char_length(btrim(name)) between 1 and 40);
