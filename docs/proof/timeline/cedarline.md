# Cedarline Freight Co.: untouched round, seed 1, 15:00 long

| clock | you | rank | Team 02 | Team 03 | Team 04 | Team 05 | waves fired | probes / compromised | injects released / overdue | SLA |
|---|---|---|---|---|---|---|---|---|---|---|
| 0:00 | 0 | 1/11 | 0 | 0 | 0 | 0 | 0/3 | 0 / 0 | 2 / 0 | 0 |
| 1:00 | 32 | 1/11 | 32 | 32 | 32 | 32 | 0/3 | 0 / 0 | 2 / 0 | 0 |
| 2:00 | 64 | 1/11 | 64 | 64 | 64 | 64 | 0/3 | 0 / 0 | 3 / 0 | 0 |
| 3:00 | 96 | 4/11 | 116 | 96 | 62 | 96 | 1/3 | 9 / 0 | 3 / 0 | 0 |
| 4:00 | 128 | 6/11 | 169 | 145 | 88 | 128 | 1/3 | 9 / 0 | 3 / 0 | 0 |
| 5:00 | 160 | 7/11 | 201 | 173 | 130 | 160 | 1/3 | 9 / 0 | 4 / 0 | 0 |
| 6:00 | 192 | 7/11 | 233 | 205 | 139 | 192 | 1/3 | 9 / 0 | 4 / 2 | 0 |
| 7:00 | 224 | 7/11 | 283 | 254 | 171 | 224 | 1/3 | 9 / 0 | 5 / 2 | 0 |
| 8:00 | -208 | 11/11 | 280 | 302 | 195 | 214 | 2/3 | 9 / 9 | 5 / 3 | 0 |
| 9:00 | -245 | 11/11 | 287 | 334 | 204 | 223 | 2/3 | 9 / 9 | 5 / 3 | 3 |
| 10:00 | -282 | 11/11 | 293 | 366 | 213 | 250 | 2/3 | 9 / 9 | 5 / 3 | 6 |
| 11:00 | -274 | 11/11 | 309 | 398 | 237 | 274 | 2/3 | 9 / 9 | 5 / 4 | 6 |
| 12:00 | -311 | 11/11 | 341 | 410 | 219 | 283 | 3/3 | 9 / 9 | 5 / 4 | 9 |
| 13:00 | -348 | 11/11 | 373 | 419 | 182 | 292 | 3/3 | 9 / 9 | 5 / 5 | 12 |
| 14:00 | -340 | 11/11 | 405 | 435 | 198 | 316 | 3/3 | 9 / 9 | 5 / 5 | 12 |
| 15:00 | -377 | 11/11 | 437 | 444 | 184 | 325 | 3/3 | 9 / 9 | 5 / 5 | 15 |

## Engine events

- 2:00 [inject] New inject from HR: "Inject 2 — New hire account (least privilege)" (due in 5 min).
- 3:00 [red] Red team wave 1: external recon + default-credential sweep.
- 3:00 [warn] Foothold attempt against edge-fw: Edge firewall allows any-to-any inbound. Catch it with an incident report, or fix it before the next wave.
- 3:00 [warn] Foothold attempt against web01: WordPress admin uses a default password. Catch it with an incident report, or fix it before the next wave.
- 3:00 [warn] Foothold attempt against web01: Web shell + root cron left by a prior intrusion. Catch it with an incident report, or fix it before the next wave.
- 3:00 [warn] Foothold attempt against db01: MySQL root password is "root" and it listens on every interface. Catch it with an incident report, or fix it before the next wave.
- 3:00 [warn] Foothold attempt against mail01: Postfix is configured as an open relay. Catch it with an incident report, or fix it before the next wave.
- 3:00 [warn] Foothold attempt against mail01: Planted SSH key + root login on the mail server. Catch it with an incident report, or fix it before the next wave.
- 3:00 [warn] Foothold attempt against dc01: An extra Domain Admin account you did not create. Catch it with an incident report, or fix it before the next wave.
- 3:00 [warn] Foothold attempt against dc01: SMBv1 enabled on the domain controller. Catch it with an incident report, or fix it before the next wave.
- 3:00 [warn] Foothold attempt against ws01: Malicious scheduled task on the accounting workstation. Catch it with an incident report, or fix it before the next wave.
- 5:00 [inject] New inject from Vendor (Northgate Logistics): "Inject 3 — Vendor file-transfer request" (due in 5 min).
- 5:30 [bad] Inject overdue: "Inject 1 — Asset inventory memo" — the white team scores a late deliverable at zero.
- 5:30 [bad] Inject overdue: "Inject 5 — Change request for the scored account" — the white team scores a late deliverable at zero.
- 7:00 [inject] New inject from CEO: "Inject 4 — Incident report" (due in 5 min).
- 7:30 [bad] Inject overdue: "Inject 2 — New hire account (least privilege)" — the white team scores a late deliverable at zero.
- 7:30 [red] Red team wave 2: exploiting what is still exposed.
- 7:30 [bad] Compromise confirmed on edge-fw: Edge firewall allows any-to-any inbound.
- 7:30 [bad] Compromise confirmed on web01: WordPress admin uses a default password.
- 7:30 [bad] Compromise confirmed on web01: Web shell + root cron left by a prior intrusion.
- 7:30 [bad] Compromise confirmed on db01: MySQL root password is "root" and it listens on every interface.
- 7:30 [bad] Compromise confirmed on mail01: Postfix is configured as an open relay.
- 7:30 [bad] Compromise confirmed on mail01: Planted SSH key + root login on the mail server.
- 7:30 [bad] Compromise confirmed on dc01: An extra Domain Admin account you did not create.
- 7:30 [bad] Compromise confirmed on dc01: SMBv1 enabled on the domain controller.
- 7:30 [bad] Compromise confirmed on ws01: Malicious scheduled task on the accounting workstation.
- 8:30 [bad] SLA violation: Company website missed 3 checks in a row.
- 8:30 [bad] SLA violation: DNS missed 3 checks in a row.
- 8:30 [bad] SLA violation: Mail (SMTP + IMAP) missed 3 checks in a row.
- 10:00 [bad] SLA violation: Company website missed 3 checks in a row.
- 10:00 [bad] SLA violation: DNS missed 3 checks in a row.
- 10:00 [bad] SLA violation: Mail (SMTP + IMAP) missed 3 checks in a row.
- 10:30 [bad] Inject overdue: "Inject 3 — Vendor file-transfer request" — the white team scores a late deliverable at zero.
- 11:30 [bad] SLA violation: Company website missed 3 checks in a row.
- 11:30 [bad] SLA violation: DNS missed 3 checks in a row.
- 11:30 [bad] SLA violation: Mail (SMTP + IMAP) missed 3 checks in a row.
- 12:00 [red] Red team wave 3: establishing persistence on anything unfixed.
- 12:30 [bad] Inject overdue: "Inject 4 — Incident report" — the white team scores a late deliverable at zero.
- 13:00 [bad] SLA violation: Company website missed 3 checks in a row.
- 13:00 [bad] SLA violation: DNS missed 3 checks in a row.
- 13:00 [bad] SLA violation: Mail (SMTP + IMAP) missed 3 checks in a row.
- 14:30 [bad] SLA violation: Company website missed 3 checks in a row.
- 14:30 [bad] SLA violation: DNS missed 3 checks in a row.
- 14:30 [bad] SLA violation: Mail (SMTP + IMAP) missed 3 checks in a row.
