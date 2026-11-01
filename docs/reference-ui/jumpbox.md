# Jump box, browser, PuTTY, PDF packet (CCDC shell)

What the team actually sits at: a Windows workstation with PuTTY, mstsc and a browser. The CCDC scene is that
desktop (`src/ui/ccdc/JumpBox.js`, `jumpbox.css`), not a dashboard.

## Looked at
- PuTTY docs on colours and bold-as-colour: https://wa2l-wintools.sourceforge.net/chm/PuTTY/html/config-colourcfg.html ,
  https://wa2l-wintools.sourceforge.net/chm/PuTTY/html/faq-colours.html , https://brianhilmers.com/putty (lists default fg 187,187,187)
- PuTTY default-colour wishlist page: https://ftp.fau.de/putty/wishlist/default-colours.html
- Windows 10 title bars (white by default, active and inactive): https://www.winhelponline.com/blog/wp-json/wp/v2/posts/1417 ,
  caption button sizing: https://winaero.com/how-to-reduce-title-bar-height-and-size-of-window-buttons-in-windows-10 ,
  FlatLaf's Windows 10 title bar spec (close hover colour key): https://www.formdev.com/flatlaf/components/titlebar
- Chrome tab strip colour mixer / omnibox security UI: https://chromium.googlesource.com/chromium/src/+/74fc83e4d20d1855d0269abd20bf7efddb3d5c6b/chrome/browser/ui/color/tab_strip_color_mixer.cc ,
  https://textslashplain.com/2017/01/10/security-ui-in-chrome/ , https://codereview.chromium.org/2734783007 (struck-through, red scheme on cert errors)

## Copied
| Element | What we copy |
|---|---|
| Taskbar | 40 px, near-black (#101010 at ~94%), Start (4-pane logo), white search box "Type here to search", pinned apps with the light-blue running underline (#76B9ED), red notification badges, tray: network, volume, clock with date line, action centre |
| Window frame | white 30 px title bar, Segoe UI 12 px, 46×30 caption buttons, close hover #E81123 with white glyph, 1 px accent border #1883D7 on the active window, grey text when inactive, double-click title = maximise |
| Chrome | tab strip #DEE1E6 with a white rounded active tab, favicon + title + ×, "+" new tab; toolbar with ← → ⟳ and the #F1F3F4 pill omnibox; self-signed CCDC hosts show red "Not secure" and a struck-through red `https` |
| PuTTY | black background, #BBBBBB text, Courier New; bold = bright (Ubuntu PS1: bright green user@host, bright blue path); Ubuntu MOTD on login ("Welcome to Ubuntu 20.04.6 LTS …", System information block, Last login) |
| pfSense over SSH | the console menu (0 Logout … 8 Shell …) before the shell |
| Toasts | Windows 10 action-centre toasts bottom-right: app name small grey, bold title, body |
| Team packet / AAR | opened in Chrome's PDF viewer (#323639 toolbar, #525659 backdrop, white pages); document typography with navy section rules and table headers like a real NCCDC team packet |
| Notepad | menu File/Edit/Format/View/Help, Consolas, status bar "Ln 1, Col 1 · 100% · Windows (CRLF) · UTF-8" |

Values marked "from memory" in the search notes (E81123, 40 px, 55FF55) match what the pages above describe
qualitatively; they are the commonly documented defaults.
