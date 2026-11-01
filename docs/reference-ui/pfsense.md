# pfSense 2.7 CE web GUI: what src/ui/ccdc/PfSenseApp.js copies

Honest note on sources: the research was limited. `docs.netgate.com/pfsense/en/latest/firewall/rules.html` returned 404 and the fetch tool does not return images, so the look is reproduced from the Netgate rule-configuration page text plus the author's knowledge of the 2.7 webConfigurator (Bootstrap 3 + the pfSense theme). Hex values marked (approx.) are from memory of the default light theme, not measured from a screenshot. Compare against a real GUI before showing it as pixel-exact.

## URLs looked at
- https://docs.netgate.com/pfsense/en/latest/firewall/configure.html (OK): confirms the rule edit page fields and their order: Action, Disabled, Interface, Address Family, Protocol, Source, Destination, Log, Description.
- https://docs.netgate.com/pfsense/en/latest/firewall/rules.html (404, not available).

## What was copied
- Page shell: dark navbar (#212121, 50px, border #080808), "pfSense" logo (bold white "pf", light grey "sense", tiny green "COMMUNITY EDITION"), menus System, Interfaces, Firewall, Services, VPN, Status, Diagnostics, Help with white bootstrap dropdowns; below 768px it collapses to a hamburger like the real responsive GUI.
- Title is a breadcrumb, 21px: "Firewall / Rules / WAN", "Status / System Logs / Firewall / Normal View", "Diagnostics / Command Prompt".
- Font: Helvetica Neue / Helvetica / Arial 14px (Bootstrap 3 default), body white, text #333, links #1e3f75 (approx.).
- Tabs: Floating | WAN | LAN; active tab filled #1e3f75 with white text (approx.). Logs page has the first-level tabs System | Firewall | DHCP | Authentication | IPsec | PPP | OpenVPN | NTP | Packages | Settings and sub-tabs Normal View | Dynamic View | Summary View.
- Panels: heading bar #1e3f75 with white 16px title ("Rules (Drag to Change Order)", "System Information", "Interfaces", "Gateways", "Services Status", "Edit Firewall Rule", "Execute Shell Command"); 1px #ddd border, 4px radius.
- Rules table columns, exactly: checkbox, (action icon), States, Protocol, Source, Port, Destination, Port, Gateway, Queue, Schedule, Description, Actions. Green check (#5cb85c) for pass, red X (#d9534f) for block; row action icons edit (pencil), copy, disable, delete (red). Protocol shows "IPv4 TCP" / "IPv4 *". Queue "none". Table text 13px, header #f5f5f5 with a 2px bottom border, zebra #f9f9f9.
- Apply notice (alert-warning #fcf8e3 / border #faebcc / text #8a6d3b) with a green "Apply Changes" button and the wording "The firewall rule configuration has been changed. The changes must be applied for them to take effect."
- Buttons: Add (green #5cb85c with a down arrow), Delete (red #d9534f, disabled until a checkbox is ticked), Save (primary #1e3f75), Cancel (default white). The real page also has Add up-arrow, Save and Separator; those are omitted because the rule editor only appends rules.
- Rule edit form wording: "Choose what to do with packets that match the criteria specified below...", "Choose the interface from which packets must come to match this rule.", "Select the Internet Protocol version this rule applies to.", "Choose which IP protocol this rule should match.", "Specify the destination port or port range for this rule. The "To" field may be left empty if only filtering a single port.", "Log packets that are handled by this rule", "A description may be entered here for administrative reference." Errors use "The following input errors were detected:" in alert-danger.
- Dashboard widgets: System Information (Name, User, System, BIOS, Version, CPU Type, Uptime, Current date/time, DNS server(s), State table size, MBUF Usage, Load average, CPU/Memory/SWAP/Disk usage with blue progress bars), Interfaces (green up arrow, media "1000baseT <full-duplex>", IP), Gateways (Name, RTT, RTTsd, Loss, Status "Online" label), Services Status.
- Status > System Logs > Firewall columns: Action (icon), Time, Interface, Rule ("Default deny rule IPv4 (1000000103)", "USER_RULE: <descr> (<tracker>)"), Source ip:port, Destination ip:port, Proto. Title "Last 50 Firewall Log Entries. (Maximum 50)".
- Footer: "pfSense is developed and maintained by Netgate. (c) ESF 2004 - 2026 View license."
- SSH console menu (pfConsoleBanner): "*** Welcome to pfSense 2.7.2-RELEASE (amd64) on <host> ***", WAN/LAN interface lines, then the numbered menu 0) Logout (SSH only) ... 8) Shell ... 16) Restart PHP-FPM and the prompt "Enter an option: ".

## Deliberate departures (lab honesty)
- A pfSense WAN has an implicit deny. This scenario starts at "pass any", so the final greyed row is labelled "Default allow rule IPv4 (pass any)" with a "Set default to block" button; once blocked it reads "Default deny rule IPv4 (block)".
- The edit pencil opens the rule read-only (the rule editor can only append and delete); the copy icon opens the Add form prefilled.
- The Add form shows the rule-editor command it will run, as a teaching aid.
- Pages not used by the exercise show a notice instead of the real page.
