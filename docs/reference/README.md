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
- **Still missing a reference (not on Commons, Microsoft/Splunk images are non-free):** Server Manager, AD Users
  and Computers, Splunk Search, a CCDC scoreboard. Soliman: drop a screenshot of each into this folder if you
  have one; the next run will compare against it.
