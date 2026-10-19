// Halcyon Mutual's Active Directory: the people from the week, their service accounts, and the servers the logs mention.
// Used by the "Active Directory Users and Computers" window and the PowerShell terminal on days that have access to them.
import { makeDirectory } from '../game/directory.js';

/** The PowerShell console config the week's days share (the Windows jump box with the AD module). */
export function halcyonPowershell() {
  return {
    host: 'SOC-WIN01',
    winfs: {
      'C:\\Users\\analyst01\\hunting.txt': [
        'Try:',
        '  Get-ADUser svc_backup -Properties *',
        '  Get-ADGroupMember "Backup Operators"',
        '  Get-ADUser -Filter * -Properties PasswordLastSet | Sort-Object PasswordLastSet | Select-Object -First 5 Name, PasswordLastSet',
        "  Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4624} -MaxEvents 5",
        '',
      ].join('\n'),
    },
  };
}

export function halcyonDirectory(extra = {}) {
  return makeDirectory({
    domain: 'halcyonmutual.local',
    netbios: 'HALCYON',
    ous: [
      { name: 'Halcyon' },
      { name: 'Employees', parent: 'Halcyon' },
      { name: 'IT', parent: 'Halcyon' },
      { name: 'ServiceAccounts', parent: 'Halcyon', desc: 'Accounts used by software, not people' },
      { name: 'Servers', parent: 'Halcyon' },
      { name: 'Workstations', parent: 'Halcyon' },
      ...(extra.ous || []),
    ],
    groups: [
      { name: 'SOC Analysts', scope: 'Global', ou: 'IT', desc: 'Security operations: read-only access to SIEM and logs' },
      { name: 'IT Helpdesk', scope: 'Global', ou: 'IT', desc: 'Level 1 support: password resets for standard users' },
      { name: 'VPN Users', scope: 'Global', ou: 'IT', desc: 'May connect to the corporate VPN (MFA enforced)' },
      { name: 'Claims Staff', scope: 'Global', ou: 'Employees', desc: 'Access to the claims shares' },
      { name: 'Finance', scope: 'Global', ou: 'Employees', desc: 'Access to finance shares' },
      { name: 'HR', scope: 'Global', ou: 'Employees', desc: 'Access to HR and payroll shares' },
      { name: 'Backup Service', scope: 'Global', ou: 'ServiceAccounts', desc: 'Accounts that run backup jobs' },
      ...(extra.groups || []),
    ],
    users: [
      { sam: 'priya.r', first: 'Priya', last: 'Raman', ou: 'IT', title: 'Security Manager', dept: 'Security', office: 'HQ-3', memberOf: ['SOC Analysts', 'VPN Users'], lastLogon: '2026-10-19', pwdLastSet: '2026-08-11', phone: '+1 330 555 0107' },
      { sam: 'analyst01', first: 'Analyst', last: 'One', display: 'Analyst One', ou: 'IT', title: 'Junior Security Analyst', dept: 'Security', office: 'HQ-3', memberOf: ['SOC Analysts', 'VPN Users'], pwdLastSet: '2026-10-19', created: '2026-10-19', logonCount: 6 },
      { sam: 'dana.k', first: 'Dana', last: 'Kowalski', ou: 'IT', title: 'IT Support Specialist', dept: 'IT', office: 'HQ-2', memberOf: ['IT Helpdesk', 'Account Operators', 'VPN Users'], pwdLastSet: '2026-07-02', adminCount: 1 },
      { sam: 't.okoye', first: 'Theo', last: 'Okoye', ou: 'IT', title: 'Software Engineer', dept: 'Engineering', office: 'HQ-2', memberOf: ['VPN Users', 'Remote Desktop Users'], pwdLastSet: '2026-05-14' },
      { sam: 'm.chen', first: 'Mike', last: 'Chen', ou: 'Employees', title: 'Account Executive', dept: 'Sales', office: 'HQ-1', memberOf: ['VPN Users'], pwdLastSet: '2026-06-23' },
      { sam: 'j.alvarez', first: 'Jordan', last: 'Alvarez', ou: 'Employees', title: 'HR Specialist', dept: 'Human Resources', office: 'HQ-1', memberOf: ['HR', 'VPN Users'], pwdLastSet: '2026-03-30' },
      { sam: 'c.reyes', first: 'Camila', last: 'Reyes', ou: 'Employees', title: 'Claims Supervisor', dept: 'Claims', office: 'HQ-1', memberOf: ['Claims Staff'], pwdLastSet: '2026-09-05' },
      { sam: 's.okafor', first: 'Sade', last: 'Okafor', ou: 'Employees', title: 'Finance Analyst', dept: 'Finance', office: 'HQ-1', memberOf: ['Finance', 'VPN Users'], pwdLastSet: '2026-08-19' },
      { sam: 'svc_backup', display: 'Backup Service', ou: 'ServiceAccounts', service: true, desc: 'Nightly backup job (BACKUP01). Password owner: IT. DO NOT RESET WITHOUT TELLING THEO', memberOf: ['Backup Operators', 'Backup Service'], neverExpires: true, adminCount: 1, pwdLastSet: '2019-02-08', created: '2018-11-03', logonCount: 9120, lastLogon: '2026-10-19' },
      { sam: 'svc_sql', display: 'SQL Service', ou: 'ServiceAccounts', service: true, desc: 'Runs SQL Server on CLAIMS-DB01', neverExpires: true, spn: ['MSSQLSvc/claims-db01.halcyonmutual.local:1433', 'MSSQLSvc/claims-db01.halcyonmutual.local'], pwdLastSet: '2018-05-21', created: '2018-05-21', logonCount: 1544, lastLogon: '2026-10-19' },
      { sam: 'svc_web', display: 'Portal Service', ou: 'ServiceAccounts', service: true, desc: 'Runs the customer portal app pool', neverExpires: true, spn: ['HTTP/portal.halcyonmutual.local'], pwdLastSet: '2022-04-12', created: '2022-04-12', logonCount: 301 },
      { sam: 'svc_scan', display: 'Vulnerability Scanner', ou: 'ServiceAccounts', service: true, desc: 'Authenticated vulnerability scans', neverExpires: true, memberOf: ['Domain Admins'], adminCount: 1, pwdLastSet: '2020-01-13', created: '2020-01-13', logonCount: 2210 },
      { sam: 'a.admin', display: 'IT Admin (Dana)', ou: 'IT', desc: 'Dana Kowalski: privileged account for server administration', memberOf: ['Domain Admins', 'Administrators'], adminCount: 1, pwdLastSet: '2026-06-02', lastLogon: '2026-10-16', logonCount: 188 },
      ...(extra.users || []),
    ],
    computers: [
      { name: 'DC01', ip: '10.0.3.10', desc: 'Primary domain controller' },
      { name: 'DC02', ip: '10.0.3.11', desc: 'Secondary domain controller' },
      { name: 'FILE01', ou: 'Servers', ip: '10.0.3.20', desc: 'File server (Claims, Finance, HR, IT, Legal, Sales shares)' },
      { name: 'BACKUP01', ou: 'Servers', ip: '10.0.3.30', desc: 'Backup server (Veeam)' },
      { name: 'MAIL01', ou: 'Servers', ip: '10.0.3.40', desc: 'Mail relay' },
      { name: 'CLAIMS-DB01', ou: 'Servers', ip: '10.0.3.50', desc: 'Claims database (SQL Server 2019)' },
      { name: 'WS-0107', ou: 'Workstations', ip: '10.0.4.17', desc: 'Priya Raman' },
      { name: 'WS-0112', ou: 'Workstations', ip: '10.0.4.33', desc: 'Jordan Alvarez' },
      { name: 'WS-0120', ou: 'Workstations', ip: '10.0.4.40', desc: 'Dana Kowalski' },
      { name: 'WS-0124', ou: 'Workstations', ip: '10.0.4.44', desc: 'Camila Reyes' },
      { name: 'WS-0127', ou: 'Workstations', ip: '10.0.4.47', desc: 'Theo Okoye' },
      { name: 'WS-0131', ou: 'Workstations', ip: '10.0.4.51', desc: 'Mike Chen' },
      { name: 'WS-0138', ou: 'Workstations', ip: '10.0.4.62', desc: 'Sade Okafor' },
      { name: 'WS-0142', ou: 'Workstations', ip: '10.0.4.142', desc: 'Analyst One' },
      ...(extra.computers || []),
    ],
  });
}
