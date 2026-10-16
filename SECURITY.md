# Security Policy — ONYX VAULT

## 🔍 Transparenz

ONYX VAULT ist ein **Open-Source Privacy-Messenger**. Wie Signal, Proton und Threema setzen wir auf vollständige Code-Transparenz:

> Du musst uns nicht vertrauen — du kannst nachschauen.

Jede Zeile Code (App, Website, Server-Konfig) liegt öffentlich und ist auditierbar.

## 🛠️ Was wo läuft (ehrlich dokumentiert)

### Automatisch bei jedem Code-Push
- **GitHub CodeQL** — statische Code-Analyse via `security-and-quality` Query-Suite
- **GitHub Secret Scanning** — findet accidentally committed Keys/Tokens
- **GitHub Push Protection** — blockt Secrets direkt beim `git push`
- **Dependabot** — meldet Vulnerabilities in Dependencies

### Scheduled
- **CodeQL wöchentlich** — Montag 06:00 UTC, falls neue Signaturen hinzugekommen sind

### Externes Review
- **AI-assisted Code Review** — ein LLM-basierter Audit-Chat hat den Code strukturiert durchgegangen und Findings dokumentiert (die bestätigten Lücken wurden behoben)
- **Community-Audit** — AGPL-3.0 Lizenz erlaubt jeder/m die Codebasis zu klonen, zu analysieren und Findings zu melden
- **Audit-Repository**: [github.com/supportonyxvault/onyx-vault-audit](https://github.com/supportonyxvault/onyx-vault-audit) — redacted Snapshot für externe Reviewer

### Was wir NICHT behaupten
- ❌ Keine Zertifizierung durch GitHub oder andere Dritte
- ❌ Kein kommerzielles externes Audit durch eine Security-Firma (noch nicht — ggf. später)
- ❌ Keine formelle Common-Criteria-/CSPN-/BSI-Zertifizierung

Transparenz heißt auch: wir werben nicht mit Dingen die wir nicht haben.

## 🐛 Responsible Disclosure

Wenn du eine Sicherheitslücke findest:

1. **Erstelle KEIN öffentliches GitHub-Issue** mit Details zur Lücke
2. **Kontaktiere uns direkt** — Kontakt-Details auf [Impressum](./impressum.html)
3. **Nenne:** Datei + Zeile + Reproduktions-Schritte + Impact-Einschätzung
4. **Gib uns Zeit** zum Fix bevor du veröffentlichst (Standard: 90 Tage)

Wir reagieren innerhalb von 7 Tagen auf jede Meldung und dokumentieren bestätigte Fixes transparent im Audit-Repo.

## 📜 Lizenz

AGPL-3.0 — © 2026 ONYX VAULT Project
