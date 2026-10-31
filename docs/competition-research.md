# CCDC and CPTC research digest (for the Cyber Office hands-on sim)

Compiled 2026-10-31 from public sources. Rules differ by event and year, so treat numbers as "typical, not official" unless marked. Third-party or unverified claims are flagged. nationalccdc.org now redirects to https://www.ccdc.io, whose rules pages could not be fetched, so National rule text is not quoted directly.

---

## 1. CCDC (Collegiate Cyber Defense Competition, blue team)

### 1.1 Teams and structure
- A blue team has up to 8 active competitors (max 2 grad students) plus a faculty/staff coach; a school roster can hold 12 but 8 compete. [Wikipedia](https://en.wikipedia.org/wiki/Collegiate_Cyber_Defense_Competition) (flagged by Wikipedia as source-heavy). ISEAGE also caps teams at 8: [ISEAGE rules](https://docs.iseage.org/cdc/current/rules/index.html)
- Colors: Blue = students; Red = live attackers (industry/government pentesters); White = runs the scoring engine, grades injects, arbitrates rules; Orange (sometimes Gold) = plays business customers/users and generates requests. [Wikipedia](https://en.wikipedia.org/wiki/Collegiate_Cyber_Defense_Competition). Black Team (infrastructure) and White Team can demand access to your systems in NECCDC. [NECCDC scoring](https://neccdl.org/docs/neccdc/scoring/)
- Event shape: you take over a pre-built simulated business network for about 20 hours over 2-3 days, 8+ hours of play per day. [Wikipedia](https://en.wikipedia.org/wiki/Collegiate_Cyber_Defense_Competition)
- Real role split (Missouri State, Midwest): Linux admin, Windows admin, firewall admin, web admin, incident response, scripting, inject management. [Missouri State blog](https://blogs.missouristate.edu/cob/2025/03/11/2025-midwest-regional-ccdc)
- Third-party doctrine (not official): each Tier-0 service gets a primary and backup owner; a dedicated log watcher; a dedicated inject lead (strong writer); captain is final approver for changes touching auth/network/AD/mail/DB with two-person confirmation; tier services 0 (never down), 1 (protect), 2 (sacrifice). [Doctrine](https://ccdc-cyberdefense.pages.dev/doctrine)
- Midwest (MWCCDC) data point: 2025 regional in person at Purdue, 16 teams from 8 states; the wild card round was 8 hours defending 10 VMs. [Missouri State blog](https://blogs.missouristate.edu/cob/2025/03/11/2025-midwest-regional-ccdc)
- Ohio: no "OCCDC" or Ohio-Cyber-Range CCDC regional found. Ohio Cyber Range Institute runs a separate statewide CTF ("Capture Ohio"); Cedarville won an Ohio CCDC event in 2022. [UC news](https://www.uc.edu/news/articles/2026/02/ocri-ctf.html), [Cedarville](https://www.cedarville.edu/news/2022/cyber-team-is-best-in-ohio)

### 1.2 Scoring
- NECCDC: 50% system (service) scoring, 50% inject scoring. Red team can subtract at most half of the combined service+inject points. [NECCDC scoring](https://neccdl.org/docs/neccdc/scoring/)
- Other regionals: services 35-50%, injects 35-50%, exploitation/incident response 10-20% (Rocky Mountain qualifier, Jan 2026). [DU blog](https://cs.du.edu/~henwalen/blog.html). CANSEC 2021: uptime 60%, injects 40%, check each minute, 1 point/minute. [CANSEC](https://sites.google.com/view/cansec2021/cyber-defense-competition)
- Midwest data point: 6 points per minute a service stays up; each business inject worth up to 100 points; incident response judged on detect/contain/report speed. [Missouri State blog](https://blogs.missouristate.edu/cob/2025/03/11/2025-midwest-regional-ccdc)
- Service checks run at a "predetermined interval" (NECCDC) or random intervals (Wikipedia). A success adds points weighted by criticality; a failure adds nothing. [NECCDC scoring](https://neccdl.org/docs/neccdc/scoring/)
- SLA, three variants: (a) NECCDC 2019: after several consecutive failed checks, each further failed check costs points [2019 packet](https://neccdl.org/history/historic/resources/2019_NECCDC_TeamPacket.pdf) (known only from search summary; direct fetch 404); (b) eSentinel: N consecutive down checks (example 6) resets the whole system to starting config [eSentinel](https://esentinel-org.nationalccdc.org/academic.html); (c) open-source engine: `slathreshold` 6 failed checks, deduction default 2x threshold per violation. [DWAYNE-INATOR-5000](https://github.com/DSU-DefSec/DWAYNE-INATOR-5000)
- Reverts/reinstalls cost: ISEAGE 75 points per reinstall. [ISEAGE](https://docs.iseage.org/cdc/current/rules/index.html). Engine design article: free threshold of reverts before points are charged; penalty if a reverted system is re-compromised. [Tirefire](https://tirefire-org.pages.dev/posts/ccdc-cheese-taxonomy/)
- Inject values vary by complexity and time and are undisclosed; late = zero. [NECCDC scoring](https://neccdl.org/docs/neccdc/scoring/)
- ISEAGE: need at least 60% uptime to place. [ISEAGE](https://docs.iseage.org/cdc/current/rules/index.html)
- Check types in a CCDC-style open-source engine: ping, tcp, ssh (run command, check output), smb, ftp, winrm, smtp (sends a real message), imap, ldap, dns (A/MX vs accepted answers), sql (db/table/value exists), web (path + regex/status, login test), custom cmd. Default delay 60 s plus jitter. [DWAYNE-INATOR-5000](https://github.com/DSU-DefSec/DWAYNE-INATOR-5000)
- Good checks authenticate and exercise real functionality; Orange team does sampled hands-on checks as users. Services must be fully functional, not static stand-ins. [Tirefire](https://tirefire-org.pages.dev/posts/ccdc-cheese-taxonomy/)

### 1.3 Red team penalties and incident reports
- Accurate, evidence-based, professional incident reports can reclaim red-team points for that activity; very low-quality reports can ADD points to red team; submit when incidents occur; confirm it was red team and not your own change; exec summary for non-technical readers; screenshots, remediation and prevention. [NECCDC scoring](https://neccdl.org/docs/neccdc/scoring/)
- ISEAGE: intrusion report up to 25 points (detail 7, evidence 5, analysis 5, mitigation 8), submitted at scheduled times (e.g., 9:30, 12:30, 15:00); raw log dumps and unsupported "no intrusions" earn nothing; late reports ungraded. [ISEAGE](https://docs.iseage.org/cdc/current/rules/index.html)
- Report fields (doctrine): timestamps, affected systems, actions taken; log every change with timestamp/actor/purpose. [Doctrine](https://ccdc-cyberdefense.pages.dev/doctrine)
- A claim that quality reports cut penalties by up to 50% is not in any official rule found (unverified).

### 1.4 Rules that matter for gameplay
- Password changes: a rotated scored account must be told to the scoring engine or checks fail. Variants: submit via a PCR page ("Rotation without PCR submission breaks scoring authentication") [Tirefire](https://tirefire-org.pages.dev/posts/ccdc-cheese-taxonomy/); tell white team account name, new password and timing beforehand [UALR FAQ](https://sites.google.com/a/ualr.edu/csc/ccdc-faq); eSentinel: user-level (not root/admin) changes, supplied as text lines `userid,password` [eSentinel](https://esentinel-org.nationalccdc.org/academic.html); ISEAGE: required users cannot be changed without White/Green instruction, you may ask White to change one if compromised [ISEAGE](https://docs.iseage.org/cdc/current/rules/index.html). Engine option: passwords yes, usernames cannot be changed or added. [DWAYNE-INATOR-5000](https://github.com/DSU-DefSec/DWAYNE-INATOR-5000)
- Disabling or disconnecting network services is unauthorized and can cause SLA violations; asking Black Team for operational aid can cost points. [NECCDC scoring](https://neccdl.org/docs/neccdc/scoring/)
- ISEAGE: no whitelisting or special treatment of the scanner; no manual IP/range blocking (automated fail2ban-style allowed if documented); SSH keys/MFA not accepted for scored logins; backups at least every 30 min covering /etc, /home, /root, C:\Users and DB data (snapshots do not count). [ISEAGE](https://docs.iseage.org/cdc/current/rules/index.html)
- Injects: business memos/tickets/work orders delivered over time via a portal (Google Classroom in NECCDC, IScorE in ISEAGE), PDF deliverables with deadlines; late = 0. [NECCDC scoring](https://neccdl.org/docs/neccdc/scoring/), [Tirefire](https://tirefire-org.pages.dev/posts/ccdc-cheese-taxonomy/). Inject SLA windows usually 15-30 min; teams pre-built memo templates. [DU blog](https://cs.du.edu/~henwalen/blog.html). Examples: incident response plan, firewall rule, deploy TLS cert, centralized logging, user account migration. [Southwest CCDC](https://southwestccdc.com/compete/), [Wikipedia](https://en.wikipedia.org/wiki/Collegiate_Cyber_Defense_Competition)
- ISEAGE anomalies are optional but skipped ones score zero. [ISEAGE](https://docs.iseage.org/cdc/current/rules/index.html)

### 1.5 Typical environment
- Rocky Mountain qualifier: enterprise network with 8 services. [DU blog](https://cs.du.edu/~henwalen/blog.html). ISEAGE: Active Directory domain, RDP, HTTP, SSH (password only), FTP/SFTP, email. [ISEAGE](https://docs.iseage.org/cdc/current/rules/index.html)
- Firewall products (pfSense/Palo Alto/Cisco) are common in practice but none of the fetched sources detail them; treat as a design assumption. The playbook covers iptables/netsh only. [Network playbook](https://ccdc-cyberdefense.pages.dev/downloads/network-playbook.md)
- Rocky Mountain team: first hour was firewalls and resetting credentials everywhere; patch firewalls/OS/services early (a flapping service was suspected to be unpatched). [DU blog](https://cs.du.edu/~henwalen/blog.html)

### 1.6 What red team does
Source: [redteam page](https://ccdc-cyberdefense.pages.dev/redteam) (third-party; "first 5 minutes" claim unsourced).
- Default/weak creds tried first; public-facing app exploits (SQLi/XSS).
- Persistence: scheduled tasks/cron ("favorite"), new or oddly named accounts added to admin groups, Run keys, startup folders, auto-start services, systemd units in /etc/systemd/system, authorized_keys additions.
- Lateral: SMB admin shares, PsExec-like, SSH hops, WMI. Impact: service stops, DB drops/mass deletions, web defacement.
- Timeline: 0-15 min recon; 15-60 initial access; 1-2 h foothold/persistence; 2-4 h lateral; 4-6 h full compromise/service disruption; 6-8 h persistence and impact.
- Other hiding places: .bashrc reverse shells, web shells in web root. [Blueteam manual](https://github.com/void-frogs/CCDC-Blueteam-Manual), [HackerSploit](https://hackersploit.org/linux-red-team-persistence-techniques/)
- Regionals often free-for-all; nationals assign two red teamers per blue team; Cobalt Strike widely used. [Cobalt Strike blog](https://www.cobaltstrike.com/blog/national-ccdc-red-team-fair-and-balanced). Red team may tunnel via VPNs and leave artifacts for blue to find. [Tirefire](https://tirefire-org.pages.dev/posts/ccdc-cheese-taxonomy/)
- Blue-team warning: do not panic over standard OS files/processes. [Blueteam manual](https://github.com/void-frogs/CCDC-Blueteam-Manual)

### 1.7 First 15 minutes: what teams actually run
Commands from [Linux playbook](https://ccdc-cyberdefense.pages.dev/downloads/linux-playbook.md), [Windows playbook](https://ccdc-cyberdefense.pages.dev/downloads/windows-playbook.md), [Network playbook](https://ccdc-cyberdefense.pages.dev/downloads/network-playbook.md), [Command reference](https://ccdc-cyberdefense.pages.dev/downloads/command-reference.md) (third-party; their sample loop gives every user the same password, which is bad practice, so use unique passwords). Also see [Samsclass first-15](https://samsclass.info/140/proj/first15.htm).

Team-level first moves: get topology, identify hosts, confirm scored services, document admin creds, open a comms channel, 15-30 min status cadence, change log, one-page "first 15" sheet per person. Common mistake: investigating 30 min before acting.

- Linux 0-5 creds: `passwd root`; `cat /etc/passwd | grep -v nologin | grep -v false`; loop `chpasswd` over shell users (unique passwords).
- Linux 5-10 lock down: `awk -F: '$3 == 0 {print $1}' /etc/passwd` (extra UID 0); `awk -F: '$2 == "" {print $1}' /etc/shadow`; `sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config`; `systemctl restart sshd`; `passwd -l <user>`.
- Linux 10-15 verify: `systemctl list-units --type=service --state=running`; `curl -I http://localhost/`; `nc -zv localhost 80` (443, 22).
- Linux inventory/persistence: `ss -tulnp`, `ss -antup`; `ps auxf`; `crontab -l`, `cat /etc/crontab`, `ls -la /etc/cron.*/`, loop `crontab -u $user -l`; `systemctl list-unit-files --type=service | grep enabled`; `ls -la /etc/systemd/system/ /etc/init.d/ /etc/rc.local`; `cat /root/.ssh/authorized_keys`; `find /home -name authorized_keys -exec cat {} \;`; `grep -rE "eval|exec|system|passthru|shell_exec" /var/www/`; `find / -perm -4000 -type f 2>/dev/null`; `find / -mmin -60 -type f`; `grep "Failed password" /var/log/auth.log`; `cat /etc/sudoers`.
- Windows 0-5: `Set-LocalUser -Name Administrator -Password $pwd`; `Set-ADAccountPassword -Identity Administrator -Reset -NewPassword $pwd` (on DC).
- Windows 5-10: `Disable-LocalUser -Name Guest`; `Get-LocalUser | Select Name,Enabled,LastLogon`; `Get-ADUser -Filter {Enabled -eq $true} | Select Name,LastLogonDate`; `Disable-ADAccount -Identity <u>`; `Get-ADGroupMember "Domain Admins"`; `net user`; `net localgroup Administrators`.
- Windows 10-15 verify: `Get-Service | ? Status -eq Running`; `Test-NetConnection localhost -Port 80`.
- Windows persistence: `Get-ScheduledTask`, `schtasks /query /fo LIST /v`, `Disable-ScheduledTask`; `Get-WmiObject win32_service`; Run keys `HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` (plus HKCU, RunOnce); Startup folders; review linked GPOs and scripts; `netstat -ano`; `Get-WinEvent -FilterHashtable @{LogName='Security';ID=4625}`; `repadmin /replsummary`. Golden ticket is not covered by the sources (standard fix is resetting krbtgt twice; general knowledge, unsourced).
- Network/firewall: `nmap -sn <subnet>`, `arp -a`; default deny `iptables -P INPUT DROP` only AFTER ESTABLISHED and admin-allow rules (lockout risk); `Set-NetFirewallProfile -DefaultInboundAction Block`; `iptables -L -n -v`; `netsh advfirewall show allprofiles state`.
- Back up configs before changing them; log every change.

### 1.8 What the game should model (CCDC)
1. Role seats (firewall, Windows/AD, Linux, web/DB, IR/captain, inject lead) each owning devices and a first-15 checklist.
2. A scoring engine ticking about every 60 s with jitter; each service check exercises real function (login, send mail, SQL query, DNS A/MX); weights by criticality; a failed check scores 0, not negative.
3. SLA: N (say 6) consecutive failures start a per-check penalty; a "reset to default" option costs points (~75).
4. PCR: rotating a scored account's password without submitting a PCR makes checks fail (the signature trap); passwords only, never usernames.
5. Score about 50/50 services vs injects; red team deduction capped at 50% of combined; evidence-backed incident reports reclaim points, vague ones backfire.
6. Injects arriving over time with 15-30 min windows, late = 0 (firewall rule, TLS cert, IR plan, logging).
7. Red team timeline: default creds early, persistence (cron, systemd, authorized_keys, new admin accounts, scheduled tasks, Run keys, webshells, rogue GPO) planted by 1-2 h, service stops/defacement later, in waves.
8. Real terminals: bash on Linux, PowerShell on DC, firewall rule editor; inventory commands from 1.7 return output with planted artifacts to find.
9. Punish blind hardening: default-deny without allowing the scoring source, disabling a needed service, same password everywhere, killing legit OS processes.
10. Timed mode (compressed round) plus untimed guided mode.

---

## 2. CPTC (Collegiate Penetration Testing Competition, cp.tc)

### 2.1 Format
- Teams act as a consulting firm hired by a fictional client (theme changes each season); they get a Scope of Work and Rules of Engagement, then identify, exploit and document vulnerabilities. Regionals Oct/Nov, Global Finals January; regional winners plus top remaining teams advance. [cp.tc/compete](https://cp.tc/compete)
- Team: up to 6 engagement members chosen from a 3-8 roster; alternates cannot help with report writing or interact during competition. [official rules PDF](https://cp.tc/docs/cptc-rules.pdf), [TTU mirror](https://www.tntech.edu/ceroc/cptc/rules.php)
- Time: regionals about 8 hours of access on one day; finals 16 hours over two days; report written after hours. [Atch guide](https://blog.atch.dev/posts/an-uncomprehensive-guide-to-doing-well-in-cptc), [Stanford CPTC West](https://cptc-west.stanford.edu/2024)
- Environments: 2018 fictional Wheelz autonomous-transportation firm, corporate network at regionals, larger infrastructure at nationals, 300 GB of data in about 10 hours, Splunk/Suricata monitoring, insider-threat storyline via emails/chat, real-time client email. [Hurricane Labs](https://hurricanelabs.com/blog/collegiate-penetration-testing-competition-2018-nationals-review/). Other years included AD, web apps, cloud, OT/ICS (general knowledge; themes at https://cp.tc/compete/themes, not fetched).
- Finals presentation to a "client board" of industry volunteers: about 10 minutes including questions, about 7 minutes of slides. [cp.tc/compete](https://cp.tc/compete), [Atch guide](https://blog.atch.dev/posts/an-uncomprehensive-guide-to-doing-well-in-cptc)

### 2.2 Scoring
- Official wording: scoring is based on communication of issues discovered, communication during the proposal process, and team actions during the event; explicit descriptions of how and when vulnerabilities were found and exploited plus executable mitigation plans; no running score, scoring is deliverable-based. [Official rules PDF](https://cp.tc/docs/cptc-rules.pdf)
- Categories, no published numeric weights: technical findings, reporting, communication (client interaction, debrief), professionalism (scope, ethics). [cp.tc/compete](https://cp.tc/compete)
- Team estimate: technical work is only 30-40% of the score; professionalism and business impact earn most; mistakes ("educational opportunities") cost about 4-6 points. [Atch guide](https://blog.atch.dev/posts/an-uncomprehensive-guide-to-doing-well-in-cptc). CPTC said in 2021 it weighted interactions, injects and presentations heavier and overhauled the report rubric (from a search summary of the cp.tc 2021 finals review; page not fetchable).
- Penalties: points lost for violating RoE/SOW, missing deliverable deadlines, interrupting the environment; touching out-of-scope systems can reach disqualification. [Official rules PDF](https://cp.tc/docs/cptc-rules.pdf), [TTU mirror](https://www.tntech.edu/ceroc/cptc/rules.php)
- Incident reports for your own mistakes: description with source/destination IPs, timeline, damage, what was affected, remediation plan; a thorough, timely report can reduce the penalty, no partial credit for vague or late. [Official rules PDF](https://cp.tc/docs/cptc-rules.pdf)
- Tickets to the client carry no penalty; file one before staff find your mistake. [Atch guide](https://blog.atch.dev/posts/an-uncomprehensive-guide-to-doing-well-in-cptc)

### 2.3 Injects
- Email injects usually allow at least an hour; one person about half-time; phishing injects are common; in-person injects go through one point of contact (captain) who defers to experts or promises a ticket follow-up; prepare general answers for ransomware, responsible disclosure, data leaks. [Atch guide](https://blog.atch.dev/posts/an-uncomprehensive-guide-to-doing-well-in-cptc)

### 2.4 What wins
- Report length/quality: regionals 50+ pages, finals about 100; Cal Poly Pomona 104 pages; UCI 2026 champions 120 pages plus C-suite presentation; Stanford regional 52 pages. [Atch guide](https://blog.atch.dev/posts/an-uncomprehensive-guide-to-doing-well-in-cptc), [UCI](https://cyberuci.com/news/cptc-2026-win), [CPP](https://www.cpp.edu/news/content/2022/02/cal-poly-pomona-cybersecurity-team-wins-international-competition/index.shtml)
- Per-finding contents: CVSS data, description, business impact, technical impact, remediation general enough for the client to implement their way, reproducible steps with proof (screenshots). [Atch guide](https://blog.atch.dev/posts/an-uncomprehensive-guide-to-doing-well-in-cptc)
- Executive summary non-technical (say "stronger authentication", not "SQLi"); no blaming the client; avoid "you"; never drop findings. [cp.tc reporting page via search summary](https://cp.tc/compete/reporting), [Atch guide](https://blog.atch.dev/posts/an-uncomprehensive-guide-to-doing-well-in-cptc)
- Expect many easy findings (plaintext creds in JS, no-auth admin panels; about 5 easy per advanced); keep hunting after root (no end goal); track what has been tested in a shared doc; screenshot as you go. [Atch guide](https://blog.atch.dev/posts/an-uncomprehensive-guide-to-doing-well-in-cptc)
- Finalist reports are public: [globalcptc/report_examples](https://github.com/globalcptc/report_examples)
- Scope: only target infrastructure; no scanning other teams, staff or support infrastructure; no outside help; vulnerabilities found stay private. [TTU mirror](https://www.tntech.edu/ceroc/cptc/rules.php)

### 2.5 What the game should model (CPTC)
1. SOW/RoE briefing with an explicit scope list and 1-2 tempting out-of-scope hosts; touching them costs points, a self-filed incident report/ticket reduces the penalty.
2. Kali-style terminal on a fictional network (nmap, gobuster, sqlmap, smbclient, crackmapexec, impacket) with canned output; many easy findings plus a few chains.
3. Evidence capture (notes/screenshot tracker); findings only count with reproducible steps and proof.
4. Per-finding fields: rating (CVSS or likelihood x impact), business impact, technical impact, remediation, steps; graded by rubric.
5. Executive summary graded for non-technical language (no IPs/jargon/blame; business actions; a positive note).
6. Score mix near published guidance: technical ~30-40%, report, communication/injects, professionalism/scope; deductions for scope violations and missed deadlines.
7. Client injects during the engagement (email with ~1 h window, phishing, ransomware question, in-person Q) answered professionally; ticket system with no penalty.
8. Countdown for the 8-hour "day", then a report phase, then an optional 10-minute board presentation.

---

## 3. Source quality notes
- Official/semi-official: NECCDC scoring page, ISEAGE rules, CPTC rules PDF (read locally) and TTU mirror, cp.tc/compete.
- Not found or not fetchable: current National CCDC rulebook (site moved to ccdc.io), MACCDC 2025 packet (expired certificate), NECCDC 2019 packet (404 directly), cp.tc/overview, cp.tc 2021 review. No official CCDC PCR format found; the flow above is assembled from regional rule variants.
- Third-party (ccdc-cyberdefense.pages.dev) supplied the command lists and red-team timeline; verify against real events.
