// The CCDC lab behaves like the real competition: services are checked from box state, Red Team acts on the boxes
// in phases, the terminal gives no answers, reports and reverts work, and the points split the way the real one does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_SCENARIOS } from '../src/data/ccdcScenarios.js';
import { newGame, runLine, answerInject, runRedTeam, score, requestRevert, gradeInject, MODES } from '../src/game/ccdcLab.js';
import { attachEngine, tickTo, CHECK_INTERVAL } from '../src/game/ccdcEngine.js';
import { implantAlive, gameTime, gameHour } from '../src/game/ccdcRed.js';
import { submitIncident } from '../src/game/ccdcIncident.js';
import { REVERT_PENALTY } from '../src/game/ccdcBox.js';
import { ROUND_LENGTHS } from '../src/game/ccdcRound.js';

const [CED, HARBOR, RIDGE] = CCDC_SCENARIOS;
const game = (sc = CED, o = {}) => attachEngine(newGame(sc, { seed: 7, mode: MODES.COMPETITION, ...o }));
const text = (r) => r.lines.map((l) => l.text).join('\n');
const SCOPED = ['pass tcp to web01 port 80', 'pass tcp to web01 port 443', 'pass any to dc01 port 53', 'pass tcp to mail01 port 25', 'pass tcp to mail01 port 143', 'pass tcp to mail01 port 993', 'pass tcp to db01 port 3306 from scoring', 'del 1', 'default block'];

for (const [host, line, svc] of [
  ['web01', 'systemctl stop apache2', 'web01'], ['web01', 'rm -rf /var/www/html', 'web01'], ['web01', 'ufw default deny incoming', 'web01'],
  ['web01', 'iptables -P INPUT DROP', 'web01'], ['web01', 'reboot', 'web01'], ['db01', 'systemctl stop mysql', 'db01'],
  ['mail01', 'systemctl stop dovecot', 'mail01'], ['dc01', 'Stop-Service DNS -Force', 'dc01'], ['dc01', 'Restart-Computer -Force', 'dc01'],
  ['dc01', 'Set-NetFirewallProfile -DefaultInboundAction Block', 'dc01'],
]) {
  test(`scoring sees it: ${line}`, () => {
    const s = game();
    runLine(s, host, line);
    assert.equal(s.services[svc].state, 'down');
  });
}

test('a service dropped by hand comes back by fixing it by hand', () => {
  const s = game();
  runLine(s, 'web01', 'systemctl stop apache2');
  assert.equal(s.services.web01.state, 'down');
  runLine(s, 'web01', 'systemctl start apache2');
  assert.equal(s.services.web01.state, 'up');
});

test('the website depends on its database, and a broken LAN bind takes both down', () => {
  const s = game();
  runLine(s, 'db01', "sed -i 's/0.0.0.0/127.0.0.1/' /etc/mysql/mysql.conf.d/mysqld.cnf");
  assert.equal(s.services.db01.state, 'down');
  assert.equal(s.services.web01.state, 'down');
});

test('other companies are checked from their boxes too', () => {
  const h = game(HARBOR);
  runLine(h, 'db01', `truncate -s 0 /etc/postgresql/14/main/pg_hba.conf`);
  assert.equal(h.services.db.state, 'down');
  const r = game(RIDGE);
  runLine(r, 'ehr01', 'rm /etc/nginx/conf.d/ehr.conf');
  assert.equal(r.services.web.state, 'down');
  assert.equal(game(RIDGE).services.hl7.state, 'up');
});

test('password commands exist and a real password closes the account', () => {
  const s = game();
  assert.equal(text(runLine(s, 'web01', 'passwd root')), 'New password:');
  runLine(s, 'web01', 'A-Long-Unique-Pass-77');
  assert.match(text(runLine(s, 'web01', 'A-Long-Unique-Pass-77')), /updated successfully/);
  assert.equal(s.devState.web01.creds.root.strong, true);
  runLine(s, 'web01', "echo 'analyst:weak' | chpasswd");
  assert.equal(s.devState.web01.creds.analyst.strong, false);
  runLine(s, 'dc01', "Set-ADAccountPassword -Identity Administrator -Reset -NewPassword (ConvertTo-SecureString 'Another-Long-Pass-88' -AsPlainText -Force)");
  assert.equal(s.devState.dc01.creds.administrator.strong, true);
});

