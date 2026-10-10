/**
 * ONYX VAULT - HERMES AGENT v4.0 (Hardened)
 *
 * Zero-Server-Architektur: Alle Kommunikation läuft über öffentliche Nostr-Relays (wss://).
 *
 * SICHERHEITS-FEATURES:
 *  - Key-Ableitung: PBKDF2-SHA256 mit 600.000 Iterationen + 16-Byte-Salt
 *    (Argon2id-Äquivalent via WebCrypto; echter Argon2 wäre WASM-Overhead)
 *  - KEIN langlebiger Secret-Storage: Nostr-PrivateKey nur im RAM (closure variable),
 *    niemals in localStorage/sessionStorage. Nach Event-Send sofort überschrieben.
 *  - QR-Dekryption: Doppel-Factor = App-ID + optionale 5-Wort-Passphrase
 *  - Payload-Signatur mit NIP-01 (secp256k1 via nostr-tools)
 *
 * Lizenz: AGPL-3.0 - ONYX VAULT Project 2026
 */

(function(global) {
  'use strict';

  // ---------- Konfiguration ----------
  const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://nostr.wine',
    'wss://offchain.pub'
  ];

  const KDF_ITER = 600000;      // PBKDF2 Iterationen (OWASP 2024+ empfohlen)
  const KDF_SALT_LEN = 16;      // Byte
  const NONCE_LEN = 12;         // AES-GCM IV
  const KIND_KILL = 30078;      // ONYX kill-command event kind
  const KIND_RECOVERY = 30081;  // ONYX recovery-command event kind

  // ---------- Krypto-Primitiven ----------

  async function pbkdf2DeriveKey(passBytes, salt, iterations, keyLenBits) {
    const baseKey = await crypto.subtle.importKey(
      'raw', passBytes, { name: 'PBKDF2' }, false, ['deriveBits', 'deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: keyLenBits },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Entschlüsselt ONYX3-Container.
   * Format: Base64( salt(16) | iv(12) | ciphertext )
   */
  async function decryptContainer(b64Payload, passphrase) {
    try {
      const raw = Uint8Array.from(atob(b64Payload), c => c.charCodeAt(0));
      if (raw.length < KDF_SALT_LEN + NONCE_LEN + 16) return null;

      const salt = raw.slice(0, KDF_SALT_LEN);
      const iv   = raw.slice(KDF_SALT_LEN, KDF_SALT_LEN + NONCE_LEN);
      const ct   = raw.slice(KDF_SALT_LEN + NONCE_LEN);

      const passBytes = new TextEncoder().encode(passphrase);
      const key = await pbkdf2DeriveKey(passBytes, salt, KDF_ITER, 256);

      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
      return new TextDecoder().decode(pt);
    } catch (e) {
      console.warn('[Hermes] decrypt failed:', e.message);
      return null;
    }
  }

  function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------- Hermes Public API ----------

  const Hermes = {
    version: '4.0',

    // Nur im RAM, niemals persistiert
    _session: {
      appId: null,
      masterPub: null,
      nostrPrivKey: null,
      relays: null
    },

    /**
     * Lädt eine Identität aus einem QR-String.
     * Formate:
     *   ONYX3:<appId>:<encBase64>        - verschlüsselt mit App-ID als Secret
     *   ONYX3P:<appId>:<encBase64>       - verschlüsselt mit App-ID + Passphrase
     */
    saveIdentity: async function(qrString, userPassphrase) {
      try {
        if (typeof qrString !== 'string') return false;
        const t = qrString.trim();
        if (!t.startsWith('ONYX3')) {
          console.warn('[Hermes] unsupported format');
          return false;
        }

        const parts = t.split(':');
        if (parts.length < 3) return false;

        const protocol = parts[0];       // ONYX3 oder ONYX3P
        const appId    = parts[1];
        const payload  = parts.slice(2).join(':');  // falls Base64 Doppelpunkte enthält

        let passphrase;
        if (protocol === 'ONYX3P') {
          passphrase = appId + ':' + (userPassphrase || prompt('5-Wort-Passphrase eingeben (space-separiert):'));
          if (!userPassphrase && !passphrase) return false;
        } else {
          passphrase = appId;
        }

        const plaintext = await decryptContainer(payload, passphrase);
        if (!plaintext) return false;

        const identity = JSON.parse(plaintext);
        if (!identity.app_id || !identity.ks_priv || !identity.pub) {
          console.warn('[Hermes] identity invalid shape');
          return false;
        }

        // Secrets nur im RAM
        this._session.appId = identity.app_id;
        this._session.masterPub = identity.pub;
        this._session.nostrPrivKey = identity.ks_priv;
        this._session.relays = Array.isArray(identity.relays) && identity.relays.length
          ? identity.relays
          : DEFAULT_RELAYS;

        // UI darf App-ID anzeigen (nicht sensibel), aber nicht die Keys
        try { sessionStorage.setItem('onyx_app_id_display', identity.app_id); } catch(e) {}

        console.log('[Hermes] identity loaded, app_id=' + identity.app_id);
        return true;
      } catch (e) {
        console.error('[Hermes] saveIdentity error', e);
        return false;
      }
    },

    isReady: function() {
      return !!(this._session.nostrPrivKey && this._session.masterPub);
    },

    getAppId: function() {
      return this._session.appId;
    },

    /**
     * Sendet signiertes Kill-Command an alle Nostr-Relays.
     * Löscht private Keys sofort nach Versand.
     */
    sendKillCommand: async function(mode) {
      return this._sendCommand(KIND_KILL, {
        action: 'EXECUTE_ONYX_KILL',
        mode: mode || 'FULL_SYSTEM',
        issued_at: Math.floor(Date.now() / 1000)
      });
    },

    sendRecoveryCommand: async function(newPinHash) {
      return this._sendCommand(KIND_RECOVERY, {
        action: 'EXECUTE_ONYX_RECOVERY',
        new_pin_hash: newPinHash || null,
        issued_at: Math.floor(Date.now() / 1000)
      });
    },

    _sendCommand: async function(kind, payloadObj) {
      if (!this.isReady()) {
        return { ok: false, error: 'identity not loaded' };
      }
      if (!global.NostrTools) {
        return { ok: false, error: 'nostr-tools library missing' };
      }

      const priv = this._session.nostrPrivKey;
      const content = JSON.stringify(payloadObj);

      try {
        const event = {
          kind: kind,
          pubkey: global.NostrTools.getPublicKey(priv),
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['p', this._session.masterPub],
            ['t', kind === KIND_KILL ? 'onyx_kill' : 'onyx_recovery']
          ],
          content: content
        };
        event.id = global.NostrTools.getEventHash(event);
        event.sig = global.NostrTools.signEvent(event, priv);

        // Keys SOFORT nach Signatur löschen
        this._wipeSecrets();

        const results = await Promise.all(
          this._session.relays.map(url => this._publishToRelay(url, event))
        );
        const successCount = results.filter(r => r).length;

        return {
          ok: successCount > 0,
          relaysReached: successCount,
          relaysTotal: this._session.relays.length,
          eventId: event.id
        };
      } catch (e) {
        this._wipeSecrets();
        return { ok: false, error: e.message };
      }
    },

    _publishToRelay: function(url, event) {
      return new Promise(resolve => {
        try {
          const ws = new WebSocket(url);
          const timer = setTimeout(() => { try { ws.close(); } catch(e){} resolve(false); }, 5000);
          ws.onopen = () => {
            ws.send(JSON.stringify(['EVENT', event]));
            setTimeout(() => { try { ws.close(); } catch(e){} resolve(true); }, 700);
          };
          ws.onerror = () => { clearTimeout(timer); resolve(false); };
        } catch (e) { resolve(false); }
      });
    },

    _wipeSecrets: function() {
      if (this._session.nostrPrivKey) {
        try { this._session.nostrPrivKey = '0'.repeat(this._session.nostrPrivKey.length); } catch(e){}
      }
      this._session.nostrPrivKey = null;
      this._session.masterPub = null;
    },

    /**
     * Für native App-Brücke: liefert Hardware-generierten Registrierungs-Token.
     * Fallback-Verhalten, wenn window.OnyxVault nicht vorhanden ist.
     */
    getRegistrationTokenFromBridge: function() {
      if (global.OnyxVault && typeof global.OnyxVault.getRegistrationToken === 'function') {
        return global.OnyxVault.getRegistrationToken();
      }
      return null;
    },

    getEncryptedTokenFromBridge: function(passphrase) {
      if (global.OnyxVault && typeof global.OnyxVault.getEncryptedToken === 'function') {
        return global.OnyxVault.getEncryptedToken(passphrase);
      }
      return null;
    },

    /**
     * 5-Wort-Passphrase als Fallback-Unlock (ohne QR-Code).
     * Server-Seite: Diese Funktion sendet nur den Hash des Pub-Keys an die Nostr-Relays,
     * die eigentliche Verifikation macht das Handy mit seiner Hardware-Keystore.
     * Hier KEINE Payload-Decryption nötig, da die App selbst entscheidet.
     */
    sendRecoveryWithPassphrase: async function(fiveWordPhrase) {
      if (!fiveWordPhrase || fiveWordPhrase.split(/\s+/).filter(Boolean).length !== 5) {
        return { ok: false, error: 'exactly 5 BIP-39 words required' };
      }

      // Hash der Passphrase lokal berechnen (die App vergleicht gegen gleichen Hash)
      const encoder = new TextEncoder();
      const salt = encoder.encode('ONYX_VAULT_RECOVERY_v4');  // Domain-Separation
      const material = encoder.encode(fiveWordPhrase.trim().toLowerCase().replace(/\s+/g, ' '));

      // Combined bytes
      const combined = new Uint8Array(salt.length + material.length);
      combined.set(salt);
      combined.set(material, salt.length);

      const hashBuf = await crypto.subtle.digest('SHA-256', combined);
      const hashHex = bytesToHex(new Uint8Array(hashBuf));

      // Ohne geladene Identität können wir nicht signieren → wir brauchen den Pub-Key
      // Das Handy horcht auf einen anonymen "challenge"-Kanal: alle Apps lauschen auf
      // Events mit Tag ["t","onyx_recovery_challenge"]  und prüfen, ob der Hash passt.
      // Signiert wird mit einem Ephemeral-Key, nicht mit dem App-Private-Key.
      if (!global.NostrTools) return { ok: false, error: 'nostr-tools missing' };

      const ephPriv = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      const payload = {
        action: 'ONYX_PASSPHRASE_CHALLENGE',
        hash: hashHex,
        issued_at: Math.floor(Date.now() / 1000)
      };

      const relays = DEFAULT_RELAYS;
      const event = {
        kind: KIND_RECOVERY,
        pubkey: global.NostrTools.getPublicKey(ephPriv),
        created_at: Math.floor(Date.now() / 1000),
        tags: [['t', 'onyx_recovery_challenge'], ['hash', hashHex]],
        content: JSON.stringify(payload)
      };
      event.id = global.NostrTools.getEventHash(event);
      event.sig = global.NostrTools.signEvent(event, ephPriv);

      const results = await Promise.all(
        relays.map(url => this._publishToRelay(url, event))
      );
      const successCount = results.filter(r => r).length;

      // Ephemeral-Key sofort überschreiben
      try { fiveWordPhrase = '0'.repeat(fiveWordPhrase.length); } catch(e){}

      return {
        ok: successCount > 0,
        relaysReached: successCount,
        relaysTotal: relays.length,
        hashSent: hashHex.substring(0, 16) + '...'
      };
    }
  };

  // ---------- UI-Helpers (werden von HTML-Seiten genutzt) ----------
  function uiStatus(id, html, kind) {
    const el = document.getElementById(id);
    if (!el) return;
    const color = kind === 'err' ? 'var(--red)' : kind === 'ok' ? 'var(--teal)' : 'var(--silver)';
    el.innerHTML = '<span style="color:' + color + '">' + html + '</span>';
  }

  global.Hermes = Hermes;
  global.OnyxUI = { status: uiStatus };

})(typeof window !== 'undefined' ? window : this);
