# The client sheet

The one page a client gets on day 0 (stage 0 of docs/PLAYBOOK.md). A checklist of
sections at the top, then one card per section. Each card holds named boxes marked
**Required** or **Optional**, a button that opens the exact page for the job, and a
chip that says how many boxes are left. What he types saves on his phone as he goes.

| File | What it is | Published at |
|---|---|---|
| `food-truck.html` | The template for every new food truck | https://claude.ai/artifact/DmuMyjuiHjejKN9pVdwXvT |
| `buns-and-patties.html` | Buns & Patties, filled in | https://claude.ai/artifact/HwCPDBosxVayFjk2PFx6vm |

Gas stations and restaurants get their own copy of the template when we take the
first one on. Most sections stay the same.

## A new food truck

Copy `food-truck.html` and change the `SHEET` object (between `SHEET-START` and
`SHEET-END`). Nothing else on the page changes.

1. `name` — the business name. `key` — any new value (it names what is saved on his phone).
2. The last line of `costs` — what running the app costs him.
3. The Google Maps hint — what to fix on his listing, or "Create one."
4. Anything we already have goes in as `def:'…'` on that box, so it opens filled in
   and marked done (Buns & Patties: the menu, the Maps link, Square).

Then publish it and send him the link.

## What a box can be

| In the `SHEET` | What he sees |
|---|---|
| `req:1` | Required. Counts toward the section's "N LEFT". |
| `ph:'…'` | Grey example text inside the box. |
| `area:1` | A bigger box, for several lines. |
| `choice:['A','B']` | Buttons to tap instead of typing. |
| `want:'Done'` | Required, and only that answer counts as done. |
| `def:'…'` | Opens already filled in. |
| `when:['provider','Square']` | Only shown when another box has that answer. |
| `sameAs:'appleid'`, `sameLabel:'…'` | A tick box: "same as the one above". |
| `url:'…'`, `go:'Open …'` | A button to the exact page. On a box or on a section. |
| `note:'…'` | One line under the box: what to tap once the page is open. |
| `pending:['status','Change requested']` (on a section) | An amber PENDING chip while he waits on someone else. |

A section with no required boxes shows OPTIONAL and does not count toward "X OF N DONE".

## Rules

- **Everything on the sheet is something he can do today.** No "later", no "coming".
- **Every box is named for exactly what goes in it**, and says Required or Optional.
  No "Notes" boxes, no free-for-all.
- **Every job has a button to the exact page**, assuming he is already signed in.
  Apple, Google Play, Stripe: all of them, the same way.
- **Never ask twice.** If we can look it up (his Square location, his address from
  the Maps link), we do not ask.
- **Done or not done.** No "Not yet" option. An empty required box already says that.
- **Do not reinvent it.** Check how owner.com asks before adding a section.
- **Never a password, never a key.** The sheet says so at the top.
- He buys the domain and the accounts himself, in his own name. We get invited.

## What is still to come

The last button says **Copy everything** because a page on claude.ai cannot send
anywhere. Once the page lives on our own domain it becomes **Send**: the answers go
straight into `client_intake` (`get_intake` / `submit_intake` in `supabase/schema.sql`,
already live in the test project). `app/intake.tsx` is the older hosted form and is
replaced by this design at that point.
