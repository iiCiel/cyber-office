// CPTC hands-on target: "Meridian Health Partners" — a fictional regional healthcare provider your team is
// paid to penetration-test. You PLAY the test: type recon and exploitation commands in the Kali terminal to
// discover each weakness, then write the report from what you found. Everything is fiction — RFC 5737
// (198.51.100.0/24) and *.example (RFC 2606) hosts, canned output, nothing executed.
//
// Each finding carries `discover` (the command patterns that confirm it, matched case-insensitively) and
// `reveal` (the canned tool output). The report step rates each on a likelihood×impact matrix and asks for a
// remediation; `refLikelihood`/`refImpact` are the reference rating the grader compares against.

export const CPTC_LAB = {
  id: 'meridian-lab-2026',
  client: 'Meridian Health Partners',
  engagement: 'External + internal network penetration test, two weeks, remote.',
  clockSeconds: 600,
  prompt: 'assessor@kali:~$',
  scope: [
    'In scope: the 198.51.100.0/24 external range and the corp.meridian.example internal domain.',
    'Out of scope: the clinical-devices VLAN and any third-party SaaS. Do not touch medical devices.',
    'Objective: find and prove the exploitable weaknesses, then report them. Do NOT exfiltrate real patient data — minimal, redacted proof only.',
    'Email phishing is allowed; phone/in-person social engineering is not.',
  ],

  // Recon commands that help but do not, by themselves, confirm a finding.
  recon: [
    { match: [[/nmap/, /198\.51\.100/]], output: [
      'Starting Nmap 7.94 ( https://nmap.org )',
      'Nmap scan report for edge.meridian.example (198.51.100.20)',
      '  PORT     STATE SERVICE',
      '  3389/tcp open  ms-wbt-server   <- Remote Desktop, open to the internet',
      'Nmap scan report for portal.meridian.example (198.51.100.25)',
      '  443/tcp  open  https           <- patient portal',
      'Nmap scan report for www.meridian.example (198.51.100.30)',
      '  443/tcp  open  https           <- marketing site (TLS 1.0 accepted)',
      'Nmap done: 256 IP addresses (3 hosts up) scanned',
      'Next: enumerate each service (try rdp on 198.51.100.20, the portal login, sslscan the www host).',
    ] },
    { match: [[/nmap/, /10\.20\.0/], [/nmap/, /corp\.meridian/], 'enum4linux', 'crackmapexec', 'netexec'], output: [
      'Internal sweep (corp.meridian.example / 10.20.0.0/16):',
      '  10.20.0.15  fileserver01   445/tcp open  microsoft-ds',
      '  10.20.0.40  printvlan-gw   161/udp open  snmp',
      'Next: smbclient -L the fileserver, and snmpwalk the printer VLAN.',
    ] },
  ],

  findings: [
    {
      id: 'ext-rdp', title: 'Remote Desktop exposed directly to the internet', system: 'Edge / 198.51.100.20',
      category: 'External exposure',
      discover: [[/rdp|hydra|xfreerdp|ncrack/, /198\.51\.100\.20|3389/], [/nmap/, /3389/, /-sv|script|p 3389/]],
      reveal: [
        'xfreerdp /v:198.51.100.20 — RDP negotiation OK; NLA enabled, no MFA.',
        'Server accepts domain credentials. No VPN or gateway in front of 3389/tcp.',
        'Exposure confirmed: internet-facing RDP accepting domain logons — the top ransomware entry point in healthcare.',
      ],
      evidence: 'RDP (TCP 3389) reachable from the internet on a server that accepts domain credentials. No MFA, no VPN.',
      businessImpact: 'An internet-facing RDP with domain logon is the most common ransomware entry point in healthcare. One guessed/phished password = an interactive domain foothold.',
      refLikelihood: 'High', refImpact: 'High',
      modelRemediation: 'Remove RDP from the internet; require VPN with MFA for remote access. Moving the port or just lengthening the password does not fix the exposure.',
    },
    {
      id: 'sql-injection', title: 'SQL injection in the patient-portal login', system: 'Web / portal.meridian.example',
      category: 'Web application (OWASP A03)',
      discover: [[/sqlmap|curl|'|%27|union|or 1=1/, /portal|login|198\.51\.100\.25/], [/sqlmap/, /portal/]],
      reveal: [
        "POST /login  user=admin'--  -> the app returned rows from another table.",
        'sqlmap: parameter "user" is injectable (boolean-based + UNION). back-end DBMS: MySQL.',
        'A single quote altered the query logic — the login concatenates input straight into SQL (OWASP A03).',
        'Minimal proof only: confirmed a row count; did NOT dump patient data (out of scope).',
      ],
      evidence: 'The login form concatenates user input into a SQL query; an assessor-supplied value altered the query and returned data from other tables.',
      businessImpact: 'The portal fronts patient records. Injection here can read or modify the patient database — a reportable PHI breach.',
      refLikelihood: 'High', refImpact: 'High',
      modelRemediation: 'Use parameterised queries / prepared statements and validate input server-side. A WAF is defence-in-depth, not a fix; blocklisting characters is trivially bypassed.',
    },
    {
      id: 'smb-share', title: 'Open file share exposing an HR spreadsheet', system: 'Internal / fileserver 10.20.0.15',
      category: 'Access control',
      discover: [[/smbclient|smbmap|smb/, /10\.20\.0\.15|fileserver/], [/smbclient/, /\\\\|list|-l/]],
      reveal: [
        'smbclient -L //10.20.0.15 -N  ->  share "HR$" readable by Authenticated Users.',
        'Found: \\HR\\staff_salaries_2026.xlsx — names, salaries, SSNs. Readable by every domain user.',
        'Captured a redacted screenshot as proof; did not copy the file.',
      ],
      evidence: 'An SMB share is readable by every domain user and contains a spreadsheet of staff salaries and SSNs.',
      businessImpact: 'Any employee or any attacker with any domain foothold can read sensitive HR data. High impact, but needs a foothold or valid account first.',
      refLikelihood: 'Medium', refImpact: 'High',
      modelRemediation: 'Restrict the share to the HR group and audit access; move the file to a controlled location. A hidden ($) share is still readable; disk encryption is the wrong control.',
    },
    {
      id: 'default-snmp', title: 'Network printers answer to a default SNMP community string', system: 'Internal / printer VLAN',
      category: 'Default credentials',
      discover: [[/snmp|snmpwalk|onesixtyone/, /public|161|10\.20\.0\.40|printer/]],
      reveal: [
        'snmpwalk -v2c -c public 10.20.0.40  ->  responds. Community "public" (default) accepted.',
        'Leaks device config and cached document metadata; a useful internal recon pivot.',
      ],
      evidence: 'Office multifunction printers respond to the "public" SNMP community, leaking device config and cached document metadata.',
      businessImpact: 'Information leakage and a possible pivot/recon aid on the internal network. Needs internal access; impact is moderate.',
      refLikelihood: 'Medium', refImpact: 'Medium',
      modelRemediation: 'Change or disable the SNMP community strings and segment the printer VLAN. Replacing the printers is unnecessary; the configuration is the problem.',
    },
    {
      id: 'weak-tls', title: 'Marketing site supports an outdated TLS version', system: 'External / www.meridian.example',
      category: 'Cryptography',
      discover: [[/sslscan|sslyze|testssl|openssl/, /www|198\.51\.100\.30|tls/]],
      reveal: [
        'sslscan www.meridian.example  ->  TLS 1.0  enabled (deprecated).  TLS 1.2 / 1.3 also offered.',
        'Static brochure site: no logins, no patient data behind it.',
      ],
      evidence: 'The public brochure site still negotiates TLS 1.0. It hosts no logins and no patient data.',
      businessImpact: 'A dated protocol on a static marketing site. Real but low: no sensitive data flows through it, and exploitation needs a privileged network position.',
      refLikelihood: 'Low', refImpact: 'Low',
      modelRemediation: 'Disable TLS 1.0/1.1; serve TLS 1.2+ only. Rate it honestly as Low and fix it anyway — do not inflate every crypto finding, and do not rebuild the whole site for a config change.',
    },
  ],

  execModel: 'A winning executive summary leads with business risk in plain language (an elevated risk of a patient-data breach), names the two critical issues — internet-exposed RDP and portal SQL injection — quantifies urgency (remediate within 72 hours), and states the outcome once fixed. No ports, CVSS vectors or jargon the board cannot act on; and it does not soft-pedal the critical findings behind reassurance.',
};

export default CPTC_LAB;
