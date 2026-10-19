// Lab: "The key on GitHub" (Halcyon Mutual, Tuesday Oct 27, 2026). A FICTIONAL AWS intrusion built from documented behavior:
// long-lived IAM access keys pushed to a public GitHub repo are found by bots within minutes. AWS notices too and attaches the
// AWSCompromisedKeyQuarantineV3 policy to the exposed user, but only after the attacker has already made a backdoor user.
// Every record is real CloudTrail / GuardDuty / GitHub audit JSON.
//
//   Mon 17:12  Theo makes the repo halcyon/claims-etl public; its .env holds the access key of IAM user ci-deploy (T1552.001)
//   Mon 17:12  first use of the key from 203.0.113.88 (a hosting provider) 40 seconds later: GetCallerIdentity (T1078.004)
//   Mon 17:13  enumeration: ListUsers, ListAttachedUserPolicies, ListBuckets, DescribeInstances in every region (T1580, T1087.004)
//   Mon 17:14  RunInstances of GPU instances in 8 regions (T1496), then CreateUser + AdministratorAccess + CreateAccessKey (T1136.003)
//   Mon 17:15  AWS attaches the quarantine policy to ci-deploy. Further ci-deploy calls fail with an explicit deny.
//   Mon 17:16  the attacker switches to the backdoor user's key: S3 GetObject on halcyon-claims-backup (T1530), console login, StopLogging (T1562.008)
//   Mon 17:28+ GuardDuty findings arrive; Tue 02:10 the budget alarm; Tue 08:05 your shift.
// Decoys: ci-deploy's normal calls from the GitHub Actions runner, Dana's console login with MFA, the ETL role, an old test user.

import { T, logBuilder, finishDays } from '../../game/logkit.js';
import { AWS_UA, AWS_ACCOUNT, s3Resources, remoteIp } from '../../game/cloudfmt.js';

export const DATE = { weekday: 'TUE', name: 'Tuesday', month: 'Oct', day: 27, year: 2026, domain: 'halcyonmutual.local', netbios: 'HALCYON' };
const DAY = 86400;
const A = (day, h, m, s = 0) => day * DAY + T(h, m, s);

export const ATT = '203.0.113.88';
export const ATT_CONSOLE = '198.51.100.140';
const GH = '192.0.2.50'; // GitHub Actions runner (stand-in)
const OFFICE = '192.0.2.25';
export const REGIONS = ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-northeast-1'];
export const BUCKET = 'halcyon-claims-backup';
export const BACKDOOR = 'aws-support-bot';
const BOTO = AWS_UA.boto3;
const CI_KEY = 'AKIA3HALCYONCIDEPLOY'.slice(0, 20);
export const BACKDOOR_KEY = 'AKIA3ATTACKERBACKDR1'.slice(0, 20);
const CI = { type: 'IAMUser', name: 'ci-deploy', accessKey: CI_KEY };
const BD = { type: 'IAMUser', name: BACKDOOR, accessKey: BACKDOOR_KEY };

export const IP_INFO = {
  [ATT]: { where: 'Netherlands', owner: 'AS-SHADOWHOST (bulletproof hosting)', note: 'Used the ci-deploy key 40 seconds after the repo went public, then created the backdoor user. Same hosting company as the week-one attacker. (Stand-in IP.)', external: true },
  [ATT_CONSOLE]: { where: 'Romania', owner: 'Anonymizing VPN service', note: 'The console login for the backdoor user came from here. (Stand-in IP.)', external: true },
  [GH]: { where: 'United States', owner: 'GitHub Actions runner (stand-in)', note: 'Where ci-deploy is supposed to be used from: the build pipeline.' },
  'AWS Internal': { where: 'AWS', owner: 'Amazon Web Services', note: 'CloudTrail shows "AWS Internal" when AWS itself acted: here it attached the quarantine policy.' },
  [OFFICE]: { where: 'United States', owner: 'Halcyon office egress', note: 'Staff console logins come from here.' },
};

