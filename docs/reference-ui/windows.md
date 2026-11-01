# Reference: Windows over Remote Desktop (src/ui/ccdc/WinDesktop.js)

Sources consulted (web results were mostly training PDFs/blogs, not pixel specs; metrics below that are marked
"approx." come from memory of the real UI, not from a measured screenshot):

- Server Manager dashboard: https://learn.microsoft.com/windows-server/administration/server-manager/server-manager ,
  https://www.packtpub.com/en-gb/product/mastering-windows-server-2019-third-edition-third-edition-2-9781801078313/chapter/installing-and-managing-windows-server-2019/centralized-management-and-monitoring ,
  https://techpress.net/hide-or-unhide-welcome-tile-in-server-manager/ (Welcome tile: heading "Welcome to Server Manager",
  sections Quick start / What's new / Learn more; View > Show Welcome Tile; tiles show Manageability, Events, Services,
  Performance, BPA results with red counts when something needs attention).
- ADUC (user context menu, Member Of tab, Add to a group, Reset Password): https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage-user-accounts-in-windows-server ,
  https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2003/cc781712(v=ws.10) , https://marcdlc-cs.github.io/createuser
- mstsc connection bar (pin on the left, host in the middle, minimise/restore/close on the right; stays pinned or auto-hides):
  https://howto.hyonix.com/article/how-to-unhide-hide-the-connection-bar-in-remote-desktop-windows
- Event IDs and field wording (4624/4625/4672/4720/4728/4732/4698/4699/4725/4729): Microsoft "Windows security auditing" event reference text.

## What was copied

Fonts: Segoe UI 12px for all chrome (fallback Tahoma / Noto Sans); Consolas 13px in the PowerShell window (TermView 'pwsh',
#012456 background, #eeedf0 text).

Shell
- Taskbar: 40px, #101010; Start button 48px with the four-pane logo; search box 232px #f2f2f2 "Type here to search";
  Task View button; pinned File Explorer / PowerShell / Server Manager; running apps get a 2px #76b9ed underline, active
  one #454545 background; tray (chevron, network, volume), two-line clock "9:01 AM / 10/31/2026", Show-desktop sliver.
- Windows: white title bar 31px, 46x30 caption buttons (minimise, maximise, close; close hover #e81123), 1px border
  #8a8a8a inactive / #1883d7 active, title text grey when inactive.
- Start menu: dark #1f1f1f, 48px left rail (menu, user, settings, power), alphabetical app list (A, E, F, L, S, T, W),
  blue tiles (#0063b1, wide #2b5797). Power menu: Disconnect / Restart / Shut down.
- Desktop: Recycle Bin only (default on Server), watermark bottom right: "Windows Server 2019 Standard Evaluation / Windows
  License is valid for 180 days / Build 17763.rs5_release.180914-1434" (2022: Build 20348.fe_release.210507-1500);
  Windows 10 workstations show "Activate Windows / Go to Settings to activate Windows."
- Wallpaper: dark blue radial with light beams (CSS approximation of the default Windows hero).
- RDP bar (approx.): 24px, #2f6fbf, centred at the top, pin | host/IP | minimise, restore, close.
  On <700px wide it becomes a full-width strip above the desktop so it does not hide title bars.

MMC consoles (ADUC, Services, Task Scheduler, Event Viewer, Local Users and Groups)
- Menu bar File / Action / View / Help on white; toolbar #f0f0f0 with back/forward (green), up, show-hide tree, refresh,
  properties, help icons; tree pane 220px; right "Actions" pane 184px (header #dfe7f2, section bars #eef2f8).
- List view: header text #4c607a, 1px #e5e5e5 column separators, rows 20px, selected #cce8ff, hover #e5f3fb.
- ADUC: tree "Active Directory Users and Computers [DC01.cedarline.local]" > Saved Queries, domain > Builtin, Computers,
  Domain Controllers, ForeignSecurityPrincipals, Managed Service Accounts, Users + the scenario OUs; columns Name | Type |
  Description (types "User", "Security Group - Global", "Computer"); disabled user = user icon with a black down-arrow
  badge. Right-click (user): Copy..., Add to a group..., Name Mappings..., Disable Account / Enable Account,
  Reset Password..., Move..., Open Home Page, Send Mail, All Tasks, Cut, Delete, Rename, Properties (bold), Help.
  Properties dialog tabs General, Address, Account, Profile, Telephones, Organization, Member Of, Dial-in, Environment,
  Sessions, Remote control; Member Of: "Member of:" list (Name | Active Directory Domain Services Folder), Add... /
  Remove, "Primary group: Domain Users". Confirmations use the title "Active Directory Domain Services"
  ("Object Backup Svc2 has been disabled.").
- Services: "Services (Local)" tree node, description pane on the left of the list (Stop/Restart the service links),
  columns Name | Description | Status | Startup Type | Log On As, Extended/Standard tabs at the bottom, context menu
  Start / Stop / Pause / Resume / Restart / All Tasks / Refresh / Properties / Help; Properties dialog with Startup
  type dropdown and Start / Stop / Pause / Resume buttons. Real error texts: Error 5 Access is denied, Error 1058
  (disabled service cannot start).
- Task Scheduler: Task Scheduler (Local) > Task Scheduler Library > Microsoft > Windows > Defrag; columns Name | Status |
  Triggers | Next Run Time | Last Run Time | Last Run Result | Author | Created; General/Triggers/Actions/Conditions/
  Settings/History tabs under the list; Actions pane "Actions" + "Selected Item" (Run, End, Disable, Export, Properties,
  Delete).
- Event Viewer: Event Viewer (Local) > Custom Views, Windows Logs (Application, Security, Setup, System, Forwarded
  Events), Applications and Services Logs, Subscriptions; columns Keywords (Level) | Date and Time | Source | Event ID |
  Task Category; Audit Success = gold key icon, Audit Failure = padlock; preview pane "Event 4720, Microsoft Windows
  security auditing." with General/Details, multi-line Subject/Target text, and Log Name/Source/Logged/Event ID/Task
  Category/Level/Keywords/User/Computer; Filter Current Log dialog with "Includes/Excludes Event IDs" (1,3,5-99,-76).
- Server Manager (approx. colours): dark nav #2f3640 with selected #0f6cbd, header "Server Manager > Dashboard" 20px
  light, menus Manage / Tools / View / Help, "WELCOME TO SERVER MANAGER" blue band with QUICK START 1-5, ROLES AND SERVER
  GROUPS tiles (AD DS, DNS, File and Storage Services, Local Server, All Servers) with Manageability / Events / Services
  / Performance / BPA results rows: green tick pill, red count pill. A tile's Services pill turns red while an
  Automatic service is stopped (live from the device). Tools menu launches ADUC, Event Viewer, Services, Task Scheduler,
  PowerShell. Local Server page: PROPERTIES (computer name, domain, firewall, remote management, Remote Desktop, ...),
  EVENTS and SERVICES grids.
