# ONYX VAULT V1 — Offizielle Website

> **Zero-Server · Zero-Trace · Zero-Compromise**

Open-Source Tor-basierter P2P-Messenger mit Nostr-Relay-Netzwerk für Killswitch, Recovery und SaveCard.

**Die App ist ein reiner Messenger — diese Websites sind nur Infomaterial und Notfall-Werkzeug.**
Dein täglicher Chat läuft NIE über eine Website.

---

## 🌐 Die zwei offiziellen Zugänge

### 🧅 Primär — Tor Hidden Service (empfohlen)

```
http://gkxjozyouiypb2gx5okxekid2mmlxfvzmup7usztsv2pwnr2wnajmoad.onion
```

**Nur mit [Tor Browser](https://www.torproject.org/download/) öffnen.**
Deine IP bleibt verborgen. Der Service ist Ende-zu-Ende verschlüsselt über das Tor-Netzwerk, kein Clearnet-Fingerprint möglich. Diese Variante ist die mit maximaler Anonymität.

### 🌍 Sekundär — GitHub Pages (Clearnet-Mirror)

```
https://supportonyxvault.github.io/onyxvault-website/
```

**Identischer Code wie die Tor-Variante.** Direkt im Standard-Browser öffnbar, kein Tor Browser nötig.

- ✅ **MIT VPN** (Mullvad, ProtonVPN, IVPN): 100% anonym — GitHub/Fastly sieht nur die VPN-Exit-IP
- ⚠️ **OHNE VPN**: deine echte IP wird von GitHub/Fastly beim Öffnen gesehen (sie sehen aber NICHT wohin dein Code gesendet wird — das übernimmt Hermes.js clientseitig)

Für Personen ohne Tor-Browser und ohne VPN ist der GitHub-Mirror im Alltag ausreichend, weil nur statische Infoseiten geliefert werden und der ganze Krypto-Flow im Browser läuft.

---

## 📂 Alle Unterseiten

| Seite | Zweck | Tor-Link | Clearnet-Link |
|---|---|---|---|
| **Übersicht** | Konzept, Sicherheits-Schichten | [.onion/index](http://gkxjozyouiypb2gx5okxekid2mmlxfvzmup7usztsv2pwnr2wnajmoad.onion/index.html) | [github.io/index](https://supportonyxvault.github.io/onyxvault-website/index.html) |
| **Registrierung** | Reg-QR → Master-QR Transformation | [.onion/register](http://gkxjozyouiypb2gx5okxekid2mmlxfvzmup7usztsv2pwnr2wnajmoad.onion/register.html) | [github.io/register](https://supportonyxvault.github.io/onyxvault-website/register.html) |
| **Recovery** | PIN-Reset via Master-QR | [.onion/recovery](http://gkxjozyouiypb2gx5okxekid2mmlxfvzmup7usztsv2pwnr2wnajmoad.onion/recovery.html) | [github.io/recovery](https://supportonyxvault.github.io/onyxvault-website/recovery.html) |
| **Kill Switch** | Remote-Wipe via Master-QR | [.onion/killswitch](http://gkxjozyouiypb2gx5okxekid2mmlxfvzmup7usztsv2pwnr2wnajmoad.onion/killswitch.html) | [github.io/killswitch](https://supportonyxvault.github.io/onyxvault-website/killswitch.html) |
| **SaveCard-Generator** | Notfall-Karte für Vertrauensperson | [.onion/savecard](http://gkxjozyouiypb2gx5okxekid2mmlxfvzmup7usztsv2pwnr2wnajmoad.onion/savecard.html) | [github.io/savecard](https://supportonyxvault.github.io/onyxvault-website/savecard.html) |
| **SaveCard-Trigger** | QR-Scan → Killswitch (via SaveCard-QR) | [.onion/savetrigger](http://gkxjozyouiypb2gx5okxekid2mmlxfvzmup7usztsv2pwnr2wnajmoad.onion/savetrigger.html) | [github.io/savetrigger](https://supportonyxvault.github.io/onyxvault-website/savetrigger.html) |
| **Tor-Gate** | Auto-Detect Tor Browser + Fallback | [.onion/tor-gate](http://gkxjozyouiypb2gx5okxekid2mmlxfvzmup7usztsv2pwnr2wnajmoad.onion/tor-gate.html) | [github.io/tor-gate](https://supportonyxvault.github.io/onyxvault-website/tor-gate.html) |
| **Impressum** | TMG § 5 | [.onion/impressum](http://gkxjozyouiypb2gx5okxekid2mmlxfvzmup7usztsv2pwnr2wnajmoad.onion/impressum.html) | [github.io/impressum](https://supportonyxvault.github.io/onyxvault-website/impressum.html) |
| **Datenschutz** | DSGVO-Erklärung | [.onion/datenschutz](http://gkxjozyouiypb2gx5okxekid2mmlxfvzmup7usztsv2pwnr2wnajmoad.onion/datenschutz.html) | [github.io/datenschutz](https://supportonyxvault.github.io/onyxvault-website/datenschutz.html) |

---

## 🔒 Sicherheits-Architektur

### Kryptographie
| Schicht | Technik |
|---|---|
| Transport (Tor) | Hidden Service v3 (Onion v3, 56-Zeichen Adresse, Ed25519) |
| Transport (Clearnet) | HTTPS via GitHub Pages (Fastly CDN) |
| App ↔ App Chat | ChaCha20-Poly1305 + X25519 + Kyber-1024 (Post-Quantum Hybrid) |
| App Container | SQLCipher mit AES-256 |
| PIN-Schutz | Argon2id im Hardware-Keystore (TEE / StrongBox) |
| Master-QR | AES-256-GCM mit SHA-256(passphrase) Key, 12-Byte IV |
| Nostr-Events | BIP-340 Schnorr-Signaturen (secp256k1) |
| SaveCard-Token | Hash-Fragment-URL (`#t=`) statt Query — leakt nicht in Server-Logs |

### Server-Härtung (Oracle VM)
- Nur `127.0.0.1:8080` gelistet, kein öffentlicher Port — Tor-Routing exklusiv
- `access_log off` — keine User-IPs, keine Fingerprints
- CSP ohne `unsafe-inline` — keine inline-Scripts, lokal vendored jsPDF + pdf.js mit SRI-Hashes
- Strict CORS Allowlist (keine Wildcards)
- Rate-Limit (10 req/min pro echter Client-IP via X-Forwarded-For)
- Event-Dedup persistiert über Server-Restart
- Backup der Hidden-Service-Keys verschlüsselt offline

### Security Headers (nginx)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`

### Nostr Kill-Event Flow
Alle eingehenden Events werden BIP-340 Schnorr-verifiziert bevor sie verarbeitet werden — sowohl in der App als auch im Relay-Proxy. Replay-Protection via persistierter Event-ID-Liste, Kind-Whitelist (`30078` KILL, `30081` RECOVERY), Shape-Validation des Payloads.

---

## 📁 Dateien im Repo

| Datei | Beschreibung |
|---|---|
| `index.html` | Übersicht + Konzept |
| `register.html` + `register.js` | ONYX3 → ONYX_MASTER QR-Transformation |
| `recovery.html` + `recovery.js` | PIN-Reset-Flow |
| `killswitch.html` + `killswitch.js` | Manueller Killswitch mit Master-QR |
| `savecard.html` + `savecard.js` | SaveCard-PDF-Generator |
| `savetrigger.html` + `savetrigger.js` | Partner-Scan → Nostr-Publish |
| `tor-gate.html` + `tor-gate.js` | Tor-Browser-Detection |
| `impressum.html` | TMG § 5 |
| `datenschutz.html` | DSGVO-Erklärung |
| `hermes.js` | Client-side BIP-340 Nostr-Signing + AES-GCM |
| `vendor/jspdf.umd.min.js` | PDF-Generation (lokal gehostet, SRI-pinned) |
| `vendor/pdf.min.js` + `pdf.worker.min.js` | PDF-Parsing (lokal gehostet, SRI-pinned) |
| `style.css` | Dark-Teal Theme |
| `logo.png` | Marken-Logo |

---

## 🏗️ Hosting-Infrastruktur

### Primär — Tor Hidden Service
- Oracle Cloud Free Tier VM (eu-frankfurt-1)
- Ubuntu 22.04 LTS, nginx + tor + Node.js
- Tor Hidden Service v3 (Ed25519)
- Node.js Relay-Proxy für Fanout zu .onion + Clearnet Nostr-Relays (via lokalem Tor SOCKS)

### Sekundär — GitHub Pages
- Statischer Mirror, identischer Code
- Ausgeliefert via Fastly CDN
- Dient Nicht-Tor-Nutzern (empfohlen mit VPN)

### Nostr-Relay-Pool
- 5 .onion-Mirror-Relays (dynamisch via relays.meowl.social gepflegt)
- 6 Clearnet-Relays (relay.damus.io, nos.lol, nostr.wine, relay.snort.social, offchain.pub, purplerelay.com)
- Dual-Fanout: Oracle-Server published parallel in beide Netze

---

## 📝 Was die App ist — und was sie NICHT ist

**ONYX VAULT ist:**
- Ein reiner P2P-Messenger auf Android (Kotlin + Jetpack Compose)
- Komplett Open Source (AGPL-3.0)
- Zero-Server-Design — die App selbst erzeugt Keys und schickt Nachrichten direkt an den Partner

**ONYX VAULT ist NICHT:**
- Abhängig von unseren Websites — du kannst die komplett ignorieren
- Abhängig von unseren Servern — die machen nur Nostr-Fanout für Killswitch/Recovery
- Ein weiterer "verschlüsselter Messenger mit Backdoor" — es gibt keinen Backup-Server der entschlüsseln könnte

---

## 📜 Lizenz

**AGPL-3.0** — © 2026 ONYX VAULT Project

Jeder Nutzer darf den Code einsehen, auditieren, forken und weitergeben.