const gdActor = (ip) => ({ actionType: 'AWS_API_CALL', awsApiCallAction: { api: 'DescribeInstances', serviceName: 'ec2.amazonaws.com', callerType: 'Remote IP', remoteIpDetails: remoteIp(ip, { country: 'Netherlands', city: 'Amsterdam', org: 'AS-SHADOWHOST', asn: '64496' }), affectedResources: {} } });

export function generateLogs({ nowMinutes = 24 * 60 } = {}) {
  const b = logBuilder(2710);
  const { r, aws, pick } = b;
  const j = (n) => Math.floor(r() * n);

  // ---- Monday workday: ci-deploy doing its job from the GitHub runner, and the staff ----
  for (let t = A(-1, 8, 40); t < A(-1, 17, 10); t += 1100 + j(1500)) {
    aws(t, { name: pick(['GetAuthorizationToken', 'PutObject', 'DescribeServices']), id: CI, ip: GH, ua: 'aws-sdk-js/3.451.0 ua/2.0 os/linux#5.15 lang/js md/nodejs#18.18.2 api/ecr#3.451.0', region: 'us-east-1' }, { noise: true });
  }
  aws(A(-1, 9, 14, 5), { name: 'ConsoleLogin', id: { type: 'IAMUser', name: 'dana.k', mfa: true }, ip: OFFICE, ua: AWS_UA.console, service: 'signin', response: { ConsoleLogin: 'Success' }, additional: { LoginTo: 'https://console.aws.amazon.com/console/home?state=hashArgs%23&isauthcode=true', MobileVersion: 'No', MFAUsed: 'Yes' }, noTls: true }, { noise: true, key: 'decoy-console-mfa' });
  for (let t = A(-1, 2, 0); t < A(0, 8, 0); t += 3600) {
    aws(t, { name: 'GetObject', id: { type: 'AssumedRole', name: 'halcyon-etl', session: 'i-0e7f8a9b', ec2: true }, ip: '10.40.8.15', data: true, ua: AWS_UA.boto3, params: { bucketName: BUCKET, Host: `${BUCKET}.s3.us-east-1.amazonaws.com`, key: `nightly/claims-${t % 97}.parquet` }, resources: s3Resources(BUCKET, `nightly/claims-${t % 97}.parquet`), additional: { bytesTransferredIn: 0, bytesTransferredOut: 41000000 + j(900000), AuthenticationMethod: 'AuthHeader', SignatureVersion: 'SigV4' } }, { noise: true, key: t === A(-1, 2, 0) ? 'decoy-etl' : undefined });
  }

  // ---- the leak ----
  b.record(A(-1, 17, 12, 0), 'github', 'github-audit', 'action=repo.access repo=halcyon/claims-etl actor=t.okoye visibility=public', (st) => ({
    '@timestamp': Date.parse(st.iso), _document_id: 'Q1c2X9a0e8m3Zr5yTq7vKw', action: 'repo.access', actor: 't.okoye', actor_ip: OFFICE, actor_is_bot: false, org: 'halcyon', repo: 'halcyon/claims-etl', visibility: 'public', previous_visibility: 'private', user_agent: AWS_UA.console, programmatic_access_type: 'OAuth access token', created_at: Date.parse(st.iso),
  }), { attack: true, key: 'repo-public', user: 't.okoye', ip: OFFICE });
  b.record(A(-1, 17, 12, 20), 'github', 'github-audit', 'action=secret_scanning_alert.create repo=halcyon/claims-etl secret_type=aws_access_key_id', (st) => ({
    '@timestamp': Date.parse(st.iso), action: 'secret_scanning_alert.create', org: 'halcyon', repo: 'halcyon/claims-etl', alert_number: 1, secret_type: 'aws_access_key_id', secret_type_display_name: 'Amazon AWS Access Key ID', state: 'open', actor: 'github-secret-scanning', location: '.env:3',
  }), { attack: true, key: 'secret-alert' });

  // ---- the attacker, with the ci-deploy key ----
  aws(A(-1, 17, 12, 40), { name: 'GetCallerIdentity', id: CI, ip: ATT, ua: BOTO, response: { userId: 'AIDA3HALCYONCI', account: AWS_ACCOUNT, arn: `arn:aws:iam::${AWS_ACCOUNT}:user/ci-deploy` }, readOnly: true }, { attack: true, key: 'first-use' });
  aws(A(-1, 17, 12, 46), { name: 'ListUsers', id: CI, ip: ATT, ua: BOTO, params: null }, { attack: true });
  aws(A(-1, 17, 12, 49), { name: 'ListAttachedUserPolicies', id: CI, ip: ATT, ua: BOTO, params: { userName: 'ci-deploy' } }, { attack: true, key: 'enum-policies' });
  aws(A(-1, 17, 12, 55), { name: 'ListBuckets', id: CI, ip: ATT, ua: BOTO, params: { Host: 's3.amazonaws.com' } }, { attack: true, key: 'list-buckets' });
  REGIONS.forEach((rg, i) => aws(A(-1, 17, 13, 2 + i * 2), { name: 'DescribeInstances', id: CI, ip: ATT, ua: BOTO, region: rg, params: { instancesSet: {}, filterSet: {} } }, { attack: true, key: i === 0 ? 'enum-regions' : undefined }));
  REGIONS.forEach((rg, i) => {
    const limit = i === 4 || i === 6;
    aws(A(-1, 17, 13, 40 + i * 5), {
      name: 'RunInstances', id: CI, ip: ATT, ua: BOTO, region: rg,
      params: { instancesSet: { items: [{ imageId: 'ami-0c7217cdde317cfec', minCount: 1, maxCount: 20, keyName: 'aws-key-9f3a' }] }, instanceType: 'p3.16xlarge', blockDeviceMapping: {}, availabilityZone: `${rg}a`, monitoring: { enabled: false }, disableApiTermination: false, clientToken: `tk-${rg}-${i}`, userData: '<sensitiveDataRemoved>', networkInterfaceSet: { items: [{ deviceIndex: 0, associatePublicIpAddress: true, groupSet: { items: [{ groupId: 'sg-0aa11bb22cc33dd44' }] } }] } },
      response: limit ? undefined : { requestId: `r-${i}`, reservationId: `r-0${i}a9b8c7d6e5f4`, ownerId: AWS_ACCOUNT, groupSet: {}, instancesSet: { items: [{ instanceId: `i-0${i}3f9a7c1d2e4b5a6`, imageId: 'ami-0c7217cdde317cfec', instanceState: { code: 0, name: 'pending' }, instanceType: 'p3.16xlarge', launchTime: 0 }] } },
      error: limit ? 'VcpuLimitExceeded' : undefined,
      errorMessage: limit ? 'You have requested more vCPU capacity than your current vCPU limit of 0 allows for the instance bucket that the specified instance type belongs to. Please visit http://aws.amazon.com/contact-us/ec2-request to request an adjustment to this limit.' : undefined,
      service: 'ec2',
    }, { attack: true, key: i === 0 ? 'runinstances' : undefined });
  });
  aws(A(-1, 17, 14, 44), { name: 'CreateUser', id: CI, ip: ATT, ua: BOTO, params: { userName: BACKDOOR }, response: { user: { path: '/', userName: BACKDOOR, userId: 'AIDA3ATTACKERBKDR', arn: `arn:aws:iam::${AWS_ACCOUNT}:user/${BACKDOOR}`, createDate: 'Oct 26, 2026, 9:14:44 PM' } } }, { attack: true, key: 'create-user', user: BACKDOOR });
  aws(A(-1, 17, 14, 49), { name: 'AttachUserPolicy', id: CI, ip: ATT, ua: BOTO, params: { userName: BACKDOOR, policyArn: 'arn:aws:iam::aws:policy/AdministratorAccess' } }, { attack: true, key: 'attach-admin', user: BACKDOOR });
  aws(A(-1, 17, 14, 53), { name: 'CreateAccessKey', id: CI, ip: ATT, ua: BOTO, params: { userName: BACKDOOR }, response: { accessKey: { userName: BACKDOOR, accessKeyId: BACKDOOR_KEY, status: 'Active', createDate: 'Oct 26, 2026, 9:14:53 PM', secretAccessKey: 'HIDDEN_DUE_TO_SECURITY_REASONS' } } }, { attack: true, key: 'create-key', user: BACKDOOR });
  aws(A(-1, 17, 14, 58), { name: 'CreateLoginProfile', id: CI, ip: ATT, ua: BOTO, params: { userName: BACKDOOR, passwordResetRequired: false } }, { attack: true, key: 'login-profile', user: BACKDOOR });

  // ---- AWS notices: the quarantine policy goes on ci-deploy ----
  aws(A(-1, 17, 15, 12), { name: 'AttachUserPolicy', id: CI, ip: 'AWS Internal', ua: AWS_UA.awsInternal, params: { userName: 'ci-deploy', policyArn: 'arn:aws:iam::aws:policy/AWSCompromisedKeyQuarantineV3' }, msgExtra: 'note="applied by AWS; CloudTrail attributes it to the exposed user"' }, { attack: true, key: 'quarantine', user: 'ci-deploy' });
  aws(A(-1, 17, 15, 40), { name: 'RunInstances', id: CI, ip: ATT, ua: BOTO, region: 'us-west-2', error: 'Client.UnauthorizedOperation', errorMessage: `You are not authorized to perform this operation. User: arn:aws:iam::${AWS_ACCOUNT}:user/ci-deploy is not authorized to perform: ec2:RunInstances on resource: arn:aws:ec2:us-west-2:${AWS_ACCOUNT}:instance/* with an explicit deny in an identity-based policy`, service: 'ec2' }, { attack: true, key: 'denied-after-quarantine' });
  aws(A(-1, 17, 15, 52), { name: 'CreateUser', id: CI, ip: ATT, ua: BOTO, error: 'AccessDenied', errorResource: `arn:aws:iam::${AWS_ACCOUNT}:user/svc-ops`, explicitDeny: true, params: { userName: 'svc-ops' } }, { attack: true });

  // ---- the backdoor user takes over ----
  aws(A(-1, 17, 16, 10), { name: 'GetCallerIdentity', id: BD, ip: ATT, ua: BOTO, response: { userId: 'AIDA3ATTACKERBKDR', account: AWS_ACCOUNT, arn: `arn:aws:iam::${AWS_ACCOUNT}:user/${BACKDOOR}` } }, { attack: true, key: 'backdoor-first-use', user: BACKDOOR });
  aws(A(-1, 17, 16, 50), { name: 'ListObjectsV2', id: BD, ip: ATT, ua: AWS_UA.cli2('s3.ls'), data: true, params: { bucketName: BUCKET, Host: `${BUCKET}.s3.us-east-1.amazonaws.com`, prefix: '' }, resources: s3Resources(BUCKET) }, { attack: true, user: BACKDOOR });
  for (let i = 0; i < 38; i++) {
    const key = `claims/2026/${pick(['07', '08', '09', '10'])}/claims-${1000 + i}.parquet`;
    aws(A(-1, 17, 17, 5) + i * 6, { name: 'GetObject', id: BD, ip: ATT, ua: AWS_UA.cli2('s3.cp'), data: true, params: { bucketName: BUCKET, Host: `${BUCKET}.s3.us-east-1.amazonaws.com`, key }, resources: s3Resources(BUCKET, key), additional: { bytesTransferredIn: 0, bytesTransferredOut: 52000000 + j(40000000), AuthenticationMethod: 'AuthHeader', SignatureVersion: 'SigV4' } }, { attack: true, key: i === 0 ? 's3-exfil' : undefined, user: BACKDOOR });
  }
  aws(A(-1, 17, 22, 31), { name: 'ConsoleLogin', id: { type: 'IAMUser', name: BACKDOOR, mfa: false }, ip: ATT_CONSOLE, ua: AWS_UA.console, service: 'signin', response: { ConsoleLogin: 'Success' }, additional: { LoginTo: 'https://console.aws.amazon.com/console/home', MobileVersion: 'No', MFAUsed: 'No' }, noTls: true }, { attack: true, key: 'console-login', user: BACKDOOR });
  aws(A(-1, 17, 31, 2), { name: 'StopLogging', id: BD, ip: ATT, ua: BOTO, params: { name: `arn:aws:cloudtrail:us-east-1:${AWS_ACCOUNT}:trail/management-events` } }, { attack: true, key: 'stop-logging', user: BACKDOOR });
  for (let i = 0; i < 6; i++) aws(A(-1, 17, 33, 10) + i * 20, { name: 'RunInstances', id: BD, ip: ATT_CONSOLE, ua: AWS_UA.console, region: REGIONS[i], service: 'ec2', params: { instancesSet: { items: [{ imageId: 'ami-0c7217cdde317cfec', minCount: 1, maxCount: 10 }] }, instanceType: 'c5.18xlarge', userData: '<sensitiveDataRemoved>' }, response: { reservationId: `r-0b${i}c9d8e7f6a5`, ownerId: AWS_ACCOUNT, instancesSet: { items: [{ instanceId: `i-0b${i}9a8c7e6d5f4a3`, instanceType: 'c5.18xlarge' }] } } }, { attack: true, user: BACKDOOR });

  // ---- GuardDuty: slower than the attacker ----
  const gdTime = A(-1, 17, 28, 14);
  b.guardduty(gdTime, { type: 'Persistence:IAMUser/AnomalousBehavior', severity: 5, title: `The user ${BACKDOOR} is behaving anomalously: persistence permissions were granted.`, description: 'An API commonly used to establish persistence (CreateUser, AttachUserPolicy, CreateAccessKey) was invoked anomalously by ci-deploy from 203.0.113.88.', resource: { resourceType: 'AccessKey', accessKeyDetails: { accessKeyId: CI_KEY, principalId: 'AIDA3HALCYONCI', userType: 'IAMUser', userName: 'ci-deploy' } }, action: gdActor(ATT) }, { attack: true, key: 'gd-persist' });
  b.guardduty(A(-1, 17, 34, 40), { type: 'Stealth:IAMUser/CloudTrailLoggingDisabled', severity: 5, title: 'AWS CloudTrail trail management-events was disabled.', description: `Trail management-events was disabled by ${BACKDOOR} from 203.0.113.88.`, resource: { resourceType: 'AccessKey', accessKeyDetails: { accessKeyId: BACKDOOR_KEY, userType: 'IAMUser', userName: BACKDOOR } }, action: { actionType: 'AWS_API_CALL', awsApiCallAction: { api: 'StopLogging', serviceName: 'cloudtrail.amazonaws.com', callerType: 'Remote IP', remoteIpDetails: remoteIp(ATT, { country: 'Netherlands', org: 'AS-SHADOWHOST', asn: '64496' }), affectedResources: {} } } }, { attack: true, key: 'gd-stealth' });
  b.guardduty(A(-1, 17, 41, 3), { type: 'Exfiltration:S3/AnomalousBehavior', severity: 8, title: `The user ${BACKDOOR} invoked an S3 API in an anomalous way (GetObject on ${BUCKET}).`, description: `${BACKDOOR} downloaded 38 objects from ${BUCKET}. This user has never read this bucket.`, resource: { resourceType: 'S3Bucket', s3BucketDetails: [{ name: BUCKET, type: 'Destination' }] }, action: { actionType: 'AWS_API_CALL', awsApiCallAction: { api: 'GetObject', serviceName: 's3.amazonaws.com', callerType: 'Remote IP', remoteIpDetails: remoteIp(ATT, { country: 'Netherlands', org: 'AS-SHADOWHOST', asn: '64496' }), affectedResources: {} } } }, { attack: true, key: 'gd-exfil' });
  b.guardduty(A(-1, 17, 52, 29), { type: 'CryptoCurrency:EC2/BitcoinTool.B!DNS', severity: 8, title: 'EC2 instance i-0033f9a7c1d2e4b5a is querying a domain name associated with Bitcoin-related activity.', description: 'EC2 instance i-0033f9a7c1d2e4b5a is querying a domain name that is associated with Bitcoin-related activity.', resource: { resourceType: 'Instance', instanceDetails: { instanceId: 'i-0033f9a7c1d2e4b5a', instanceType: 'p3.16xlarge', availabilityZone: 'us-west-1a' } }, action: { actionType: 'DNS_REQUEST', dnsRequestAction: { domain: 'xmr-pool.example', protocol: 'UDP', blocked: false } } }, { attack: true, key: 'gd-crypto' });

  // ---- Tuesday morning ----
  b.add(A(0, 2, 10, 0), 'aws-budgets', 'cloudwatch', 'AWS Budgets: Monthly cost budget "halcyon-prod" forecasted amount $48,215.77 exceeds 100% of the budgeted amount $4,000.00', { attack: true, key: 'budget' });
  return finishDays(b.ev, { nowMinutes, date: DATE });
}

