# SIEM (Splunk-style search) reference

Used for `src/ui/ccdc/SiemApp.js` + `siem.css`. The Splunk docs site (docs.splunk.com) returned HTTP 403 to the fetch tool, so the
layout comes from (1) the search-engine summary of docs.splunk.com "About the Search app" pages, (2) the Splunk look this repo already
modelled in `src/ui/SocScreen.js` / `.spl-*` in `src/ui/screen.css`, and (3) my knowledge of the product. I could not view a screenshot.

## URLs looked at
- https://docs.splunk.com/Documentation/Splunk/9.2.2/Search/WhatsinSplunkSearch (search result summary only: timeline, Fields sidebar
  left of the events list, Interesting Fields = fields in >= 20% of events, newest event first)
- https://docs.splunk.com/Documentation/Splunk/latest/SearchTutorial/Startsearching and .../Search/Retrievetheeventsfromtheindex (403)
- https://community.splunk.com (interesting-field behaviour, via search result)

## What was copied
- Top bar #171d21 with `splunk>` (white, orange `>` #ff6a00) + "enterprise"; right-hand Administrator / Messages / Settings / Activity / Help / Find.
- App bar #3c444d, "Search & Reporting", nav Search / Analytics / Datasets / Reports / Alerts / Dashboards, active item green (#65a637) underline.
- "New Search" light 22px heading, Save As / Close buttons, one search bar (monospace 13px, placeholder "enter search here..."),
  time-range picker button with clock ("All time"), green search button #65a637 with a magnifier.
- Status line: green check, bold "N events", "(before <date>)" for All time or "(<from> to <to>)", "No Event Sampling", then Job / pause / stop / Smart Mode.
  While running: spinner, "N events (scanned X of Y)" and a thin #1e93c6 progress bar under the search row.
- Time presets: Last 15 minutes / 60 minutes / 4 hours / 24 hours / 7 days / All time (+ "During the round").
- Tabs: Events (N) | Patterns | Statistics (N) | Visualization (Patterns and Visualization greyed).
- Timeline: bars #5379af, hover #3a5f96, selected #f58220, "Format Timeline / - Zoom Out / + Zoom to Selection / x Deselect", "1 hour per column".
- Sidebar: SELECTED FIELDS (host, source, sourcetype) and INTERESTING FIELDS with `a` / `#` type marks and distinct counts ("100+"); click a field
  for the value card (Top 10 values, count, %, thin bars); clicking a value adds `field=value` to the search.
- Event list: header `i | Time | Event`, row = chevron, time as `10/31/26` over `9:12:44.000 AM`, raw text in monospace 12px, search terms
  highlighted #fff1a8, grey meta line `host = web01 | source = ... | sourcetype = ...` with blue values. Row chevron expands a Type/Field/Value table.
  Long events show 10 lines and "Show all N lines".
- Pager: `List | Format | 20 Per Page`, then `« Prev 1 2 3 … N Next »`; per page 10 / 20 / 50.
- Text #3c444d, links #006eaa, borders #d6dce2, header fills #eef1f4 / #f7f8fa, hover rows #f4f9fd.

## Raw formats used (src/game/siemGen.js)
- Apache combined: `IP - - [31/Oct/2026:09:12:44 -0400] "GET /path HTTP/1.1" 200 1234 "ref" "UA"`
- sshd / sudo / cron (auth.log, syslog): `Oct 31 09:12:44 web01 sshd[1234]: Failed password for invalid user admin from IP port 4242 ssh2`,
  `Accepted password|publickey for ...`, `pam_unix(sshd:session): session opened ...`, `sudo: user : TTY=pts/0 ; PWD=... ; USER=root ; COMMAND=...`,
  `CRON[pid]: (root) CMD (...)`; WP Fail2Ban style `wordpress(site)[pid]: Authentication failure for admin from IP`.
- pfSense filterlog (CSV after the colon): `rule,,,tracker,em0,match,block,in,4,0x0,,ttl,id,0,DF,6,tcp,60,src,dst,sport,dport,0,S,seq,,win,,mss`.
- Windows Security as Splunk WinEventLog (key=value header then `Message=` block with Subject / Logon Type / New Logon / Network Information):
  4624 4625 4634 4672 4688 4698 4720 4722 4724 4728 4732 4768 4769, PrintService 808.
- Postfix (`connect from`, `NOQUEUE: reject ... Relay access denied`, `status=sent`), Dovecot (`imap-login: Login: user=<..>, method=PLAIN, rip=`),
  MySQL 8 error log (`[Note] [MY-010926] [Server] Access denied for user 'root'@'IP' (using password: YES)`), PostgreSQL
  (`connection received: host=`, `connection authorized: user= database=`, `FATAL:  role "x" does not exist`, `statement:`).
