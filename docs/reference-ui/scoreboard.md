# Reference: the CCDC scoring engine website

Sources (fetched Oct 31, 2026):
- https://github.com/scoringengine/scoringengine (README; Flask web UI: "Scoreboard, team management, administration")
- https://github.com/scoringengine/scoringengine/tree/master/scoring_engine/web/templates : base.html, overview.html, services.html, injects.html (read as raw templates)
- https://ccdc-cyberdefense.pages.dev/playbooks (team playbook; first-15-minute checklist)

## What the real engine looks like (copied into src/ui/ccdc/ScoreboardApp.js + InjectsApp.js)
- Bootstrap navbar, dark. Brand = small "SE" box + "Scoring Engine". Left items: Scoreboard, Overview, Services (blue team), Injects, Stats. Right: Announcements, user dropdown (Logout). Our nav: Overview | Scoreboard | Services | Injects | team07.
- Overview: stat cards on top (Round N + start time, Services Up (green), Services Down (red), Leader name + pts), then a table `table-sm overview-matrix`: first column row labels, one column per team. Metadata rows: Current Score, Current Place (1-3 medals gold #C98910, silver #A8A8A8, bronze #965A38), Services Up (green), Services Down (red, 0 = muted), SLA Penalties (red with minus). Then one row per service with a filled circle: green check = up, red X = down, grey ? = unknown.
- Live indicator at right of the title bar: dot + "Live - Round N".
- Services (blue team): stat cards Team / Place / Score / Services Up / Services Down / Uptime; table columns Service, Host, Port, Status (green UP / red DOWN badge), Rank, Score Earned, Max Score, % Earned, Pts Per Check, Trending (last 10 results as green check / red X icons).
- Injects: table with columns ID, Title (link), Category, Score ("25 pts available" or "7 (70.00%)"), Status (badge: Draft yellow, Expired red, Submitted green, Graded light blue), Time Remaining ("0d 0h 4m 12s" ticking every second).
- Colours (Bootstrap): success #198754 / old BS3 #5cb85c, danger #dc3545 / #d9534f, warning #ffc107, info #0dcaf0, navbar dark #212529, body text #212529, page bg #f8f9fa, table border #dee2e6, link #0d6efd. Font: system sans (Segoe UI / Helvetica Neue), 14px, tables 13px.

## What we copied
Light Bootstrap page (white cards with 1px #dee2e6 border, no shadows, no gradients, no emoji), dark navbar, matrix with a column per team, status circles drawn in CSS, badge colours as above, countdown format "0d 0h 4m 12s". The player is highlighted with a pale yellow row/column (#fff8d6).

## Not copied
Themes, SSE, admin/white-team pages, flags page.