export const CASE = {
  id: 'case',
  area: 'SOC investigation',
  title: 'An access key on GitHub, GPU instances in 8 regions, and a user nobody created',
  max: 40,
  question: 'What happened in the AWS account?',
  teaches: { skill: 'Investigate a leaked IAM access key in CloudTrail and GuardDuty, and find the persistence AWS did not remove', secplus: '4.9 Use data sources: cloud logs; 2.4 Malicious activity' },
  verdicts: [
    { id: 'leak', text: 'The ci-deploy access key was exposed in a public GitHub repo. An outside attacker used it to enumerate the account, launch crypto-mining instances, create a backdoor admin user (aws-support-bot) and copy data from the claims backup bucket.' },
    { id: 'root', text: 'The AWS root account password was guessed and the attacker logged in to the console.' },
    { id: 'aws', text: 'A flaw in AWS itself exposed the account. Nothing for us to fix.' },
    { id: 'insider', text: 'Theo did all of this. The calls came from his access key.' },
  ],
  correctVerdict: 'leak',
  wrongVerdictNotes: {
    root: 'There is no root login anywhere. Every call used an IAM access key (ci-deploy, then aws-support-bot), and the first one came 40 seconds after the repo went public.',
    aws: 'AWS did its part: it noticed the exposed key and quarantined it within seconds. The key was ours and the repo was ours.',
    insider: 'The calls came from 203.0.113.88, a hosting provider, with a Boto3 user agent, not from the build runner or the office. Theo\'s mistake was publishing the key; the attacker used it.',
  },
  actions: [
    { id: 'delkey', text: 'Deactivate and delete the ci-deploy access key, and move CI to short-lived credentials (GitHub OIDC role) so there is no key to leak', good: true },
    { id: 'backdoor', text: 'Disable the aws-support-bot user: deactivate its access key, delete its login profile and detach AdministratorAccess (keep the user for evidence)', good: true },
    { id: 'terminate', text: 'Snapshot, then terminate the attacker\'s instances in every region, and delete the aws-key-9f3a key pairs and the open security groups', good: true },
    { id: 'trail', text: 'Turn CloudTrail back on, and protect it (organization trail, log file validation, an SCP that denies StopLogging)', good: true },
    { id: 'scp', text: 'Add an SCP that denies unused regions, and tighten ci-deploy (and every other key) to least privilege', good: true },
    { id: 'ir', text: 'Open an incident: the claims backup bucket was read, so involve legal and privacy for notification analysis, and answer the AWS Support case', good: true },
    { id: 'scan', text: 'Turn on GitHub push protection and secret scanning for the org and add a pre-commit hook', good: true },
    { id: 'quarantine', text: 'Rely on the AWS quarantine policy. AWS already handled it.', good: false, why: 'The quarantine policy only restricts the exposed key (ci-deploy). The backdoor user and its key were created seconds before it was applied and are untouched. This is the detail that turns a bill into a breach.' },
    { id: 'repodel', text: 'Delete the GitHub repo and call it done', good: false, why: 'Deleting the repo does not revoke the key. Copies exist in forks, caches and the attacker\'s hands. Revoke the credential first.' },
    { id: 'bucket', text: 'Delete the claims backup bucket so nothing else can be taken', good: false, why: 'That destroys the evidence and the company\'s backups. Contain the identity, keep the data.' },
    { id: 'logs', text: 'Delete the CloudTrail logs to stop the leak spreading', good: false, why: 'Logs are the evidence, and may be covered by legal hold. They also show what the backdoor user did.' },
  ],
  primaryEvidence: { key: 'create-user', note: 'The key line: CreateUser aws-support-bot, called by ci-deploy from 203.0.113.88 at 17:14:44, one minute before AWS quarantined the key.' },
  keyEvidence: ['repo-public', 'first-use', 'enum-regions', 'runinstances', 'create-user', 'attach-admin', 'create-key', 'quarantine', 's3-exfil', 'stop-logging', 'console-login'],
  containedRequires: ['delkey', 'backdoor'],
  costs: {
    contained: { amount: 52000, text: 'Compute charges for 20 minutes of miners (AWS often credits some), response time and notification analysis (estimate for this lab)' },
    breach: { amount: 480000, text: 'The backdoor admin stays: mining bills, claims data copied again and a notification event (estimate for this lab)' },
  },
  perfectWhy: 'Right order: revoke the credential and the persistence (the exposed key AND the backdoor user), stop the compute, restore and protect the logs, then fix the habit that caused it: long-lived keys in repos.',
  notSubmittedWhy: 'Nobody wrote it up. The backdoor admin user is still active.',
};

