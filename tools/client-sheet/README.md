# The client sheet

The one page a client gets on day 0 (stage 0 of docs/PLAYBOOK.md): the costs at the
top, a tick box on every job, and an answers form with a **Copy my answers** button.
Ticks and answers save in the client's browser as he goes.

- `template.html` — the universal version. Published at
  https://claude.ai/artifact/DmuMyjuiHjejKN9pVdwXvT. Fill every dotted field for a
  new client.
- `buns-and-patties.html` — the filled-in one. Published at
  https://claude.ai/artifact/HwCPDBosxVayFjk2PFx6vm.
- `sheet_transform.py` — adds the costs table, tick boxes and form to a sheet;
  `build_buns_and_patties.py` shows how (edit costs and questions there, then run
  `python3 build_buns_and_patties.py`).

Anything new we need from a client goes on the sheet, never in a message.
