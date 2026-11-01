# What a CCDC day feels like (and what the sim reproduces)

Sources:
- https://ccdc-cyberdefense.pages.dev/playbooks : community playbook; first 15 min = topology, identify hosts, confirm scored services, document creds, set a comms rhythm, captain status board; then change default passwords, disable unknown accounts, lock admin interfaces, enable logging.
- https://chazae.github.io/projects/CCDC : PRCCDC 2016 write-up; the first 15 minutes of hardening shaped the rest of the day; red team (professional pentesters) launches after the opening window; back up the web server first.
- https://crypticsignals.github.io/2025/06/04/ccdc.html : 2025 team reflection; manual password changes on many-user machines take 15-20 min per box, so automate.
- https://docs.google.com/document/d/1khxkdUmrArD-oty4oQLA3VMA_zNqoT3-/export?format=pdf : a competition rules doc; ~4.5-5 h day, ~15 injects at random times, expect to miss a couple.
- https://www.scribd.com/document/82368444/SECCDCReportOfKTTeam-3 : SECCDC report; business injects done accurately and on time were a challenge.
- https://4rji-web.pages.dev/ccdc-journey : captain journey; timers, injects, service failures, scoring.
- https://github.com/scoringengine/scoringengine : the engine itself.
(No first-hand Discord write-up found; the chat is modelled on common practice: per-area channels, captain calling status.)

## Moments the sim should reproduce
1. Minute 0: everyone scrambling, captain asks for status and inventory. (teamFeed t=60, inject 1 at t=0)
2. Scoreboard is a table of OTHER teams; your rank moves every check even when you do nothing.
3. A service flips red on the board before you know why ("who touched apache?"). Chat reacts.
4. Red team waves land on a schedule (180/450/720 s) and other teams tank and recover too.
5. Injects pile up with a countdown; late = zero; some teams skip them.
6. SLA violations appear after repeated misses and are visible on the Overview.
7. Captain/seat leads talk in #general, #linux, #windows, #network, #injects.
