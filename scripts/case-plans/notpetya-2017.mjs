// Browser-test plan for the NotPetya case (same shape as PLANS in scripts/smoke-case.mjs).
export default {
  id: 'notpetya-2017',
  report: ['vaccine-phish'],
  steps: [
    { label: 'domain controllers walk-up', walkup: [1] },
    { label: 'user message phone call', phone: [1] },
    { tickets: { 'local-admin': 'laps', smbv1: 'patch-segment', 'dc-backup': 'approve-drill' } },
  ],
  // the AD objective is satisfied by a PowerShell command (see powershell below)
  powershell: { cmd: 'repadmin /replsummary', expect: 'DC-GH01' },
  search: ['EventCode=7045 Service_Name=PSEXESVC', 'perfc.dat', 'dllhost.dat', 'EventCode=4624 Account_Name=Administrator', 'wmic process call create', 'EventCode=1102', 'sourcetype=cisco:asa SYN Timeout', 'snort 42944', 'EventCode=1074'],
  verdict: 'worm',
  actions: ['isolate-wan', 'dc-offline', 'cancel-tasks', 'creds', 'patch', 'rebuild', 'block-admin', 'hunt'],
};
