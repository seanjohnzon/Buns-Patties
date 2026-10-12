# proudmerchant.com

The company's own site: the landing page, Get started, and every customer's setup list.

| File | What it is |
|---|---|
| `index.html` | Landing page and the Get started form. Starts a business in the company database and sends him to his list. |
| `account.html?c=<code>` | His list: the Food Truck template's sections, every box saving as he types. `<code>` is the private link made at Get started. |
| `netlify.toml` | Hosting: plain files, base directory `proud-merchant`. |

The database is the Supabase project **`proud-merchant`** (ref `ecfscfmmgpefnpjqwbye`, org Sahin LLC):
`templates`, `businesses`, `answers`, `tasks`, `jobs`, `events`. Browsers reach it only through three
functions: `start_business`, `get_account`, `save_answer`. A finished section starts the job its
template names (`jobs` table). The template is the sheet in `tools/client-sheet/food-truck.html`
plus a `job` line per section; `docs/PLAYBOOK.md` section 7 has the plan.

Serdar's account is `bp-7f3k9q`, seeded from his sheet (Maps pending, Square chosen, menu received).
