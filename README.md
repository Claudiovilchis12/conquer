# Conquer (placeholder name)

Swipe through internships ranked for you, save the ones you want, see where to apply and who to message, and track every application.

Live app: https://claude.ai/artifact/T7HrPCEpWzdPbGZcnyMgvh (Claude artifact: syncs across devices, live search via ZipRecruiter + Indeed connectors)

## Tabs
- **Explore**: swipe deck ranked by match. Each card shows its grid position (P1, P2…), match %, and why it ranks there.
- **Find Out More**: saved internships grouped into industry folders. Each profile has apply links (listing, LinkedIn, Workday, company site, Indeed, Handshake) and people to message, ranked by what you have in common, with a ready-to-send note.
- **Home**: application tracker with status, a 6-step checklist, progress, notes and "Do next".

## How ranking works (`score()` in app.js)
Goals pipeline 35 (motorsports > automotive > aerospace…), major fit 20, location 20 (home/campus), pay 15, freshness 10.

## Files
| File | What it is |
|---|---|
| `jobs.js` | Built-in internship feed (+ `CONQUER_PEOPLE`). The daily task adds more through the artifact database (`feed/current`). |
| `logos.js` | Company logos as inline images (the artifact host blocks remote images). |
| `app.js` | All app logic: ranking, swipe deck, industry folders, people ranking, tracker, sync, live search. |
| `styles.css` | Motorsport livery design. Tokens are at the top. |
| `index.html`, `manifest.json`, `sw.js`, `icon*` | App shell and installable web-app files. |
| `build.py` | Inlines everything into one HTML file for the artifact: `python3 build.py . dist/conquer.html` |

## Roadmap
Accounts + multi-user backend · AI preferences chat that drives the ranking · Settings tab · AI Coach tab (free, plus a paid CV/mock-interview plan) · native app wrapper.
