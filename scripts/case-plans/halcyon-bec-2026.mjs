// Browser-test plan for the Halcyon BEC lab (same shape as PLANS in scripts/smoke-case.mjs).
export default {
  id: 'halcyon-bec-2026',
  report: ['m365-expire'],
  steps: [
    { tickets: { 'auto-forward': 'decline', 'mfa-exemption': 'fido2', 'legacy-auth': 'oauth' } },
  ],
  terminalAfterAlert: true,
  terminal: { cmd: 'grep New-InboxRule /var/log/remote/m365/unified-audit.json', expect: 'New-InboxRule' },
  afterAlert: [
    { label: 'the wire Mike wants released', walkup: [1] },
    { label: 'the bank and the vendor', walkup: [1] },
  ],
  search: [
    'index=o365 Operation=New-InboxRule',
    'index=o365 Operation=Set-InboxRule',
    'index=o365 Operation=SearchQueryInitiatedExchange QueryText=invoice',
    'index=o365 Operation=Send Item.Subject="RE: Invoice INV-20418*"',
    'index=azure riskEventTypes_v2{}=anomalousToken',
    'index=azure userPrincipalName=r.delgado* "MFA requirement satisfied by claim in the token"',
    'index=azure ipAddress=198.51.100.58',
    'index=azure activityDisplayName="User registered security info" initiatedBy.user.userPrincipalName=r.delgado*',
    'index=azure SenderFromDomain=tidewater-facilities-ap.example',
    'index=azure SenderIPv4=203.0.113.88',
  ],
  verdict: 'aitm-bec',
  actions: ['preserve', 'revoke', 'remove-rules', 'payments', 'conditional-access', 'detect', 'notify'],
};