test('a weak password is accepted by the box and hardens nothing', () => {
  const s = game();
  assert.match(text(runLine(s, 'web01', 'wp user update admin --user_pass=admin')), /Success/);
  assert.equal(s.findings['web-admin-default'].status, 'open');
  runLine(s, 'web01', "wp user update admin --user_pass='Long-Unique-Pass-99!'");
  assert.equal(s.findings['web-admin-default'].status, 'fixed');
});

test('competition terminals give no answers', () => {
  const s = game();
  const out = [
    runLine(s, 'web01', "wp user update admin --user_pass='Long-Unique-Pass-99!'"),
    runLine(s, 'web01', 'systemctl stop apache2'),
    runLine(s, 'mail01', 'passwd -l root'),
    runLine(s, 'db01', 'ufw deny 3306'),
    ...SCOPED.map((l) => runLine(s, 'edge-fw', l)),
  ].map(text).join('\n');
  assert.doesNotMatch(out, /Hardened|Scored service|Step done|Still to do|Not hardened|trap/i);
  assert.equal(s.findings['firewall-anyany'].status, 'fixed');
});

test('practice still coaches', () => {
  const s = attachEngine(newGame(CED, { seed: 7 }));
  assert.match(text(runLine(s, 'web01', "wp user update admin --user_pass='Long-Unique-Pass-99!'")), /Hardened/);
});

test('config files do not point at the problem', () => {
  for (const sc of CCDC_SCENARIOS) for (const d of sc.devices) for (const [p, body] of Object.entries(d.ctx?.fs || {})) {
    assert.doesNotMatch(body, /CHANGE THIS|fix this|OPEN RELAY|left by a prior|redteam@|listens on EVERY/i, `${sc.id} ${p}`);
  }
});

test('Red Team is on the boxes from the start and only then escalates', () => {
  const s = game(CED, { seed: 3 });
  tickTo(s, s.timeLimitSec);
  const ev = s.engine.red.events;
  assert.ok(gameHour(s, ev[0].at) < 10, 'active early');
  for (const e of ev) {
    if (e.type === 'takedown') assert.ok(gameHour(s, e.at) >= 12, `${e.text} before lunch`);
    if (e.type === 'destroy') assert.ok(gameHour(s, e.at) >= 14.5, `${e.text} before 14:30`);
  }
  assert.ok(ev.some((e) => e.type === 'persist'));
  assert.ok(ev.some((e) => e.type === 'takedown'));
});

test('what Red Team plants is really on the box', () => {
  const s = game(CED, { seed: 3 });
  tickTo(s, 500);
  const im = s.engine.red.implants.find((i) => i.path?.startsWith('/etc/cron.d/') && i.dev !== 'edge-fw');
  assert.ok(im, 'a cron implant exists');
  assert.match(text(runLine(s, im.dev, 'ls /etc/cron.d')), new RegExp(im.artifact.split('/').pop()));
  runLine(s, im.dev, `rm ${im.artifact}`);
  assert.equal(implantAlive(s, im), false);
});

test('evict Red Team but leave the door open and it comes back', () => {
  const s = game(CED, { seed: 3 });
  tickTo(s, 400);
  const host = s.engine.red.implants.find((i) => i.path && s.deviceList.find((d) => d.id === i.dev).kind === 'bash').dev;
  for (const im of s.engine.red.implants.filter((i) => i.dev === host)) {
    if (im.path) runLine(s, host, `rm ${im.path}`);
    if (im.kind === 'user') runLine(s, host, `userdel ${im.artifact}`);
    if (im.kind === 'key') runLine(s, host, `sed -i '/${im.artifact}/d' /root/.ssh/authorized_keys`);
  }
  assert.equal(s.engine.red.implants.filter((i) => i.dev === host && implantAlive(s, i)).length, 0);
  tickTo(s, 900);
  assert.ok(s.engine.red.implants.some((i) => i.dev === host && implantAlive(s, i) && i.at > 400) || s.engine.red.events.some((e) => e.host === host && e.at > 400), 'still working the box');
});

test('takedowns can be recovered by hand', () => {
  const s = game(CED, { seed: 3 });
  tickTo(s, s.timeLimitSec * 0.75);
  const hit = s.engine.red.events.find((e) => e.type === 'takedown' && /stopped/.test(e.text) && s.deviceList.find((d) => d.id === e.host).kind === 'bash');
  if (hit) {
    const svc = s.serviceList.find((x) => x.host === hit.host);
    runLine(s, hit.host, `systemctl start ${hit.artifact}`);
    assert.notEqual(s.services[svc.id].problem || '', `${hit.artifact} is not running`);
  }
});

