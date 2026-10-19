import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/game/shell.js';
import { makeAwsCli, makeAzCli, awsDenied, cliError } from '../src/game/cloudcli.js';

const WHO = 'arn:aws:iam::111122223333:user/ci-deploy';
const aws = makeAwsCli({
  'sts get-caller-identity': () => ({ UserId: 'AIDAEXAMPLE', Account: '111122223333', Arn: WHO }),
  'iam list-users': () => ({ Users: [{ UserName: 'ci-deploy', UserId: 'AIDA1', CreateDate: '2024-01-02T10:00:00+00:00' }, { UserName: 'backup-svc', UserId: 'AIDA2', CreateDate: '2025-06-01T10:00:00+00:00' }] }),
  's3 ls': () => '2026-01-10 09:12:44 halcyon-claims-backup\n2026-02-03 14:02:11 halcyon-web-assets\n',
  'iam get-role-policy': (f) => { throw awsDenied('iam:GetRolePolicy', WHO); },
  'ec2 describe-instances': (f) => (f.region === 'us-east-1' ? { Reservations: [] } : { Reservations: [{ Instances: [{ InstanceId: 'i-0abc', InstanceType: 'p3.16xlarge' }] }] }),
}, { identity: WHO });
const az = makeAzCli({
  'ad user list': () => [{ displayName: 'Mike Chen', userPrincipalName: 'm.chen@halcyonmutual.com' }, { displayName: 'Priya Raman', userPrincipalName: 'priya.r@halcyonmutual.com' }],
  'account show': () => ({ name: 'Halcyon Production', tenantId: 'x' }),
});
const ctx = { fs: {}, cwd: '/home/analyst01', commands: { aws, az } };
const sh = (l) => run(l, ctx).out;

test('aws: JSON uses 4 spaces; --query, --output text and table work', () => {
  assert.match(sh('aws sts get-caller-identity'), /^\{\n {4}"UserId": "AIDAEXAMPLE",/);
  assert.equal(sh("aws iam list-users --query 'Users[].UserName' --output text"), 'ci-deploy\tbackup-svc\n');
  assert.equal(sh("aws iam list-users --query 'Users[0].UserName'").trim(), '"ci-deploy"');
  assert.match(sh("aws iam list-users --query 'Users[?UserName==`backup-svc`].UserId'"), /AIDA2/);
  assert.match(sh('aws iam list-users --output table'), /\| UserName\s+\|/);
  assert.match(sh("aws sts get-caller-identity --query Arn --output text"), /user\/ci-deploy/);
});

test('aws: plain text commands, errors and region flag', () => {
  assert.match(sh('aws s3 ls'), /halcyon-claims-backup/);
  assert.match(sh('aws iam get-role-policy --role-name x --policy-name y'), /An error occurred \(AccessDenied\) when calling the GetRolePolicy operation: User: arn:aws:iam::111122223333:user\/ci-deploy is not authorized to perform: iam:GetRolePolicy/);
  assert.match(sh('aws ec2 describe-instances --region us-west-2'), /p3\.16xlarge/);
  assert.doesNotMatch(sh('aws ec2 describe-instances'), /p3/);
  assert.match(sh('aws frobnicate list'), /Invalid choice/);
  assert.match(sh('aws iam nope'), /Invalid choice, valid choices are/);
  assert.match(sh('aws --version'), /aws-cli\/2/);
});

test('aws pipes into jq', () => {
  assert.equal(sh("aws iam list-users | jq -r '.Users[].UserName'"), 'ci-deploy\nbackup-svc\n');
});

test('az: JSON uses 2 spaces, tsv, and the login error', () => {
  assert.match(sh('az ad user list'), /^\[\n {2}\{\n {4}"displayName": "Mike Chen"/);
  assert.equal(sh("az ad user list --query '[].userPrincipalName' -o tsv").trim(), 'm.chen@halcyonmutual.com\npriya.r@halcyonmutual.com');
  assert.match(sh('az account show'), /"tenantId"/);
  assert.match(sh('az nonsense list'), /is not in the 'az' command group/);
  const out = run('az ad user list', { ...ctx, commands: { az: makeAzCli({ 'ad user list': () => [] }, { loggedIn: false }) } }).out;
  assert.match(out, /Please run 'az login'/);
});

test('cliError text is printed as the error', () => {
  const r = run('aws sts get-caller-identity', { ...ctx, commands: { aws: makeAwsCli({ 'sts get-caller-identity': () => { throw cliError('Unable to locate credentials. You can configure credentials by running "aws configure".'); } }) } });
  assert.match(r.out, /Unable to locate credentials/);
});
