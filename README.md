# ONYX VAULT — Offizielle Website

Zero-Server · Zero-Trace · Zero-Compromise

Dies ist die offizielle Website für **ONYX VAULT**, einen dezentralen Tor-basierten P2P-Messenger mit Nostr-Relay-Netzwerk für Recovery und Kill Switch.

## 🌐 Live

GitHub Pages: `https://supportonyxvault.github.io/onyxvault-website/`

## 🏗️ Architektur

- **Zero-Server:** Keine zentrale Infrastruktur. Nur öffentliche Nostr-Relays (wss://) und Tor-Netzwerk.
- **Client-side crypto:** Alle QR-Dekodierung, Argon2id-Härtung und Nostr-Signatur passiert im Browser.
- **No tracking:** Keine Analytics, keine Cookies, keine Logs.
- **In-App Mirror:** Identische Dateien liegen auch unter `app/src/main/assets/website/` der APK — die App-WebView lädt sie offline.

## 📁 Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Marketing-Übersicht, 8 Sicherheits-Schichten |
| `register.html` | Hardware-QR-Export (In-App) oder Browser-Upload (Backup) |
| `recovery.html` | 2 Wege: 5-Wort-Passphrase (kostenlos) oder Recovery-QR + Zahlung |
| `killswitch.html` | Nostr-signiertes Kill-Event (ONLY_APP oder FULL_SYSTEM) |
| `hermes.js` | Argon2id-KDF + Nostr NIP-01 Signing + wss-Relay-Pool |
| `style.css` | Dark Teal Theme, ONYX (weiß) · VAULT (türkis) |
| `logo.png` | Markenlogo |

## 🚀 Deployment

Push auf `main` → GitHub Actions deployt automatisch (siehe `.github/workflows/deploy.yml`).

### Custom Domain

Erstelle `CNAME` mit `onyxvault.io` (oder gewünschter Domain) und setze DNS A-Records auf GitHub Pages IPs.

## 🔐 Sicherheits-Hinweise

- Website lädt zwei externe Scripts: `jsqr@1.4.0` (QR-Decode) und `nostr-tools@1.17.0` (NIP-01 Signing).
- Beide via `cdn.jsdelivr.net` + `unpkg.com` — Subresource-Integrity-Hashes werden mit v4.1 ergänzt.
- Keine Keys werden in `localStorage` oder `sessionStorage` persistiert — nur Session-Memory.
- Keine Formulardaten verlassen den Browser außer das signierte Nostr-Event.

## 📜 Lizenz

AGPL-3.0 — © 2026 ONYX VAULT Project
