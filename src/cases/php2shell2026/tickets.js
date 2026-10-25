// Case file: PHP2Shell. The PHP patch queue. Each ticket is one habit that decides how a runtime bug like this goes.
// Real basis: php.net lists the partial mitigations and says only an update is a complete solution (session.upload_progress.enabled=0
// must be set in php.ini or the pool config, not ini_set or .user.ini, with every worker restarted); PHP 8.1 and older get no
// release from the project (only minimal source backports for 7.4, 8.0 and 8.1); hiding the version header (expose_php) hides the
// header, not the bug. The people and requests are invented.
export const TICKETS = [
  {
    id: 'upload-progress',
    num: 7401,
    title: 'Turn off session.upload_progress on the agent portal: can we do it in wp-config.php?',
    from: 'Web team',
    via: 'Change queue, Wed 9:10 AM',
    priority: 'High',
    facts: [['Host', 'agentportal01 (Apache, mod_php, PHP 8.2.34)'], ['Request', 'Add ini_set(\'session.upload_progress.enabled\', 0) to wp-config.php'], ['Why', '"It is a one-line change and no restart"'], ['php.net says', 'Set it in php.ini or the pool config and restart every worker; ini_set and .user.ini do not work for this']],
    body: ['PHP2Shell uses the session upload progress feature. The web team wants to switch it off from wp-config.php so nothing needs restarting.', 'Is that enough to call the portal mitigated?'],
    teaches: { skill: 'Apply the vendor\'s mitigation exactly as written, and keep patching', secplus: '4.3 Vulnerability management: compensating controls' },
    options: [
      { id: 'ini', text: 'No. Set session.upload_progress.enabled=0 in php.ini (not ini_set or .user.ini), restart every Apache worker, add a low post_max_size and request limits at the proxy, and treat all of it as a stopgap until the portal is patched and checked.', outcome: 'good', points: 10, why: 'Right. php.net lists these as partial mitigations, set in php.ini or the pool config with every worker restarted, and says only an update is a complete solution. The multipart parsing happens before wp-config.php even runs, so a line there does nothing.', reply: 'Web team: Understood, doing it in php.ini and restarting Apache.' },
      { id: 'wpconfig', text: 'Yes, put it in wp-config.php. Same setting, no restart.', outcome: 'ok', points: 3, why: 'It looks like the same thing and it is not. The request is handled before application code runs, so ini_set in wp-config.php (or .user.ini) is too late. You would close the ticket and feel safe, and the portal would be exactly as exposed as before.', reply: 'Web team: Done. Marking it mitigated.' },
      { id: 'skip', text: 'Skip the mitigation. Our WAF will catch it.', outcome: 'bad', points: 0, why: 'The WAF only logs these requests (detection-only mode), and the weekly digest shows it has been logging them since Oct 17. A mitigation that exists and is not applied protects nobody.', reply: 'Web team: Okay.', cost: { amount: 40000, text: 'The portal stays exposed (estimate for this replay)' } },
    ],
  },
  {
    id: 'legacy74',
    num: 7402,
    title: 'The old intranet app runs PHP 7.4 and there is no release for it: leave it?',
    from: 'Intranet owner',
    via: 'Change queue, Wed 9:25 AM',
    priority: 'High',
    facts: [['Host', 'intranet02 (PHP 7.4.33, end of life)'], ['Exposure', 'Published to field offices through a reverse proxy'], ['Fix', 'None from the project. Only a minimal source backport, no binaries'], ['Status', 'Nobody owns upgrades. The app "just works"']],
    body: ['PHP 8.2.35 and the other releases do not cover 7.4. The PHP project published only a source backport and no packages.', 'It is just an old staff intranet. Can it stay as it is?'],
    teaches: { skill: 'Deal with end-of-life software: reduce exposure now, then retire it', secplus: '2.3 Vulnerabilities: end-of-life, unsupported software' },
    options: [
      { id: 'offline', text: 'Take it off the internet today (VPN or an IP allow-list for the field offices), check its logs back to Oct 17, apply a vendor-built fix only if one exists for it, and schedule a move to a supported PHP.', outcome: 'good', points: 10, why: 'Right. 7.4 gets no official release, so you cannot patch your way out. Cut the exposure first, check whether it was touched since Oct 17 (the intranet box did show memory-limit fatals), then plan an upgrade or retirement.', reply: 'Intranet owner: Fair. Field offices will use the VPN.' },
      { id: 'waf', text: 'Put a WAF rule in front of it and leave it as is.', outcome: 'ok', points: 4, why: 'A request-size limit helps a little. But the bug is reached before any application code runs, the version has no fix, and mitigations are partial. It stays a risk on the internet.', reply: 'Intranet owner: Okay, I will ask for the rule.' },
      { id: 'leave', text: 'Leave it. It is old, small and quiet.', outcome: 'bad', points: 0, why: 'Old, small and quiet is how the forgotten box becomes the way in. Its own logs already show memory-limit fatals from the attacker address on Oct 20. Nothing will ever fix it unless someone moves it.', reply: 'Intranet owner: Great, thanks.', cost: { amount: 80000, text: 'An unpatchable PHP host stays on the internet (estimate for this replay)' } },
    ],
  },
  {
    id: 'hide-version',
    num: 7403,
    title: 'Close the PHP2Shell finding: expose_php is Off on every host',
    from: 'AppSec',
    via: 'Security backlog, Wed 9:40 AM',
    priority: 'Medium',
    facts: [['Request', 'Close the PHP2Shell finding because the PHP version is hidden'], ['expose_php', 'Off on agentportal01 and claims-app01'], ['Hidden version', 'Hides the X-Powered-By header, not the bug'], ['Exposed hosts', 'About four in five hide their version and are still vulnerable (VirusTotal count)']],
    body: ['AppSec says attackers cannot tell which PHP version we run because the header is hidden, so we are not at risk.', 'Can we close the finding?'],
    teaches: { skill: 'Do not confuse hiding a version with fixing a vulnerability', secplus: '2.3 Vulnerabilities; 4.1 Asset management' },
    options: [
      { id: 'inventory', text: 'No. Keep expose_php=Off as hygiene, but close the finding only when every PHP host (including the unknown vendor and agency ones) is patched or upgraded, with the versions written down.', outcome: 'good', points: 10, why: 'Right. The bug does not need the header: attackers send the request and see what happens. On the VirusTotal count about four in five exposed hosts hide their version, and they are still vulnerable. Close the finding with an inventory and fixed versions, not a header.', reply: 'AppSec: Okay. I will track every host until it is patched.' },
      { id: 'partial', text: 'Close it for the two hosts we checked, and keep it open for the rest.', outcome: 'ok', points: 5, why: 'Closing it for hosts where only the header is hidden still counts a hidden version as a fix. Keep it open for those too, until they run a fixed release.', reply: 'AppSec: Done.' },
      { id: 'close', text: 'Yes, close it. They cannot see the version.', outcome: 'bad', points: 0, why: 'This is the false comfort the day is about. The bug is reached by a multipart request, and the version header was never part of it.', reply: 'AppSec: Closed.', cost: { amount: 30000, text: 'A finding closed for the wrong reason (estimate for this replay)' } },
    ],
  },
];
