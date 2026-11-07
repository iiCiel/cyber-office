# Real reference screenshots (guardrail 2)

Real screenshots of the tools our CCDC/CPTC screens imitate. Compare against these before calling a screen "real".
All files come from Wikimedia Commons (free licences; see each file page for author and licence).

| File | Real tool | Source |
|---|---|---|
| pfsense-dashboard-2.7.png | pfSense 2.7 Status / Dashboard (pfSense-dark theme) | https://commons.wikimedia.org/wiki/File:Screenshot_of_pfSense_2.7.0_(modified,_3_rows).png |
| pfsense-2.3.2.jpg | pfSense 2.3.2 web GUI | https://commons.wikimedia.org/wiki/File:PfSense_2.3.2.jpg |
| putty-ubuntu.png | PuTTY session into Ubuntu | https://commons.wikimedia.org/wiki/File:PuTTY_Ubuntu.png |
| windows-event-viewer.png | Windows Event Viewer | https://commons.wikimedia.org/wiki/File:Event_Viewer.png |
| kali-2021.2.png | Kali Linux 2021.2 Xfce desktop | https://commons.wikimedia.org/wiki/File:Kali_Linux_2021.2.png |

## Side-by-side notes (Nov 6, 2026)

- **pfSense dashboard** (ours: docs/proof/pfsense/dashboard-1366.png). Same top navbar and menus, same
  "Status / Dashboard" breadcrumb, same System Information rows in the same order (Name, User, System, BIOS,
  Version, CPU Type, Hardware crypto, Kernel PTI, Uptime, ...), same bar widgets for State table / MBUF.
  Ours uses the default light theme (blue panel headers); the reference uses pfSense-dark. Both are real themes.
  Gap: the real dashboard has a 3rd column (Services Status with green ticks, Traffic Graphs). Not built yet.
- **pfSense dashboard, second pass (Nov 6, 2026)** (ours: docs/proof/pfsense-3col/dashboard-1366.png vs
  pfsense-dashboard-2.7.png). Differences found and fixed:
  1. Breadcrumb now sits in the grey page-header bar with the last crumb link-coloured and + / ? icons on the right.
  2. Every widget heading has the wrench / minimise / close icons and a compact title, like the real widgets.
  3. Interfaces: one row each with the network icon, green up arrow, media and IP (was two-line text rows).
  4. Services Status: green check-circle column and blue restart / stop icons under Action (was "Running" text),
     plus dhcpd. Gateways: green "Online" cell.
  5. Bars are thin with the figure on the line below ("0% (404/98000) Show states"), as in the real widget.
  6. System Information adds MDS Mitigation, QAT Crypto, bold BIOS / version values and a bulleted DNS list.
  7. Traffic Graphs: one graph per interface (WAN, LAN) with title, dot legend, filled in (blue, above 0) /
     out (orange, below 0) areas, y labels on the right and time labels along the bottom.
  Remaining by choice: light theme (the 2.7 default) instead of pfSense-dark; no Disks / NTP / Installed
  Packages / Netgate Support widgets (those widgets are optional in the real product).
- **Still missing a reference (not on Commons, Microsoft/Splunk images are non-free):** Server Manager, AD Users
  and Computers, Splunk Search, a CCDC scoreboard. Soliman: drop a screenshot of each into this folder if you
  have one; the next run will compare against it.
- **servicenow-incident-lower.png**: lower half of a real ServiceNow incident form (Notes / Related Records /
  Closure Information tabs, Watch list, Additional comments, Work notes, Post), from the University of Michigan
  ServiceNow training guide: https://mylinccontent.dsc.umich.edu/mais/html/SL_InvestigateDiagnoseResolveanIncident.html
  Our Tickets app copies its grey field labels, flat inputs with lookup icons, state flow bar, work-notes
  activity stream and blue Update / Resolve buttons. Side by side: docs/proof/tickets/sbs-servicenow.png.
