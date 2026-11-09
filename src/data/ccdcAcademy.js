// The lessons behind Learn mode. Each step either explains something, has the player type something and checks that
// it really happened on the box, asks what the output showed, or asks for a piece of writing that the inject grader
// reads. Rules come from the 2026 Midwest regional team packet; the invitational packet may differ, and lessons say so.
//
// Step fields:
//   say       what to know, in plain words          vm      the console to show        open   the window to show
//   type      the exact line to enter               parts   [[piece, meaning]] for it  look   what to read in the output
//   done(c)   did it happen (defaults to: `type` was entered on `vm`)
//   ask       { q, a: RegExp | (st) => RegExp, sample: string | (st) => string, why, seen? }
//   write     { injectId, starter }                 setup(st)  breaks or plants something first
//   after     shown when the step is complete       drill   hide the command until "Show me"
//   edit      { tool, path, find, replace } a change made with nano or vi; what a test applies
//   sim       (st) => void, what a test does for a step performed in a window rather than a console
//
// c = { st, ran(vm, re), loggedIn(vm), lastIncident() }

import { stageAttack } from '../game/ccdcRed.js';
import { NAT, PW, PW2, adPw, login, winLogin } from './ccdcAcademyKit.js';
import { MORE_LESSONS } from './ccdcAcademyMore.js';

