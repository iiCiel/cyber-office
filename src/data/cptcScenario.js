// CPTC scenario: "Meridian Health Partners" — a fictional regional healthcare provider that hired your team
// for a penetration test. The testing is done; you are now writing the report, which is what CPTC actually
// scores. Everything is invented: no real client, no real systems, documentation-only hosts. Each finding is
// written at report altitude — "we identified this weakness, here is the business risk, here is the fix" —
// which is exactly the deliverable a pentester is paid for. No exploit steps live here; the learning is risk
// rating, remediation quality, scope judgment and executive writing.

export const CPTC_SCENARIO = {
  id: 'meridian-health-2026',
  client: 'Meridian Health Partners',
  engagement: 'External + internal network penetration test, two-week engagement, remote.',
  scopeNote: 'In scope: the 198.51.100.0/24 external range and the corp.meridian.example internal domain. Out of scope: the clinical devices VLAN and any third-party SaaS. Social engineering: email phishing allowed, phone/in-person not authorised.',

  clockSeconds: 600, // competition mode: a real 10-minute countdown; at 0:00 the report is handed in as it stands

  // Rules-of-engagement judgment calls. These mirror the on-the-spot decisions CPTC judges watch for: a team
  // that oversteps scope or mishandles sensitive data loses more than points.
  roe: [
    {
      id: 'out-of-scope-host',
      title: 'An interesting host outside your scope',
      situation: 'During internal testing you notice a clinical imaging server on the out-of-scope devices VLAN that looks trivially vulnerable. Exploiting it would be an easy, impressive finding.',
      choices: [
        { id: 'stop-note', label: 'Do not touch it. Note in the report that the VLAN was out of scope and recommend it be included in a future assessment.', correct: true, feedback: 'Correct. Scope is a contract. You flag the risk and recommend expanding scope — you never test what you were not authorised to test, especially medical devices.' },
        { id: 'quick-test', label: 'Just run a quick, careful check — if it is that easy, the client needs to know now.', partial: 0, feedback: 'No. "Careful" testing of an out-of-scope clinical system is still unauthorised, and on a medical VLAN it can endanger patients. Document and recommend, do not test.' },
        { id: 'ignore', label: 'Ignore it entirely and leave it out of the report.', partial: 0.3, feedback: 'You respected scope, but you also observed a real risk. The professional move is to note it (without testing) so the client can act.' },
      ],
    },
    {
      id: 'patient-data',
      title: 'You can reach real patient records',
      situation: 'A misconfiguration lets you list a database containing real patient names and diagnoses. Proving access needs some evidence.',
      choices: [
        { id: 'minimal-proof', label: 'Capture the minimum evidence (a row count and redacted screenshot), stop, and notify the client contact immediately.', correct: true, feedback: 'Correct. Prove access with the least sensitive evidence possible, do not exfiltrate PHI, and tell the client right away — sensitive-data exposure is an immediate-notification item.' },
        { id: 'download', label: 'Download a copy of the table as proof and attach it to the report.', partial: 0, feedback: 'Never exfiltrate real patient data. That turns your test into the breach. Minimal, redacted proof only.' },
        { id: 'keep-testing', label: 'Keep going quietly — report it all at the end with full detail.', partial: 0.2, feedback: 'Critical PHI exposure is an immediate-notification finding, not an end-of-engagement surprise. Stop and tell the client.' },
      ],
    },
    {
      id: 'prod-ransomware-poc',
      title: 'Proving impact on a production server',
      situation: 'To demonstrate a critical flaw on a production billing server, you could run a destructive proof-of-concept that would briefly take the server down.',
      choices: [
        { id: 'safe-poc', label: 'Demonstrate impact with a safe, non-destructive proof and describe the worst case in the report.', correct: true, feedback: 'Correct. You show the risk without harming production. The report explains the full impact; the test does not cause it.' },
        { id: 'destructive', label: 'Run the destructive PoC briefly — impact findings need to be undeniable.', partial: 0, feedback: 'Taking down a production billing system is damage, not a demonstration. Prove impact safely; narrate the worst case in writing.' },
        { id: 'after-hours', label: 'Run it after hours without telling anyone.', partial: 0, feedback: 'Unannounced destructive testing, any hour, is outside the rules. Coordinate and keep PoCs non-destructive.' },
      ],
    },
  ],

  findings: [
    {
      id: 'ext-rdp',
      title: 'Remote Desktop exposed directly to the internet',
      system: 'Edge / 198.51.100.20',
      category: 'External exposure',
      evidence: 'RDP (TCP 3389) is reachable from the internet on a server that also accepts domain credentials. No MFA, no VPN in front of it.',
      businessImpact: 'An internet-facing RDP with domain logon is the single most common ransomware entry point in healthcare. One guessed or phished password and an attacker has an interactive foothold on the domain.',
      refLikelihood: 'High',
      refImpact: 'High',
      riskRationale: 'High likelihood (RDP brute-forcing is constant and automated) x High impact (domain foothold, ransomware) = Critical.',
      remediations: [
        { id: 'vpn-mfa', label: 'Remove RDP from the internet; require VPN with MFA for remote access.', correct: true, note: 'Roots out the exposure: no direct internet RDP, strong auth in front.' },
        { id: 'change-port', label: 'Move RDP to a non-standard port.', partial: 0, note: 'Port obscurity stops nothing — scanners find it in minutes. The service is still exposed.' },
        { id: 'strong-pw', label: 'Enforce a longer password on the server.', partial: 0.3, note: 'Helps at the margin but leaves RDP open to the world. The exposure, not just the password, is the problem.' },
      ],
    },
    {
      id: 'sql-injection',
      title: 'SQL injection in the patient-portal login',
      system: 'Web / portal.meridian.example',
      category: 'Web application (OWASP A03)',
      evidence: 'The login form concatenates user input into a SQL query. An assessor-supplied value altered the query logic and returned data from other tables.',
      businessImpact: 'The portal fronts patient records. Injection here can read or modify the patient database — a reportable PHI breach with regulatory and reputational cost.',
      refLikelihood: 'High',
      refImpact: 'High',
      riskRationale: 'High likelihood (injection on an internet-facing login is heavily targeted) x High impact (patient database) = Critical.',
      remediations: [
        { id: 'param', label: 'Use parameterised queries / prepared statements, and validate input server-side.', correct: true, note: 'Fixes the root cause: data is never parsed as SQL. The durable fix.' },
        { id: 'waf', label: 'Put a web application firewall in front of the portal.', partial: 0.3, note: 'A WAF is useful defence-in-depth but filters can be bypassed. It does not fix the vulnerable code.' },
        { id: 'escape', label: 'Blocklist the apostrophe character in the login field.', partial: 0, note: 'Character blocklists are trivially evaded and break legitimate input. Parameterise instead.' },
      ],
    },
    {
      id: 'smb-share',
      title: 'Open file share exposing an HR spreadsheet',
      system: 'Internal / fileserver 10.20.0.15',
      category: 'Access control',
      evidence: 'An SMB share is readable by every domain user and contains a spreadsheet of staff salaries and SSNs.',
      businessImpact: 'Any employee (or any attacker with any domain foothold) can read sensitive HR data. High impact, but it requires a foothold or valid account first.',
      refLikelihood: 'Medium',
      refImpact: 'High',
      riskRationale: 'Medium likelihood (needs some access first, not internet-facing) x High impact (SSNs, salaries) = High.',
      remediations: [
        { id: 'least-priv', label: 'Restrict the share to the HR group and audit access; move the file to a controlled location.', correct: true, note: 'Least privilege: only HR can read HR data, with an audit trail.' },
        { id: 'hide-share', label: 'Make the share hidden (append $ to the name).', partial: 0, note: 'A hidden share is still readable by everyone who can enumerate it. Fix the permissions, not the visibility.' },
        { id: 'encrypt-disk', label: 'Enable full-disk encryption on the file server.', partial: 0.2, note: 'Disk encryption protects a stolen drive, not a logged-in user reading an over-shared folder. Wrong control for this risk.' },
      ],
    },
    {
      id: 'weak-tls',
      title: 'Marketing site supports an outdated TLS version',
      system: 'External / www.meridian.example',
      category: 'Cryptography',
      evidence: 'The public brochure site still negotiates TLS 1.0. The site hosts no logins and no patient data.',
      businessImpact: 'A dated protocol on a static marketing site. Real but low: no sensitive data flows through it, and exploitation needs a privileged network position.',
      refLikelihood: 'Low',
      refImpact: 'Low',
      riskRationale: 'Low likelihood (needs a man-in-the-middle position) x Low impact (no sensitive data) = Low. Resist the urge to inflate every crypto finding.',
      remediations: [
        { id: 'disable-old-tls', label: 'Disable TLS 1.0/1.1; serve TLS 1.2+ only.', correct: true, note: 'Simple, correct hygiene fix. Rate it honestly as Low and fix it anyway.' },
        { id: 'rebuild', label: 'Rebuild the marketing site on a new platform.', partial: 0, note: 'Wildly disproportionate to a config change. Remediation should match the risk.' },
        { id: 'nothing', label: 'No action — it is only the marketing site.', partial: 0.3, note: 'It is low risk, but disabling a deprecated protocol is a trivial, standard fix worth doing.' },
      ],
    },
    {
      id: 'default-snmp',
      title: 'Network printers answer to a default SNMP community string',
      system: 'Internal / printer VLAN',
      category: 'Default credentials',
      evidence: 'Office multifunction printers respond to the "public" SNMP community, leaking device config and some cached document metadata.',
      businessImpact: 'Information leakage and a possible pivot/recon aid on the internal network. Needs internal access; impact is moderate, not catastrophic.',
      refLikelihood: 'Medium',
      refImpact: 'Medium',
      riskRationale: 'Medium likelihood (internal, common and easily found) x Medium impact (info leak, recon aid) = Medium.',
      remediations: [
        { id: 'change-community', label: 'Change or disable the SNMP community strings; segment the printer VLAN.', correct: true, note: 'Removes the default and limits blast radius with segmentation.' },
        { id: 'replace-printers', label: 'Replace all the printers.', partial: 0, note: 'The printers are fine; the configuration is the problem. Reconfigure, do not re-buy.' },
        { id: 'ignore', label: 'Accept the risk — printers are harmless.', partial: 0.2, note: 'Printers are a classic internal foothold and recon source. A default community string is worth fixing.' },
      ],
    },
  ],

  // The player picks the best executive summary. Only one is written the way a board can act on.
  execSummaries: [
    {
      id: 'business',
      label: 'Business-risk framing',
      text: 'Meridian Health Partners faces an immediate, elevated risk of a patient-data breach. Two critical issues — an internet-exposed remote-access service and a SQL injection flaw in the patient portal — each provide a realistic path for an attacker to reach protected health information, with regulatory, financial and reputational consequences. We recommend emergency remediation of both within 72 hours, followed by the access-control and configuration fixes detailed below. With these addressed, Meridian\'s external risk posture would move from high to low.',
      correct: true,
      feedback: 'This is the winning summary: it leads with business risk (patient-data breach), names the critical issues in plain language, quantifies urgency, and gives the board a clear action and outcome. No jargon they cannot act on.',
    },
    {
      id: 'technical',
      label: 'Technical dump',
      text: 'We identified an exposed TCP/3389 endpoint on 198.51.100.20, a SQLi vector in the portal login parameter, an overly permissive SMB ACL on 10.20.0.15, TLS 1.0 negotiation on the www vhost, and default "public" SNMP communities on the MFP VLAN. CVSS vectors and payload notes are in Appendix C.',
      partial: 0.3,
      feedback: 'Accurate but wrong audience. An executive summary full of ports, CVSS vectors and payloads gives the board nothing to decide on. Save the detail for the findings section; lead with business risk.',
    },
    {
      id: 'vague',
      label: 'Reassuring but empty',
      text: 'The assessment found that Meridian\'s security is generally in line with industry norms. Some areas could be improved, and we found a few issues of varying severity. Overall the environment is reasonably secure and the team is doing a good job. Details follow.',
      partial: 0,
      feedback: 'This hides the two critical, breach-grade findings behind reassurance. A summary that soft-pedals real risk is worse than none — the client will not act, and you failed your duty to inform.',
    },
  ],
};

export default CPTC_SCENARIO;