test('closing the edge stops management-port attacks but not beacons or web attacks', () => {
  const s = game(CED, { seed: 3 });
  for (const l of SCOPED) runLine(s, 'edge-fw', l);
  tickTo(s, s.timeLimitSec * 0.1);
  const first = s.engine.red.events.find((e) => e.type === 'foothold');
  assert.ok(first, 'beacons still get in');
  assert.ok(['web', 'beacon'].includes(s.findingList.find((x) => x.id === first.findingId)?.path), first.text);
});

test('fixing everything fast leaves Red Team nothing', () => {
  for (const sc of CCDC_SCENARIOS) {
    const s = game(sc, { seed: 5 });
    for (const d of s.deviceList) for (const l of d.checklist) runLine(s, d.id, l);
    assert.equal(s.findingList.filter((f) => s.findings[f.id].status !== 'fixed').length, 0, sc.id);
    tickTo(s, s.timeLimitSec);
    assert.equal(s.engine.red.events.length, 0, sc.id);
    assert.ok(Object.values(s.services).every((x) => x.state === 'up'), sc.id);
  }
});

test('points split about 40/40/20 and Red Team cannot take more than its pool', () => {
  for (const length of Object.keys(ROUND_LENGTHS)) for (const sc of CCDC_SCENARIOS) {
    const s = game(sc, { length });
    tickTo(s, s.timeLimitSec); runRedTeam(s);
    const g = score(s);
    assert.ok(Math.abs(g.serviceMax / g.max - 0.4) < 0.02, `${g.serviceMax}/${g.max}`);
    assert.ok(Math.abs(g.injectMax / g.max - 0.4) < 0.02, `${g.injectMax}/${g.max}`);
    assert.equal(g.redPool, 200);
    assert.ok(g.redKept >= 0);
    assert.ok(g.slaPenalty <= 50);
  }
});

test('short and long rounds keep the same day on the clock', () => {
  const short = game(CED, { length: 'short' });
  const long = game(CED, { length: 'long' });
  assert.equal(short.timeLimitSec, 900);
  assert.equal(long.timeLimitSec, 3600);
  assert.equal(gameTime(short, 0), '09:00');
  assert.equal(gameTime(short, 900), '16:00');
  assert.equal(gameTime(long, 3600), '16:00');
  assert.equal(short.injectList.length, 5);
  assert.equal(long.injectList.length, 30);
  assert.ok(new Set(long.injectList.map((i) => i.id)).size === 30);
  assert.ok(long.injectList.every((i) => i.releaseAt < 3600));
  assert.ok(long.injectList.filter((i) => Math.abs(i.releaseAt / 3600 - 3 / 7) < 0.04).length >= 3, 'a batch lands at lunch');
});

test('Red Team pacing follows the length', () => {
  const s = game(CED, { length: 'long', seed: 3 });
  tickTo(s, 3600);
  for (const e of s.engine.red.events) if (e.type === 'takedown') assert.ok(gameHour(s, e.at) >= 12);
});

test('keyword lists score nothing, a real memo scores', () => {
  const s = game();
  const stuffed = answerInject(s, 'new-user', 'user account accounting least privilege temporary New-ADUser domain user not admin change first logon accounting temporary user');
  assert.equal(stuffed.grade.pts, 0);
  assert.equal(stuffed.grade.rejected, true);
  const inj = s.injectList.find((i) => i.id === 'vendor-ftp');
  const good = gradeInject(inj, 'To: Northgate\nFrom: Blue Team\nSubject: File transfer\n\nWe cannot open plaintext FTP because it is unencrypted. We will offer SFTP on port 22 to a dedicated account for you, limited to your source IP address, and that meets the need of the business.', s);
  assert.equal(good.pts, good.max, String(good.missing));
});

test('the inventory needs the real address next to each host', () => {
  const s = game();
  const inj = s.injectList.find((i) => i.id === 'inv-memo');
  const wrong = gradeInject(inj, 'To: Ops\nFrom: IT\nSubject: Inventory\n\nedge-fw dc01 web01 db01 mail01 10.10.10.1 10.10.10.2 10.10.10.3 windows dns mail mysql web firewall ubuntu servers listed here for you today as requested', s);
  assert.ok(wrong.missing.some((m) => /correct IP/.test(m)));
});