const CORE = [
  {
    id: 'day', title: 'What Saturday actually is', mins: 8, vms: [],
    steps: [
      { say: 'CCDC puts you in charge of a small company\'s network. It already has problems, and someone may already be inside. You get points for keeping the business running, not for hacking anything.\n\nThe packet says the winner is decided by three things: services staying up (35 to 50%), business tasks called injects (35 to 50%), and incident response with Red Team results (10 to 30%).\n\nSo a team that locks everything down and breaks the website loses to a team that kept the website up and wrote good memos.' },
      { say: 'The people around you:\n\nBlue: you and up to 7 teammates.\nRed: professional penetration testers attacking you all day.\nWhite and Black: judges. They send injects and read your reports.\nOrange: people acting as normal users.\nGreen: tech support.\nGold: the organizers.\n\nYour Captain talks to the officials. Say your team number, never your school.' },
      { say: 'How the day goes:\n\n1. Log in to NISE, the team portal. Find the Welcome inject and answer it. That tells the judges you are ready, and it counts as agreeing to the rules.\n2. The judges announce the drop flag. Your NETLAB password becomes valid then, and you must change it the first time you log in.\n3. Scoring runs. Red Team is active the whole time.\n4. Injects keep arriving in NISE with deadlines.\n\nAt regionals the times are in the packet and are Central time. An invitational is shorter. Read your own packet the moment you get it. Anything in it beats this lesson.' },
      { say: 'Rules that lose points or get you thrown out:\n\n- No talking to anyone outside your team. That includes your coach, advisers and friends.\n- No phones, USB sticks or other electronics unless the judges allow them.\n- Printed notes ARE allowed. Print the cheat sheet in this panel.\n- Never scan or touch another team, the Red Team or the judges. Instant disqualification.\n- Internet goes through a proxy and is watched. Only free tools. No personal Google Drive, email or private storage.\n- Do not change hostnames, usernames or internal IP addresses unless an inject says to.\n- User workstations stay user workstations.' },
      { ask: { q: 'Can you bring a printed checklist into the competition room? (yes or no)', a: /^y/i, sample: 'yes', why: 'Printed reference material is allowed. Electronic media is not.' } },
      { ask: { q: 'Your coach walks in and you have a question. Are you allowed to ask? (yes or no)', a: /^n/i, sample: 'no', why: 'Advisers may not assist during the competition. It is grounds for disqualification.' } },
      { ask: { q: 'A rule question: when you talk to the judges, do you say your school or your team number?', a: /team|number/i, sample: 'team number', why: 'Teams communicate by number so judging stays blind.' } },
    ],
  },
  {
    id: 'concepts', title: 'The network in plain words', mins: 10, vms: [],
    steps: [
      { say: 'An IP address is a machine\'s address. A port is a numbered door on that machine. A service is a program listening behind a door.\n\nDoors you must know:\n22 SSH, remote shell\n25 SMTP, sending mail\n53 DNS, names to addresses\n80 HTTP, websites\n110 POP3, reading mail\n443 HTTPS, encrypted websites\n445 SMB, Windows file sharing\n3389 RDP, Windows remote desktop\n3306 MySQL or MariaDB, the database' },
      { ask: { q: 'Which port does the scoring engine use to test sending mail?', a: /\b25\b/, sample: '25', why: 'SMTP is port 25.' } },
      { ask: { q: 'Which port is POP3?', a: /\b110\b/, sample: '110', why: 'POP3, reading mail, is 110.' } },
      { say: 'A firewall decides which doors can be reached from where. You will meet two kinds.\n\nThe network firewall, a Palo Alto, sits between the zones. Each host also has its own firewall on the machine.\n\nA zone is a group of networks treated the same. Here: Public (web-facing servers), Internal, User (staff machines) and Core (the outside, where the scoring engine and Red Team come from).' },
      { say: `NAT means the outside world uses a different address than the machine has inside. The store server is 172.20.241.30 inside, but the outside reaches it at ${NAT(11)}.\n\nThat is the most important fact about the Palo Alto, so here is the rule to memorize: a security rule uses the PUBLIC address, and the zone the traffic ends up in.` },
      { open: 'netlab', say: 'Now look at it. In NETLAB+, click Topology to see the zones, then Content for the table of every machine.' },
      { ask: { q: 'Using the Content tab: what is the public address of the Fedora mail server?', a: new RegExp(NAT(39).replace(/\./g, '\\.')), sample: NAT(39), why: 'Every address you write in a firewall rule for outside traffic comes from this column.' } },
      { say: 'Active Directory, or AD, is the Windows server that holds every staff account. Here, the mail server asks AD whether a login is valid. So if AD goes down, or a staff password changes without the judges knowing, POP3 fails even though nothing is wrong on the mail server.\n\nThe packet says it plainly: it is your job to work out how accounts relate to services.' },
      { ask: { q: 'POP3 is failing but the mail server looks fine. Which other machine should you check?', a: /\b(ad|active directory|domain controller|dc)\b/i, sample: 'AD', why: 'POP3 logs in with AD accounts.' } },
    ],
  },
  {
    id: 'netlab', title: 'Getting in: NETLAB+', mins: 6, vms: ['web'],
    steps: [
      { open: 'netlab', say: 'NETLAB+ is how you reach every machine. There is one button per VM along the top. Clicking the name opens its console. The small arrow opens a menu.\n\nA console is like sitting at the machine. It keeps working even if you break the network, which makes it your safety net.\n\nOn the real system there is a Reservation menu. Stay out of it. Ending your reservation restarts your whole network, and you start over.' },
      login('web', 'Ubuntu Srv'),
      { vm: 'web', type: 'hostname', parts: [['hostname', 'prints this machine\'s name']], look: 'Always check which machine you are on before changing anything. People take down the wrong server this way.', after: 'It said web. That is the machine you meant.' },
      { vm: 'web', say: 'Click the arrow on Ubuntu Srv and look at the menu.\n\nUndock opens the console in its own window, which is useful with two machines side by side.\nRevert is greyed out. You cannot undo things yourself.\nPower Off and Power On restart the machine, but they restore nothing.\n\nIf a machine is truly dead, a teammate files a Tech Support ticket to restore it. It costs points, takes time, and all the original holes come back.' },
      { ask: { q: 'You delete an important file and power-cycle the VM. Does the file come back? (yes or no)', a: /^n/i, sample: 'no', why: 'A power cycle restores nothing. Only a Tech Support restoration does, and it wipes your work too.' } },
    ],
  },
  {
    id: 'linux', title: 'Reading a Linux box', mins: 12, vms: ['web'],
    steps: [
      login('web', 'Ubuntu Srv'),
      { vm: 'web', say: 'Before you fix anything, learn what the box is. These are safe because they only read.', type: 'cat /etc/issue', parts: [['cat', 'print a file'], ['/etc/issue', 'the file holding the OS name']], look: 'This decides which commands work here.' , after: 'Ubuntu 14. That is old, and it matters in a minute.' },
      { vm: 'web', type: 'ss -tulpn', parts: [['ss', 'show network sockets'], ['-t -u', 'TCP and UDP'], ['-l', 'only ones listening'], ['-p', 'which program'], ['-n', 'numbers, not names']], look: 'Each LISTEN line is an open door. Learn what should be here, and anything else is suspicious.' },
      { ask: { q: 'Which port is the web server listening on?', a: /\b80\b/, sample: '80', seen: true, why: 'Port 80 is the scored website.' } },
      { vm: 'web', type: 'ps aux', parts: [['ps aux', 'every running program, all users']], look: 'You want to get used to what normal looks like.' },
      { vm: 'web', type: 'cat /etc/passwd', parts: [['/etc/passwd', 'every account on the box, one per line']], look: 'Format is name:x:UID:GID:... UID 0 means root, whatever the name is.' },
      { ask: { q: 'Which account other than root has UID 0?', a: /webmaint/i, sample: 'webmaint', seen: true, why: 'Two accounts with UID 0 means there are two roots. One of them is a backdoor.' } },
      { vm: 'web', say: 'grep finds lines in a file. It will be your most used tool.', type: 'grep ":x:0:" /etc/passwd', parts: [['grep', 'print matching lines'], ['":x:0:"', 'the text to look for'], ['/etc/passwd', 'where to look']], after: 'One command instead of reading the whole file.' },
      { vm: 'web', say: 'Back up before you change anything. Red Team deletes things and you will make mistakes. Save the website and config now, in the first minutes.', type: 'cp -a /var/www/html /root/www.bak', parts: [['cp', 'copy'], ['-a', 'everything inside, keep permissions'], ['/var/www/html', 'from'], ['/root/www.bak', 'to']], after: 'If the page gets defaced later, you can put it back.' },
      { vm: 'web', drill: true, say: 'Your turn, no command given: list what is in /var/www/html. The command is ls.', done: (c) => c.ran('web', /^ls\b.*\/var\/www\/html/), type: 'ls -la /var/www/html', after: 'That is the folder the website serves.' },
    ],
  },
  {
    id: 'passwords', title: 'Passwords, and the trap', mins: 12, vms: ['web', 'ad'],
    steps: [
      { say: 'Every machine starts with a password everyone knows. Red Team will try it right away, so this is job one.\n\nA good password here is long and made of words. Do not use anything starting with password, admin, welcome or the season. Write them on your team\'s sheet. Being locked out of your own box is common.\n\nThe packet\'s rule: you can change root and Administrator passwords whenever you like. Passwords used by scored services need a Password Change Request ticket.' },
      login('web', 'Ubuntu Srv'),
      { vm: 'web', say: `Change root's password. Use ${PW} here. It asks twice, and shows nothing as you type.`, type: 'passwd root', parts: [['passwd', 'change a password'], ['root', 'for this account']], done: (c) => c.st.devState.web.creds.root.strong, testLines: [PW, PW], after: 'Root is changed. On the day, your team does this on every Linux box.' },
      winLogin('ad', '2019 AD'),
      { vm: 'ad', say: 'Administrator is not a scored account, so no ticket is needed.', type: adPw('Administrator'), parts: [['Set-ADAccountPassword', 'change an AD password'], ['-Identity Administrator', 'whose'], ['-Reset', 'set it without knowing the old one'], ['-NewPassword (...)', 'the new one, in the form PowerShell insists on']], done: (c) => c.ran('ad', /set-adaccountpassword .*administrator/i), after: 'No ticket needed for that one.' },
      { vm: 'ad', type: 'Get-ADUser -Filter *', parts: [['Get-ADUser', 'list AD accounts'], ['-Filter *', 'all of them']], look: 'The staff accounts are what POP3 logs in with.' },
      { open: 'support', say: 'Staff passwords are the trap. If you change them first, the scoring engine can no longer log in and POP3 fails. So file the ticket first.\n\nIn Support, click Support Tickets. Pick Password Change Request, describe which accounts are changing, and submit. On the real system this also opens a chat with the officials.', done: (c) => c.st.engine.pcr.filed, sim: (st) => { st.engine.pcr.filed = true; }, after: 'Filed. Now the judges know.' },
      { vm: 'ad', say: 'Now it is safe to change a staff account.', type: adPw('a.hansen'), done: (c) => c.ran('ad', /set-adaccountpassword .*a\.hansen/i), after: 'POP3 keeps passing because the ticket went in first. If you do it the other way around, POP3 fails until the ticket is handled.' },
      { ask: { q: 'You want to change the root password on the web server. Do you need a ticket? (yes or no)', a: /^n/i, sample: 'no', why: 'Root and Administrator are not used for scoring. Accounts that services log in with are.' } },
    ],
  },
  {
    id: 'services', title: 'Is it up? Checking and fixing services', mins: 12, vms: ['web', 'ecom'],
    steps: [
      { say: 'The scoring engine tests for real function. It fetches a page and compares the content, sends real mail, and logs in to POP3. A port being open is not enough.\n\nAfter any change, check it yourself. Look at the service list in NISE too, though it lags a little.' },
      login('web', 'Ubuntu Srv'),
      { vm: 'web', say: 'Old Ubuntu has no systemctl. Watch what happens.', type: 'systemctl status apache2', expectFail: true, after: 'Command not found. You will hit this on Saturday, on old boxes.' },
      { vm: 'web', type: 'service apache2 status', parts: [['service', 'the older tool for controlling services'], ['apache2', 'the web server on Debian and Ubuntu'], ['status', 'is it running']] },
      { vm: 'web', say: 'Ask the website itself, the way the scorer does.', type: 'curl http://localhost/', parts: [['curl', 'fetch a page from the command line']], look: 'You should see the company\'s page in the output.' },
      login('ecom', 'CentOS'),
      { vm: 'ecom', say: 'CentOS has systemctl, and its web server is called httpd rather than apache2. Same job, different name.', type: 'systemctl status httpd' },
      { vm: 'web', setup: (st) => { st.devState.web.live.units.apache2 = 'inactive'; }, say: 'Something just stopped the website. Check it, then start it again. Use the service command with the word start.', done: (c) => c.st.devState.web.live.units.apache2 === 'active', type: 'service apache2 start', drill: true, after: 'Found it and fixed it. Check, fix, check again.' },
      { vm: 'web', type: 'curl http://localhost/', after: 'Now you have proved it works, rather than assuming.' },
      { vm: 'web', setup: (st) => { st.devState.web.fs['/var/www/html/index.html'] = '<html><h1>owned</h1></html>\n'; if (!st.devState.web.fs['/root/www.bak/index.html']) st.devState.web.fs['/root/www.bak/index.html'] = '<html><head><title>Driftless Managed Services</title></head><body><h1>Driftless Managed Services</h1></body></html>\n'; }, say: 'Red Team defaced the page. The service is running, but the scorer compares content, so it is failing. Put your backup back.', type: 'cp /root/www.bak/index.html /var/www/html/index.html', done: (c) => /Driftless Managed/.test(c.st.devState.web.fs['/var/www/html/index.html']), after: 'That is why you back up in the first few minutes.' },
    ],
  },
  {
    id: 'hostfw', title: 'Firewalls on the machines', mins: 14, vms: ['dns', 'ecom'],
    steps: [
      { say: 'Each operating system has its own firewall tool:\n\nUbuntu: ufw (off by default)\nCentOS, Fedora: firewalld\nDebian here: iptables only\nWindows: Windows Firewall\n\nThe rule that saves you: allow what is needed FIRST, then block the rest. Do it backwards and you drop every service at once. You keep the console either way, so you can always undo it.\n\nDo not limit public services to certain source addresses. The packet allows blocking a single attacking address. It prohibits blocking whole subnets or allowing only the scorer.' },
      login('dns', 'Debian'),
      { vm: 'dns', type: 'iptables -L -n', parts: [['iptables', 'the Linux firewall'], ['-L', 'list rules'], ['-n', 'numbers, not names']], look: 'Policy ACCEPT means anything not mentioned gets in.' },
      { vm: 'dns', say: 'First, let replies to connections this box started come back in.', type: 'iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT', parts: [['-A INPUT', 'add to the end of the incoming list'], ['-m state --state ...', 'traffic that is part of an existing conversation'], ['-j ACCEPT', 'let it in']] },
      { vm: 'dns', say: 'Next, the scored service. DNS is port 53.', type: 'iptables -A INPUT -p udp --dport 53 -j ACCEPT', parts: [['-p udp', 'protocol'], ['--dport 53', 'destination port']] },
      { vm: 'dns', say: 'DNS also uses TCP for large answers, so allow that too.', type: 'iptables -A INPUT -p tcp --dport 53 -j ACCEPT' },
      { vm: 'dns', say: 'Only now, drop everything else.', type: 'iptables -P INPUT DROP', parts: [['-P INPUT DROP', 'the default for incoming traffic is now drop']], after: 'DNS kept passing, because the allow rules went in first.' },
      { ask: { q: 'You ran iptables -P INPUT DROP before adding any allow rules. What happens to DNS?', a: /(down|fail|block|drop|stop|break)/i, sample: 'it goes down', why: 'The default drops everything until something allows it.' } },
      login('ecom', 'CentOS'),
      { vm: 'ecom', type: 'firewall-cmd --list-all', look: 'Read the ports line. The database port should not be open to the world.' },
      { ask: { q: 'Which port is open here that does not need to be?', a: /3306/, sample: '3306', seen: true, why: 'The store talks to its database on the same machine, so nothing outside needs 3306.' } },
      { vm: 'ecom', say: 'firewalld has two copies of its rules: running now, and saved. --permanent changes only the saved copy. It does nothing until you reload.', type: 'firewall-cmd --permanent --remove-port=3306/tcp', after: 'Saved, but still open right now.' },
      { vm: 'ecom', type: 'firewall-cmd --list-ports', look: '3306 is still listed, because the running copy has not changed.' },
      { vm: 'ecom', type: 'firewall-cmd --reload', after: 'Now the saved rules are live.' },
      { vm: 'ecom', type: 'firewall-cmd --list-ports', after: '3306 is gone. The trap in reverse: a change without --permanent works until the next reload, then it vanishes.' },
    ],
  },
  {
    id: 'panos', title: 'The Palo Alto from zero', mins: 20, vms: ['pan', 'uwks'],
    steps: [
      { say: 'The Palo Alto decides what gets between zones. It starts with one rule that allows everything.\n\nThree ideas:\n\n1. Your changes go into a candidate copy. Nothing happens until you commit.\n2. Rules are read top to bottom, and the first match wins.\n3. If nothing matches, traffic between zones is denied by a built-in rule.\n\nAt the 2026 regional there were two Palo Altos and a router. Check your packet for how many you have, and for the zone names.' },
      login('pan', 'Palo Alto', 'admin'),
      { vm: 'pan', type: 'show interface all', look: 'Read the zone column. Zone names in rules must match exactly, including capitals.' },
      { vm: 'pan', type: 'show running nat-policy', look: 'This is where the public addresses come from.' },
      { vm: 'pan', say: 'Enter configuration mode. The prompt changes from > to #.', type: 'configure' },
      { vm: 'pan', say: `The website. From Core, to the zone it lives in, to its public address.`, type: `set rulebase security rules scored-web from Core to User source any destination ${NAT(23)} application web-browsing service application-default action allow`, parts: [['scored-web', 'a name you choose'], ['from Core', 'where the traffic comes from'], ['to User', 'the zone the server is in'], ['source any', 'keep it any for public services'], [`destination ${NAT(23)}`, 'the PUBLIC address'], ['application web-browsing', 'the kind of traffic'], ['service application-default', 'only that application\'s usual port'], ['action allow', 'let it through']] },
      { vm: 'pan', say: 'The store, with both HTTP and HTTPS. Square brackets, with spaces inside, make a list.', type: `set rulebase security rules scored-ecom from Core to Public source any destination ${NAT(11)} application [ web-browsing ssl ] service application-default action allow` },
      { vm: 'pan', say: 'Mail.', type: `set rulebase security rules scored-mail from Core to Public source any destination ${NAT(39)} application [ smtp pop3 web-browsing ] service application-default action allow` },
      { vm: 'pan', say: 'DNS. It lives in the Internal zone.', type: `set rulebase security rules scored-dns from Core to Internal source any destination ${NAT(20)} application dns service application-default action allow` },
      { vm: 'pan', say: 'Ping. The rules say to keep ICMP working. Easy to forget, and it costs points.', type: 'set rulebase security rules allow-ping from Core to [ User Public Internal ] source any destination any application ping service application-default action allow' },
      { vm: 'pan', say: 'The rules are in place, so now you can remove the one that allows everything.', type: 'delete rulebase security rules allow-all' },
      { vm: 'pan', say: 'Nothing has changed yet. Commit.', type: 'commit', after: 'A commit is a job, and on a real VM it can take a minute or more. Do not stack up changes while it runs.' },
      { vm: 'pan', type: 'exit', say: 'Leave configuration mode.' },
      { vm: 'pan', say: 'Check on the job. If the status is still ACT, wait a few seconds and run it again. It needs to say FIN and OK.', type: 'show jobs all', done: (c) => c.ran('pan', /^show jobs/) && !c.st.devState.pan.firewall.pendingCommit, simWait: true, after: 'Committed.' },
      { vm: 'pan', say: 'Ask the firewall what it would do with a packet. This is the best way to check a rule.', type: `test security-policy-match from Core to User source 8.8.8.8 destination ${NAT(23)} destination-port 80 protocol 6 application web-browsing`, look: 'It should name your scored-web rule, with action allow.' },
      { ask: { q: `The web server is 172.20.242.10 inside and ${NAT(23)} outside. Which one goes in the rule's destination?`, a: new RegExp(NAT(23).replace(/\./g, '\\.')), sample: NAT(23), why: 'Security rules match the original destination, before NAT, with the zone after NAT.' } },
      { vm: 'pan', say: 'Check SSH to the store is now blocked.', type: `test security-policy-match from Core to Public source 8.8.8.8 destination ${NAT(11)} destination-port 22 protocol 6`, look: 'It should fall through to interzone-default, deny.' },
      { vm: 'pan', say: 'Now the admin password. In configure mode, enter this, then type the new password twice. It only takes effect when you commit.', type: 'configure', after: 'Type: set mgt-config users admin password   then your password twice, then commit, then exit. Do that now on your own, then press Next.' },
      login('uwks', 'Ubuntu Wkst'),
      { vm: 'uwks', say: 'The web interface only opens from a machine on the User network. Open it from this workstation. Everything you did in the CLI is there too.', type: 'firefox https://172.20.242.150', browser: true, after: 'Log in with admin. Policies is the tab you want, Commit is at the top right. Use whichever you are faster with.' },
    ],
  },
  {
    id: 'persistence', title: 'Finding what Red Team left behind', mins: 14, vms: ['web', 'ecom', 'uwks'],
    steps: [
      { say: 'Assume they are already inside. They leave ways back in, called persistence. If you remove one and leave the way they got in, they come back.\n\nThe usual hiding places:\n- extra accounts, especially UID 0\n- SSH keys in authorized_keys\n- cron, things that run on a schedule\n- web shells, code in places that should only hold files\n- sudo rules giving away root\n\nCheck these on every Linux box.' },
      login('web', 'Ubuntu Srv'),
      { vm: 'web', say: 'A web shell is a small script that runs commands sent through the website.', type: 'find /var/www -name "*.php"', parts: [['find', 'search for files'], ['/var/www', 'starting here'], ['-name "*.php"', 'files ending in .php']], look: 'A site made of plain HTML has no reason to have PHP in its uploads folder.' },
      { ask: { q: 'What is the name of the suspicious file?', a: /thumb\.php/i, sample: 'thumb.php', seen: true, why: 'An uploads folder should hold pictures, not code.' } },
      { vm: 'web', type: 'cat /var/www/html/uploads/thumb.php', look: 'It takes whatever arrives in a web request and runs it as a command. Keep a note of the name and time for your incident report.' },
      { vm: 'web', type: 'rm /var/www/html/uploads/thumb.php', done: (c) => c.st.devState.web.fs['/var/www/html/uploads/thumb.php'] === undefined, after: 'Gone. Only delete what you have read and understood. Deleting the wrong file is how teams hurt themselves.' },
      { vm: 'web', say: 'Now the extra root account.', type: 'userdel webmaint', parts: [['userdel', 'delete an account']], after: 'Next time you can find it alone.' },
      login('ecom', 'CentOS'),
      { vm: 'ecom', type: 'ls /etc/cron.d', parts: [['/etc/cron.d', 'scheduled jobs for the whole system']] },
      { ask: { q: 'Which cron job looks wrong?', a: /sysstat-upd/i, sample: 'sysstat-upd', seen: true, why: 'Read it next. A name that sounds normal proves nothing.' } },
      { vm: 'ecom', type: 'cat /usr/local/sbin/sysstat-upd', look: 'curl something | bash means: download a script and run it. This is a callback.' },
      { vm: 'ecom', say: 'Remove both the schedule and the script. Leaving either one lets it return.', type: 'rm /etc/cron.d/sysstat-upd', done: (c) => c.st.devState.ecom.fs['/etc/cron.d/sysstat-upd'] === undefined },
      { vm: 'ecom', type: 'rm /usr/local/sbin/sysstat-upd', done: (c) => c.st.devState.ecom.fs['/usr/local/sbin/sysstat-upd'] === undefined },
      login('uwks', 'Ubuntu Wkst'),
      { vm: 'uwks', drill: true, say: 'On your own: look in /etc/sudoers.d, read the file, and delete it if it gives everyone root.', type: 'rm /etc/sudoers.d/90-tmp', done: (c) => c.st.devState.uwks.fs['/etc/sudoers.d/90-tmp'] === undefined, after: 'Found and cleared.' },
      { vm: 'uwks', type: 'cat /root/.ssh/authorized_keys', look: 'Every line is a key that can log in as root with no password. Empty is good here. Any key you cannot explain gets removed.' },
    ],
  },
  {
    id: 'windows', title: 'Windows and Active Directory', mins: 14, vms: ['ad', 'win10', 'docker'],
    steps: [
      { say: 'Windows work is mostly PowerShell. Commands are Verb-Noun, so Get- reads and is safe. Set-, Remove-, Stop- and Disable- change things.\n\nGraphical tools work too. In Server Manager, under Tools, you will find Active Directory Users and Computers.' },
      winLogin('ad', '2019 AD'),
      { vm: 'ad', say: 'Who runs your domain? This is the first thing to read.', type: "Get-ADGroupMember 'Domain Admins'", look: 'Anyone here can do anything to every Windows machine.' },
      { ask: { q: 'Which member does not look like it belongs?', a: /svc_audit/i, sample: 'svc_audit', seen: true, why: 'A service account in Domain Admins that nobody can explain.' } },
      { vm: 'ad', type: "Remove-ADGroupMember -Identity 'Domain Admins' -Members svc_audit -Confirm:$false", parts: [['-Members svc_audit', 'who to take out'], ['-Confirm:$false', 'do not ask are you sure']] },
      { vm: 'ad', type: 'Disable-ADAccount -Identity svc_audit', after: 'Disable rather than delete first. You keep the evidence, and you can undo it if you were wrong.' },
      { vm: 'ad', say: 'SMB version 1 is very old and is the door EternalBlue used.', type: 'Get-SmbServerConfiguration', look: 'EnableSMB1Protocol should be False.' },
      { vm: 'ad', type: 'Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force' },
      { vm: 'ad', say: 'A domain controller does not print. The Print Spooler has a history of giving attackers SYSTEM.', type: 'Stop-Service Spooler -Force' },
      { vm: 'ad', say: 'Stopping lasts until the next reboot. Disable it as well.', type: 'Set-Service Spooler -StartupType Disabled' },
      { vm: 'ad', say: 'Never reboot a domain controller casually, and never stop NTDS. POP3 depends on it.', type: 'Get-Service NTDS', look: 'It must say Running.' },
      winLogin('win10', 'Win 10'),
      { vm: 'win10', type: 'Get-LocalGroupMember Administrators', look: 'Local admins on this one machine.' },
      { ask: { q: 'Who should not be there?', a: /svc_print/i, sample: 'svc_print', seen: true, why: 'Nobody can explain it, so it goes.' } },
      { vm: 'win10', drill: true, say: 'On your own: disable that account.', type: 'Disable-LocalUser -Name svc_print', done: (c) => c.ran('win10', /disable-localuser.*svc_print/i), after: 'Done.' },
      { vm: 'win10', type: 'Get-ScheduledTask', look: 'Scheduled tasks are the Windows version of cron. On the day, check these for anything unfamiliar.' },
      winLogin('docker', '2019'),
      { vm: 'docker', say: 'Docker\'s control port, 2375, has no password. Anyone who reaches it effectively owns the machine.', type: 'New-NetFirewallRule -DisplayName "block docker api" -Direction Inbound -LocalPort 2375 -Protocol TCP -Action Block' },
      { vm: 'docker', type: 'docker ps', look: 'A container named maint nobody asked for.' },
      { vm: 'docker', type: 'docker rm -f maint', after: 'Closed the door and removed what came through it.' },
    ],
  },
  {
    id: 'scored', title: 'Hardening without breaking the score', mins: 12, vms: ['dns', 'mail', 'ecom', 'splunk'],
    steps: [
      { say: 'Scored services are the ones to be most careful with. Change one thing, restart, test, then move on. If it breaks, you know what did it.\n\nBefore editing a config file, copy it.' },
      login('mail', 'Fedora'),
      { vm: 'mail', type: 'cp /etc/postfix/main.cf /etc/postfix/main.cf.bak' },
      { vm: 'mail', type: 'postconf mynetworks', look: 'mynetworks is who may send mail through this server without logging in. 0.0.0.0/0 means the entire internet.' },
      { vm: 'mail', type: "postconf -e 'mynetworks = 127.0.0.0/8 172.20.0.0/16'" },
      { vm: 'mail', say: 'Reload so it takes effect.', type: 'systemctl reload postfix' },
      { vm: 'mail', say: 'A leftover installer can reconfigure the whole app. Delete the installer folder only. Webmail itself stays.', type: 'rm -rf /var/www/html/webmail/installer' },
      login('dns', 'Debian'),
      { vm: 'dns', type: 'grep -n recursion /etc/bind/named.conf.options' },
      { vm: 'dns', say: 'sed edits a file from the command line. Slashes inside must be written as \\/ .', type: "sed -i 's/allow-recursion { any; };/allow-recursion { 172.20.0.0\\/16; };/' /etc/bind/named.conf.options", parts: [['sed -i', 'edit the file in place'], ['s/old/new/', 'replace old with new']] },
      { vm: 'dns', type: 'systemctl reload bind9', after: 'Lookups for your own zone still work, which is what is scored.' },
      { vm: 'dns', say: 'Stop root logging in over SSH. Keep your console open while you do this.', type: "sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config" },
      { vm: 'dns', type: 'systemctl restart ssh', after: 'SSH reads its config only when it starts, so the edit did nothing until now.' },
      login('ecom', 'CentOS'),
      { vm: 'ecom', say: 'App passwords live in config files, and firewalls cannot protect them because they come in over a scored port.', type: 'grep -n ADMIN_PASSWORD /var/www/html/config.php' },
      { vm: 'ecom', drill: true, say: `On your own: with sed, change the admin password from admin to ${PW}. Do not delete this file.`, type: `sed -i "s/ADMIN_PASSWORD', 'admin'/ADMIN_PASSWORD', '${PW}'/" /var/www/html/config.php`, done: (c) => !/ADMIN_PASSWORD',\s*'admin'/.test(c.st.devState.ecom.fs['/var/www/html/config.php']), after: 'Done. The store is still up.' },
      login('splunk', 'Splunk'),
      { vm: 'splunk', say: 'Whoever owns the log server can erase your evidence.', type: `/opt/splunk/bin/splunk edit user admin -password ${PW} -auth admin:changeme`, done: (c) => c.ran('splunk', /splunk edit user admin/) },
    ],
  },
  {
    id: 'splunk', title: 'Finding attackers in Splunk', mins: 12, vms: ['uwks'],
    steps: [
      { say: 'Splunk collects logs from everything into one searchable place. You type a search, and you get matching lines.\n\nA search is words, field=value pairs, and pipes that summarize. Do not assume your machines are sending logs on the day. Check. Field names can also differ from this practice copy: the list on the left of the results shows what really exists.' },
      login('uwks', 'Ubuntu Wkst'),
      { vm: 'uwks', type: 'firefox http://172.20.241.20:8000', browser: true, after: 'Splunk is open. Set the time range to All time.' },
      { open: 'siem', say: 'Try this in the search bar. It shows the busiest web clients:\n\nsourcetype=access_combined | stats count by src_ip | sort -count\n\nsourcetype picks a type of log. stats count by adds them up. sort -count puts the biggest first.' },
      { open: 'siem', say: 'Now look for code being called in the uploads folder:\n\nsourcetype=access_combined uploads | stats count by src_ip, uri' },
      { ask: { q: 'Which outside address kept posting to the uploads folder?', a: /198\.51\.100\.61/, sample: '198.51.100.61', why: 'That address is your attacker. The same one swept the ports first.' } },
      { open: 'siem', say: 'Follow them to the next machine. Search for logins that worked:\n\nsourcetype=linux_secure "Accepted password" root\n\nLook for a login that came from one of your own servers.' },
      { ask: { q: 'From which internal address did root log in to the store server?', a: /172\.20\.242\.10\b/, sample: '172.20.242.10', why: 'That is the web server. They reused a stolen password. That is called lateral movement.' } },
      { open: 'siem', say: 'Windows logs by number. Worth memorizing:\n\n4624 login worked\n4625 login failed\n4720 account created\n4728 added to a global group, such as Domain Admins\n\nTry: EventCode=4728' },
      { ask: { q: 'Which account was added to Domain Admins?', a: /svc_audit/i, sample: 'svc_audit', why: 'Now you have a timeline, from first scan to Domain Admin. That is your incident report.' } },
    ],
  },
  {
    id: 'injects', title: 'Injects: the other 40%', mins: 12, vms: [],
    steps: [
      { say: 'An inject is a task from management: write a policy, add a user, answer a vendor. They count about as much as keeping services up, and many teams leave those points behind.\n\nAt regionals, answers are attached PDFs unless told otherwise. Have Word or LibreOffice ready to export. Late usually means zero. Refresh NISE often.' },
      { open: 'injects', say: 'Open NISE. Each row has a title, a release time and a due time. Announcements sit above the list. Assign each inject to one person as soon as it lands.' },
      { say: 'What the judges want:\n\nA memo: To, From, Date, Subject at the top.\nAnswer exactly what was asked, every part of it. Tasks are often multi-part with separate points.\nWrite for the person who asked. A CEO wants plain language. An auditor wants specifics.\nNo slang and no mention of the competition.\nSign as your team number or role, never your school.\nProofread it. Then submit before the due time.' },
      { write: { injectId: 'rdp-request', starter: 'To: Sales Director\nFrom: IT Team\nDate: November 14, 2026\nSubject: Remote access request\n\n' }, say: 'Write this one yourself. The Sales Director wants remote desktop opened to their PC from the internet. Say no, say why, offer a safe alternative and make it useful. The grader tells you what you missed. Keep going until it passes.' },
      { write: { injectId: 'pw-policy', starter: 'To: All Staff\nFrom: IT Team\nDate: November 14, 2026\nSubject: New password policy\n\n' }, say: 'One more. The CEO wants a password policy for all staff, and to hear what you already changed today.' },
    ],
  },
  {
    id: 'incident', title: 'Writing an incident report', mins: 14, vms: ['mail'],
    steps: [
      { say: 'Reports win back points. The packet requires: what occurred, with source and destination addresses, a timeline and any passwords cracked; what was affected; and a remediation plan.\n\nFocus on real break-ins and unauthorized access. A misconfiguration you found is not an incident unless someone exploited it. Frivolous or excessive reports can lose points.' },
      login('mail', 'Fedora'),
      { vm: 'mail', setup: (st) => { stageAttack(st, 'mail', { tag: 'cron', account: 'root' }); }, say: 'Something has just happened on this box. Start with who logged in. On CentOS and Fedora the login log is /var/log/secure. On Debian and Ubuntu it is /var/log/auth.log.', type: 'grep Accepted /var/log/secure', look: 'Note the time, the address and the account. Copy the line for your report.' },
      { ask: { q: 'Which address logged in?', a: (st) => new RegExp(st.engine.red.ip.replace(/\./g, '\\.')), sample: (st) => st.engine.red.ip, seen: true, why: 'That is the source address for your report.' } },
      { vm: 'mail', type: 'ls /etc/cron.d', look: 'Something new that was not there before.' },
      { vm: 'mail', drill: true, say: 'On your own: read the new cron file, then remove it with rm.', done: (c) => !c.st.engine.red.implants.some((i) => i.dev === 'mail' && c.st.devState.mail.fs[i.path] !== undefined), type: (st) => `rm ${st.engine.red.implants.find((i) => i.dev === 'mail').path}`, after: 'Removed. A report scores only if the backdoor is really gone.' },
      { open: 'ir', say: 'Open Incident Reports and file it. Host: mail. Attacker address: from the log. Time: from the log. What happened: name the cron file. Evidence: paste the log line. What you did and how you will prevent it: real sentences.', done: (c) => (c.lastIncident()?.credit || 0) >= 5 / 7, sim: 'incident', feedback: (c) => { const i = c.lastIncident(); return i && i.credit < 5 / 7 ? `Still missing: ${i.missing.join(', ') || 'a match with what really happened'}. File it again.` : null; }, after: 'Graded against what really happened on the box.' },
    ],
  },
  {
    id: 'breakfix', title: 'When something goes red', mins: 12, vms: ['web', 'ecom', 'mail', 'ad'],
    steps: [
      { say: 'A service went down. Work through this in order, every time:\n\n1. Is the machine on? Open the console.\n2. Is the service running?\n3. Is it listening? ss -tulpn\n4. Does it work from inside? curl, or the mail command.\n5. Is the host firewall blocking it?\n6. Is the Palo Alto blocking it? test security-policy-match\n7. What changed recently? Ask your team.\n\nMost outages are self-inflicted. Announce every change out loud before you make it.' },
      login('ecom', 'CentOS'),
      { vm: 'ecom', drill: true, setup: (st) => { const f = st.devState.ecom.live.fwd; f.running.services = f.running.services.filter((s) => s !== 'http'); f.permanent.services = f.permanent.services.filter((s) => s !== 'http'); }, say: 'The store\'s HTTP check is failing, and httpd is running. Find out why and fix it so that it survives a reload.', type: 'firewall-cmd --permanent --add-service=http', done: (c) => c.st.devState.ecom.live.fwd.permanent.services.includes('http'), after: 'Saved. It is not live yet.' },
      { vm: 'ecom', type: 'firewall-cmd --reload', after: 'Fixed, and it will stay fixed.' },
      login('mail', 'Fedora'),
      { vm: 'mail', drill: true, setup: (st) => { st.devState.mail.live.units.postfix = 'inactive'; }, say: 'SMTP is failing. Fix it.', type: 'systemctl start postfix', done: (c) => c.st.devState.mail.live.units.postfix === 'active', after: 'Then find out why it stopped. Services do not stop on their own.' },
      winLogin('ad', '2019 AD'),
      { vm: 'ad', drill: true, setup: (st) => { st.devState.ad.live.winServices.find((s) => s.Name === 'NTDS').Status = 'Stopped'; }, say: 'POP3 is failing. The mail server looks fine. Fix it.', type: 'Start-Service NTDS', done: (c) => c.st.devState.ad.live.winServices.find((s) => s.Name === 'NTDS').Status === 'Running', after: 'The cause was on a different machine. That is the hardest kind to spot.' },
      login('web', 'Ubuntu Srv'),
      { vm: 'web', drill: true, setup: (st) => { delete st.devState.web.fs['/var/www/html/index.html']; st.devState.web.fs['/root/www.bak/index.html'] = '<html><head><title>Driftless Managed Services</title></head><body><h1>Driftless Managed Services</h1></body></html>\n'; }, say: 'The web check is failing and apache is running. You took a backup to /root/www.bak this morning.', type: 'cp /root/www.bak/index.html /var/www/html/index.html', done: (c) => /Driftless Managed/.test(c.st.devState.web.fs['/var/www/html/index.html'] || ''), after: 'Restored.' },
      { ask: { q: 'A machine has been wrecked beyond repair. Who restores it, and how do you ask?', a: /ticket|tech support|support/i, sample: 'a Tech Support ticket', why: 'It is tracked and can cost points, and the original holes come back. It is the last resort.' } },
    ],
  },
  {
    id: 'plan', title: 'Your first 15 minutes', mins: 8, vms: [],
    steps: [
      { say: 'Most damage happens early, so teams split up and follow a list. Decide seats with your captain before Saturday:\n\nCaptain: injects, time, talks to the judges.\nFirewall: the Palo Alto.\nWindows: AD, DNS on AD, workstations.\nLinux: web, DNS, store, mail.\nInjects and reports: writing, all day.\n\nIf you are short on people, double up. Do not leave injects to nobody.' },
      { say: 'Every Linux person, on every box, in this order:\n\n1. Read what it is: cat /etc/issue, ss -tulpn\n2. Change root and user passwords\n3. Back up: web root and configs\n4. Accounts: grep ":x:0:" /etc/passwd\n5. Persistence: /etc/cron.d, crontab -l, authorized_keys, web root\n6. Host firewall, allows first\n7. Test the service\n\nThen go around again. Red Team keeps working.' },
      { say: 'Windows, in order:\n\n1. Administrator password\n2. Domain Admins, local Administrators\n3. SMBv1, Spooler\n4. Scheduled tasks and services\n5. Ticket before staff passwords\n6. Windows Firewall, allows first\n\nFirewall seat, in order:\n\n1. Read the zones and NAT\n2. Admin password\n3. Allow rules for scored services and ping\n4. Test with test security-policy-match\n5. Delete allow-all, commit, watch the job\n6. Check every service afterwards' },
      { say: 'Talking is a skill too. Say what you are about to do before you do it: "changing the firewall on CentOS." Keep one shared list of passwords. Keep one shared log of who changed what and when, since your incident reports come from it.\n\nFrom the packet: teams\' GitHub repositories have been copied into Nextcloud for everyone to use at regionals. Ask your captain whether that applies on Saturday. Scripts you have tested beat scripts you found on the day.' },
      { say: 'Practice in this order from here:\n\n1. Start a Practice round: Long length. Use the playbook.\n2. Competition, Short. Do it until the services stay up.\n3. Competition, Long.\n4. One Real time run with your teammates if you can.\n\nThe boxes on Saturday will be different from these. What carries over is the method.' },
    ],
  },
];

const ORDER = ['day', 'concepts', 'netlab', 'linux', 'editors', 'passwords', 'services', 'hostfw', 'panos', 'pan2', 'persistence', 'deeplinux', 'evict', 'windows', 'windeep', 'scored', 'otherservices', 'patching', 'docker', 'splunk', 'splunkops', 'injects', 'injecttypes', 'incident', 'breakfix', 'redplaybook', 'otherfw', 'scripts', 'plan'];
const ALL = [...CORE, ...MORE_LESSONS];
export const LESSONS = ORDER.map((id) => ALL.find((l) => l.id === id));

export const lessonById = (id) => LESSONS.find((l) => l.id === id);

// The reference sheet: on screen in the panel, and printable (the packet allows printed notes).
export const SHEET = [
  ['Rules to remember', [
    ['Printed notes', 'allowed. No phones, USB or other electronics'],
    ['Root / Administrator', 'change any time, no ticket'],
    ['Accounts services use', 'Password Change Request ticket FIRST'],
    ['Public services', 'no source filtering. May block a single attacking IP, never a subnet'],
    ['Do not change', 'hostnames, usernames, internal IPs, unless an inject says to'],
    ['Never', 'scan or touch another team, Red, White or global assets'],
    ['Say', 'your team number, never your school'],
    ['Injects', 'PDF unless told otherwise. Late usually means zero'],
    ['Incident report', 'what happened, source and destination IPs, timeline, cracked passwords, what was affected, fix'],
  ]],
  ['Editors', [['nano FILE', '^O Enter saves, ^X exits, ^K cuts a line'], ['vi FILE', 'i to type, Esc to stop'], [':wq', 'vi: save and quit'], [':q!', 'vi: quit, discard'], ['dd / u / /word', 'vi: delete line / undo / search']]],
  ['Ports', [['22', 'SSH'], ['25', 'SMTP'], ['53', 'DNS (udp and tcp)'], ['80 / 443', 'HTTP / HTTPS'], ['110', 'POP3'], ['123', 'NTP'], ['445', 'SMB'], ['3306', 'MySQL / MariaDB'], ['3389', 'RDP'], ['5985', 'WinRM']]],
  ['Linux: look', [
    ['cat /etc/issue', 'which OS'], ['ss -tulpn', 'what is listening'], ['ps aux', 'what is running'], ['who ; last', 'who is on, who was'],
    ['grep ":x:0:" /etc/passwd', 'extra root accounts'], ['ls /etc/cron.d ; crontab -l', 'scheduled jobs'], ['cat /root/.ssh/authorized_keys', 'keys that log in as root'],
    ['ls /etc/sudoers.d', 'sudo rules'], ['find /var/www -name "*.php"', 'look for web shells'], ['grep Accepted /var/log/auth.log', 'logins (Debian, Ubuntu)'], ['grep Accepted /var/log/secure', 'logins (CentOS, Fedora)'],
  ]],
  ['Linux: change', [
    ['passwd root', 'change a password'], ['cp -a /var/www/html /root/www.bak', 'back up first'], ['userdel NAME', 'delete an account'], ['rm FILE', 'delete, after reading it'],
    ['sed -i \'s/old/new/\' FILE', 'edit a file'],
    ['service NAME status|restart', 'old systems (Ubuntu 14)'], ['systemctl status|restart NAME', 'newer systems'], ['curl http://localhost/', 'test the website'],
  ]],
  ['Harder Linux backdoors', [
    ['lsattr FILE ; chattr -i FILE', 'cannot delete as root? immutable flag'], ['cat /etc/rc.local', 'boot script'], ['systemctl list-timers', 'the newer cron'], ['cat /etc/ld.so.preload', 'should not exist'], ['cat /root/.bashrc', 'aliases, login commands'], ['find / -perm -4000', 'SUID programs'], ['ss -antp ; who', 'live connections, sessions'], ['pkill -9 -t pts/N', 'kick a session, AFTER changing the password'],
    ['bash -i >& /dev/tcp/', 'reverse shell'], ['curl ... | bash', 'download and run'],
  ]],
  ['Old systems', [['/etc/apt/sources.list', 'Debian 8: use archive.debian.org'], ['apt-get -o Acquire::Check-Valid-Until=false update', 'accept the expired date'], ['/etc/yum.repos.d/CentOS-Base.repo', '#mirrorlist, baseurl=http://vault.centos.org'], ['Fedora 21', 'archives.fedoraproject.org/pub/archive/...'], ['No connection?', 'outbound blocked on the Palo Alto?']]],
  ['Host firewalls: allow first, then block', [
    ['iptables -L -n', 'list'], ['iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT', 'allow replies'], ['iptables -A INPUT -p tcp --dport 80 -j ACCEPT', 'allow a port'], ['iptables -P INPUT DROP', 'then drop the rest'],
    ['firewall-cmd --list-all', 'list'], ['firewall-cmd --permanent --add-service=http', 'save a rule'], ['firewall-cmd --permanent --remove-port=3306/tcp', 'save a removal'], ['firewall-cmd --reload', 'make saved rules live'],
    ['ufw allow 80/tcp ; ufw enable', 'Ubuntu'],
  ]],
  ['Palo Alto CLI', [
    ['show interface all', 'zones'], ['show running nat-policy', 'public addresses'], ['show running security-policy', 'live rules'], ['configure', 'enter config mode'],
    ['set rulebase security rules NAME from Core to ZONE source any destination PUBLIC-IP application APP service application-default action allow', 'add a rule'],
    ['application [ web-browsing ssl ]', 'a list uses spaces and brackets'], ['delete rulebase security rules NAME', 'remove'], ['move rulebase security rules NAME top', 'reorder'], ['set mgt-config users admin password', 'admin password, needs commit'],
    ['commit', 'apply. Takes a while'], ['exit ; show jobs all', 'watch it: FIN and OK'], ['test security-policy-match from Core to ZONE source 8.8.8.8 destination PUBLIC-IP destination-port 80 protocol 6', 'what would happen'],
    ['show log traffic last 50 direction equal backward', 'recent traffic'], ['set rulebase security rules X from Core to any source IP destination any application any service any action deny', 'block ONE address, then move it top'],
    ['Rule destination', 'PUBLIC address, zone AFTER NAT'], ['Apps', 'web-browsing ssl smtp pop3 dns ping'],
  ]],
  ['Windows / AD (PowerShell)', [
    ['Get-ADGroupMember \'Domain Admins\'', 'who runs the domain'], ['Get-LocalGroupMember Administrators', 'local admins'], ['Get-ADUser -Filter *', 'all accounts'],
    ['Set-ADAccountPassword -Identity NAME -Reset -NewPassword (ConvertTo-SecureString \'PW\' -AsPlainText -Force)', 'change an AD password'],
    ['Remove-ADGroupMember -Identity \'Domain Admins\' -Members NAME', 'remove rights'], ['Disable-ADAccount -Identity NAME', 'disable'], ['Disable-LocalUser -Name NAME', 'disable local'],
    ['Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force', 'SMBv1 off'], ['Stop-Service Spooler -Force', 'stop'], ['Set-Service Spooler -StartupType Disabled', 'keep it off'], ['Get-ScheduledTask', 'look for persistence'],
    ["Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625} -MaxEvents 5", 'read events'], ['netstat -ano ; Get-Process', 'connections, PIDs'], ['reg query HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'startup'], ['setspn -Q */*', 'Kerberoast targets'], ['Reset krbtgt twice', 'kills forged tickets'],
    ['New-NetFirewallRule -DisplayName X -Direction Inbound -LocalPort N -Protocol TCP -Action Block', 'block a port'],
  ]],
  ['Splunk', [
    ['sourcetype=access_combined | stats count by src_ip | sort -count', 'busiest web clients'], ['sourcetype=linux_secure "Failed password" | stats count by src_ip', 'guessing attempts'], ['sourcetype=linux_secure "Accepted password"', 'logins that worked'],
    ['4624 / 4625', 'Windows login worked / failed'], ['4720 / 4728', 'account created / added to a group'], ['4688 / 7045 / 4698 / 1102', 'process / service / task / log cleared'], ['splunk enable listen 9997', 'on the server'], ['splunk add forward-server IP:9997 ; add monitor FILE', 'on each machine'],
  ]],
  ['Something is red', [['1', 'Machine on?'], ['2', 'Service running?'], ['3', 'Listening? ss -tulpn'], ['4', 'Works from inside? curl'], ['5', 'Host firewall?'], ['6', 'Palo Alto? test security-policy-match'], ['7', 'What changed? Ask the team'], ['Last resort', 'Tech Support ticket: costs points, holes come back']]],
];

/** The sheet as its own printable page. */
export function sheetHtml() {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const body = SHEET.map(([t, rows]) => `<section><h2>${esc(t)}</h2><table>${rows.map(([a, b]) => `<tr><td class="c">${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table></section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>CCDC reference sheet</title><style>
@page { size: letter; margin: 0.4in; }
body { font: 9.5px/1.25 Arial, Helvetica, sans-serif; color: #000; margin: 0; columns: 2; column-gap: 0.25in; }
h1 { font-size: 13px; margin: 0 0 4px; column-span: all; }
section { break-inside: avoid; margin-bottom: 8px; }
h2 { font-size: 10.5px; margin: 0 0 2px; padding: 1px 3px; background: #000; color: #fff; }
table { border-collapse: collapse; width: 100%; }
td { padding: 1px 3px; border-bottom: 1px solid #bbb; vertical-align: top; }
td.c { font-family: Consolas, 'DejaVu Sans Mono', monospace; font-size: 8.8px; word-break: break-word; }
</style></head><body><h1>CCDC reference sheet (printed notes are allowed; your own packet overrides this)</h1>${body}</body></html>`;
}
