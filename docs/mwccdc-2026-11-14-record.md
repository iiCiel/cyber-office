# MWCCDC Invitational, Nov 14 2026: full combined record

Source: two live-support chats (session 1 morning, session 2 afternoon). Team 14 (the packet's "Pod 16" was wrong; 20 + 14 = 34). All competition times CST; player in EST.

## Environment

| Box | Inside IP | Public IP | Runs | Scored checks |
|---|---|---|---|---|
| Rocky Ecom | 172.20.240.10 | 172.25.34.10 | nginx + nopCommerce store (http redirects to https) | ecomm-ping, ecomm-http (SSH NOT scored) |
| Ubuntu Email (WEBMAIL) | .15 | .15 | postfix, dovecot, Apache + Roundcube webmail, ufw | smtp, imap, pop3, webmail, webmail-interactive, webmail-ssh |
| Debian Splunk | .20 | .20 | Splunk 10.0.2, chronyd, LDAP auth to AD as svc-splunk | splunk-ssh, splunk-chrony, splunk-mgmt (8089), splunk-query |
| 2022 AD (AD-DNS) | .100 | .100 | DC, DNS, WinRM 5985 | ad-dns, ad-winrm |
| 2019 MSSQL | .120 | .120 | SQL 1433, SMB with SOP files, RDP | mssql-smb, mssql-rdp, mssql-mssql |
| Palo Alto PA-VM 11.0.2 | mgmt 172.20.240.200 | | zones external (e1/2) / internal (e1/3), 2 allow-all rules, outbound SNAT only | none |
| VyOS 1.4 | | outside 172.31.34.2 | 1:1 destination NAT public to inside, SNAT rule 900 on eth2 (external) | ping |
| Kali | 172.17.0.2 | | outside the firewall, acts like attacker/robot | |
| Ubuntu Wkst, Win 11 Wkst | DHCP | | user workstations (Win 11 wore a Linux-looking theme) | |

Default creds: sysadmin/Changeme1! everywhere, PA admin/Changeme123, VyOS vyos/vyos. Domain underpressure.local.

Portals: NISE injects.ccdc.events (injects, PDF only, CST deadlines). Quotient quotient.ccdc.events (service status, PCR tab). Credential lists: DomainUsers (670 AD users), Splunk (30 AD users), MssqlService (waterops_svc, local MSSQL account). One bad username rejects the whole PCR paste.

Scoring: 40% service uptime, 40% injects, 20% incident response. Robot's mail logins came from 203.0.113.200, 192.0.2.84; robot SSH logins are seconds-long sessions from random IPs (198.18.x, 198.19.x, 10.x) with rotating AD users. Red team seen from 198.51.100.12 and .28.

## Session 1 (morning) timeline

1. Read packet; built cheat sheet. Learned "staff passwords" vs admin passwords, PCR process.
2. Team changed every box's sysadmin to a different password; PCR'd sysadmin per box. Risky but OK.
3. Ubuntu Wkst: found `cyberrange-lab` SSH key and `splunkfwd` account (legit forwarder, locked).
4. webmail-interactive down; Apache/dovecot/postfix up, IMAP logins working. (Cause not pinned.)
5. Inject TOOL23T (Palo Alto perimeter review): screenshots showed two allow-all rules, no inbound NAT on PA (VyOS does it), so rules use inside IPs. With 8 min left: made profile group "inspict" (anti-spyware + vuln), applied to allow rules, logged interzone-default, committed, submitted memo PDF.
6. ad-winrm flapped; recovered on its own (likely DC busy running freshclam).
7. Inject SRVA07A (anti-malware): ClamAV on Linux (apt/dnf) and Windows (msi + freshclam). Lessons: clamd@scan fails/eats RAM, disable it; needrestart prompt, choose "none"; clamscan loads ~3.6M sigs silently for 1-2 min; don't Ctrl+C; arm64 vs x64 msi; PowerShell `>>` = unfinished quote.
8. Login banner inject: key concepts (authorized use, monitoring, consent, consequences); /etc/issue.net + sshd Banner; Windows legalnoticecaption/text; PA login banner; VyOS pre-login banner.
9. Robot passwords: generated per-user list, Quotient rejected it (AD list included names not in Quotient's list). Fixed by building the PCR from Quotient's Usernames tab (670 lines, one shared password `ZipsBlue2026x!`). PCR FIRST, then Set-ADAccountPassword.
10. Bulk reset also changed **svc-splunk** (not in skip list). Splunk LDAP bind broke; splunk-query red from ~11:03. Two parts to fix: (a) Quotient's separate **Splunk** credential list (30 users) needed the new password; (b) svc-splunk password reset + `bindDNpassword` in /opt/splunk/etc/system/local/authentication.conf, restart Splunkd. Console couldn't type capitals at first; used a no-shift password `splunk.bind.2026`.
11. Found `svc-chrony` listed as admin-capable identity on Splunk (polkit prompt).
12. ad-winrm red 10:24 to 10:58 CST: DC flipped to **Public** network profile (WinRM rule limited to local subnet). Fixed with `Set-NetFirewallRule -DisplayGroup "Windows Remote Management" -RemoteAddress Any`. Traffic from Kali got connection reset while DC answered locally with 405; recovered by itself.
13. Event 4625 hunting: 198.51.100.12 (DESKTOP-0132U9D) guessing `sysadmin` over NTLM = red team. chris.hill failures from 172.20.240.20 = Splunk.
14. Incident report PDF (4 incidents).
15. End: robot SSH sessions on Email recognized (short, random IPs). ufw deny typo (192 vs 198) and order (`ufw insert 1`).
16. **VyOS taken over**: nyan cat on console. No SSH ("No route to host"). Rebooted; boot menu option 2 = iPXE network boot; option 1 (disk) went straight to nyan cat: boot code overwritten. Router dead, every service down for the last ~20 min. Support ticket drafted.

### Session 1 debrief (what went wrong)
1. Router never secured, and it decided the day.
2. Rebooting a compromised core device near the end.
3. Bulk AD reset hit svc-* accounts.
4. Changed passwords before reading Quotient lists.
5. Found persistence (svc-chrony) but didn't remove it.
6. Hand-typing cost time (typos, quotes, capitals).
7. Full AV scan on DC; CST/EST deadline confusion; IRs written at the end.

## Session 2 (afternoon) timeline (CST)

13:04 Start. **VyOS first**: one user (vyos) + `cyberrange-lab` key. Changed password, deleted key, `delete service ssh`, commit/save. Task scheduler empty, NAT 10/15/20/100/120 correct, SNAT 900 legit (eth2 external). Startup scripts default, cron clean, saved /config/clean.boot. Router survived session 2.

Splunk (.20) hardening ~13:17 to 13:36:
- svc-chrony with bash shell; chronyd runs as `chrony`, so safe to remove. Deleted user + /etc/sudoers.d/svc-chrony (NOPASSWD root).
- Planted keys: root (unnamed), sysadmin (cyberrange-lab), /var/lib/svc-chrony/.ssh. Truncated; PermitRootLogin no.
- sshd_config AuthorizedKeysFile also pointed at hidden /etc/ssh/.ssh/authorized_keys. Removed.
- Root crontab "Ansible: firewall local" flushing iptables/nft every minute. `crontab -r`.
- cron.d: svc-chrony (fake /usr/lib/systemd/systemd-journal-sync every 5 min), e2scrub ("Ansible: firewall global" flush). **quotient_scoring is legit** (writes water-plant report line to /var/log/scoring.log that splunk-query searches). Keep.
- systemd: systemd-helper + sssd-sync (both run /etc/systemd-helper), systemd-kworker (/usr/local/sbin/systemd-kworker). Disabled, quarantined to /root/q.
- IR written for .20.

Palo Alto: password changed, committed via CLI (`commit`). Only one admin.

Ecomm outage: teammate restarted firewalld; it left nft table `inet firewalld_policy_drop` dropping everything (even localhost curl hung). Fix: `sudo nft delete table inet firewalld_policy_drop`. Someone also tried `dnf install httpd` (box runs nginx, no internet). nopCommerce returns 301 to https then 200.

~13:57: **every AD password reset at once** (teammate bulk reset). All AD-login checks red (webmail ssh/smtp/imap/interactive, splunk-ssh/query, mssql-smb). Splunk broken again via svc-splunk. Reset svc-splunk to `splunk.bind.2026`, verified with DirectoryEntry LDAP test returning "underpressure"; still "Invalid credentials" in splunkd.log after restart. Also found **svc-splunk in Domain Admins and Enterprise Admins** (privilege escalation). Suggested bindDN UPN form `svc-splunk@underpressure.local`.

DC tampering: PowerShell commands returned nothing (suspected profile hook); then "Access is denied" for firewall even as Domain/Enterprise admin. mpssvc running, service SDDL normal. **FirewallPolicy registry key ACL locked** (even take ownership denied). Got SYSTEM regedit via PsExec64 (`-s -i`). Later Get-NetFirewallRule worked and showed no block rules.

Mistake: ran Rocky cleanup commands on **Splunk** (wrong tab), disabled scored SSH. Re-enabled (`udo` typo first). Splunk also showed pkill "Connection reset by peer" and passwd "Authentication token manipulation error" (likely chattr +i on shadow).

Rocky Ecom (goose kit) ~14:30 to 15:05:
- Console spammed goose ASCII art, broadcast "you are now the incident".
- /etc/profile `BEGIN MANAGED PROMPT_COMMAND` block flushing iptables/nft on every prompt. Removed. (/etc/bashrc clean; Ctrl+W closes browser tab, use grep/sed.)
- Root crontab "Ansible: firewall local"; cron.d honkd (`ttygoose --once`), svc-chrony, e2scrub ("firewall global"). Removed.
- systemd: systemd-helper (/etc/systemd-helper), systemd-kworker (/usr/local/sbin/systemd-kworker), net-transport (`kill -59 $$; exec systemd-kworker`). Removed. nopcommerce.service, nginx.service.d, SplunkForwarder legit.
- Processes: `bash /usr/lib/.honk`, `bash /dev/shm/.ttygoose.5621/src.sh --stealth --syslog --syslog-tag systemd --wall --persist cron --persist-name honkd`, fake `kworker/0:2H` (no brackets). Parent PID 7484 = **/bin/scoringengine** (fake scorer, root, since 12:52). Killed, deleted.

Ubuntu Email: goose story text, UFW BLOCK log of scan from 10.48.250.15. Same kit: /bin/scoringengine, /etc/systemd-helper x2, systemd-kworker x2. Stopped services, killed, deleted, cron.d svc-chrony removed (e2scrub_all and php legit).

Inject SA103 SNMP: community `ccdc14ro`, net-snmp/snmpd per OS, Windows SNMP feature, VyOS `service snmp community`, PA interface mgmt profile; test with snmpwalk from Kali.

Inject EVAL14A external scan: Nmap 7.99 from Kali. .10 22/80/443; .15 22/25/110/143/443/587/993/995 + UDP 53/123/161 open|filtered; .20 22/8000/8089 + 123; .120 22/80/135/139/445/1433/3389/5985; .100 ALL filtered (no ping, all 1000 TCP filtered) although inside IP reachable from Kali (evil-winrm got to auth, then Ruby NTLM bug). Suspect public mapping for .100. Memo PDF written.

IR session 2: 6 incidents (fake scoringengine, firewall wipers, fake services on Rocky, Splunk backdoors, svc-splunk in DA/EA, DC firewall ACL lock).

## Red team playbook observed (same on every Linux box)
- Backdoor user `svc-chrony` + NOPASSWD sudoers file
- `cyberrange-lab` key and unnamed root keys; extra AuthorizedKeysFile at /etc/ssh/.ssh
- Firewall wipers: root crontab "Ansible: firewall local", cron.d/e2scrub "Ansible: firewall global", /etc/profile PROMPT_COMMAND
- Fake services: systemd-helper, systemd-kworker, sssd-sync, net-transport (Restart=always)
- Fake binaries: /bin/scoringengine, /etc/systemd-helper, /usr/local/sbin/systemd-kworker, /usr/lib/systemd/systemd-journal-sync
- Hidden scripts: /usr/lib/.honk, /dev/shm/.ttygoose.*; honkd cron; fake kworker without brackets
- Windows: FirewallPolicy registry ACL lock, possible PowerShell profile hook, service account added to DA/EA
- Network: VyOS console takeover + boot code overwrite (session 1)

## Legit things that looked suspicious (don't break these)
quotient_scoring cron (feeds splunk-query), chronyd as `chrony`, SNAT rule 900, splunkfwd user, SplunkForwarder/nopcommerce services, real `[kworker/...]` threads, e2scrub_all and php cron on Ubuntu, robot's short SSH sessions, svc-palo.

## Core lessons
1. Secure core network devices first (router, firewall). Never reboot a compromised core device late.
2. Read Quotient credential lists before any password change. PCR first, then change. Exclude every svc-* account from bulk resets. Some services keep their own copy of a password (Splunk bindDNpassword).
3. Check which box you're on before every command (prompt hostname).
4. Hunt the same persistence list on every box immediately; one find predicts the others.
5. Find the parent process; killing children leaves the spawner.
6. Test like the scorer: from Kali, through the public IP.
7. Write IRs as you go, with screenshots.
8. Know which services are scored per box before closing ports.
