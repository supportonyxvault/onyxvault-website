/**
 * ONYX VAULT - HERMES AGENT v4.3 (App-kompatible Verschluesselung)
 *
 * KRITISCH: Diese Datei muss BIT-GENAU das selbe Verschluesselungsformat wie
 *           EncryptionManager.encryptWithPassphrase in der App verwenden!
 *
 * APP-FORMAT (EncryptionManager.kt):
 *   Base64( iv[12] || ciphertext )
 *   Key = SHA-256( passphrase )  -- KEIN PBKDF2, KEIN Salt
 *   AES/GCM/NoPadding, Tag 128 bit
 *
 * FORMATE:
 *   ONYX3:<appId>:<encBase64>         - Reg-QR aus der App (Passphrase = appId)
 *   ONYX3P:<appId>:<encBase64>        - Reg-QR mit Cloud-Passwort (Passphrase = userPw)
 *   ONYX_MASTER:<appId>:<encBase64>   - Master-QR (NUR von register.html erzeugt)
 *   ONYX_MASTER_P:<appId>:<encBase64> - Master-QR mit Cloud-Passwort
 *
 * (c) 2026 ONYX VAULT Project - AGPL-3.0
 */

(function(global) {
  'use strict';

  const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://nostr.wine',
    'wss://offchain.pub'
  ];

  const NONCE_LEN = 12;
  const KIND_KILL = 30078;
  const KIND_RECOVERY = 30081;

  // --- Base64 (binaer-sicher) ---
  function b64decode(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function b64encode(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // --- KEY-ABLEITUNG: identisch zur App ---
  async function sha256Key(passphrase) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passphrase));
    return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  // --- APP-KOMPATIBLE Entschluesselung ---
  // Format: base64(iv[12] || ciphertext_mit_tag)
  async function decryptAppFormat(b64Payload, passphrase) {
    if (!passphrase) return null;
    try {
      const raw = b64decode(b64Payload);
      if (raw.length < NONCE_LEN + 16) return null;
      const iv = raw.slice(0, NONCE_LEN);
      const ct = raw.slice(NONCE_LEN);
      const key = await sha256Key(passphrase);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv, tagLength: 128 }, key, ct);
      return new TextDecoder().decode(pt);
    } catch (e) {
      console.warn('[Hermes] decrypt failed:', e.message);
      return null;
    }
  }

  // --- APP-KOMPATIBLE Verschluesselung ---
  async function encryptAppFormat(plaintext, passphrase) {
    const iv = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
    const key = await sha256Key(passphrase);
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv, tagLength: 128 }, key, new TextEncoder().encode(plaintext)
    );
    const ctBytes = new Uint8Array(ct);
    const out = new Uint8Array(iv.length + ctBytes.length);
    out.set(iv, 0);
    out.set(ctBytes, iv.length);
    return b64encode(out);
  }

  const Hermes = {
    version: '4.3',

    _session: {
      appId: null,
      masterPub: null,
      nostrPrivKey: null,
      relays: null
    },

    /**
     * REG-QR (ONYX3) -> MASTER-QR (ONYX_MASTER)
     */
    transformRegToMaster: async function(regQrString, userPassphrase) {
      try {
        if (typeof regQrString !== 'string') return { ok: false, error: 'kein gueltiger QR' };
        const t = regQrString.trim();
        if (t.startsWith('ONYX_MASTER')) {
          return { ok: false, error: 'Das ist bereits ein Master-QR, kein Registrierungs-QR.' };
        }
        if (!t.startsWith('ONYX3:') && !t.startsWith('ONYX3P:')) {
          return { ok: false, error: 'Das ist kein Registrierungs-QR aus der App (ONYX3-Format erwartet). Gefunden: ' + t.substring(0, 20) };
        }

        const parts = t.split(':');
        if (parts.length < 3) return { ok: false, error: 'QR-Format defekt' };

        const protocol = parts[0];
        const appId = parts[1];
        const payload = parts.slice(2).join(':');

        // Passphrase bestimmen - IDENTISCH zur App-Logik:
        //   ONYX3  -> appId als Passphrase (ohne Cloud-Passwort)
        //   ONYX3P -> userPassphrase als Passphrase (mit Cloud-Passwort)
        let decryptPass;
        if (protocol === 'ONYX3P') {
          if (!userPassphrase) return { ok: false, error: 'Dieser QR ist passwortgeschuetzt. Bitte Cloud-Passwort eingeben.' };
          decryptPass = userPassphrase;
        } else {
          decryptPass = appId;
        }

        const plaintext = await decryptAppFormat(payload, decryptPass);
        if (!plaintext) {
          return { ok: false, error: 'Entschluesselung fehlgeschlagen. ' + (protocol === 'ONYX3P' ? 'Falsches Cloud-Passwort?' : 'QR beschaedigt?') };
        }

        let identity;
        try { identity = JSON.parse(plaintext); } catch (e) {
          return { ok: false, error: 'QR-Inhalt ist kein gueltiges JSON (QR beschaedigt).' };
        }

        // ENVELOPE-AUSPACKEN: Die App packt die Payload in einen signierten Umschlag
        //   {p: "<payload-als-string>", s: "<signature>"}
        // -> Payload-string parsen, Signature kann die Website nicht pruefen (ECDSA-Pub-Key fehlt)
        if (identity && identity.p && identity.s) {
          try { identity = JSON.parse(identity.p); }
          catch (e) { return { ok: false, error: 'Envelope-Payload nicht lesbar.' }; }
        }

        if (!identity.app_id || !identity.ks_priv || !identity.pub) {
          return { ok: false, error: 'QR enthaelt keine gueltige Identitaet (fehlende Felder: ' + Object.keys(identity).join(',') + ').' };
        }

        // Master-Umhuellung mit zusaetzlichen Markern
        const entropy = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
        const masterPayload = Object.assign({}, identity, {
          type: 'MASTER',
          origin: 'website_v4',
          minted_at: Math.floor(Date.now() / 1000),
          entropy: entropy
        });

        // Master-QR mit gleichem App-Format verschluesseln (SHA-256 Key, iv+ct)
        const masterPass = userPassphrase || appId;
        const masterEnc = await encryptAppFormat(JSON.stringify(masterPayload), masterPass);
        const prefix = userPassphrase ? 'ONYX_MASTER_P' : 'ONYX_MASTER';

        return {
          ok: true,
          masterQrString: prefix + ':' + appId + ':' + masterEnc,
          appId: appId
        };
      } catch (e) {
        console.error('[Hermes] transform error', e);
        return { ok: false, error: e.message || 'Unbekannter Fehler' };
      }
    },

    /**
     * Lade Master-Identitaet. Lehnt Reg-QR mit klarer Fehlermeldung ab.
     */
    saveIdentity: async function(qrString, userPassphrase) {
      try {
        if (typeof qrString !== 'string') return { ok: false, error: 'kein gueltiger QR' };
        const t = qrString.trim();

        if (t.startsWith('ONYX3:') || t.startsWith('ONYX3P:')) {
          return {
            ok: false,
            error: 'Das ist dein Registrierungs-QR, nicht dein Master-QR. Erzeuge zuerst den Master-QR auf der Registrierungs-Seite.'
          };
        }
        if (!t.startsWith('ONYX_MASTER:') && !t.startsWith('ONYX_MASTER_P:')) {
          return { ok: false, error: 'Unbekanntes QR-Format: ' + t.substring(0, 20) };
        }

        const parts = t.split(':');
        if (parts.length < 3) return { ok: false, error: 'QR defekt' };

        const protocol = parts[0];
        const appId = parts[1];
        const payload = parts.slice(2).join(':');

        let decryptPass;
        if (protocol === 'ONYX_MASTER_P') {
          if (!userPassphrase) {
            const pw = prompt('Cloud-Passwort eingeben:');
            if (!pw) return { ok: false, error: 'Passwort erforderlich' };
            decryptPass = pw;
          } else {
            decryptPass = userPassphrase;
          }
        } else {
          decryptPass = appId;
        }

        const plaintext = await decryptAppFormat(payload, decryptPass);
        if (!plaintext) {
          return { ok: false, error: 'Entschluesselung fehlgeschlagen. Falsches Passwort oder beschaedigter Master-QR?' };
        }

        let identity;
        try { identity = JSON.parse(plaintext); } catch (e) {
          return { ok: false, error: 'Master-QR Inhalt defekt (kein JSON).' };
        }

        // ENVELOPE-AUSPACKEN (falls Master noch Envelope-Format hat)
        if (identity && identity.p && identity.s) {
          try { identity = JSON.parse(identity.p); }
          catch (e) { return { ok: false, error: 'Envelope-Payload nicht lesbar.' }; }
        }

        if (identity.type !== 'MASTER') {
          return { ok: false, error: 'QR ist kein gueltiger Master.' };
        }
        if (!identity.app_id || !identity.ks_priv || !identity.pub) {
          return { ok: false, error: 'Master-QR beschaedigt (fehlende Felder).' };
        }

        this._session.appId = identity.app_id;
        this._session.masterPub = identity.pub;
        this._session.nostrPrivKey = identity.ks_priv;
        this._session.relays = Array.isArray(identity.relays) && identity.relays.length
          ? identity.relays : DEFAULT_RELAYS;

        try { sessionStorage.setItem('onyx_app_id_display', identity.app_id); } catch(e) {}

        return { ok: true, appId: identity.app_id };
      } catch (e) {
        console.error('[Hermes] saveIdentity error', e);
        return { ok: false, error: e.message };
      }
    },

    isReady: function() {
      return !!(this._session.nostrPrivKey && this._session.masterPub);
    },

    getAppId: function() { return this._session.appId; },

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
      if (!this.isReady()) return { ok: false, error: 'identity not loaded' };
      if (!global.NostrTools) return { ok: false, error: 'nostr-tools library missing' };

      const priv = this._session.nostrPrivKey;
      try {
        const event = {
          kind: kind,
          pubkey: global.NostrTools.getPublicKey(priv),
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ['p', this._session.masterPub],
            ['t', kind === KIND_KILL ? 'onyx_kill' : 'onyx_recovery']
          ],
          content: JSON.stringify(payloadObj)
        };
        event.id = global.NostrTools.getEventHash(event);
        event.sig = global.NostrTools.signEvent(event, priv);
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

    sendRecoveryWithPassphrase: async function(fiveWordPhrase) {
      if (!fiveWordPhrase || fiveWordPhrase.split(/\s+/).filter(Boolean).length !== 5) {
        return { ok: false, error: 'genau 5 BIP-39 Woerter erforderlich' };
      }
      const encoder = new TextEncoder();
      const salt = encoder.encode('ONYX_VAULT_RECOVERY_v4');
      const material = encoder.encode(fiveWordPhrase.trim().toLowerCase().replace(/\s+/g, ' '));
      const combined = new Uint8Array(salt.length + material.length);
      combined.set(salt);
      combined.set(material, salt.length);

      const hashBuf = await crypto.subtle.digest('SHA-256', combined);
      const hashHex = bytesToHex(new Uint8Array(hashBuf));
      if (!global.NostrTools) return { ok: false, error: 'nostr-tools missing' };

      const ephPriv = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      const event = {
        kind: KIND_RECOVERY,
        pubkey: global.NostrTools.getPublicKey(ephPriv),
        created_at: Math.floor(Date.now() / 1000),
        tags: [['t', 'onyx_recovery_challenge'], ['hash', hashHex]],
        content: JSON.stringify({
          action: 'ONYX_PASSPHRASE_CHALLENGE',
          hash: hashHex,
          issued_at: Math.floor(Date.now() / 1000)
        })
      };
      event.id = global.NostrTools.getEventHash(event);
      event.sig = global.NostrTools.signEvent(event, ephPriv);

      const results = await Promise.all(
        DEFAULT_RELAYS.map(url => this._publishToRelay(url, event))
      );
      const successCount = results.filter(r => r).length;
      try { fiveWordPhrase = '0'.repeat(fiveWordPhrase.length); } catch(e){}
      return {
        ok: successCount > 0,
        relaysReached: successCount,
        relaysTotal: DEFAULT_RELAYS.length,
        hashSent: hashHex.substring(0, 16) + '...'
      };
    }
  };

  function uiStatus(id, html, kind) {
    const el = document.getElementById(id);
    if (!el) return;
    const color = kind === 'err' ? 'var(--red)' : kind === 'ok' ? 'var(--teal)' : 'var(--silver)';
    el.innerHTML = '<span style="color:' + color + '">' + html + '</span>';
  }

  global.Hermes = Hermes;
  global.OnyxUI = { status: uiStatus };

})(typeof window !== 'undefined' ? window : this);
