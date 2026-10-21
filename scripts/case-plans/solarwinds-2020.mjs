// Browser-test plan for the SolarWinds / SUNBURST case (same shape as PLANS in scripts/smoke-case.mjs).
export default {
  id: 'solarwinds-2020',
  report: ['hotfix-phish'],
  steps: [
    { tickets: { 'orion-upgrade': 'image-first', 'orion-egress': 'restrict', 'update-policy': 'stage' } },
  ],
  terminalAfterAlert: true,
  terminal: { cmd: 'grep avsvmcloud /var/log/remote/dns/queries.log | head -3', expect: 'avsvmcloud.com' },
  afterAlert: [
    { label: 'what Orion held', walkup: [1] },
    { label: 'the monitoring server', walkup: [1] },
  ],
  search: [
    'avsvmcloud',
    'SolarWinds.Orion.Core.BusinessLayer.dll',
    'freescanonline.com',
    'netsetupsvc.dll',
    'thedoccloud.com',
    'EventCode=4624 Logon_Type=10 Account_Name=svc-solarwinds',
    'thumbnailPhoto',
    'index=azure tokenIssuerType=ADFederationServices ipAddress=203.0.113.77',
    'index=azure activityDisplayName="Add service principal credentials"',
    'index=azure activityDisplayName="Update application - Certificates and secrets management" initiatedBy.user.ipAddress=203.0.113.77',
    'index=azure servicePrincipalName=Halcyon-HR-Sync ipAddress=203.0.113.77',
    'index=o365 Operation=MailItemsAccessed ClientIPAddress=203.0.113.77',
    'Solorigate',
  ],
  verdict: 'supply-chain',
  actions: ['preserve', 'isolate-orion', 'creds', 'saml', 'apps', 'hunt', 'rebuild', 'notify'],
};
