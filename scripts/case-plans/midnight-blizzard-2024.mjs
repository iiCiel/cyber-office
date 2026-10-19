// Browser-test plan for the Microsoft / Midnight Blizzard 2024 case (same shape as PLANS in scripts/smoke-case.mjs).
export default {
  id: 'midnight-blizzard-2024',
  report: ['entra-blocked'],
  steps: [
    { tickets: { 'mfa-exception': 'enforce', 'app-approval': 'scope', 'audit-retention': 'keep' } },
  ],
  terminalAfterAlert: true,
  terminal: { cmd: "az rest --method get --url \"https://graph.microsoft.com/v1.0/servicePrincipals(appId='00000002-0000-0ff1-ce00-000000000000')/appRoleAssignedTo\" --query 'value[].principalDisplayName' -o tsv", expect: 'Azure-Sync-Helper' },
  afterAlert: [
    { label: 'secrets in the mailbox', walkup: [1] },
    { label: 'the executive who wants it kept quiet', walkup: [1] },
  ],
  search: [
    'index=azure status.errorCode=50126',
    'index=azure status.errorCode=50076',
    'index=azure userPrincipalName=qa-legacy07* status.errorCode=0',
    'index=azure activityDisplayName="Add app role assignment to service principal"',
    'index=azure activityDisplayName="Consent to application"',
    'index=azure maint.svc02 "Add user"',
    'index=azure initiatedBy.app.displayName=LabSync-Legacy activityDisplayName="Add application"',
    'index=azure targetResources{}.displayName=LabSync-Legacy "Certificates and secrets"',
    'index=azure servicePrincipalName=LabSync-Legacy',
    'index=azure servicePrincipalName=Azure-Sync-Helper',
    'index=o365 Operation=MailItemsAccessed ClientInfoString=*WebServices*',
  ],
  verdict: 'oauth-chain',
  actions: ['preserve', 'disable-apps', 'revoke-legacy', 'disable-user', 'mfa-ca', 'scope-ews', 'detect', 'notify'],
};
