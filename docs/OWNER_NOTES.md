# Owner's notes — Sunday 27 September 2026

Every point from the owner's list, what the app does now, and how it is checked.
Page version: https://claude.ai/artifact/XMCaHhDquNXqtgjpZnL6SK · QA checklist: https://claude.ai/artifact/JwhQiypwXDu3x59euqpnGE
**Auto** = automated test (`npm run verify`). **X##** = the Expo Go check you tick
yourself on the QA page (Gate 1). **E##** = the three-phone acceptance route (Gate 3).

Status as of Monday 28: all points built and walked on the simulator. Square is the
one open item.

## The list

| # | He asked | How it works now | Auto | You | Status |
|---|---|---|---|---|---|
| 1 | Fries drop on the logo, scattered; the press comes down; juice comes out | Logo is three layers (badge, press, burger). Press winds up, slams, burger squashes. Juice wells out of the patty edges and runs down the bun in the logo's own style. Single seasoned fries (drawn, not the carton emoji) burst out and pop in around the screen, each falling and vanishing its own way. Scrolling presses again. | — | X01 X02 | Done |
| 2 | Square dashboard; DoorDash, Grubhub, Uber Eats | App orders are paid into his Square and show in his Square dashboard as itemised pickup orders; he connects it with one Allow button. Delivery apps: links on the truck page, under **Delivery** on Home; delivery orders come into Square through Square's own integrations (his setup). | Auto (square.test) | X24 | Built. Sandbox test needs our Square developer app; live needs his Allow. |
| 3 | Tag us on social media | Yellow "Post your burger. Tag @buns.patties" card on Home, opens Instagram. | — | X25 | Done |
| 4 | Remove Google review | The free drink is Instagram only. No review action anywhere (also against Google's rules to reward reviews). | Auto | X04 | Done |
| 5 | 10 orders of $15+ = one free burger | Stamp card. Orders of $15+ before tax earn a stamp. 10 = a free burger. | Auto | X16 X17 X19 | Done |
| 6 | Home: address and hours first, then the free drink | Home: logo → where/when → free drink → stamp card → reviews → tag us → links. | — | X03 | Done |
| 7 | Instead of free wings, show the 10; $15 is fine print | Wings/fries/OG point tiers gone. The card says "5 = free fries · 10 = free burger"; $15 only in the small print. | Auto | X20 | Done |
| 8 | Delete "Your rewards" — only the drink, then the burger | Rewards tab = the free drink card + the stamp card. No points anywhere. | Auto (no-points test) | X03 | Done |
| 9 | Testimonials on Home; Home is about appearance | Reviews the owner picks (truck page) in a swipeable row. Home has no menu list; it is the shop window. | — | X24 | Done |
| 10 | Picking an item auto-selects its defaults; what it comes with is included; only extras cost | Burgers open built: single patty, their sauce, their cheese already picked. "Comes with" is listed and cannot be removed. Add-on lists never offer what it already has (BBQ Bacon was charging $1.50 for its own bacon). | Auto | X07 X09 X10 | Done |
| 11 | Sauces: "No sauce", no remove list; "No cheese" | Sauce: pick up to 2, or No sauce (stands alone). Cheese: American or No cheese. | Auto (app + server) | X11 | Done |
| 12 | Wings: 4–6 = 1 sauce, 8–10 = 2 | Limit follows the size; going back down trims. Server refuses otherwise. | Auto (app + server) | X12 | Done |
| 13 | Smash Fries: toppings then sauce; No cheese; sauce required, up to 2 | As asked. | Auto | X13 | Done |
| 14 | Seasoned Fries: sauces, any mix, 25¢ each | Counter per sauce, 25¢ a cup. | Auto (app + server) | X14 | Done |
| 15 | Free can drink: pick which one | The free drink opens the drink picker, priced at nothing. | Auto | X06 | Done |
| 16 | Rewards: free drink for following (pick a drink), then 5 orders = fries, 10 = burger (not BYO, no triple, extras charged) | Free drink: one per phone number. Stamp card: fries at 5 or save up; burger at 10 = any but Build Your Own; double patty on us, triple pays $2, paid toppings paid. Taking a reward uses its stamps. | Auto | X04–X06 X18–X20 | Done |
| 17 | Account: story, feedback, email, contact | Our story, Call or text, Email, Message on Instagram, Leave feedback. Empty ones hide. | — | X24 X25 | Done |
| 18 | Admin: sold out on the dashboard; build campaigns (actions, links, rewards) | Sold-out switches on the dashboard and for staff. Campaign builder: "Do this, get that" (follow Instagram/TikTok, tag us, a link → free item, cap, end date) or a stamp card (minimum, any rewards). Each shows its cost; one-tap off. | Auto | X22 X23 | Done |
| 19 | Bottom of Home: good Google reviews, socials, contacts | Reviews row, then Delivery / Follow / Contact. | — | X24 | Done |

## Rulings made since (Monday)

- **Toppings first, sauce last — everywhere.** Every item asks: size → cheese → toppings → sauce. Enforced by a test.
- **Defaults cannot be removed, only added to.** Sauce and cheese are choices (you can pick "No").
- **Instagram or TikTok for the free drink** — Instagram for now; to be decided with the owner.
- **The owner already has Square.** Missing: D-U-N-S (requesting Tuesday), the domain, delivery hookups.

## Found and fixed while checking (not on his list)

- Staff's sold-out button opened an owner-only screen.
- The kitchen board never showed the customer's note.
- Home, Menu and the cart went stale after the truck opened or something sold out.
- A sold-out category stayed as an empty tab.
- Signed-out visitors could start the free-drink follow before signing in.
- The server accepted option combinations the kitchen cannot make.

## Still open

1. **Square** — built (checkout, webhook, sweep, Connect Square button, 13 tests). Needs our free Square developer app to test in sandbox, then the owner's Allow on Thursday.
2. **Owner's content** — story, 3–5 Google reviews, TikTok/Facebook/delivery links, phone and email (asked for on the What We Need page).
3. **Instagram vs TikTok** for the free drink.
