# Harbor Point Credit Union: untouched round, seed 1, 15:00 long

| clock | you | rank | Team 02 | Team 03 | Team 04 | Team 05 | waves fired | probes / compromised | injects released / overdue | SLA |
|---|---|---|---|---|---|---|---|---|---|---|
| 0:00 | 0 | 1/11 | 0 | 0 | 0 | 0 | 0/3 | 0 / 0 | 2 / 0 | 0 |
| 1:00 | 32 | 1/11 | 32 | 32 | 32 | 28 | 0/3 | 0 / 0 | 2 / 0 | 0 |
| 2:00 | 64 | 1/11 | 64 | 64 | 64 | 60 | 0/3 | 0 / 0 | 3 / 0 | 0 |
| 3:00 | 96 | 4/11 | 116 | 96 | 62 | 92 | 1/3 | 7 / 0 | 3 / 0 | 0 |
| 4:00 | 128 | 6/11 | 169 | 145 | 88 | 124 | 1/3 | 7 / 0 | 3 / 0 | 0 |
| 5:00 | 160 | 7/11 | 201 | 177 | 130 | 156 | 1/3 | 7 / 0 | 4 / 0 | 0 |
| 6:00 | 192 | 7/11 | 229 | 209 | 139 | 188 | 1/3 | 7 / 0 | 4 / 2 | 0 |
| 7:00 | 224 | 7/11 | 279 | 258 | 171 | 220 | 1/3 | 7 / 0 | 5 / 2 | 0 |
| 8:00 | -120 | 11/11 | 276 | 306 | 195 | 206 | 2/3 | 7 / 7 | 5 / 3 | 0 |
| 9:00 | -134 | 11/11 | 283 | 334 | 204 | 215 | 2/3 | 7 / 7 | 5 / 3 | 2 |
| 10:00 | -148 | 11/11 | 289 | 362 | 213 | 242 | 2/3 | 7 / 7 | 5 / 3 | 4 |
| 11:00 | -132 | 11/11 | 305 | 390 | 237 | 266 | 2/3 | 7 / 7 | 5 / 4 | 4 |
| 12:00 | -146 | 11/11 | 333 | 402 | 219 | 275 | 3/3 | 7 / 7 | 5 / 4 | 6 |
| 13:00 | -160 | 11/11 | 365 | 411 | 182 | 284 | 3/3 | 7 / 7 | 5 / 5 | 8 |
| 14:00 | -144 | 11/11 | 397 | 435 | 198 | 308 | 3/3 | 7 / 7 | 5 / 5 | 8 |
| 15:00 | -158 | 11/11 | 429 | 444 | 184 | 317 | 3/3 | 7 / 7 | 5 / 5 | 10 |

## Engine events

- 2:00 [inject] New inject from HR: "Inject 2 — New teller account (least privilege)" (due in 5 min).
- 3:00 [red] Red team wave 1: default-credential + exposed-service sweep.
- 3:00 [warn] Foothold attempt against edge-fw: Edge firewall allows any-to-any inbound. Catch it with an incident report, or fix it before the next wave.
- 3:00 [warn] Foothold attempt against dc01: Print Spooler running on the domain controller. Catch it with an incident report, or fix it before the next wave.
- 3:00 [warn] Foothold attempt against dc01: Guest account re-enabled and placed in Account Operators. Catch it with an incident report, or fix it before the next wave.
- 3:00 [warn] Foothold attempt against app01: The .git folder is exposed in the web root (leaks DB credentials). Catch it with an incident report, or fix it before the next wave.
- 3:00 [warn] Foothold attempt against app01: Attacker persistence: a root cron re-running a planted script. Catch it with an incident report, or fix it before the next wave.
- 3:00 [warn] Foothold attempt against db01: PostgreSQL trusts any host with no password, on every interface. Catch it with an incident report, or fix it before the next wave.
- 3:00 [warn] Foothold attempt against ws01: Planted local administrator account on the teller workstation. Catch it with an incident report, or fix it before the next wave.
- 5:00 [inject] New inject from Vendor (Keystone Core): "Inject 3 — Core-banking vendor access request" (due in 5 min).
- 5:30 [bad] Inject overdue: "Inject 1 — Asset inventory memo" — the white team scores a late deliverable at zero.
- 5:30 [bad] Inject overdue: "Inject 5 — Change request for the scored account" — the white team scores a late deliverable at zero.
- 7:00 [inject] New inject from CEO: "Inject 4 — Incident report" (due in 5 min).
- 7:30 [bad] Inject overdue: "Inject 2 — New teller account (least privilege)" — the white team scores a late deliverable at zero.
- 7:30 [red] Red team wave 2: exploiting what is still open.
- 7:30 [bad] Compromise confirmed on edge-fw: Edge firewall allows any-to-any inbound.
- 7:30 [bad] Compromise confirmed on dc01: Print Spooler running on the domain controller.
- 7:30 [bad] Compromise confirmed on dc01: Guest account re-enabled and placed in Account Operators.
- 7:30 [bad] Compromise confirmed on app01: The .git folder is exposed in the web root (leaks DB credentials).
- 7:30 [bad] Compromise confirmed on app01: Attacker persistence: a root cron re-running a planted script.
- 7:30 [bad] Compromise confirmed on db01: PostgreSQL trusts any host with no password, on every interface.
- 7:30 [bad] Compromise confirmed on ws01: Planted local administrator account on the teller workstation.
- 8:30 [bad] SLA violation: DNS missed 3 checks in a row.
- 8:30 [bad] SLA violation: Member database (PostgreSQL) missed 3 checks in a row.
- 10:00 [bad] SLA violation: DNS missed 3 checks in a row.
- 10:00 [bad] SLA violation: Member database (PostgreSQL) missed 3 checks in a row.
- 10:30 [bad] Inject overdue: "Inject 3 — Core-banking vendor access request" — the white team scores a late deliverable at zero.
- 11:30 [bad] SLA violation: DNS missed 3 checks in a row.
- 11:30 [bad] SLA violation: Member database (PostgreSQL) missed 3 checks in a row.
- 12:00 [red] Red team wave 3: persistence + lateral movement to the teller workstation.
- 12:30 [bad] Inject overdue: "Inject 4 — Incident report" — the white team scores a late deliverable at zero.
- 13:00 [bad] SLA violation: DNS missed 3 checks in a row.
- 13:00 [bad] SLA violation: Member database (PostgreSQL) missed 3 checks in a row.
- 14:30 [bad] SLA violation: DNS missed 3 checks in a row.
- 14:30 [bad] SLA violation: Member database (PostgreSQL) missed 3 checks in a row.
