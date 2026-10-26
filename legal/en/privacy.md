---
title: Privacy policy — Insieme
---

[Italiano](../privacy.html) · **English**

# Insieme privacy policy

**Last updated: 28 October 2026**

> ⚠️ **To be completed.** Two details of the data controller are missing:
> full name and contact email (wherever `[...]` appears). Without them this
> document is not valid: the data controller must be identifiable and
> reachable.

*This is a translation of the [Italian policy](../privacy.html). If the two
versions ever differ, the Italian one prevails.*

Insieme is a shared space where a group of people keeps their messages, links
and places on a map together. This document says what data we collect, why,
where it ends up and how to make it disappear. It is written to be read, not
skimmed past.

## Who handles your data

The data controller is **[full name]**. For any request about your data you can write to **[contact email address]**: it is
also the address to use to exercise the rights listed further down.

## What we collect, and why

| Data | When | Why | How long |
| --- | --- | --- | --- |
| Email address | when you sign up | to identify your account and let you sign back in | as long as the account exists |
| Password | when you sign up with email | to protect access | as long as the account exists |
| Google profile name, email and picture | if you sign in with Google | to create the account and suggest a name | as long as the account exists |
| Display name | on first launch | to sign your messages, links and places within your groups | as long as the account exists |
| Username | if you make a group public, or when you change it in your *Profile* | to let people who search find you, and to sign your public groups | as long as the account exists |
| Invitations to join a group | when you invite someone from your groups, or someone invites you | to show the invitation to whoever receives it | until it is accepted or declined |
| App language | when you sign up and when you change it | to write emails to you in your language | as long as the account exists |
| Messages | when you write | it is the service itself | as long as the group exists |
| Photos, videos, voice messages, documents | when you attach them | to share them with your group | as long as the group exists |
| Location | when you open the map or search for a place | to centre the map where you are and show you nearby places first | not stored |
| Location sent in the chat | if you use “Where I am” | to show it to your group | it is a message: as long as the group exists |
| Saved places | when you mark one | to show them to the whole group | as long as the group exists |
| Device code for notifications | if you allow notifications | to deliver alerts to you | until you sign out or turn them off |
| Date you last read a chat | when you open a chat | read receipts and unread message counts | as long as you are in the group |
| People you have blocked | when you block someone | to hide their messages and make the two of you impossible to find for each other | until you unblock them or delete your account |
| Technical sign-in data: IP address, device and app type | when you sign in and when the app renews your sign-in | to protect your account and the service from abuse | as long as you stay signed in on that device; in Supabase's technical logs, for the limited time the service keeps them |
| Technical data about an error | when something in the app goes wrong | to understand and fix the problem | 90 days at most |

**We don't know your password.** Supabase keeps it in encrypted form: it can't
be read by us or by other users.

**Your location, on its own, is not stored.** Your phone uses it to centre the
map at the moment you open it and, when you search for a place by name, to show
you nearby places first (see *Where the data goes*). It is stored only when you send it or mark it
yourself: the coordinates of the places you add to the map, and the location
you send in the chat with “Where I am”, which becomes a message like any other.
In both cases your group sees it, and nobody else.

**There is no advertising, no profiling, and we sell nothing to anyone.** We
don't use your data to build a profile of you and we don't hand it to third
parties for commercial purposes.

## Who can see what

Every group starts out **private**: what is written and saved in it is seen by
**the people in that group**, and nobody else. A private group can only be
joined by invitation: with the invite link, or with an invitation inside the app
from someone who is already in another group with you. Whoever invites you that
way already knows your name, because you are in a group together; before
deciding whether to join, you see the name of the group, who is inviting you and
the names of the people already in it.

### Public groups

Whoever **created** a group can make it **public**. From then on anyone with an
Insieme account can find it and see:

- the group's name, colour, description, dates and destination, and its “Things
  to know”;
- the saved links and videos, the places on the map and their categories;
- the name and username of whoever created it, and how many other people are in
  it.

Visible **only to members**: the chat (messages, photos, voice messages,
documents, polls, reactions), the other members' names and when they were last
active.

When a group is made public, the links and places added by the other members
become visible too, without their names: that is why the other members get a
notification. Whoever created it can make it private again at any time, and the
group goes back to private on its own if its creator leaves it or deletes their
account.

Making a group public requires a **username**: it is unique, chosen at that
moment and can be changed in your *Profile*. People searching on Insieme can
find you by username or display name, but **only if you have at least one public
group**: people who use Insieme only privately can't be found. Your page shows
your name, your username and your public groups, nothing else. Two people who
have blocked each other can't find each other and don't see each other's public
groups.

### Attachments

**Attachments** (photos, videos, voice messages, documents) are stored at a web
address that is hard to guess but **not password-protected**: anyone who gets
hold of the exact address can open it even without being in the group. It
works like the “unlisted” links of many services. Keep this in mind for
sensitive documents. A file saved among the links of a public group can also be
seen from outside, like the other saved items.

## Where the data goes