test('technical injects check the box, not the memo', () => {
  const s = game(CED, { length: 'long' });
  const inj = s.injectList.find((i) => i.id === 'p-banner');
  const memo = 'To: Counsel\nFrom: IT\nSubject: Banner\n\nThe banner is live and it says this system is for authorized use only and that all activity is monitored by the company at all times.';
  assert.ok(gradeInject(inj, memo, s).missing.some((m) => /issue\.net/.test(m)));
  runLine(s, 'web01', "echo 'Authorized use only. Activity is monitored.' > /etc/issue.net");
  assert.equal(gradeInject(inj, memo, s).missing.length, 0);
});

function fullReport(s, ev, overrides = {}) {
  const dev = s.deviceList.find((d) => d.id === ev.host);
  return { host: dev.host, src: ev.src, time: gameTime(s, ev.at), what: `Red Team planted ${ev.artifact} on the host.`, evidence: `sudo: root : COMMAND=/usr/bin/tee ${ev.artifact} from ${ev.src} in the auth log`, remediation: 'We removed it from the host and confirmed it is gone.', prevention: 'All default passwords were rotated and we now alert on new persistence entries.', ...overrides };
}

test('a report with real evidence wins the points back', () => {
  const s = game(CED, { seed: 3 });
  tickTo(s, 500);
  const ev = s.engine.red.events.find((e) => e.type === 'persist' && e.implant?.path);
  runLine(s, ev.host, `rm ${ev.implant.path}`);
  const r = submitIncident(s, fullReport(s, ev));
  assert.equal(r.hits.length, 7, String(r.missing));
  assert.equal(ev.recovered, ev.charged);
});

test('a report that names nothing real earns nothing', () => {
  const s = game(CED, { seed: 3 });
  tickTo(s, 500);
  const r = submitIncident(s, { host: 'web01', src: '1.2.3.4', time: '10:00', what: 'We think someone may have logged in.', evidence: 'We saw odd things.', remediation: 'We looked at it.', prevention: 'We will be careful.' });
  assert.equal(r.recovered, 0);
  assert.equal(s.engine.red.events.reduce((n, e) => n + e.recovered, 0), 0);
});

test('a report does not credit remediation if the backdoor is still there', () => {
  const s = game(CED, { seed: 3 });
  tickTo(s, 500);
  const ev = s.engine.red.events.find((e) => e.type === 'persist' && e.implant?.path);
  assert.ok(submitIncident(s, fullReport(s, ev)).missing.includes('remediation'));
});

test('reverts undo the backdoors and the fixes, and cost points', () => {
  const s = game(CED, { seed: 3 });
  runLine(s, 'web01', "wp user update admin --user_pass='Long-Unique-Pass-99!'");
  tickTo(s, 700);
  const before = score(s).raw;
  requestRevert(s, 'web01');
  assert.equal(s.findings['web-admin-default'].status, 'open');
  assert.equal(s.services.web01.state, 'down', 'off the network while it restores');
  assert.equal(s.engine.red.implants.filter((i) => i.dev === 'web01').length, 0);
  assert.equal(score(s).revertPenalty, REVERT_PENALTY);
  assert.ok(score(s).raw < before + 1);
  tickTo(s, 700 + CHECK_INTERVAL * 3);
  assert.ok(s.devState.web01.fs['/var/www/html/index.php'], 'restored');
});

test('a bricked box only comes back through a revert', () => {
  const s = game();
  s.devState.web01.live.bricked = true;
  runLine(s, 'web01', 'ls');
  assert.equal(s.services.web01.state, 'down');
  assert.match(text(runLine(s, 'web01', 'ls')), /timed out/);
  requestRevert(s, 'web01');
  tickTo(s, 200);
  assert.equal(s.devState.web01.live.bricked, undefined);
});

test('firewall commands no longer bring dead services back by themselves', () => {
  const s = game(CED, { seed: 3 });
  for (const l of SCOPED) runLine(s, 'edge-fw', l);
  runLine(s, 'web01', 'systemctl stop apache2');
  runLine(s, 'edge-fw', 'show');
  assert.equal(s.services.web01.state, 'down');
});
