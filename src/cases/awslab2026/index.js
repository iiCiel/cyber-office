// Lab: "The key on GitHub". A fictional AWS intrusion at Halcyon Mutual built from documented behavior (exposed access keys, the AWS
// quarantine policy, GuardDuty findings). Real CloudTrail/GuardDuty/GitHub audit JSON in the SIEM, and a working `aws` CLI and `jq`
// in the Terminal. Same engine as the week and the Case Files; caseFile.kind = 'lab'.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE, REGIONS, BACKDOOR, BACKDOOR_KEY, BUCKET, ATT } from './logs.js';
import { KEY_TALK, KEY_SCORE } from './talk.js';
import { TICKETS } from './tickets.js';
import { makeAwsCli, awsDenied, cliError } from '../../game/cloudcli.js';
import { scoreEmail, scoreCase, scoreTicket, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'aws-trail';
const ME = 'arn:aws:iam::111122223333:user/soc-analyst';
const CI_KEY = 'AKIA3HALCYONCIDEPLOY';
// Hunting in the account: the aws CLI (iam, cloudtrail, ec2, guardduty) or jq over the exported CloudTrail files.
const HUNT_RE = /(aws (iam|cloudtrail|ec2|guardduty|s3)|jq\b|aws-support-bot|CreateUser)/i;

function huntItem(st) {
  const cmds = st.events.filter((e) => e.type === 'terminal-cmd' && e.shell !== 'pwsh');
  const found = cmds.some((e) => /(list-users|list-attached-user-policies|lookup-events|CreateUser|aws-support-bot|list-access-keys)/i.test(e.cmd));
  return {
    id: 'hunt',
    area: 'Terminal',
    title: 'Find the user nobody created (aws CLI or jq)',
    max: 10,
    teaches: { skill: 'Audit IAM users and their policies with the aws CLI', secplus: '4.9 Use data sources to support an investigation' },
    outcome: found ? 'good' : cmds.length ? 'ok' : 'bad',
    points: found ? 10 : cmds.length ? 4 : 0,
    what: found ? 'You listed the IAM users and found aws-support-bot: created at 17:14 by ci-deploy, AdministratorAccess, no MFA.' : cmds.length ? 'You opened the Terminal but never looked at the IAM users.' : 'You never audited the IAM users.',
    why: 'The quarantine policy AWS applied covers only ci-deploy. The backdoor user is a second identity with admin rights that survives every fix to the first. After a credential leak, listing users, keys and policies created or changed since the exposure is the step that separates a bill from a breach.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreConversation(KEY_SCORE, st.enc?.key),
    ...TICKETS.map((t) => scoreTicket(t, st.tickets?.[t.id])),
    huntItem(st),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Lab over. Let's go through what the attacker did, in order."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the chain: a key in a public repo, first use 40 seconds later, enumeration, miners in eight regions, a backdoor admin user created before AWS quarantined the key, S3 downloads and StopLogging.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain: exposed key, enumeration, miners, a backdoor user (aws-support-bot), S3 exfiltration, then logging turned off.');
  else lines.push('You never wrote it up. The backdoor user is still an admin.');
  if (by.case.contained) lines.push('You killed both identities, not just the leaked key. That is the lesson: the quarantine policy only covers the key it was put on.');
  if (st.enc?.key?.outcome === 'revoke-first') lines.push('On the repo you told Theo to revoke first. Credentials are revoked, not deleted.');
  else if (st.enc?.key?.outcome === 'deleted-repo') lines.push('You deleted the repo. The key was still alive.');
  else if (st.enc?.key?.outcome === 'hid-it') lines.push('You let the history be rewritten quietly. The key was still active and the incident had no record.');
  if (by.hunt.outcome === 'good') lines.push('And you found aws-support-bot with the CLI. A user you did not create, with admin, is persistence.');
  if (st.mail?.['aws-suspend']?.enteredCreds) lines.push('And you gave your password to the copycat AWS phish.');
  lines.push('One line to remember: the cheapest fix was never to have a long-lived key. Federated, short-lived credentials do not sit in .env files.');
  lines.push("Here's your lab report, and what you can honestly say you've done.");
  return lines;
}

function cloudtrailFiles() {
  const logs = generateLogs({ nowMinutes: 24 * 60 }).filter((e) => e.sourcetype === 'aws:cloudtrail');
  const recs = logs.map((e) => { try { return JSON.parse(e.raw); } catch { return null; } }).filter(Boolean);
  return { recs, text: `${JSON.stringify({ Records: recs }, null, 2)}\n` };
}

function awsCli() {
  const { recs } = cloudtrailFiles();
  const gd = generateLogs({ nowMinutes: 24 * 60 }).filter((e) => e.sourcetype === 'aws:cloudwatch:guardduty').map((e) => JSON.parse(e.raw).detail);
  const inst = (rg) => {
    const rows = recs.filter((x) => x.eventName === 'RunInstances' && x.awsRegion === rg && x.responseElements);
    return { Reservations: rows.map((x) => ({ ReservationId: x.responseElements.reservationId, OwnerId: '111122223333', Instances: x.responseElements.instancesSet.items.map((i) => ({ InstanceId: i.instanceId, InstanceType: i.instanceType, KeyName: x.requestParameters.instancesSet.items[0].keyName || 'aws-key-9f3a', LaunchTime: x.eventTime, State: { Code: 16, Name: 'running' }, PublicIpAddress: '198.51.100.2' })) })) };
  };
  const cmp = (who) => (_f) => { throw awsDenied(who, ME); };
  return makeAwsCli({
    'sts get-caller-identity': () => ({ UserId: 'AIDA3HALCYONSOC', Account: '111122223333', Arn: ME }),
    'iam list-users': () => ({ Users: [
      { Path: '/', UserName: 'ci-deploy', UserId: 'AIDA3HALCYONCI', Arn: 'arn:aws:iam::111122223333:user/ci-deploy', CreateDate: '2023-09-14T13:02:11+00:00', PasswordLastUsed: null },
      { Path: '/', UserName: 'dana.k', UserId: 'AIDA3HALCYONDK', Arn: 'arn:aws:iam::111122223333:user/dana.k', CreateDate: '2022-02-01T15:20:00+00:00', PasswordLastUsed: '2026-10-26T13:14:05+00:00' },
      { Path: '/', UserName: 'soc-analyst', UserId: 'AIDA3HALCYONSOC', Arn: ME, CreateDate: '2026-10-19T12:00:00+00:00' },
      { Path: '/', UserName: 'test-user', UserId: 'AIDA3HALCYONTU', Arn: 'arn:aws:iam::111122223333:user/test-user', CreateDate: '2021-06-30T09:00:00+00:00', PasswordLastUsed: null },
      { Path: '/', UserName: BACKDOOR, UserId: 'AIDA3ATTACKERBKDR', Arn: `arn:aws:iam::111122223333:user/${BACKDOOR}`, CreateDate: '2026-10-26T21:14:44+00:00', PasswordLastUsed: '2026-10-26T21:22:31+00:00' },
    ] }),
    'iam list-access-keys': (f) => ({ AccessKeyMetadata: f.userName === 'ci-deploy' ? [{ UserName: 'ci-deploy', AccessKeyId: CI_KEY, Status: 'Active', CreateDate: '2023-09-14T13:02:30+00:00' }] : f.userName === BACKDOOR ? [{ UserName: BACKDOOR, AccessKeyId: BACKDOOR_KEY, Status: 'Active', CreateDate: '2026-10-26T21:14:53+00:00' }] : [] }),
    'iam get-access-key-last-used': (f) => ({ UserName: f.accessKeyId === CI_KEY ? 'ci-deploy' : BACKDOOR, AccessKeyLastUsed: f.accessKeyId === CI_KEY ? { LastUsedDate: '2026-10-26T21:15:52+00:00', ServiceName: 'ec2', Region: 'us-west-2' } : { LastUsedDate: '2026-10-26T21:33:50+00:00', ServiceName: 'ec2', Region: 'ap-northeast-1' } }),
    'iam list-attached-user-policies': (f) => ({ AttachedPolicies: f.userName === 'ci-deploy' ? [{ PolicyName: 'PowerUserAccess', PolicyArn: 'arn:aws:iam::aws:policy/PowerUserAccess' }, { PolicyName: 'AWSCompromisedKeyQuarantineV3', PolicyArn: 'arn:aws:iam::aws:policy/AWSCompromisedKeyQuarantineV3' }] : f.userName === BACKDOOR ? [{ PolicyName: 'AdministratorAccess', PolicyArn: 'arn:aws:iam::aws:policy/AdministratorAccess' }] : [] }),
    'iam list-user-policies': () => ({ PolicyNames: [] }),
    'iam list-mfa-devices': () => ({ MFADevices: [] }),
    'iam get-login-profile': (f) => {
      if (f.userName !== BACKDOOR) throw cliError(`An error occurred (NoSuchEntity) when calling the GetLoginProfile operation: Login Profile for User ${f.userName} cannot be found.`);
      return { LoginProfile: { UserName: BACKDOOR, CreateDate: '2026-10-26T21:14:58+00:00', PasswordResetRequired: false } };
    },
    'iam delete-user': cmp('iam:DeleteUser'),
    'iam delete-access-key': cmp('iam:DeleteAccessKey'),
    'iam update-access-key': cmp('iam:UpdateAccessKey'),
    'ec2 terminate-instances': cmp('ec2:TerminateInstances'),
    'ec2 describe-regions': () => ({ Regions: REGIONS.map((r) => ({ Endpoint: `ec2.${r}.amazonaws.com`, RegionName: r, OptInStatus: 'opt-in-not-required' })) }),
    'ec2 describe-instances': (f) => inst(f.region),
    's3 ls': () => `2021-03-12 10:01:14 halcyon-web-assets\n2023-09-30 08:44:50 ${BUCKET}\n2024-05-17 13:20:09 halcyon-cloudtrail-logs\n`,
    'cloudtrail describe-trails': () => ({ trailList: [{ Name: 'management-events', S3BucketName: 'halcyon-cloudtrail-logs', IncludeGlobalServiceEvents: true, IsMultiRegionTrail: true, HomeRegion: 'us-east-1', TrailARN: 'arn:aws:cloudtrail:us-east-1:111122223333:trail/management-events', LogFileValidationEnabled: false, HasCustomEventSelectors: true, IsOrganizationTrail: false }] }),
    'cloudtrail get-trail-status': () => ({ IsLogging: false, LatestDeliveryTime: '2026-10-26T21:30:58.121000+00:00', StopLoggingTime: '2026-10-26T21:31:02.000000+00:00', LatestDeliveryAttemptTime: '2026-10-26T21:30:58Z' }),
    'cloudtrail lookup-events': (f) => {
      const m = String(f.lookupAttributes || '').match(/AttributeKey=(\w+),AttributeValue=(\S+)/);
      const hit = recs.filter((x) => !m || (m[1] === 'EventName' ? x.eventName === m[2] : m[1] === 'Username' ? (x.userIdentity.userName || '') === m[2] : true)).slice(-50);
      return { Events: hit.map((x) => ({ EventId: x.eventID, EventName: x.eventName, ReadOnly: String(x.readOnly), AccessKeyId: x.userIdentity.accessKeyId || '', EventTime: Date.parse(x.eventTime) / 1000, EventSource: x.eventSource, Username: x.userIdentity.userName || '', Resources: [], CloudTrailEvent: JSON.stringify(x) })) };
    },
    'guardduty list-detectors': () => ({ DetectorIds: ['d0b1c2e3f4a5b6c7d8e9f0a1b2c3d4e5'] }),
    'guardduty list-findings': () => ({ FindingIds: gd.map((g) => g.id) }),
    'guardduty get-findings': () => ({ Findings: gd }),
  }, { identity: ME });
}

function terminal() {
  const ct = cloudtrailFiles();
  return {
    date: 'Tue Oct 27 2026',
    note: 'You are signed in to AWS as soc-analyst (SecurityAudit): read-only. Exported CloudTrail is in /var/log/remote/cloudtrail/. Try: aws iam list-users',
    files: {
      '/var/log/remote/cloudtrail/2026-10-26.json': ct.text,
      '/home/analyst01/README.txt': [
        'Tips from Priya:',
        '  aws sts get-caller-identity',
        '  aws iam list-users --query "Users[].[UserName,CreateDate]" --output text',
        '  aws iam list-attached-user-policies --user-name aws-support-bot',
        '  aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=CreateUser',
        '  aws ec2 describe-instances --region us-west-2 --query "Reservations[].Instances[].[InstanceId,InstanceType]" --output text',
        "  jq -r '.Records[] | select(.userIdentity.userName==\"ci-deploy\") | .eventName' /var/log/remote/cloudtrail/2026-10-26.json | sort | uniq -c",
        '  whois 203.0.113.88',
        '',
      ].join('\n'),
    },
    whois: { [ATT]: ['inetnum:        203.0.113.0 - 203.0.113.255', 'netname:        TEST-NET-3', 'org-name:       AS-SHADOWHOST', 'descr:          Replay stand-in for the attacker address (bulletproof hosting)', 'country:        NL'].join('\n') },
    dns: {},
    commands: { aws: awsCli() },
  };
}

export default {
  n: 3,
  caseId: 'halcyon-aws-2026',
  date: DATE,
  title: 'Halcyon Mutual · Oct 27, 2026 (lab)',
  start: 8 * 60 + 5,
  endAt: 11 * 60 + 30,
  intro: ['Lab: the key on GitHub.', 'Tuesday morning at Halcyon Mutual. The budget alarm went off at 2 AM.'],
  badgeAtStart: true,
  cast: ['mike', 'theo'],

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  tickets: TICKETS,
  terminal: terminal(),

  npcLines: {
    priya: {
      talk: [
        'Welcome to the AWS lab. It is invented, but the behavior is real: access keys pushed to GitHub get found by bots in minutes.',
        "It's Tuesday, October 27, 2026, 8:05 AM. The budget alarm woke me at 2. You have the aws CLI in the Terminal as a read-only analyst, plus jq over the exported CloudTrail files.",
        'The SIEM now speaks AWS: CloudTrail, GuardDuty and the GitHub audit log are all real JSON. Click the { [+] toggles to open a record.',
        'Start with your inbox.',
      ],
      again: ['Inbox first. Then the cloud queue.'],
    },
    dana: { talk: ["I'm cloud governance today. I asked for region limits a year ago."], again: ['Region SCP. I keep saying it.'] },
    mike: { talk: ["I'm finance. Forty-eight thousand dollars in a forecast is a lot."], again: ['Can we get that credited?'] },
    theo: { talk: ["I'm the platform engineer. The repo is mine."], again: ['I am so sorry about the .env.'] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the lab briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the cloud security inbox' },
    { id: 'key', type: 'encounter', target: 'theo', text: 'Theo is coming over about the repo', waitText: 'Someone is on the way to talk to you.' },
    { id: 'tickets', type: 'tickets', target: 'my-desk', text: 'Work through the cloud hygiene queue' },
    { id: 'hunt', type: 'terminal', match: HUNT_RE, target: 'my-desk', waitFor: 'alert', text: 'Terminal: list the IAM users with the aws CLI (look for one nobody created)', waitText: 'Waiting on the SIEM.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what the attacker did' },
  ],
  encounters: [{ id: 'key', type: 'walkup', npc: 'theo', after: 'inbox', delayMs: 1500, fallbackAt: 8 * 60 + 40, intro: 'Hey. I need to tell you something about last night.', conv: KEY_TALK }],

  score,
  debrief,

  caseFile: {
    id: 'halcyon-aws-2026',
    kind: 'lab',
    company: 'Halcyon Mutual',
    when: 'Oct 27, 2026 · Lab',
    title: 'The key on GitHub',
    pitch: 'An engineer makes a repo public with a .env inside. Forty seconds later a bot is calling the AWS APIs. AWS quarantines the key, but not before the attacker has launched miners in eight regions, created a backdoor admin user and started copying a claims backup bucket. Investigate it in real CloudTrail, GuardDuty and GitHub audit logs, with the aws CLI and jq.',
    tags: ['AWS', 'Leaked credentials', 'CloudTrail', 'GuardDuty', 'IAM persistence'],
    difficulty: 'Intermediate',
    headline: 'An IAM access key published in a public GitHub repo was used by an outside attacker within a minute: enumeration, crypto-mining instances in eight regions, a new admin user (aws-support-bot) created before AWS applied its quarantine policy, S3 downloads from the claims backup bucket, and CloudTrail switched off.',
    timeline: [
      { when: 'Mon 17:12:00', what: 'Theo changes halcyon/claims-etl from private to public. Its .env holds the access key of IAM user ci-deploy (GitHub audit log: repo.access).' },
      { when: 'Mon 17:12:20', what: 'GitHub secret scanning raises an alert for an AWS Access Key ID.' },
      { when: 'Mon 17:12:40', what: 'First use of the key from 203.0.113.88 with a Boto3 user agent: GetCallerIdentity.' },
      { when: 'Mon 17:13', what: 'ListUsers, ListAttachedUserPolicies, ListBuckets and DescribeInstances in eight regions; RunInstances of p3.16xlarge in eight regions (two fail on vCPU limits).' },
      { when: 'Mon 17:14', what: 'CreateUser aws-support-bot, AttachUserPolicy AdministratorAccess, CreateAccessKey, CreateLoginProfile, all from ci-deploy.' },
      { when: 'Mon 17:15', what: 'AWS attaches AWSCompromisedKeyQuarantineV3 to ci-deploy and emails the account. Later ci-deploy calls fail with an explicit deny.' },
      { when: 'Mon 17:16-17:22', what: 'The attacker continues as aws-support-bot: 38 S3 GetObject calls on halcyon-claims-backup and a console login with no MFA.' },
      { when: 'Mon 17:31', what: 'StopLogging on the management-events trail. More instances launched.' },
      { when: 'Mon 17:28-17:52', what: 'GuardDuty findings: Persistence, Stealth (CloudTrail disabled), Exfiltration (S3) and CryptoCurrency (DNS).' },
      { when: 'Tue 02:10', what: 'The budget alarm forecasts $48,215 against a $4,000 budget.' },
    ],
    realOutcome: [
      'Researchers who plant test credentials in public repos report that automated scanners find and use them within minutes (Unit 42 and others). AWS also scans public sources and applies a quarantine policy, but the policy limits the exposed key only.',
      'AWS\'s own documentation says the AWSCompromisedKeyQuarantine policy is applied when an IAM user\'s credentials are exposed publicly, and tells customers not to remove it until the Support case instructs them to.',
      'Crypto-mining on stolen cloud credentials is one of the most common outcomes, because compute is the quickest thing to monetize. Backdoor users and keys are the common persistence.',
      'CloudTrail attributes the quarantine policy attachment to the exposed user, so a reader of the log can mistake it for attacker activity. Know where AWS acts on your behalf.',
    ],
    failures: [
      'A long-lived access key existed at all, with broad permissions (PowerUserAccess plus iam:*).',
      'The key was stored in a .env file inside a repository that could be made public with one click.',
      'No guardrails: miners could start in eight regions the company never uses, and admin could create users and keys.',
      'No MFA on the new console user, and no alert when a user was created by a key from a new IP.',
      'CloudTrail could be stopped by a single API call from the same account, and it was.',
      'Relying on the provider\'s quarantine: it handled the key, not the backdoor user.',
    ],
    attack: [
      { id: 'T1552.001', name: 'Unsecured Credentials: Credentials In Files', fix: 'Never store keys in files. Use federated roles (GitHub OIDC), a secrets manager and pre-commit and push-protection secret scanning.' },
      { id: 'T1078.004', name: 'Valid Accounts: Cloud Accounts', fix: 'Alert when a key is used from outside its normal network, require short-lived credentials, and delete keys that are not in use.' },
      { id: 'T1580', name: 'Cloud Infrastructure Discovery', fix: 'Scope roles so CI cannot list users or all regions, and alert on enumeration across many regions in seconds.' },
      { id: 'T1496', name: 'Resource Hijacking', fix: 'Deny unused regions by SCP, set EC2 service quotas, and alarm on GPU instance launches and billing anomalies.' },
      { id: 'T1136.003', name: 'Create Account: Cloud Account', fix: 'Alert on CreateUser, CreateAccessKey and AttachUserPolicy of AdministratorAccess, and deny iam:* to CI roles.' },
      { id: 'T1530', name: 'Data from Cloud Storage', fix: 'Restrict sensitive buckets with bucket policies to named roles, log S3 data events, and alert on bulk reads by any new or unexpected identity.' },
      { id: 'T1562.008', name: 'Impair Defenses: Disable or Modify Cloud Logs', fix: 'Use an organization trail delivering to a separate log account, enable log file validation and deny StopLogging by SCP.' },
    ],
    resume: 'Investigated a simulated AWS credential-leak intrusion in Cyber Office: traced an access key from a public GitHub repo through CloudTrail, GuardDuty and the GitHub audit log to crypto-mining instances, a backdoor IAM admin and S3 exfiltration with the aws CLI and jq (MITRE ATT&CK T1552.001, T1136.003, T1562.008), and wrote a containment plan that revoked both identities. Score: {grade}.',
    sources: [
      { title: 'AWS Managed Policy reference: AWSCompromisedKeyQuarantineV3', url: 'https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSCompromisedKeyQuarantineV3.html' },
      { title: 'Palo Alto Networks Unit 42: Detecting exposed AWS IAM credentials', url: 'https://unit42.paloaltonetworks.com/detecting-exposed-aws-iam-credentials/' },
      { title: 'AWS CloudTrail: CloudTrail record contents', url: 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-event-reference-record-contents.html' },
      { title: 'Amazon GuardDuty: finding types', url: 'https://docs.aws.amazon.com/guardduty/latest/ug/guardduty_finding-types.html' },
      { title: 'MITRE ATT&CK: Unsecured Credentials: Credentials In Files (T1552.001)', url: 'https://attack.mitre.org/techniques/T1552/001/' },
      { title: 'GitHub Docs: About secret scanning', url: 'https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning' },
    ],
    disclaimer: 'A fictional training scenario. Halcyon Mutual, its staff, the account id (the documentation account 111122223333), user and bucket names and IP addresses (documentation ranges) are invented. The behavior is documented: exposed keys are found and used quickly, AWS applies the quarantine policy to the exposed key only, and GuardDuty reports the listed finding types. Exact timings, the number of events and the AWS email wording are illustrative. Dollar costs are estimates for this lab.',
  },
};
