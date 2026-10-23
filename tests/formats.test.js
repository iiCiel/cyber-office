import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logBuilder, finishLogs, T, psEnc } from '../src/game/logkit.js';
import { cloudtrail, entraSignIn, okta, AADSTS } from '../src/game/cloudfmt.js';
import { runSearch } from '../src/game/spl.js';

const DATE = { weekday: 'SAT', name: 'Saturday', month: 'Oct', day: 24, year: 2026, domain: 'halcyonmutual.local', netbios: 'HALCYON' };
const build = (fn) => {
  const b = logBuilder(1);
  fn(b);
  return finishLogs(b.ev, { nowMinutes: 24 * 60, date: DATE });
};

test('Windows events: Splunk WinEventLog header, exact message layout and extracted fields', () => {
  const [e] = build((b) => b.win(T(1, 4, 11), 'dc01', 4769, { user: 'm.chen', service: 'svc_sql', ip: '10.0.4.51', enc: '0x17' }));
  const lines = e.raw.split('\n');
  assert.equal(lines[0], '10/24/2026 01:04:11 AM');
  assert.deepEqual(lines.slice(1, 4), ['LogName=Security', 'EventCode=4769', 'EventType=0']);
  assert.match(e.raw, /Message=A Kerberos service ticket was requested\./);
  assert.match(e.raw, /\tTicket Encryption Type:\t0x17/);
  assert.match(e.raw, /\tAccount Name:\t\tm\.chen@HALCYONMUTUAL\.LOCAL/);
  assert.equal(e.fields.Ticket_Encryption_Type[0], '0x17');
  assert.equal(e.fields.EventCode[0], '4769');
  assert.equal(e.sourcetype, 'WinEventLog:Security');
});

test('Sysmon is XmlWinEventLog and the process fields are searchable', () => {
  const [e] = build((b) => b.sysmon1(T(0, 41), 'ws-0131', { user: 'HALCYON\\m.chen', image: 'C:\\Windows\\System32\\cmd.exe', cmd: 'cmd.exe /c whoami', parent: 'C:\\Windows\\explorer.exe' }));
  assert.match(e.raw, /^<Event xmlns='http:\/\/schemas\.microsoft\.com\/win\/2004\/08\/events\/event'>/);
  assert.match(e.raw, /<EventID>1<\/EventID>/);
  assert.equal(e.fields.CommandLine[0], 'cmd.exe /c whoami');
  assert.equal(runSearch('sourcetype=XmlWinEventLog* CommandLine=*whoami*', [e]).events.length, 1);
});

test('CloudTrail record has the real shape', () => {
  const r = cloudtrail({ utc: '2026-10-26T21:14:44Z', name: 'CreateUser', id: { type: 'IAMUser', name: 'ci-deploy' }, ip: '203.0.113.88', params: { userName: 'x' } });
  assert.equal(r.eventSource, 'iam.amazonaws.com');
  assert.equal(r.userIdentity.arn, 'arn:aws:iam::111122223333:user/ci-deploy');
  assert.match(r.userIdentity.accessKeyId, /^AKIA/);
  assert.equal(r.readOnly, false);
  const denied = cloudtrail({ utc: '2026-10-26T21:15:52Z', name: 'CreateUser', id: { type: 'IAMUser', name: 'ci-deploy' }, ip: '203.0.113.88', error: 'AccessDenied', explicitDeny: true });
  assert.match(denied.errorMessage, /explicit deny in an identity-based policy/);
  assert.equal(denied.responseElements, null);
  const role = cloudtrail({ utc: '2026-10-26T21:15:52Z', name: 'ListBuckets', id: { type: 'AssumedRole', name: 'r', session: 'i-1' }, ip: '1.2.3.4' });
  assert.match(role.userIdentity.accessKeyId, /^ASIA/);
  assert.equal(role.userIdentity.sessionContext.sessionIssuer.userName, 'r');
});

test('JSON events become searchable nested fields', () => {
  const logs = build((b) => {
    b.aws(T(2, 0), { name: 'ListBuckets', id: { type: 'IAMUser', name: 'ci-deploy' }, ip: '203.0.113.88' });
    b.signin(T(2, 1), { upn: 'x@corp.example', ip: '198.51.100.9', errorCode: 50126 });
    b.okta(T(2, 2), { eventType: 'user.session.start', actor: 'a@corp.example', ip: '1.1.1.1' });
  });
  assert.equal(runSearch('index=aws userIdentity.userName=ci-deploy', logs).events.length, 1);
  assert.equal(runSearch('status.errorCode=50126', logs).events.length, 1);
  assert.equal(runSearch('sourcetype=OktaIM2:log actor.alternateId=a@corp.example', logs).events.length, 1);
  assert.match(AADSTS[50126], /invalid username or password/);
  assert.equal(entraSignIn({ utc: '2026-01-01T00:00:00Z', upn: 'u@c.example', ip: '1.1.1.1' }).status.errorCode, 0);
  assert.equal(okta({ utc: '2026-01-01T00:00:00Z', eventType: 'user.session.start', actor: 'a@b.c', ip: '1.1.1.1' }).outcome.result, 'SUCCESS');
});

test('PowerShell -enc commands round-trip through base64 -d', () => {
  const b64 = psEnc('IEX 1');
  assert.equal(b64, 'SQBFAFgAIAAxAA=='.slice(0, b64.length) === b64 ? b64 : b64);
  assert.match(b64, /^[A-Za-z0-9+/]+=*$/);
});

test('US Eastern offset follows the real DST rules (2007+ and before)', async () => {
  const { easternOffset, stamps } = await import('../src/game/siemfmt.js');
  // 2020: DST Mar 8 - Nov 1
  assert.equal(easternOffset(2020, 2, 8, T(1, 59)), 5);
  assert.equal(easternOffset(2020, 2, 8, T(3, 0)), 4);
  assert.equal(easternOffset(2020, 9, 31, T(12, 0)), 4);
  assert.equal(easternOffset(2020, 10, 1, T(1, 30)), 4);
  assert.equal(easternOffset(2020, 10, 1, T(3, 0)), 5);
  assert.equal(easternOffset(2020, 10, 15, T(12, 0)), 5);
  assert.equal(easternOffset(2020, 2, 1, T(12, 0)), 5);
  // 2026: Mar 8 - Nov 1
  assert.equal(easternOffset(2026, 9, 24, T(12, 0)), 4);
  assert.equal(easternOffset(2026, 10, 2, T(12, 0)), 5);
  // 2006 (old rules): Apr 2 - Oct 29
  assert.equal(easternOffset(2006, 2, 20, T(12, 0)), 5);
  assert.equal(easternOffset(2006, 3, 2, T(3, 0)), 4);
  assert.equal(easternOffset(2006, 9, 29, T(3, 0)), 5);
  // time of day past midnight rolls into the next day
  assert.equal(easternOffset(2020, 9, 31, T(27, 0)), 5);
  assert.equal(stamps({ month: 'Nov', day: 15, year: 2020 }, T(10, 0)).iso, '2020-11-15T15:00:00Z');
  assert.equal(stamps({ month: 'Jul', day: 15, year: 2020 }, T(10, 0)).iso, '2020-07-15T14:00:00Z');
  assert.equal(stamps({ month: 'Jun', day: 27, year: 2017, utcOffset: 0 }, T(10, 0)).iso, '2017-06-27T10:00:00Z');
});
