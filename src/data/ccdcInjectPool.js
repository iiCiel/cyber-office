// The business injects a long round adds to a scenario's own five. Written against the facts of the company in
// play, so the same memo fits a freight broker, a credit union and a clinic. `window` is in competition-clock
// minutes. Rubric items with `verify` check the box: writing "I blocked it" scores nothing unless it is blocked.

const has = (re) => ({ re });

export function injectPool(sc) {
  const co = sc.company;
  const dc = sc.devices.find((d) => /domain controller/i.test(d.name || ''));
  const web = sc.devices.find((d) => d.id === sc.services.find((s) => s.content)?.host) || sc.devices.find((d) => d.kind === 'bash');
  const edge = sc.devices.find((d) => d.kind === 'firewall');
  const leaver = (dc?.ctx?.dir?.all || []).find((u) => u.type === 'user' && u.title)?.sam || 'j.doe';
  const badIp = '198.51.100.77';
  const lower = (s) => String(s || '').toLowerCase();
  const fsHas = (st, dev, path, re) => re.test(st.devState[dev.id]?.fs?.[path] || '');
  return [
    { id: 'p-banner', title: 'Legal login banner', from: 'General Counsel', window: 90,
      prompt: `Counsel requires a legal warning on ${web.host} before anyone logs in. Put an authorized-use warning in /etc/issue.net and confirm by memo that it is live.`,
      model: 'Warning text in /etc/issue.net that says the system is for authorized use only and activity is monitored.',
      rubric: [{ label: `/etc/issue.net on ${web.host} carries a warning`, verify: (st) => fsHas(st, web, '/etc/issue.net', /authori[sz]ed/i) }, { ...has(/authori[sz]ed/i), label: 'states authorized use only' }, { ...has(/monitor/i), label: 'says activity is monitored' }] },
    { id: 'p-leaver', title: 'Employee termination', from: 'HR', window: 45,
      prompt: `${leaver} was let go this morning. Disable the account now and tell HR what was done and when.`,
      model: 'The AD account is disabled (not deleted, for records), with the time and who did it.',
      rubric: [{ label: `${leaver} is disabled in AD`, verify: (st) => { const d = st.devState[dc.id]?.dir; return !!d && d.lookup(leaver)?.enabled === false; } }, { ...has(/disabl/i), label: 'says the account was disabled' }, { ...has(/\b\d{1,2}:\d{2}\b/), label: 'gives the time' }] },
    { id: 'p-blockip', title: 'Block an abusive address', from: 'SOC vendor', window: 60,
      prompt: `Our SOC vendor reports abuse from ${badIp}. Block it at the edge firewall and reply with the rule you added.`,
      model: `A block rule for ${badIp} placed above the pass rules on the WAN.`,
      rubric: [{ label: `${badIp} is blocked on ${edge?.host}`, verify: (st) => (st.devState[edge?.id]?.firewall?.rules || []).some((r) => (r.action === 'block' && r.from === badIp) || (['deny', 'drop'].includes(r.action) && r.source?.includes(badIp))) }, { ...has(new RegExp(badIp.replace(/\./g, '\\.'))), label: 'names the address' }, { ...has(/block|deny|drop/i), label: 'describes the rule' }] },
    { id: 'p-backup', title: 'Back up the website', from: 'Operations Manager', window: 75,
      prompt: `Before any more changes, take a copy of the ${web.host} site into /var/backups and tell Operations what was saved.`,
      model: 'A copy of the site files under /var/backups, with the path and time.',
      rubric: [{ label: `a file exists under /var/backups on ${web.host}`, verify: (st) => Object.keys(st.devState[web.id]?.fs || {}).some((p) => p.startsWith('/var/backups/')) }, { ...has(/\/var\/backups/), label: 'gives the backup path' }, { ...has(/restore|recover/i), label: 'says how it would be restored' }] },
    { id: 'p-tempuser', title: 'Temporary contractor account', from: 'IT Director', window: 60,
      prompt: 'A contractor needs an AD account named contractor1 for the audit. Create it with no admin rights and confirm by memo.',
      model: 'A standard AD user named contractor1, no privileged groups, with an end date.',
      rubric: [{ label: 'contractor1 exists in AD', verify: (st) => !!st.devState[dc.id]?.dir?.lookup('contractor1') }, { ...has(/no admin|non-?admin|least privilege|standard user/i), label: 'no admin rights' }, { ...has(/expire|end date|remove|until/i), label: 'gives an end date' }] },
    { id: 'p-audit', title: 'Turn on logon auditing', from: 'Auditor', window: 75,
      prompt: `The auditor wants successful and failed logons audited on ${dc?.host}. Turn it on and confirm.`,
      model: 'auditpol set for Logon with success and failure enabled.',
      rubric: [{ label: 'logon auditing is on', verify: (st) => !!st.devState[dc.id]?.live?.audit?.logon }, { ...has(/success/i), label: 'covers successful logons' }, { ...has(/fail/i), label: 'covers failed logons' }] },
    ...[
      ['p-pwpolicy', 'Password policy', 'CEO', 120, `Draft a password policy for ${co} staff.`, [[/length|characters/i, 'sets a length'], [/multi-?factor|mfa/i, 'covers MFA'], [/rotat|expire|change/i, 'covers change rules'], [/shar/i, 'forbids sharing']]],
      ['p-aup', 'Acceptable use policy', 'HR', 150, 'Write a short acceptable-use policy for company computers.', [[/personal/i, 'covers personal use'], [/monitor/i, 'says use is monitored'], [/report/i, 'tells staff to report problems'], [/disciplin|consequence|terminat/i, 'gives consequences']]],
      ['p-byod', 'Personal phones at work', 'COO', 120, 'Staff want company email on personal phones. Recommend what we should allow.', [[/mdm|mobile device management|managed/i, 'requires management'], [/wipe/i, 'covers remote wipe'], [/pin|passcode|encrypt/i, 'requires a lock or encryption'], [/recommend/i, 'makes a recommendation']]],
      ['p-phish', 'Phishing warning to staff', 'CEO', 45, 'Staff are getting fake invoices by email. Send them a plain-language warning.', [[/link|attachment/i, 'warns about links or attachments'], [/report|forward/i, 'says how to report'], [/sender|address/i, 'says to check the sender'], [/do not|don.t/i, 'gives a clear instruction']]],
      ['p-patch', 'Patch plan', 'IT Director', 150, `Explain how ${co} should patch its servers from now on.`, [[/critical|severity|priorit/i, 'prioritizes by severity'], [/test/i, 'tests first'], [/window|schedule/i, 'uses a maintenance window'], [/roll ?back|snapshot|backup/i, 'has a way back']]],
      ['p-backups', 'Backup strategy', 'CFO', 150, 'The CFO asks whether we could survive losing the servers. Propose a backup strategy.', [[/3-2-1|offsite|off-site/i, 'keeps a copy offsite'], [/test|restore/i, 'tests restores'], [/daily|nightly|hourly|frequen/i, 'gives a frequency'], [/encrypt/i, 'encrypts backups']]],
      ['p-dr', 'Disaster recovery summary', 'CEO', 180, 'Summarize how the business keeps running if the main office loses power for three days.', [[/rto|recovery time/i, 'sets a recovery time'], [/priorit|critical/i, 'ranks systems'], [/communicat|contact/i, 'covers communication'], [/alternate|cloud|failover|remote/i, 'names an alternate site']]],
      ['p-diagram', 'Network description for the auditor', 'Auditor', 90, 'Describe the network layout in words: zones, what sits in each and how traffic is controlled.', [[/firewall/i, 'covers the firewall'], [/lan|internal/i, 'covers the internal network'], [/wan|internet/i, 'covers the internet edge'], [/port|service/i, 'says what is allowed']]],
      ['p-vendor', 'Vendor risk review', 'COO', 120, 'A new payroll vendor wants our staff data. What should we ask them first?', [[/soc ?2|iso ?27001|certif/i, 'asks for certification'], [/encrypt/i, 'asks about encryption'], [/breach|notif/i, 'asks about breach notice'], [/contract|agreement/i, 'puts it in the contract']]],
      ['p-mfa', 'MFA proposal', 'CEO', 120, 'Propose multi-factor authentication for remote access and say what it costs the business.', [[/multi-?factor|mfa/i, 'proposes MFA'], [/remote|vpn/i, 'covers remote access'], [/cost|\$|budget/i, 'gives a cost'], [/rollout|phase|pilot/i, 'gives a rollout']]],
      ['p-retention', 'Data retention', 'General Counsel', 150, 'Recommend how long we keep email and logs, and why.', [[/days|months|years/i, 'gives periods'], [/legal|regulat|law/i, 'cites a legal reason'], [/delete|dispos|purge/i, 'covers disposal'], [/log/i, 'covers logs']]],
      ['p-logging', 'Central logging plan', 'IT Director', 120, 'Explain how we should collect logs from every server in one place.', [[/siem|splunk|central/i, 'names central logging'], [/forward/i, 'forwards from hosts'], [/retain|retention/i, 'covers retention'], [/alert/i, 'covers alerting']]],
      ['p-fwchange', 'Firewall change justification', 'Auditor', 90, 'Justify the firewall changes made today in terms management can follow.', [[/default.?deny|block/i, 'explains default deny'], [/business|service/i, 'ties it to the business'], [/risk/i, 'names the risk'], [/review/i, 'commits to review']]],
      ['p-ransom', 'Ransomware tabletop', 'CEO', 180, 'Walk the executives through what happens in the first hour of a ransomware attack.', [[/isolat|disconnect|contain/i, 'isolates systems'], [/backup/i, 'checks backups'], [/legal|counsel|insur/i, 'calls legal or insurance'], [/communicat|notify/i, 'covers communication']]],
      ['p-edr', 'Endpoint protection business case', 'CFO', 150, 'Make the case for buying endpoint detection software.', [[/cost|\$|budget/i, 'gives a cost'], [/risk|breach/i, 'names the risk'], [/detect/i, 'explains detection'], [/recommend/i, 'makes a recommendation']]],
      ['p-board', 'Board security summary', 'CEO', 120, 'Write a one-page summary for the board on where security stands today.', [[/risk/i, 'names top risks'], [/improv|fixed|complete/i, 'says what improved'], [/next|plan/i, 'gives next steps'], [/budget|invest|resource/i, 'asks for what is needed']]],
      ['p-awareness', 'Security awareness plan', 'HR', 150, 'Outline a security training plan for non-technical staff.', [[/phish/i, 'covers phishing'], [/quarter|annual|month|frequen/i, 'gives a frequency'], [/measure|track|test/i, 'measures results'], [/new hire|onboard/i, 'covers new hires']]],
      ['p-admins', 'Who has admin rights', 'Auditor', 60, 'List who holds Domain Admin today and say why each one should.', [[/domain admin/i, 'addresses Domain Admins'], [/administrator/i, 'lists the Administrator account'], [/review|quarter/i, 'commits to review'], [/least privilege|remove|need/i, 'justifies access']]],
      ['p-ports', 'Exposed services list', 'Auditor', 60, 'List every service reachable from the internet and why it needs to be.', [...sc.services.slice(0, 2).map((s) => [new RegExp(String(s.ports[0])), `lists port ${s.ports[0]}`]), [/business|required|need/i, 'justifies exposure'], [/firewall/i, 'names the control']]],
    ].map(([id, title, from, window, prompt, items]) => ({ id, title, from, window, prompt, model: `A clear memo to ${lower(from)} covering: ${items.map((i) => i[1]).join('; ')}.`, rubric: items.map(([re, label]) => ({ re, label })) })),
  ];
}
