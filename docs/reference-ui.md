# Reference UI: what we looked at, and what we copied

Soliman's rule: the competition screens must look like the real tools, not like generic dark "AI" cards.
Before any screen was built, each one was researched against real sources (docs, GitHub templates, write-ups).
The detail for each tool is in its own file, with every URL and the exact colours, fonts, column names and
wording copied. Where a source was blocked (Splunk docs 403, Netgate screenshots 404, Reddit unreadable), the
file says so and lists which values come from memory, so they can be checked against the real product.

| Screen in the game | Real thing copied | Detail file | Code |
|---|---|---|---|
| CCDC workstation (taskbar, windows, Chrome, PuTTY, toasts, Notepad playbook, PDF packet + after-action report) | Windows 10 desktop, Chrome 9x, PuTTY 0.7x, Chrome PDF viewer, NCCDC-style team packet | [reference-ui/jumpbox.md](reference-ui/jumpbox.md) | `src/ui/ccdc/JumpBox.js`, `PuttyApp.js`, `TermView.js`, `PlaybookApp.js`, `ccdcdoc.css` |
| Scoreboard vs other teams, inject portal, team chat | scoringengine/scoringengine (Bootstrap templates: Overview matrix, Services, Injects), Discord channel view | [reference-ui/scoreboard.md](reference-ui/scoreboard.md) | `src/game/ccdcTeams.js`, `src/ui/ccdc/ScoreboardApp.js`, `InjectsApp.js`, `ChatApp.js` |
| What the day feels like | team write-ups, rules docs, captain accounts | [reference-ui/ccdc-day.md](reference-ui/ccdc-day.md) | engine timings, chat, injects, toasts |
| Firewall | pfSense 2.7 CE webConfigurator (Firewall / Rules / WAN, rule edit form, Status / System Logs / Firewall, Dashboard) + SSH console menu | [reference-ui/pfsense.md](reference-ui/pfsense.md) | `src/ui/ccdc/PfSenseApp.js`, `src/game/pfsenseMap.js` |
| Windows DC / workstations | Windows Server 2019 over RDP: Server Manager, ADUC, services.msc, Task Scheduler, Event Viewer, PowerShell 5.1 | [reference-ui/windows.md](reference-ui/windows.md) | `src/ui/ccdc/WinDesktop.js`, `src/game/winGuiMap.js` |
| SIEM (millions of seeded log lines) | Splunk Enterprise Search & Reporting; raw formats of auth.log, Apache combined, pfSense filterlog, WinEventLog | [reference-ui/siem.md](reference-ui/siem.md) | `src/game/siemGen.js`, `siemSearch.js`, `src/data/siemStories.js`, `src/ui/ccdc/SiemApp.js` |
| CPTC | Kali Xfce panel, QTerminal zsh prompt, Mousepad, client rules-of-engagement letter, public pentest report templates | [reference-ui/cptc.md](reference-ui/cptc.md) | `src/scenes/CptcLabScene.js`, `src/ui/cptc/*` |

Background research on the competitions themselves: [competition-research.md](competition-research.md).

Proof screenshots: `docs/proof/ccdc-sim/` (integrated scene), `docs/proof/pfsense/`, `docs/proof/scoreboard/`,
`docs/proof/windows/`, `docs/proof/siem/`, `docs/proof/cptc/`.
