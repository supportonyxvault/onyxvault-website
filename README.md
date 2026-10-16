# ONYX VAULT V1 — Offizielle Website

> **Zero-Server · Zero-Trace · Zero-Compromise**

Dezentraler Tor-basierter P2P-Messenger mit Nostr-Relay-Netzwerk für Recovery und Kill Switch.

---

## 🧅 PRIMÄRE ADRESSE — Tor Hidden Service (empfohlen)

```
http://k5zgzy3zuhsvocddjaywh56ieuyeid4woff4nsnvponz4qc7djhl27id.onion
```

**Nur über [Tor Browser](https://www.torproject.org/download/) öffnen.** Deine IP bleibt verborgen, der Service ist Ende-zu-Ende verschlüsselt über das Tor-Netzwerk, kein Clearnet-Fingerprint möglich.

> **Warum nur Tor?** Jede Clearnet-Verbindung leakt deine IP an den Hoster. Tor Hidden Services sind der einzige Weg zu echter Anonymität — die User-Erfahrung ist identisch zu einer normalen Website, nur mit `.onion` statt `.com`.

---

## 🔒 Sicherheits-Architektur (ganz oben, weil es die wichtigste Entscheidung ist)

| Schicht | Technik |
|---|---|
| Transport | Tor Hidden Service v3 (Onion v3, 56-Zeichen Adresse, ed25519) |
| TLS entfällt | Tor-Verschlüsselung Ende-zu-Ende, kein Zertifikatsproblem |
| Client-Crypto | Argon2id-KDF, ChaCha20-Poly1305, X25519, Kyber-1024, BIP-340 Schnorr |
| Server-Logs | `access_log off` — keine User-IPs, keine Browser-Fingerprints |
| CSP | `default-src 'self'; connect-src 'self' wss://*.onion` — kein externes Script |
| Headers | `X-Frame-Options DENY`, `Referrer-Policy no-referrer`, `Permissions-Policy camera=(), microphone=(), geolocation=()` |
| Keine Analytics | Keine Cookies, keine Fonts von Google, keine Social-Media-Plugins |

---

## 📁 Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Übersicht — 8 Sicherheits-Schichten |
| `register.html` | Hardware-QR-Export (In-App) oder Browser-Upload (Backup) |
| `recovery.html` | 2 Wege: 5-Wort-Passphrase (kostenlos) oder Recovery-QR + Zahlung |
| `killswitch.html` | Nostr-signiertes Kill-Event (`ONLY_APP` oder `FULL_SYSTEM`) |
| `impressum.html` | Impressum (TMG § 5 / § 55 RStV) |
| `datenschutz.html` | Datenschutzerklärung (DSGVO-konform) |
| `hermes.js` | Argon2id-KDF + Nostr NIP-01 Signing + wss-Relay-Pool |
| `style.css` | Dark Teal Theme, ONYX (weiß) · VAULT (türkis) |
| `logo.png` | Markenlogo |

---

## 🏗️ Architektur

- **Zero-Server:** Keine zentrale Infrastruktur. Nur Tor Hidden Service + öffentliche Nostr-Relays (wss://)
- **Client-side crypto:** Alle QR-Dekodierung, Argon2id-Härtung und Nostr-Signatur passiert ausschließlich im Browser des Nutzers
- **No tracking:** Keine Analytics, keine Cookies, keine Logs der Nutzer-IPs
- **In-App Mirror:** Identische Dateien liegen auch unter `app/src/main/assets/website/` der APK — die App-WebView lädt sie offline

---

## 🚀 Hosting

### Primär: Tor Hidden Service
- Oracle Cloud Free Tier VM (eu-frankfurt-1)
- Ubuntu 22.04 LTS, nginx + tor
- Nur `127.0.0.1:8080` gelistet, **kein öffentlicher Port**
- Backup der Hidden-Service-Keys erfolgt verschlüsselt offline

### Sekundär: GitHub Pages (Fallback)
- `https://supportonyxvault.github.io/onyxvault-website/`
- Nur als Mirror für Nutzer ohne Tor Browser
- **Nicht empfohlen** — leakt deine IP an GitHub/Fastly

---

## 📜 Lizenz

AGPL-3.0 — © 2026 ONYX VAULT Project
