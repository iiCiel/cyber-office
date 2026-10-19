// Browser-test plan for the Halcyon AWS lab (same shape as PLANS in scripts/smoke-case.mjs).
export default {
  id: 'halcyon-aws-2026',
  report: ['aws-suspend'],
  steps: [
    { label: 'the engineer who pushed the key', walkup: [1] },
    { tickets: { 'ci-oidc': 'oidc', 'region-scp': 'scp', 'trail-protect': 'org' } },
  ],
  terminal: { cmd: 'aws iam list-users --query "Users[].UserName" --output text', expect: 'aws-support-bot' },
  terminalAfterAlert: true,
  search: ['repo.access public', 'eventName=CreateUser aws-support-bot', 'AttachUserPolicy AdministratorAccess', 'StopLogging', 'eventName=RunInstances p3.16xlarge', 'GetObject halcyon-claims-backup', 'ConsoleLogin aws-support-bot'],
  verdict: 'leak',
  actions: ['delkey', 'backdoor', 'terminate', 'trail', 'scp', 'ir', 'scan'],
};
