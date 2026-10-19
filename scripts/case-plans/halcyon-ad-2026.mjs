// Browser-test plan for the Halcyon AD lab (same shape as PLANS in scripts/smoke-case.mjs).
export default {
  id: 'halcyon-ad-2026',
  report: ['m365-expire'],
  steps: [
    { label: 'database server walk-up', walkup: [1] },
    { tickets: { 'contractor-da': 'deny', 'svc-sql-rotate': 'gmsa', 'rc4-policy': 'phased' } },
  ],
  // the AD objective is satisfied by a PowerShell command (see powershell below)
  powershell: { cmd: 'Get-ADGroupMember "Domain Admins" | Select-Object Name, SamAccountName', expect: 'svc_updater' },
  search: ['EventCode=4662 Account_Name=a.admin', 'EventCode=4769 Ticket_Encryption_Type=0x17 NOT Service_Name=*$', 'rundll32 comsvcs MiniDump', 'svc_sql 4624', 'Invoice_8841', 'a.admin 4768 0x17', 'svc_updater 4728'],
  verdict: 'chain',
  actions: ['isolate', 'rogue', 'krbtgt', 'svcsql', 'tiering', 'detect', 'hunt'],
};
