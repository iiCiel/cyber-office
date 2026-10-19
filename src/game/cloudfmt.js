// Cloud and identity logs, in the JSON shapes the real services write:
//   AWS CloudTrail records, GuardDuty findings, Okta System Log events, Microsoft Entra ID sign-in and audit logs,
//   and Microsoft Purview / Microsoft 365 Unified Audit Log records.
//
// Every builder returns a plain object; the SIEM prints it with JSON.stringify and extracts fields from it, the same way
// Splunk's AWS / Okta / Microsoft add-ons do. Ids are derived from a seed string, so logs stay identical on every run.
// Field names, value spellings and nesting follow each vendor's documentation (docs.aws.amazon.com CloudTrail record
// contents, developer.okta.com System Log API, learn.microsoft.com Graph signIn / directoryAudit, Purview audit schema).

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const HEXD = '0123456789abcdef';
const B62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function seeded(seed) {
  let a = [...String(seed)].reduce((x, c) => (Math.imul(x, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic id: id('seed', 20, B32) etc. */
export function fakeId(seed, len, alphabet = B32) {
  const r = seeded(seed);
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(r() * alphabet.length)];
  return s;
}
export const uuid = (seed) => {
  const h = fakeId(seed, 32, HEXD);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

// ---------------------------------------------------------------------------------------------- AWS

export const AWS_ACCOUNT = '111122223333'; // the documentation account id

const AWS_SERVICE = {
  s3: ['ListBuckets', 'GetObject', 'PutObject', 'DeleteObject', 'ListObjects', 'ListObjectsV2', 'GetBucketAcl', 'PutBucketPolicy', 'GetBucketPolicy', 'GetBucketLocation', 'DeleteBucket', 'PutBucketAcl', 'CopyObject', 'GetBucketPublicAccessBlock', 'PutBucketPublicAccessBlock', 'HeadObject'],
  sts: ['GetCallerIdentity', 'AssumeRole', 'GetSessionToken', 'AssumeRoleWithWebIdentity'],
  iam: ['CreateUser', 'CreateAccessKey', 'AttachUserPolicy', 'PutUserPolicy', 'ListUsers', 'ListRoles', 'ListAttachedUserPolicies', 'ListAccessKeys', 'GetUser', 'CreateLoginProfile', 'UpdateAccessKey', 'DeleteAccessKey', 'AttachRolePolicy', 'CreateRole', 'ListPolicies', 'GetRolePolicy', 'ListRolePolicies', 'ListAttachedRolePolicies', 'GetAccountAuthorizationDetails', 'AddUserToGroup', 'UpdateAssumeRolePolicy', 'DeactivateMFADevice', 'PutRolePolicy', 'GetAccountSummary'],
  ec2: ['RunInstances', 'DescribeInstances', 'TerminateInstances', 'StopInstances', 'DescribeSecurityGroups', 'AuthorizeSecurityGroupIngress', 'CreateKeyPair', 'ImportKeyPair', 'DescribeRegions', 'CreateSnapshot', 'ModifySnapshotAttribute', 'DescribeSnapshots', 'CreateSecurityGroup', 'DescribeImages', 'DescribeVolumes', 'DeleteSnapshot', 'DescribeInstanceTypes', 'GetEbsEncryptionByDefault', 'DescribeAddresses', 'DescribeVpcs', 'GetConsoleOutput', 'CreateVolume', 'AttachVolume', 'DescribeInstanceStatus', 'ModifyInstanceAttribute', 'DeleteSecurityGroup', 'DescribeNetworkInterfaces', 'GetPasswordData'],
  cloudtrail: ['StopLogging', 'DeleteTrail', 'UpdateTrail', 'DescribeTrails', 'LookupEvents', 'PutEventSelectors', 'GetTrailStatus', 'StartLogging', 'GetEventSelectors'],
  guardduty: ['ListDetectors', 'DeleteDetector', 'UpdateDetector', 'ListFindings', 'GetFindings', 'CreateIPSet', 'UpdateIPSet', 'ArchiveFindings'],
  secretsmanager: ['GetSecretValue', 'ListSecrets', 'DescribeSecret', 'BatchGetSecretValue'],
  ssm: ['GetParameter', 'GetParameters', 'GetParametersByPath', 'SendCommand', 'StartSession', 'DescribeInstanceInformation'],
  kms: ['Decrypt', 'Encrypt', 'ListKeys', 'DescribeKey', 'GenerateDataKey', 'ScheduleKeyDeletion', 'DisableKey', 'CreateGrant'],
  lambda: ['ListFunctions20150331', 'GetFunction20150331v2', 'CreateFunction20150331', 'Invoke', 'UpdateFunctionCode20150331v2', 'ListFunctions'],
  rds: ['DescribeDBInstances', 'CreateDBSnapshot', 'ModifyDBSnapshotAttribute', 'DeleteDBInstance', 'RestoreDBInstanceFromDBSnapshot', 'ModifyDBInstance'],
  organizations: ['ListAccounts', 'DescribeOrganization', 'ListRoots', 'LeaveOrganization'],
  config: ['StopConfigurationRecorder', 'DeleteConfigRule', 'DescribeConfigRules'],
  signin: ['ConsoleLogin', 'SwitchRole', 'CheckMfa', 'RenewRole'],
  cloudwatch: ['PutMetricData', 'DeleteAlarms', 'DescribeAlarms'],
  logs: ['DeleteLogGroup', 'DescribeLogGroups', 'DeleteLogStream', 'PutRetentionPolicy'],
  ecr: ['GetAuthorizationToken', 'BatchGetImage', 'DescribeRepositories', 'GetDownloadUrlForLayer'],
  eks: ['DescribeCluster', 'ListClusters'],
  sns: ['Publish', 'ListTopics'],
  dynamodb: ['Scan', 'ListTables', 'DescribeTable', 'GetItem', 'ExportTableToPointInTime'],
};
const EVENT_SOURCE = Object.fromEntries(Object.entries(AWS_SERVICE).flatMap(([svc, names]) => names.map((n) => [n, svc])));
export const awsService = (eventName) => EVENT_SOURCE[eventName] || 'sts';
const IAM_PREFIX = { ListFunctions20150331: 'lambda:ListFunctions', GetFunction20150331v2: 'lambda:GetFunction', ConsoleLogin: 'signin:ConsoleLogin' };
export const awsAction = (name) => IAM_PREFIX[name] || `${awsService(name)}:${name}`;

const UA_CLI2 = 'aws-cli/2.13.25 Python/3.11.5 Linux/5.15.0-1049-aws exe/x86_64.ubuntu.22 prompt/off';
export const AWS_UA = {
  cli2: (cmd) => `${UA_CLI2} command/${cmd}`,
  cli1: (cmd = 's3.sync') => `[aws-cli/1.16.130 Python/2.7.15 Linux/4.14.88-88.76.amzn2.x86_64 botocore/1.12.120] command/${cmd}`,
  boto3: 'Boto3/1.28.57 md/Botocore#1.31.57 ua/2.0 os/linux#5.15.0-1049-aws md/arch#x86_64 lang/python#3.11.5 md/pyimpl#CPython cfg/retry-mode#legacy Botocore/1.31.57',
  console: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  terraform: 'APN/1.0 HashiCorp/1.0 Terraform/1.5.7 (+https://www.terraform.io) terraform-provider-aws/5.20.0 (+https://registry.terraform.io/providers/hashicorp/aws) aws-sdk-go-v2/1.21.0',
  awsInternal: 'AWS Internal',
  s3Console: '[S3Console/0.4, aws-internal/3 aws-sdk-java/1.12.531 Linux/5.10.192-183.736.amzn2int.x86_64 OpenJDK_64-Bit_Server_VM/25.382-b09 java/1.8.0_382 vendor/Oracle_Corporation cfg/retry-mode/standard]',
};

/**
 * One CloudTrail record, in the layout of the log files CloudTrail delivers to S3.
 * @param {object} o
 * @param {string} o.utc ISO time with Z   @param {string} o.name eventName   @param {string} [o.ip]   @param {string} [o.ua]
 * @param {{type:'IAMUser'|'AssumedRole'|'Root'|'AWSService'|'FederatedUser', name:string, session?:string, mfa?:boolean, accessKey?:string, role?:string, via?:string}} o.id
 * @param {object|null} [o.params] requestParameters   @param {object|null} [o.response] responseElements
 * @param {string} [o.error] errorCode (e.g. AccessDenied, Client.UnauthorizedOperation)   @param {string} [o.errorMessage]
 * @param {boolean} [o.data] true for S3/Lambda data events   @param {Array} [o.resources]
 */
export function cloudtrail(o) {
  const account = o.account || AWS_ACCOUNT;
  const region = o.region || 'us-east-1';
  const id = o.id;
  const seed = `${o.utc}${o.name}${id.name}${o.ip || ''}${o.seq || 0}`;
  const service = o.service || awsService(o.name);
  let userIdentity;
  if (id.type === 'Root') {
    userIdentity = { type: 'Root', principalId: account, arn: `arn:aws:iam::${account}:root`, accountId: account, accessKeyId: id.accessKey ?? '', userName: 'root', sessionContext: { attributes: { creationDate: o.utc.replace(/(:\d\d)Z$/, ':00Z'), mfaAuthenticated: id.mfa ? 'true' : 'false' } } };
    if (!id.accessKey && o.name !== 'ConsoleLogin') userIdentity.accessKeyId = '';
  } else if (id.type === 'IAMUser') {
    userIdentity = {
      type: 'IAMUser',
      principalId: `AIDA${fakeId(`pid${id.name}`, 17)}`,
      arn: `arn:aws:iam::${account}:user/${id.name}`,
      accountId: account,
      accessKeyId: id.accessKey ?? `AKIA${fakeId(`ak${id.name}`, 16)}`,
      userName: id.name,
    };
    if (id.mfa !== undefined && o.name !== 'ConsoleLogin') userIdentity.sessionContext = { attributes: { creationDate: o.utc, mfaAuthenticated: id.mfa ? 'true' : 'false' } };
    if (o.name === 'ConsoleLogin') delete userIdentity.accessKeyId;
  } else if (id.type === 'AssumedRole') {
    const roleId = `AROA${fakeId(`rid${id.role || id.name}`, 17)}`;
    const roleName = id.role || id.name;
    userIdentity = {
      type: 'AssumedRole',
      principalId: `${roleId}:${id.session}`,
      arn: `arn:aws:sts::${account}:assumed-role/${roleName}/${id.session}`,
      accountId: account,
      accessKeyId: id.accessKey ?? `ASIA${fakeId(`as${roleName}${id.session}`, 16)}`,
      sessionContext: {
        sessionIssuer: { type: 'Role', principalId: roleId, arn: `arn:aws:iam::${account}:role/${roleName}`, accountId: account, userName: roleName },
        webIdFederationData: {},
        attributes: { creationDate: id.created || o.utc, mfaAuthenticated: id.mfa ? 'true' : 'false' },
        ...(id.ec2 ? { ec2RoleDelivery: '1.0' } : {}),
      },
    };
  } else if (id.type === 'AWSService') {
    userIdentity = { type: 'AWSService', invokedBy: id.name };
  } else {
    userIdentity = { type: id.type, principalId: `${account}:${id.name}`, arn: `arn:aws:sts::${account}:federated-user/${id.name}`, accountId: account, accessKeyId: id.accessKey ?? `ASIA${fakeId(`fu${id.name}`, 16)}` };
  }
  if (id.via) userIdentity.invokedBy = id.via;

  const readOnly = o.readOnly ?? /^(Get|List|Describe|Lookup|Head|Check)/.test(o.name);
  const rec = {
    eventVersion: o.version || '1.08',
    userIdentity,
    eventTime: o.utc,
    eventSource: `${service}.amazonaws.com`,
    eventName: o.name,
    awsRegion: region,
    sourceIPAddress: o.ip || '203.0.113.10',
    userAgent: o.ua || AWS_UA.cli2(`${service}.${o.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`),
    requestParameters: o.params === undefined ? null : o.params,
    responseElements: o.error ? null : o.response === undefined ? null : o.response,
    requestID: uuid(`req${seed}`),
    eventID: uuid(`evt${seed}`),
    readOnly,
    eventType: o.name === 'ConsoleLogin' ? 'AwsConsoleSignIn' : 'AwsApiCall',
    managementEvent: !o.data,
    recipientAccountId: account,
    eventCategory: o.data ? 'Data' : 'Management',
  };
  if (o.error) {
    rec.errorCode = o.error;
    rec.errorMessage = o.errorMessage || (o.error === 'AccessDenied' || o.error.includes('Unauthorized') ? `User: ${userIdentity.arn} is not authorized to perform: ${awsAction(o.name)}${o.errorResource ? ` on resource: ${o.errorResource}` : ''}${o.explicitDeny ? ' with an explicit deny in an identity-based policy' : ''}` : o.error);
  }
  if (o.resources) rec.resources = o.resources;
  if (o.additional) rec.additionalEventData = o.additional;
  if (o.sharedEventID) rec.sharedEventID = o.sharedEventID;
  if (o.tls !== false && !o.noTls) rec.tlsDetails = { tlsVersion: 'TLSv1.3', cipherSuite: 'TLS_AES_128_GCM_SHA256', clientProvidedHostHeader: `${service}.${region}.amazonaws.com` };
  // CloudTrail's own key order (userIdentity first, then times, then the call) is kept by construction above.
  return rec;
}

export const s3Resources = (bucket, key) => [
  ...(key ? [{ type: 'AWS::S3::Object', ARN: `arn:aws:s3:::${bucket}/${key}` }] : []),
  { accountId: AWS_ACCOUNT, type: 'AWS::S3::Bucket', ARN: `arn:aws:s3:::${bucket}` },
];

/** A GuardDuty finding as delivered by EventBridge (what a SIEM ingests). */
export function guardduty(o) {
  const account = o.account || AWS_ACCOUNT;
  const region = o.region || 'us-east-1';
  const detectorId = fakeId(`det${account}`, 32, HEXD);
  const gid = fakeId(`gd${o.utc}${o.type}`, 32, HEXD);
  const detail = {
    schemaVersion: '2.0',
    accountId: account,
    region,
    partition: 'aws',
    id: gid,
    arn: `arn:aws:guardduty:${region}:${account}:detector/${detectorId}/finding/${gid}`,
    type: o.type,
    resource: o.resource,
    service: {
      serviceName: 'guardduty',
      detectorId,
      action: o.action,
      resourceRole: o.role || 'TARGET',
      additionalInfo: o.additionalInfo || { threatListName: 'GeneratedFindingThreatListName', sample: false },
      eventFirstSeen: o.first || o.utc,
      eventLastSeen: o.last || o.utc,
      archived: false,
      count: o.count || 1,
    },
    severity: o.severity ?? 5,
    createdAt: o.utc,
    updatedAt: o.last || o.utc,
    title: o.title,
    description: o.description,
  };
  return { version: '0', id: uuid(`eb${gid}`), 'detail-type': 'GuardDuty Finding', source: 'aws.guardduty', account, time: o.utc, region, resources: [], detail };
}

export const remoteIp = (ip, { country = 'Netherlands', city = '', org = 'Unknown', asn = '0', lat = 52.37, lon = 4.9 } = {}) => ({
  ipAddressV4: ip,
  organization: { asn, asnOrg: org, isp: org, org },
  country: { countryName: country },
  city: { cityName: city },
  geoLocation: { lat, lon },
});

// ---------------------------------------------------------------------------------------------- Okta

const OKTA_LEGACY = { 'user.session.start': 'core.user_auth.login_success', 'user.authentication.auth_via_mfa': 'core.user.factor.attempt_success', 'user.mfa.factor.reset_all': 'core.user.factor.reset_all' };

/**
 * An Okta System Log event (GET /api/v1/logs). `actor` is an email; `geo` {city,state,country,lat,lon}.
 */
export function okta(o) {
  const actor = o.actor || 'unknown';
  const uid = `00u${fakeId(`u${actor}`, 17, B62)}`;
  const ua = o.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';
  const geo = o.geo || { city: 'Las Vegas', state: 'Nevada', country: 'United States', postalCode: '89109', lat: 36.1, lon: -115.17 };
  const gctx = { city: geo.city, state: geo.state, country: geo.country, postalCode: geo.postalCode || '', geolocation: { lat: geo.lat, lon: geo.lon } };
  const rid = fakeId(`rid${o.utc}${o.eventType}${actor}`, 24, B62);
  return {
    actor: { id: o.actorId || uid, type: o.actorType || 'User', alternateId: actor, displayName: o.display || actor.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), detailEntry: null },
    client: { userAgent: { rawUserAgent: ua, os: /Mac/.test(ua) ? 'Mac OS X' : /iPhone/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : 'Windows 10', browser: /Firefox/.test(ua) ? 'FIREFOX' : /Safari\/[\d.]+$/.test(ua) && !/Chrome/.test(ua) ? 'SAFARI' : 'CHROME' }, zone: 'null', device: /iPhone|Android/.test(ua) ? 'Mobile' : 'Computer', id: null, ipAddress: o.ip, geographicalContext: gctx },
    device: null,
    authenticationContext: { authenticationProvider: o.authProvider ?? null, credentialProvider: null, credentialType: o.credentialType ?? null, issuer: null, interface: null, authenticationStep: 0, externalSessionId: `idx${fakeId(`sess${actor}${o.session || ''}`, 24, B62)}` },
    displayMessage: o.displayMessage || o.eventType,
    eventType: o.eventType,
    outcome: { result: o.result || 'SUCCESS', reason: o.reason ?? null },
    published: o.utc.replace(/Z$/, '.000Z'),
    securityContext: { asNumber: o.asn ?? null, asOrg: o.asOrg ?? null, isp: o.isp ?? null, domain: o.domain ?? null, isProxy: !!o.proxy },
    severity: o.severity || (o.result === 'FAILURE' || o.result === 'DENY' ? 'WARN' : 'INFO'),
    debugContext: { debugData: { requestId: rid, requestUri: o.uri || '/api/v1/authn', threatSuspected: o.threat ? 'true' : 'false', url: o.uri || '/api/v1/authn', ...(o.debug || {}) } },
    legacyEventType: o.legacy || OKTA_LEGACY[o.eventType] || null,
    transaction: { type: 'WEB', id: rid, detail: {} },
    uuid: uuid(`ok${o.utc}${o.eventType}${actor}`),
    version: '0',
    request: { ipChain: [{ ip: o.ip, geographicalContext: gctx, version: 'V4', source: null }] },
    target: o.targets ?? null,
  };
}

// ---------------------------------------------------------------------------------------------- Microsoft Entra ID

export const AADSTS = {
  0: 'Other.',
  50126: 'Error validating credentials due to invalid username or password.',
  50053: 'Account is locked because user tried to sign in too many times with an incorrect user ID or password.',
  50057: 'User account is disabled. The account has been disabled by an administrator.',
  50055: 'The password is expired.',
  50076: "Due to a configuration change made by your administrator, or because you moved to a new location, you must use multi-factor authentication to access '{resource}'.",
  50074: 'Strong Authentication is required.',
  50158: 'External security challenge not satisfied.',
  50034: "The user account {id} does not exist in the {tenant} directory. To sign into this application, the account must be added to the directory.",
  50072: 'User needs to enroll for second factor authentication (interactive).',
  500121: 'Authentication failed during strong authentication request.',
  53003: 'Access has been blocked by Conditional Access policies. The access policy does not allow token issuance.',
  53000: 'Device is not in required device state: compliant. Conditional Access policy requires a compliant device, and the device is not compliant.',
  65001: 'The user or administrator has not consented to use the application with ID. Send an interactive authorization request for this user and resource.',
  70044: 'The session has expired or is invalid due to sign-in frequency checks by conditional access.',
  7000215: 'Invalid client secret provided.',
};

/** Microsoft Graph signIn resource (Entra admin center > Sign-in logs > Activity Details). */
export function entraSignIn(o) {
  const upn = o.upn;
  const code = o.errorCode ?? 0;
  const ok = code === 0;
  const geo = o.geo || { city: 'New York', state: 'New York', country: 'US', lat: 40.71, lon: -74.0 };
  const res = o.resource || 'Office 365 Exchange Online';
  return {
    id: uuid(`si${o.utc}${upn}${o.ip}${code}`),
    createdDateTime: o.utc,
    userDisplayName: o.display || upn.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    userPrincipalName: upn,
    userId: uuid(`uid${upn}`),
    appId: o.appId || '00000002-0000-0ff1-ce00-000000000000',
    appDisplayName: o.app || 'Office 365 Exchange Online',
    ipAddress: o.ip,
    clientAppUsed: o.client || 'Browser',
    correlationId: uuid(`corr${o.utc}${upn}${o.ip}`),
    conditionalAccessStatus: o.ca || (ok ? 'success' : code === 53003 ? 'failure' : 'notApplied'),
    isInteractive: o.interactive ?? true,
    riskDetail: o.riskDetail || 'none',
    riskLevelAggregated: o.risk || 'none',
    riskLevelDuringSignIn: o.risk || 'none',
    riskState: o.riskState || 'none',
    riskEventTypes_v2: o.riskEvents || [],
    resourceDisplayName: res,
    resourceId: uuid(`res${res}`),
    status: { errorCode: code, failureReason: ok ? 'Other.' : (AADSTS[code] || 'Other.').replace('{resource}', res).replace('{id}', upn).replace('{tenant}', o.tenant || 'contoso'), additionalDetails: o.details ?? (ok ? null : code === 50076 ? 'MFA required in Azure AD' : null) },
    deviceDetail: { deviceId: o.deviceId || '', displayName: o.deviceName || '', operatingSystem: o.os || 'Windows 10', browser: o.browser || 'Chrome 129.0.0', isCompliant: !!o.compliant, isManaged: !!o.managed, trustType: o.trust || '' },
    location: { city: geo.city, state: geo.state, countryOrRegion: geo.country, geoCoordinates: { latitude: geo.lat, longitude: geo.lon } },
    appliedConditionalAccessPolicies: o.policies || [],
    authenticationRequirement: o.authReq || (o.mfa ? 'multiFactorAuthentication' : 'singleFactorAuthentication'),
    authenticationDetails: o.authDetails || [{ authenticationStepDateTime: o.utc, authenticationMethod: 'Password', authenticationMethodDetail: 'Password in the cloud', succeeded: ok || code === 50076, authenticationStepResultDetail: ok ? 'Correct password' : code === 50126 ? 'Invalid password' : 'Correct password', authenticationStepRequirement: 'Primary authentication' }],
    authenticationProtocol: o.protocol || 'none',
    tokenIssuerType: 'AzureAD',
    userAgent: o.ua || (o.client === 'Browser' || !o.client ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36' : 'Microsoft Office/16.0'),
    signInEventTypes: [o.interactive === false ? 'nonInteractiveUser' : 'interactiveUser'],
    homeTenantId: uuid(`tenant${o.tenant || 'contoso'}`),
    resourceTenantId: uuid(`tenant${o.tenant || 'contoso'}`),
    ...(o.extra || {}),
  };
}

/** Microsoft Graph directoryAudit resource (Entra admin center > Audit logs). */
export function entraAudit(o) {
  const by = o.by || {};
  const initiatedBy = by.app
    ? { app: { appId: by.appId || uuid(`app${by.app}`), displayName: by.app, servicePrincipalId: uuid(`sp${by.app}`), servicePrincipalName: null }, user: null }
    : { user: { id: uuid(`uid${by.upn}`), displayName: by.display || by.upn, userPrincipalName: by.upn, ipAddress: by.ip || o.ip || null, userType: null, homeTenantId: null, homeTenantName: null }, app: null };
  return {
    id: uuid(`au${o.utc}${o.activity}${by.upn || by.app}`),
    category: o.category || 'UserManagement',
    correlationId: uuid(`ac${o.utc}${o.activity}`),
    result: o.result || 'success',
    resultReason: o.reason || '',
    activityDisplayName: o.activity,
    activityDateTime: o.utc,
    loggedByService: o.service || 'Core Directory',
    operationType: o.op || 'Update',
    initiatedBy,
    targetResources: (o.targets || []).map((t) => ({ id: t.id || uuid(`tr${t.name}`), displayName: t.name ?? null, type: t.type || 'User', userPrincipalName: t.upn ?? null, groupType: t.groupType ?? null, modifiedProperties: t.props || [] })),
    additionalDetails: o.details || [],
  };
}

export const modProp = (displayName, oldValue, newValue) => ({ displayName, oldValue: oldValue == null ? null : JSON.stringify(oldValue), newValue: newValue == null ? null : JSON.stringify(newValue) });

/** Microsoft Purview Unified Audit Log record (Search-UnifiedAuditLog / Office 365 Management Activity API). */
const UAL_TYPE = { ExchangeAdmin: 1, ExchangeItem: 2, ExchangeItemGroup: 3, SharePoint: 4, SharePointFileOperation: 6, AzureActiveDirectory: 8, AzureActiveDirectoryAccountLogon: 9, AzureActiveDirectoryStsLogon: 15, ExchangeItemAggregated: 50, SharePointSharingOperation: 14 };
export function ual(o) {
  const rec = {
    CreationTime: o.utc.replace(/Z$/, ''),
    Id: uuid(`ual${o.utc}${o.op}${o.user}`),
    Operation: o.op,
    OrganizationId: uuid(`org${o.org || 'tenant'}`),
    RecordType: UAL_TYPE[o.type] ?? 1,
    ResultStatus: o.result || 'Succeeded',
    UserKey: o.userKey || o.user,
    UserType: o.userType ?? 0,
    Version: 1,
    Workload: o.workload || 'Exchange',
    ObjectId: o.objectId,
    UserId: o.user,
    ClientIPAddress: o.ip,
    ClientIP: o.ip,
  };
  if (o.app) rec.AppId = o.appId || uuid(`ualapp${o.app}`);
  for (const [k, v] of Object.entries(o.fields || {})) rec[k] = v;
  return rec;
}

// ---------------------------------------------------------------------------------------------- legacy "k=v" messages -> records

/** Parse `a=b c="d e"` style compact messages. Returns { kv, rest } where rest is the text outside key=value pairs. */
export function parseKv(msg) {
  const kv = {};
  const rest = [];
  const re = /(\w[\w.-]*)=("([^"]*)"|\S+)/g;
  let last = 0;
  let m;
  while ((m = re.exec(msg))) {
    if (m.index > last) rest.push(msg.slice(last, m.index).trim());
    kv[m[1]] = m[3] !== undefined ? m[3] : m[2];
    last = re.lastIndex;
  }
  if (last < msg.length) rest.push(msg.slice(last).trim());
  return { kv, rest: rest.filter(Boolean).join(' ') };
}

const OKTA_NAMES = {
  'user.session.start': 'User login to Okta',
  'user.authentication.auth_via_mfa': 'Authentication of user via MFA',
  'user.authentication.sso': 'User single sign on to app',
  'user.mfa.factor.reset_all': 'Reset all MFA factors',
  'user.mfa.factor.activate': 'Activate user multifactor authentication',
  'user.account.reset_password': 'Reset password',
  'user.lifecycle.create': 'Create Okta user',
  'user.account.privilege.grant': 'Grant user privilege',
  'system.idp.lifecycle.create': 'Create Identity Provider',
  'policy.rule.update': 'Update rule from policy',
};

export function legacyOkta(e, utc) {
  const { kv, rest } = parseKv(e.msg);
  const actor = (kv.actor || kv.user || 'unknown').includes('@') ? kv.actor || kv.user : `${kv.actor || kv.user}@halcyonmutual.com`;
  const targets = kv.target ? [{ id: `00u${fakeId(`u${kv.target}`, 17, B62)}`, type: kv.eventType?.startsWith('system.idp') ? 'IdentityProvider' : 'User', alternateId: kv.target, displayName: kv.target.split('@')[0] }] : null;
  const geoMatch = (kv.geo || '').match(/^(.+?),\s*(\w+)$/);
  return okta({
    utc,
    eventType: kv.eventType || 'user.session.start',
    result: kv.outcome || 'SUCCESS',
    reason: kv.reason ? kv.reason.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) : null,
    actor,
    ip: kv.client_ip || e.ip || '203.0.113.10',
    geo: geoMatch ? { city: geoMatch[1], state: '', country: geoMatch[2] === 'US' ? 'United States' : geoMatch[2], lat: 0, lon: 0 } : undefined,
    displayMessage: kv.displayMessage || OKTA_NAMES[kv.eventType] || kv.eventType,
    targets,
    debug: kv.factor ? { factor: kv.factor.toUpperCase() } : undefined,
  });
}

/** Older cases wrote CloudTrail as one compact line (eventName=... userIdentity=Type:name/session sourceIPAddress=...). Print it as the real record. */
export function legacyCloudTrail(e, utc) {
  const { kv } = parseKv(e.msg);
  const [type, rest = 'unknown'] = (kv.userIdentity || 'AssumedRole:unknown').split(':');
  const [name, session] = rest.split('/');
  const bucket = kv.bucket;
  const data = !!bucket && /^(GetObject|ListObjectsV2|PutObject)$/.test(kv.eventName);
  const login = kv.eventName === 'ConsoleLogin';
  return cloudtrail({
    utc,
    name: kv.eventName,
    version: '1.05',
    id: type === 'AssumedRole' ? { type, name, session: session || 'i-0a1b2c3d', ec2: true } : { type, name, mfa: kv.mfaUsed === 'true' },
    ip: kv.sourceIPAddress,
    ua: login ? AWS_UA.console : kv.userAgent ? AWS_UA.cli1('s3.sync') : AWS_UA.boto3,
    data,
    params: bucket ? { bucketName: bucket, Host: `${bucket}.s3.amazonaws.com` } : null,
    resources: data ? s3Resources(bucket) : undefined,
    service: login ? 'signin' : undefined,
    response: login ? { ConsoleLogin: 'Success' } : undefined,
    additional: login ? { MFAUsed: kv.mfaUsed === 'true' ? 'Yes' : 'No', MobileVersion: 'No' } : undefined,
    noTls: true,
  });
}

/** Old compact m365-audit / exchange-audit lines -> Purview Unified Audit Log records. */
export function legacyUal(e, utc) {
  const { kv } = parseKv(e.msg);
  const exch = e.source === 'exchange-audit';
  return ual({
    utc,
    op: kv.Operation || kv.Cmdlet,
    type: exch ? 'ExchangeAdmin' : 'SharePointFileOperation',
    workload: exch ? 'Exchange' : 'SharePoint',
    user: kv.User || kv.Mailbox || e.user || 'unknown',
    ip: kv.ClientIP || e.ip || '',
    objectId: kv.Site || kv.Mailbox,
    fields: exch ? { Parameters: kv.Params ? [{ Name: 'Params', Value: kv.Params }] : [] } : { SiteUrl: kv.Site, ItemCount: Number(kv.Items) || undefined },
  });
}

/** Old compact azure-audit lines ("Add member to role | role=... target=... initiatedBy=... ip=... result=...") -> Entra directoryAudit records. */
export function legacyAzureAudit(e, utc) {
  const { kv } = parseKv(e.msg);
  const activity = e.msg.split(' | ')[0];
  const by = (kv.initiatedBy || e.user || 'unknown').replace(/^federated:/, '');
  return entraAudit({
    utc,
    activity,
    category: /role/i.test(activity) ? 'RoleManagement' : 'UserManagement',
    result: kv.result || 'success',
    by: { upn: by.includes('@') ? by : `${by}@corp.example`, ip: kv.ip || e.ip },
    targets: kv.target ? [{ name: kv.target, upn: kv.target, type: 'User', props: kv.role ? [modProp('Role.DisplayName', null, kv.role)] : [] }] : [],
  });
}
