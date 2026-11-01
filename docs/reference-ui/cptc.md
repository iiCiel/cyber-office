# CPTC desktop: what is copied and from where

Note on method: the layout, colours and report structure below were written from knowledge of the real tools and
public templates, not from screenshots fetched during the build (the build helper had no verified image fetch).
The URLs are the places to compare against; anything below marked "check" should be eyeballed against them.

## Competition (what the scene models)
- CPTC (https://cptc.stratumsecurity.com/ , https://nationalcptc.org/): student teams are consultants hired by a
  fictional client. They get a rules-of-engagement / scope document, a testing window, then write a professional
  report and present to the client's executives. The report and presentation are most of the score. The game
  therefore starts with a client RoE letter and ends with a graded report review sheet.

## Kali Xfce desktop (https://www.kali.org/docs/introduction/download-images/ , https://www.kali.org/blog/)
- Top panel, 28 px, dark (#1b1f27), left to right: Kali menu button (blue dragon mark, approximated as a blue "K"
  tile, no copyrighted image), separator, one task button per open window (active one has a blue underline),
  status area, system tray icons (network, volume, power), date and time ("Sat 31 Oct, 19:51").
- Wallpaper: dark navy with blue radial glow and a large faint "KALI LINUX" word, done in CSS only. Desktop icons
  (File System, Home, Trash) on the left, decorative.
- Windows: Xfce window manager look, 26 px titlebar with centred bold title and minimise / maximise / close at the
  right; focused titlebar blue-grey (#2b3f66), unfocused grey (#343a47). Close turns red on hover.
- Narrow screens: windows maximise and only the focused one shows (a phone cannot tile windows).

## QTerminal (https://www.kali.org/docs/general-use/qterminal/ , check)
- Dark background (#1c1f26), DejaVu Sans Mono, menu bar File / Edit / View / Terminal / Help.
- zsh two-line prompt `┌──(kali㉿kali)-[~]` then `└─$` (green frame, bold blue user and `$`). Drawn by the shared
  `src/ui/ccdc/TermView.js` theme `kali`. Terminal commands and output text are unchanged from `cptclab.js`.

## Mousepad notes window
- Default Kali text editor: grey menu bar (File Edit Search View Document Help), white page, monospace text,
  status bar "Ln, Col" and "Plain Text". Used as the tester's notes: scope, confirmed findings, and (guided mode)
  a TODO list of commands. Names a real habit: testers keep a running notes file and copy evidence from it.

## Report document (public templates to compare against)
- Offensive Security sample report: https://www.offsec.com/pwk-online/OSCP-Exam-Report.docx
- TCM Security sample pentest report: https://github.com/hmaverickadams/TCM-Security-Sample-Pentest-Report
- Public report collection: https://github.com/juliocesarfort/public-pentesting-reports
- Structure copied: cover block (title, client, document reference, version, date, prepared by, classification) ->
  document control table -> 1 Executive summary -> 2 Scope and methodology -> 3 Findings summary table (ref,
  finding, affected host, likelihood, impact, risk) with a severity count bar -> 4 Detailed findings, one section
  each with a two-column attribute table (risk rating with CVSS v3.1 band, likelihood, impact, affected hosts,
  evidence, remediation).
- Styling: white page on a grey viewer background, serif body (Georgia), sans headings in navy (#14325c), thin rules,
  flat square severity chips (Critical purple, High red, Medium amber, Low green) as in common templates and
  Dradis/Serpico style exports. CVSS bands are the NVD qualitative scale (Low 0.1-3.9, Medium 4.0-6.9, High 7.0-8.9,
  Critical 9.0-10.0), shown as a band only because this game rates by likelihood x impact, not by a vector.

## Left out on purpose
- Burp Suite / Metasploit lookalike windows (owner decision for this round). No new attack capability or real-world
  exploit detail was added; the simulated command set and canned output are exactly those in `src/data/cptc*.js`.