The data is stored on **Supabase**, on infrastructure in the **European Union
(Ireland)**. Notifications go through the services of **Expo** and **Google
Firebase**, which receive your device code and the text of the alert in order
to deliver it.

If you **sign in with Google**, it is Google that confirms who you are and tells
us your name, email address and profile picture. Google knows you used your
account to sign in to Insieme; it receives nothing of what you do inside the
app.

The **emails** for confirming your address and resetting your password are sent
from a **Gmail** (Google) mailbox, which therefore sees who they are sent to.

When someone shares a link, our server asks that link's website for its title
and the address of its preview image: the website sees that request coming from
us, not from you. The **preview image**, on the other hand, is downloaded by
your phone directly from wherever it is hosted, which therefore sees your IP
address, just as when you open a web page.

The **map** is **Google Maps**: to show it, your phone asks Google for the area
you are looking at, and Google sees your IP address and the type of device.
When you **search for a place by name**, or when the app recognises the place in
a Google Maps link, the search text (or the link) and, if you have allowed
location access, where you are pass from our server to **Google Places**, which
replies with the matching places: Google sees that request coming from us, not
from you. For these features the [Google Privacy
Policy](https://policies.google.com/privacy) also applies.

### When something goes wrong

If an error occurs in the app, its technical details are sent to **Sentry**
(Functional Software, Inc.), a service that collects application errors. The
data is stored in the **European Union (Frankfurt)** and deleted after
**90 days** at the latest.

Sentry receives: a technical description of the error and the place in the code
where it happened; the app version, the phone model and the operating system
version; the app language; your account's **identification code**; the last
steps before the error (which screens were open, which requests the app had
just made to its own servers, without their content).

Sentry does **not** receive: your name, your email, your IP address, the text of
your messages, your photos or other attachments. There are no screen
recordings.

It serves one purpose only: noticing problems and fixing them, even when they
happen on someone else's phone. The legal basis is our **legitimate interest**
in keeping the service you use working. This data stays until it expires even
if you delete your account, because it is kept separately and is not used to
identify you.

### Outside the European Union

The data is stored in the European Union, but some of the services we use
belong to companies based in the United States, which may receive it or access
it from there:

- **Google** (Google sign-in, emails, notifications, the map and place search),
  **Expo** (notifications) and **Sentry** (errors) take part in the **EU-U.S.
  Data Privacy Framework**, for which the European Commission has recognised an
  adequate level of protection;
- **Supabase**, which hosts the data, relies on the **standard contractual
  clauses** approved by the European Commission, and besides the United States
  may also process it in Singapore.

You can ask us for a copy of these safeguards at the email address given at the top.

## How long it stays

Messages, links and places stay as long as the group does. When **the last
person leaves a group**, the group is deleted entirely along with its content,
files included. If you delete your account, see the section below.

## Deleting your account

You can delete your account **directly in the app**: tap your initials at the
top right to open your *Profile*, then *Delete account*. It is immediate and
needs no approval from us.

What disappears: your profile and your username, your group memberships, your
messages, the links and places you added, your reactions, pending invitations
and the devices registered for notifications. The public groups you created go
back to private. Groups where other people remain carry on without you; groups
where you were the only one left are deleted entirely, files included.

If you no longer have the app installed, you can ask for deletion by writing to
**[contact email address]** from the email address you signed up with. We will
do it within 30 days.

## Your rights

Under the European General Data Protection Regulation (GDPR) you can ask at any
time to **access** your data, **correct** it, **delete** it, **restrict** its
processing, **object** to its processing and **receive it in a readable
format** to take it elsewhere. Write to **[contact email address]**. We reply
within **one month**; in complex cases this can be extended by two more months,
and if so we will tell you.

If you believe your data is being handled improperly you can contact the
Italian data protection authority, the **Garante per la protezione dei dati
personali** (www.garanteprivacy.it), or the authority in your own country.

The legal basis for processing is the **performance of the contract** with you:
without this data the service can't work. The exceptions, processed on the basis
of our **legitimate interest**, are the technical data about errors (see *When
something goes wrong*), the technical sign-in data, to protect accounts and the
service, and reports (see *Reported content*): you can object by writing to the
address above.

We make no **automated decisions** about you and we don't profile you.

## Minors

Insieme is not meant for people under 16 and we don't knowingly collect data
from minors under that age. If you find out that it has happened, write to us
and we'll delete everything.

## Reported content

If you report a message, we keep a copy of its text, of who wrote it and of who
reported it, so that the report can be assessed. If you report a public group,
we keep the group's name, who created it and who reported it. Those records stay
even if the message, the group or the accounts are deleted: without them a
report could no longer be assessed.

We keep them for as long as it takes to assess the report and, after that, only
for as long as they help us recognise repeated abuse or answer an authority. The
legal basis is our **legitimate interest** in keeping the service safe and
enforcing the terms of use.

## If this document changes

If anything substantial changes we will write it here and update the date at the
top. Important changes will be announced inside the app.
