// CPTC hands-on target #4: "Under Pressure Water Authority" — the MWCCDC Invitational network, this time from the
// RED TEAM's seat. Same boxes as the Under Pressure blue-team replay (ccdcLabScenario4.js), but here you run the
// assessment: TYPE recon and exploitation commands in the Kali terminal to find and PROVE each weakness the real
// red team used, then write the report. Everything is fiction (the Water Authority network, 172.20.240.0/24 +
// 172.31.34.0/24, reached from Kali at 172.17.0.2); output is canned and nothing is executed. Secrets, keys and
// payloads are redacted on purpose — this is the recon-and-report half of CPTC, not a weaponisation tutorial.
//
// Each finding carries `discover` (command patterns that confirm it, matched case-insensitively) and `reveal`
// (the canned tool output). The report step rates each on a likelihood×impact matrix and asks for a remediation;
// `refLikelihood`/`refImpact` are the reference rating the grader compares against.

import { RAW_4 } from './cptcRaw4.js';

export const CPTC_LAB_4 = {
  raw: RAW_4,
  id: 'underpressure-redteam-2026',
  client: 'Under Pressure Water Authority',
  engagement: 'Internal network penetration test from a dropped box (Kali at 172.17.0.2), one competition day.',
  clockSeconds: 600,
  prompt: 'redteam@kali:~$',
  scope: [
    'In scope: the 172.20.240.0/24 corp network and the 172.31.34.0/24 edge (the Palo Alto and the VyOS router).',
    'Objective: find and prove the exploitable weaknesses the way the red team did — default credentials, planted keys and backdoors, credential reuse into AD — then report them.',
    'Rules of engagement: prove access with minimal, redacted evidence. Do NOT destroy data or wipe boot images for real; a screenshot of access is the proof CPTC wants.',
    'Out of scope: denial-of-service against scored services, and anything outside the two ranges above.',
  ],

  // Recon that helps but does not, by itself, confirm a finding.
  recon: [
    { match: [[/nmap/, /172\.20\.240|172\.31\.34/], 'nmap'], output: [
      'Scanned the edge (172.31.34.0/24) and corp (172.20.240.0/24).',
      'Edge: Palo Alto mgmt on 172.20.240.200 (443/22), VyOS router on 172.31.34.2 (22, publickey+password).',
      'Inside, straight through the firewall: web store, mail, Splunk, the DC (445/5985) and the SQL box (135/445/5985).',
      'Next: try the firewall factory login, the router SSH key, and crackmapexec the Windows hosts.',
    ] },
    { match: ['crackmapexec', 'netexec', 'nxc', 'enum4linux'], output: [
      'SMB  172.20.240.100  DC01   (domain:underpressure.local, signing:True)',
      'SMB  172.20.240.120  SQL01  (signing:False, WinRM 5985 open)',
      'Next: spray recovered service-account creds, and check which accounts are in Domain Admins.',
    ] },
  ],

  findings: [
    {
      id: 'vyos-backdoor', title: 'Router accepts a planted SSH key and its factory password', system: 'Edge / VyOS 172.31.34.2',
      category: 'Backdoor / default credentials',
      discover: [[/ssh|hydra|ncrack/, /172\.31\.34\.2|vyos/], [/nmap/, /172\.31\.34\.2/, /ssh-auth|publickey|22/]],
      reveal: RAW_4.findings['vyos-backdoor'][0].out,
      evidence: 'The router accepts a planted SSH key with no password (and still accepts its factory password on every interface). That yields the operator console and control of the boot image.',
      businessImpact: 'This is the crown jewel: whoever holds the router holds the path to every scored service. The real red team used it to take the console and overwrite the boot disk, dropping the whole network.',
      refLikelihood: 'High', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'remove the planted authorized key and rotate the router credentials', re: /(remov|delet|rotat|chang)[^.]{0,40}(key|authorized|password|credential)/i },
          { label: 'restrict SSH to a management interface/subnet only', re: /(restrict|limit|mgmt|management)[^.]{0,30}(ssh|interface|subnet|address)|source[- ]address/i },
          { label: 'require key-based auth with known keys (no factory password)', re: /disabl[^.]{0,20}password|key[- ]based|known keys/i },
        ],
        wrong: [
          { label: 'changing the SSH port is obscurity, not a fix', re: /(chang|mov)[^.]{0,20}port|non-?standard port/i },
        ],
      },
      modelRemediation: 'Remove the planted key, rotate the router credentials, bind SSH to the management interface only, and disable password authentication.',
    },
    {
      id: 'pa-default-admin', title: 'Firewall still uses its factory administrator password', system: 'Edge / Palo Alto 172.20.240.200',
      category: 'Default credentials',
      discover: [[/curl|login|ssh|admin/, /172\.20\.240\.200|pa-vm|changeme/]],
      reveal: RAW_4.findings['pa-default-admin'][0].out,
      evidence: 'The PAN-OS management UI and SSH accept the factory administrator account (admin / the shipped default), granting superuser control of the firewall.',
      businessImpact: 'Full control of the edge firewall: an attacker can add their own allow rules, read the config, and disable logging — from the internet-reachable management plane.',
      refLikelihood: 'High', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'change the admin password from the factory default', re: /(chang|rotat|replac|set)[^.]{0,30}(password|admin|credential)/i },
          { label: 'restrict management access to a dedicated subnet', re: /(restrict|limit|mgmt|management)[^.]{0,30}(access|interface|subnet|profile)|permitted ip/i },
          { label: 'add individual admin accounts / MFA, disable shared factory account', re: /\bmfa\b|individual (admin )?accounts?|per-?user|disable[^.]{0,20}(shared|factory|default)/i },
        ],
        wrong: [
          { label: 'a longer password on the same shared factory account is not enough', re: /longer password|strong(er)? password only|just[^.]{0,15}password/i },
        ],
      },
      modelRemediation: 'Change the admin password, lock management to a dedicated subnet with a permitted-IP list, and add per-user admin accounts with MFA instead of the shared factory account.',
    },
    {
      id: 'pa-permit-any', title: 'Firewall has an any-any allow rule exposing the inside', system: 'Edge / Palo Alto 172.20.240.200',
      category: 'Firewall misconfiguration',
      discover: [[/nmap|show|policy|rule/, /172\.20\.240\.(100|120)|3389|5985|445|tool23t/], [/nmap/, /5985|445|3389/]],
      reveal: RAW_4.findings['pa-permit-any'][0].out,
      evidence: 'A temporary any-any allow rule (TOOL23T) sits at the top of the policy, so internal ports — RDP, SMB and WinRM on the Windows hosts — are reachable from outside.',
      businessImpact: 'The firewall provides no segmentation: every inside service is directly attackable. This is what let the external recon reach the DC and SQL box at all.',
      refLikelihood: 'High', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'remove the any-any rule', re: /(remov|delet|disabl)[^.]{0,30}(any|permit|allow|rule|tool23t)/i },
          { label: 'allow only required services least-privilege, deny by default', re: /least[- ]privilege|only[^.]{0,30}(required|needed|necessary)|deny[^.]{0,15}default|explicit (allow|rules)/i },
          { label: 'block inbound RDP/SMB/WinRM from outside', re: /(block|deny)[^.]{0,30}(rdp|smb|winrm|3389|445|5985|inbound)/i },
        ],
        wrong: [
          { label: 'logging the any-any rule is not a fix — it must be removed', re: /(enabl|turn on|add)[^.]{0,15}log/i, unless: /also|in addition|as well/i },
        ],
      },
      modelRemediation: 'Delete the any-any rule, rebuild the policy as deny-by-default with explicit least-privilege allows, and block inbound RDP/SMB/WinRM. Turning on logging is not a substitute for removing the rule.',
    },
    {
      id: 'dc-svc-da', title: 'Service account is a Domain Admin and its password is reusable', system: 'Internal / DC01 172.20.240.100',
      category: 'Privilege escalation (credential reuse)',
      discover: [[/crackmapexec|netexec|nxc|evil-winrm|bloodhound/, /svc-splunk|172\.20\.240\.100|domain admins/], [/net (group|user)/, /domain admins|svc-splunk/]],
      reveal: RAW_4.findings['dc-svc-da'][0].out,
      evidence: 'The svc-splunk service account is in Domain Admins and Enterprise Admins, and its password — recoverable from the Splunk server — logs straight into the domain controller as a Domain Admin.',
      businessImpact: 'This is the privilege-escalation chain: a foothold on one Linux box leads to full control of Active Directory. Over-privileged, reused service-account credentials are how the whole domain fell.',
      refLikelihood: 'High', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'remove the service account from Domain/Enterprise Admins (least privilege)', re: /(remov|take)[^.]{0,40}(domain admin|enterprise admin|privileged group)|least[- ]privilege/i },
          { label: 'rotate the service-account password and stop reusing it', re: /(rotat|chang|reset)[^.]{0,30}(password|credential)|stop[^.]{0,15}reus|unique (password|credential)/i },
          { label: 'use a gMSA / tiered admin model', re: /gmsa|managed service account|tier(ed|ing)?|separate[^.]{0,20}admin/i },
        ],
        wrong: [
          { label: 'just renaming the account does not remove its privilege', re: /renam(e|ing) the account/i },
        ],
      },
      modelRemediation: 'Remove svc-splunk from Domain Admins and Enterprise Admins (least privilege, granting only the rights Splunk needs), rotate the password and stop reusing it across hosts, and move to a gMSA with a tiered-admin model.',
    },
    {
      id: 'splunk-backdoor-user', title: 'Backdoor Linux account with passwordless sudo', system: 'Internal / Splunk 172.20.240.20',
      category: 'Backdoor account',
      discover: [[/ssh|sudo/, /svc-chrony|172\.20\.240\.20/], [/sudo -l/]],
      reveal: RAW_4.findings['splunk-backdoor-user'][0].out,
      evidence: 'A rogue local account (svc-chrony) has NOPASSWD:ALL sudo, so logging in as it gives instant root on the Splunk server.',
      businessImpact: 'Root on the Splunk box means the attacker reads the logs meant to catch them and pulls the stored service-account credentials used to reach the DC.',
      refLikelihood: 'High', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'remove the backdoor account', re: /(remov|delet|disabl)[^.]{0,30}(account|user|svc-chrony)/i },
          { label: 'remove the NOPASSWD sudoers entry', re: /(remov|fix|audit)[^.]{0,20}sudo|nopasswd/i },
          { label: 'audit all local accounts and sudoers', re: /audit[^.]{0,30}(account|user|sudo)|review[^.]{0,20}(account|sudoers)/i },
        ],
        wrong: [
          { label: 'just setting a password on the backdoor account leaves the access', re: /(set|add)[^.]{0,20}password[^.]{0,20}(svc-chrony|account)/i },
        ],
      },
      modelRemediation: 'Delete the backdoor account, remove the NOPASSWD sudoers rule, and audit every local account and sudoers entry across the Linux hosts.',
    },
    {
      id: 'splunk-ssh-keys', title: 'Hidden AuthorizedKeysFile allows passwordless login as any user', system: 'Internal / Splunk 172.20.240.20',
      category: 'Backdoor / persistence',
      discover: [[/sshd_config|\/etc\/ssh|authorizedkeys|grep/, /ssh|key|splunk/]],
      reveal: RAW_4.findings['splunk-ssh-keys'][0].out,
      evidence: 'sshd is configured with AuthorizedKeysFile /etc/ssh/.ssh/%u — a hidden directory holding planted keys for root and other users, so a planted key logs in as anyone with no password.',
      businessImpact: 'A durable backdoor that survives a user password reset: the defender can rotate every password and the attacker still walks in by key.',
      refLikelihood: 'High', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'reset AuthorizedKeysFile to the default (~/.ssh) and remove the hidden keys', re: /(reset|restor|default|remov|delet)[^.]{0,40}(authorizedkeys|\/etc\/ssh|\.ssh|key)/i },
          { label: 'audit authorized_keys for every account', re: /audit[^.]{0,30}(authorized|keys)|review[^.]{0,20}keys/i },
          { label: 'restart sshd after fixing the config', re: /restart[^.]{0,15}(ssh|sshd)/i },
        ],
        wrong: [
          { label: 'rotating passwords does not remove a key-based backdoor', re: /(rotat|chang|reset)[^.]{0,20}password/i, unless: /also|in addition|as well|and/i },
        ],
      },
      modelRemediation: 'Point AuthorizedKeysFile back at ~/.ssh, delete /etc/ssh/.ssh, audit authorized_keys on every account, and restart sshd. Password rotation alone leaves the key backdoor in place.',
    },
    {
      id: 'linux-persistence', title: 'Root implant with cron and profile persistence that wipes the firewall', system: 'Internal / Linux hosts (ecom, email, splunk)',
      category: 'Persistence / defense evasion',
      discover: [[/scoringengine|crontab|cron|\/etc\/profile|ls -la/, /bin|cron|profile|scoring/]],
      reveal: RAW_4.findings['linux-persistence'][0].out,
      evidence: 'A setuid-root implant (/bin/scoringengine) is kept alive by cron and /etc/profile, which also flush the host firewall every minute — so any defensive rule is undone within 60 seconds.',
      businessImpact: 'The attacker keeps a root foothold on the public-facing Linux hosts and neutralises the defender\'s firewall changes, buying time for the rest of the intrusion.',
      refLikelihood: 'Medium', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'remove the implant binary and its cron/profile entries', re: /(remov|delet|kill)[^.]{0,40}(implant|binary|scoringengine|cron|profile)/i },
          { label: 'stop the firewall-flush job before re-applying firewall rules', re: /(remov|stop|disabl)[^.]{0,30}(flush|iptables -f|cron)[^.]{0,20}|order[^.]{0,20}firewall/i },
          { label: 'hunt the same persistence on the other hosts / rebuild if unsure', re: /(hunt|check|sweep|other hosts|rebuild|reimage)/i },
        ],
        wrong: [
          { label: 'adding firewall rules first is wasted while the flush cron runs', re: /(add|apply)[^.]{0,20}(firewall|iptables)[^.]{0,20}first/i },
        ],
      },
      modelRemediation: 'Remove the implant and its cron/profile launchers, delete the firewall-flush cron FIRST, then re-apply firewall rules; sweep the other Linux hosts for the same persistence and reimage anything uncertain.',
    },
    {
      id: 'mssql-exposed', title: 'SQL server exposes WinRM and RPC to the outside', system: 'Internal / SQL01 172.20.240.120',
      category: 'External exposure',
      discover: [[/evil-winrm|winrm|crackmapexec|netexec|nxc|rpcclient/, /172\.20\.240\.120|5985|135/], [/nmap/, /172\.20\.240\.120/, /5985|135|winrm/]],
      reveal: RAW_4.findings['mssql-exposed'][0].out,
      evidence: 'The SQL box answers WinRM (5985) and RPC (135) from outside; valid local-admin credentials give remote command execution and access to the operations (SOP) file share.',
      businessImpact: 'Remote code execution as a local administrator on the database server, and exposure of internal operating procedures — a strong pivot deeper into the network.',
      refLikelihood: 'High', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'block WinRM/RPC from untrusted networks (firewall / segmentation)', re: /(block|restrict|firewall|segment)[^.]{0,40}(winrm|5985|rpc|135|smb)/i },
          { label: 'limit remote management to admin jump hosts', re: /jump (host|box)|bastion|admin (host|workstation)|restrict[^.]{0,20}management/i },
          { label: 'rotate the local admin password / enforce LAPS', re: /laps|rotat[^.]{0,20}(local admin|password)|unique local admin/i },
        ],
        wrong: [
          { label: 'disabling SQL Server does not address the WinRM/RPC exposure', re: /disabl[^.]{0,20}sql server|turn off (the )?database/i },
        ],
      },
      modelRemediation: 'Firewall WinRM and RPC off untrusted networks, allow remote management only from admin jump hosts, and enforce LAPS so the local admin password is unique and rotated.',
    },
    {
      id: 'wkst-default', title: 'Workstation trusts a shared lab key and a default password', system: 'Internal / Ubuntu-Wkst 172.20.240.5',
      category: 'Default credentials',
      discover: [[/ssh|172\.20\.240\.5|wkst/, /-i |cyberrange|key|default/]],
      reveal: RAW_4.findings['wkst-default'][0].out,
      evidence: 'The Ubuntu workstation accepts a shared "cyberrange-lab" SSH key (and the packet default password), giving an inside foothold from which to reach the servers.',
      businessImpact: 'A low-friction entry point on the LAN: once inside, the attacker reaches the Linux and Windows servers that the perimeter was supposed to protect.',
      refLikelihood: 'Medium', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'remove the shared key and change the default password', re: /(remov|delet)[^.]{0,30}(key|authorized)|(chang|reset)[^.]{0,20}(default )?password/i },
          { label: 'issue per-user credentials, no shared accounts', re: /per-?user|individual (account|credential)|no shared|unique (account|credential)/i },
          { label: 'restrict which hosts the workstation can reach (segmentation)', re: /segment|restrict[^.]{0,30}(workstation|lan|server)|\bvlan\b|\bacl\b/i },
        ],
        wrong: [
          { label: 'keeping the shared key but adding a passphrase still leaves it shared', re: /passphrase on the (shared|same) key|keep the shared key/i },
        ],
      },
      modelRemediation: 'Remove the shared cyberrange-lab key, change the default password, issue per-user credentials, and segment the workstation away from the server subnet.',
    },
  ],

  // The executive summary is graded on what leadership needs, not on length.
  execRubric: {
    need: [
      { label: 'business risk in plain language (water utility / full domain takeover)', re: /water|utility|domain|takeover|business|operations|safety|public/i },
      { label: 'names the router/firewall edge compromise', re: /router|firewall|palo alto|edge|vyos/i },
      { label: 'names the default-credential / backdoor theme', re: /default (password|credential)|backdoor|factory/i },
      { label: 'names the credential-reuse path to Domain Admin', re: /domain admin|credential reuse|service account|svc-splunk|active directory/i },
      { label: 'a timeframe and the outcome once fixed', re: /\b\d+\s*(hours?|days?|weeks?)\b|immediately|within|(once|after)[^.]{0,40}(fix|remediat|closed)/i },
    ],
    wrong: [
      { label: 'jargon leadership cannot act on (ports, CVSS, CVE ids)', re: /cvss|\/tcp\b|port \d{2,5}|cve-\d/i },
    ],
  },
  execModel: 'A winning executive summary leads with business risk in plain language — a water utility whose entire network and Active Directory fell in one day — names the edge compromise (router + firewall on factory credentials), the backdoor/default-credential theme, and the reused over-privileged service account that handed over Domain Admin, then gives a timeframe and the outcome once fixed. No ports, CVSS or CVE jargon; and it does not soft-pedal the domain takeover.',
};

export default CPTC_LAB_4;