export const ALERTS = [
  {
    id: 'aws-key-geo',
    title: 'IAM access key used from an unusual IP: ci-deploy outside the build pipeline',
    severity: 'High',
    rule: 'An access key that normally calls the AWS APIs from the CI runner range is used from a different network.',
    fields: [['User', 'ci-deploy'], ['Source', '203.0.113.88'], ['Normal source', '192.0.2.50 (GitHub Actions runner)'], ['First seen', 'Mon 17:12:40']],
    trigger: { when: (st, min) => min >= 8 * 60 + 40 },
    notice: '🚨 SIEM alert (High): ci-deploy key used from 203.0.113.88',
    chat: ['This key only ever runs in the build pipeline. Now it is calling ListUsers and DescribeInstances from a hosting provider.', 'Start with the GitHub audit log. Then follow the key.'],
  },
  {
    id: 'aws-trail',
    main: true,
    title: 'CloudTrail logging stopped, and a new IAM user has AdministratorAccess',
    severity: 'Critical',
    rule: 'StopLogging on a trail, or AttachUserPolicy of AdministratorAccess to a user created in the last 24 hours.',
    fields: [['Trail', 'management-events (us-east-1)'], ['Actor', 'aws-support-bot'], ['New user created by', 'ci-deploy'], ['GuardDuty', 'Stealth:IAMUser/CloudTrailLoggingDisabled, Exfiltration:S3/AnomalousBehavior']],
    trigger: { when: (st, min) => (st.visited.includes('tickets') && min >= 9 * 60 + 30) || min >= 10 * 60 + 30 },
    notice: '🚨 SIEM alert (Critical): CloudTrail stopped, new admin user aws-support-bot',
    chat: ['Someone turned the logging off. That is what an attacker does after they have what they came for.', 'Search the account in order: who made aws-support-bot? When? And did AWS\'s quarantine policy touch it?', 'Use the aws CLI and jq in the Terminal if you like, then write the case up at the SOC console.'],
    case: CASE,
  },
];
