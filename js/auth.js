/* ═══════════════════════════════════════════════════════════════
   Dominus Finance — CONTA E SEGURANÇA
   Como funciona, em uma frase: a sua senha não abre os dados —
   ela abre a CHAVE que abre os dados (envelope encryption).
   Por isso trocar a senha é instantâneo e não re-criptografa
   nada, e o código de recuperação consegue abrir o mesmo cofre
   sem que a sua senha esteja guardada em lugar algum.
═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var Dm = global.Dominus;
  var Sec = Dm.Sec, Store = Dm.Store, DB = Dm.DB, Vault = Dm.Vault, Schema = Dm.Schema;
  var esc = Dm.esc, uid = Dm.uid, clamp = Dm.clamp;

  var MAX_FAILS = 5;
  var LOCKOUT_MS = 60 * 1000;      /* dobra a cada bloqueio */
  var REMEMBER_DAYS = 7;

  var Auth = {
    current: null,     /* registro do usuário logado */
    locked: false,

    /* ═══════════ LEITURA ═══════════ */

    users: function () {
      var u = Store.get(Store.usersKey, []);
      return Array.isArray(u) ? u : [];
    },
    saveUsers: function (list) { return Store.set(Store.usersKey, list); },
    hasUsers: function () { return Auth.users().length > 0; },

    find: function (username) {
      var k = String(username || '').trim().toLowerCase();
      var list = Auth.users();
      for (var i = 0; i < list.length; i++) if (list[i].usernameLower === k) return list[i];
      return null;
    },

    update: function (user) {
      var list = Auth.users();
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === user.id) { list[i] = user; break; }
      }
      return Auth.saveUsers(list);
    },

    /* ═══════════ VALIDAÇÃO ═══════════ */

    validateUsername: function (u) {
      u = String(u || '').trim();
      if (u.length < 3) return 'O nome de usuário precisa de ao menos 3 caracteres.';
      if (u.length > 24) return 'O nome de usuário pode ter no máximo 24 caracteres.';
      if (!/^[A-Za-z0-9._\- ]+$/.test(u)) return 'Use apenas letras, números, ponto, hífen, espaço ou sublinhado.';
      if (Auth.find(u)) return 'Esse nome de usuário já existe neste aparelho.';
      return null;
    },

    validatePassword: function (p) {
      p = String(p || '');
      if (p.length < 8) return 'A senha precisa de ao menos 8 caracteres.';
      if (p.length > 200) return 'Senha longa demais.';
      var s = Sec.strength(p);
      if (s.score < 2) return 'Senha fraca: ' + s.tips.slice(0, 2).join(' e ') + '.';
      return null;
    },

    /* ═══════════ BLOQUEIO POR TENTATIVAS ═══════════ */

    lockoutLeft: function (user) {
      if (!user || !user.failed || !user.failed.until) return 0;
      return Math.max(0, user.failed.until - Date.now());
    },

    registerFail: function (user) {
      user.failed = user.failed || { count: 0, until: 0, strikes: 0 };
      user.failed.count++;
      if (user.failed.count >= MAX_FAILS) {
        user.failed.strikes = (user.failed.strikes || 0) + 1;
        /* espera crescente: 1min, 2min, 4min… até 30min */
        var wait = Math.min(LOCKOUT_MS * Math.pow(2, user.failed.strikes - 1), 30 * 60 * 1000);
        user.failed.until = Date.now() + wait;
        user.failed.count = 0;
      }
      Auth.update(user);
    },

    clearFail: function (user) {
      user.failed = { count: 0, until: 0, strikes: 0 };
      Auth.update(user);
    },

    /* ═══════════ CADASTRO ═══════════ */

    register: function (opts) {
      var username = String(opts.username || '').trim();
      var password = String(opts.password || '');
      var errU = Auth.validateUsername(username);
      if (errU) return Promise.reject(new Error(errU));
      var errP = Auth.validatePassword(password);
      if (errP) return Promise.reject(new Error(errP));

      var canEnc = Sec.canEncrypt();
      var iters = Sec.iterations();
      var saltPw = Sec.randomBytes(16);
      var dek = canEnc ? Sec.randomBytes(32) : null;
      var recoveryCode = canEnc ? Sec.makeRecoveryCode() : null;

      var user = {
        id: uid('usr'),
        username: username,
        usernameLower: username.toLowerCase(),
        displayName: String(opts.displayName || username).trim().slice(0, 40) || username,
        avatar: opts.avatar || '🦅',
        createdAt: new Date().toISOString(),
        lastLogin: null,
        enc: canEnc ? 'aes' : 'none',
        kdf: { algo: 'PBKDF2-SHA256', iters: iters, salt: Sec.b64(saltPw) },
        wrapped: null,
        verifier: null,
        recovery: null,
        failed: { count: 0, until: 0, strikes: 0 }
      };

      return Sec.deriveBits(password, saltPw, iters, 32).then(function (kekPw) {
        if (!canEnc) {
          /* Sem crypto.subtle não há AES disponível: o cofre fica
             em texto claro e a senha só controla o acesso. A tela
             de Segurança informa isso sem rodeios. */
          user.verifier = Sec.b64(kekPw);
          return null;
        }
        return Sec.encrypt(kekPw, dek).then(function (wrappedPw) {
          user.wrapped = { pw: wrappedPw };
          var saltRc = Sec.randomBytes(16);
          return Sec.deriveBits(Sec.normalizeRecoveryCode(recoveryCode), saltRc, iters, 32)
            .then(function (kekRc) { return Sec.encrypt(kekRc, dek); })
            .then(function (wrappedRc) {
              user.recovery = {
                kdf: { algo: 'PBKDF2-SHA256', iters: iters, salt: Sec.b64(saltRc) },
                wrapped: wrappedRc,
                createdAt: new Date().toISOString(),
                acknowledged: false
              };
            });
        });
      }).then(function () {
        var list = Auth.users();
        list.push(user);
        var res = Auth.saveUsers(list);
        if (!res.ok) throw new Error('Não foi possível salvar a conta: armazenamento do navegador cheio ou bloqueado.');
        return Auth.openSession(user, dek, { remember: opts.remember })
          .then(function (info) {
            return { user: user, recoveryCode: recoveryCode, mount: info };
          });
      });
    },

    /* ═══════════ LOGIN ═══════════ */

    login: function (username, password, remember) {
      var user = Auth.find(username);
      if (!user) return Promise.reject(new Error('Usuário não encontrado neste aparelho.'));
      var left = Auth.lockoutLeft(user);
      if (left > 0) {
        return Promise.reject(new Error('Muitas tentativas. Tente de novo em ' +
          Math.ceil(left / 1000) + ' segundo(s).'));
      }
      var salt = Sec.unb64(user.kdf.salt);
      return Sec.deriveBits(password, salt, user.kdf.iters, 32).then(function (kek) {
        if (user.enc !== 'aes') {
          if (!Sec.equalBytes(Sec.unb64(user.verifier || ''), kek)) {
            Auth.registerFail(user);
            throw new Error('Senha incorreta.');
          }
          return null;
        }
        return Sec.decrypt(kek, user.wrapped.pw).catch(function () {
          Auth.registerFail(user);
          throw new Error('Senha incorreta.');
        });
      }).then(function (dek) {
        Auth.clearFail(user);
        user.lastLogin = new Date().toISOString();
        Auth.update(user);
        Store.set(Store.lastUserKey, user.usernameLower);
        return Auth.openSession(user, dek, { remember: remember });
      });
    },

    /* ═══════════ SESSÃO ═══════════ */

    openSession: function (user, dek, opts) {
      opts = opts || {};
      Auth.current = user;
      Auth.locked = false;
      var payload = {
        userId: user.id, username: user.username,
        dek: dek ? Sec.b64(dek) : null, enc: user.enc,
        at: Date.now()
      };
      Store.session.set(Store.sessionKey, payload);
      if (opts.remember) {
        /* Guardar a chave em localStorage mantém você conectado
           após fechar o navegador, mas deixa a chave em repouso
           no aparelho. A tela avisa; o padrão é desligado. */
        Store.set('dominus_remember_v1', {
          userId: user.id, dek: payload.dek, enc: user.enc,
          exp: Date.now() + REMEMBER_DAYS * 86400000
        });
      } else {
        Store.del('dominus_remember_v1');
      }
      return DB.mount(user.id, dek, user.enc, user.displayName);
    },

    /* Retoma a sessão depois de um recarregamento da página */
    restoreSession: function () {
      var s = Store.session.get(Store.sessionKey, null);
      if (!s) {
        var r = Store.get('dominus_remember_v1', null);
        if (r && r.exp > Date.now()) s = r; else if (r) Store.del('dominus_remember_v1');
      }
      if (!s || !s.userId) return Promise.resolve(false);
      var list = Auth.users(), user = null;
      for (var i = 0; i < list.length; i++) if (list[i].id === s.userId) user = list[i];
      if (!user) { Store.session.del(Store.sessionKey); return Promise.resolve(false); }
      if (user.enc === 'aes' && !s.dek) return Promise.resolve(false);
      Auth.current = user;
      Auth.locked = false;
      var dek = s.dek ? Sec.unb64(s.dek) : null;
      Store.session.set(Store.sessionKey, {
        userId: user.id, username: user.username, dek: s.dek, enc: user.enc, at: Date.now()
      });
      return DB.mount(user.id, dek, user.enc, user.displayName).then(function (info) {
        return info || true;
      });
    },

    /* Tranca: a chave sai da memória e do armazenamento, mas o
       cofre continuo criptografado no disco. */
    lock: function () {
      Auth.locked = true;
      Store.session.del(Store.sessionKey);
      Store.del('dominus_remember_v1');
      DB.unmount();
    },

    logout: function () {
      Auth.lock();
      Auth.current = null;
    },

    unlock: function (password) {
      if (!Auth.current) return Promise.reject(new Error('Nenhuma sessão para destrancar.'));
      return Auth.login(Auth.current.username, password, false);
    },

    /* ═══════════ TROCA DE SENHA ═══════════
       Reembrulha a MESMA chave de dados: nenhum byte do cofre é
       reescrito, então trocar a senha é instantâneo mesmo com
       anos de histórico.                                        */
    changePassword: function (oldPw, newPw) {
      var user = Auth.current;
      if (!user) return Promise.reject(new Error('Sessão encerrada.'));
      var errP = Auth.validatePassword(newPw);
      if (errP) return Promise.reject(new Error(errP));

      var oldSalt = Sec.unb64(user.kdf.salt);
      return Sec.deriveBits(oldPw, oldSalt, user.kdf.iters, 32).then(function (kekOld) {
        if (user.enc !== 'aes') {
          if (!Sec.equalBytes(Sec.unb64(user.verifier || ''), kekOld)) throw new Error('Senha atual incorreta.');
          return null;
        }
        return Sec.decrypt(kekOld, user.wrapped.pw)
          .catch(function () { throw new Error('Senha atual incorreta.'); });
      }).then(function (dek) {
        var iters = Sec.iterations();
        var newSalt = Sec.randomBytes(16);
        return Sec.deriveBits(newPw, newSalt, iters, 32).then(function (kekNew) {
          user.kdf = { algo: 'PBKDF2-SHA256', iters: iters, salt: Sec.b64(newSalt) };
          if (user.enc !== 'aes') {
            user.verifier = Sec.b64(kekNew);
            Auth.update(user);
            return true;
          }
          return Sec.encrypt(kekNew, dek).then(function (w) {
            user.wrapped.pw = w;
            Auth.update(user);
            /* a sessão corrente continua válida: a chave não mudou */
            Store.session.set(Store.sessionKey, {
              userId: user.id, username: user.username,
              dek: Sec.b64(dek), enc: user.enc, at: Date.now()
            });
            return true;
          });
        });
      });
    },

    /* ═══════════ RECUPERAÇÃO ═══════════ */

    resetWithRecovery: function (username, code, newPw) {
      var user = Auth.find(username);
      if (!user) return Promise.reject(new Error('Usuário não encontrado.'));
      if (!user.recovery || user.enc !== 'aes') {
        return Promise.reject(new Error('Esta conta não tem código de recuperação.'));
      }
      var errP = Auth.validatePassword(newPw);
      if (errP) return Promise.reject(new Error(errP));

      var norm = Sec.normalizeRecoveryCode(code);
      if (norm.length < 20) return Promise.reject(new Error('Código de recuperação incompleto.'));

      var saltRc = Sec.unb64(user.recovery.kdf.salt);
      return Sec.deriveBits(norm, saltRc, user.recovery.kdf.iters, 32)
        .then(function (kekRc) {
          return Sec.decrypt(kekRc, user.recovery.wrapped)
            .catch(function () { throw new Error('Código de recuperação inválido.'); });
        })
        .then(function (dek) {
          var iters = Sec.iterations();
          var newSalt = Sec.randomBytes(16);
          return Sec.deriveBits(newPw, newSalt, iters, 32).then(function (kekNew) {
            return Sec.encrypt(kekNew, dek).then(function (w) {
              user.kdf = { algo: 'PBKDF2-SHA256', iters: iters, salt: Sec.b64(newSalt) };
              user.wrapped = { pw: w };
              user.failed = { count: 0, until: 0, strikes: 0 };
              Auth.update(user);
              return { user: user, dek: dek };
            });
          });
        });
    },

    /* Gera um código novo e invalida o antigo */
    regenerateRecovery: function (password) {
      var user = Auth.current;
      if (!user) return Promise.reject(new Error('Sessão encerrada.'));
      if (user.enc !== 'aes') return Promise.reject(new Error('Indisponível sem criptografia ativa.'));
      var salt = Sec.unb64(user.kdf.salt);
      return Sec.deriveBits(password, salt, user.kdf.iters, 32).then(function (kek) {
        return Sec.decrypt(kek, user.wrapped.pw)
          .catch(function () { throw new Error('Senha incorreta.'); });
      }).then(function (dek) {
        var code = Sec.makeRecoveryCode();
        var iters = Sec.iterations();
        var saltRc = Sec.randomBytes(16);
        return Sec.deriveBits(Sec.normalizeRecoveryCode(code), saltRc, iters, 32)
          .then(function (kekRc) { return Sec.encrypt(kekRc, dek); })
          .then(function (w) {
            user.recovery = {
              kdf: { algo: 'PBKDF2-SHA256', iters: iters, salt: Sec.b64(saltRc) },
              wrapped: w, createdAt: new Date().toISOString(), acknowledged: false
            };
            Auth.update(user);
            return code;
          });
      });
    },

    acknowledgeRecovery: function () {
      if (Auth.current && Auth.current.recovery) {
        Auth.current.recovery.acknowledged = true;
        Auth.update(Auth.current);
      }
    },

    /* ═══════════ EXCLUSÃO ═══════════ */

    deleteAccount: function (password) {
      var user = Auth.current;
      if (!user) return Promise.reject(new Error('Sessão encerrada.'));
      var salt = Sec.unb64(user.kdf.salt);
      return Sec.deriveBits(password, salt, user.kdf.iters, 32).then(function (kek) {
        if (user.enc !== 'aes') {
          if (!Sec.equalBytes(Sec.unb64(user.verifier || ''), kek)) throw new Error('Senha incorreta.');
          return true;
        }
        return Sec.decrypt(kek, user.wrapped.pw)
          .catch(function () { throw new Error('Senha incorreta.'); });
      }).then(function () {
        Vault.destroy(user.id);
        Auth.saveUsers(Auth.users().filter(function (u) { return u.id !== user.id; }));
        Auth.logout();
        return true;
      });
    },

    /* ═══════════ DADOS DA VERSÃO ANTIGA ═══════════ */

    legacyFound: function () {
      for (var i = 0; i < Store.legacyKeys.length; i++) {
        var raw = Store.get(Store.legacyKeys[i], null);
        if (raw && (raw.transactions || raw.investments)) {
          return {
            key: Store.legacyKeys[i], raw: raw,
            txCount: (raw.transactions || []).length,
            invCount: (raw.investments || []).length,
            goal: raw.goal || 0
          };
        }
      }
      return null;
    },

    importLegacy: function () {
      var found = Auth.legacyFound();
      if (!found || !DB.isOpen()) return Promise.resolve({ ok: false });
      var incoming = Schema.fromLegacy(found.raw);
      /* mescla: o cofre novo está vazio, mas usamos o merge para
         não sobrescrever preferências já escolhidas no cadastro */
      return Dm.Backup.apply(incoming, 'merge').then(function () {
        /* a chave antiga NÃO é apagada — fica como rede de
           segurança até o usuário mandar removê-la */
        DB.data.meta.legacyImportedFrom = found.key;
        DB.data.meta.legacyImportedAt = new Date().toISOString();
        return DB.saveNow({ noSnapshot: true }).then(function () {
          return { ok: true, txCount: found.txCount, invCount: found.invCount };
        });
      });
    },

    discardLegacy: function () {
      Store.legacyKeys.forEach(function (k) { Store.del(k); });
    },

    /* ═══════════ TRANCA AUTOMÁTICA ═══════════ */

    _idleTimer: null,
    _onLock: null,

    touchActivity: function () {
      if (!DB.isOpen() || Auth.locked) return;
      var mins = (DB.data && DB.data.settings && DB.data.settings.autoLockMin);
      clearTimeout(Auth._idleTimer);
      if (!mins || mins <= 0) return;   /* 0 = nunca trancar */
      Auth._idleTimer = setTimeout(function () {
        if (!DB.isOpen()) return;
        DB.saveNow().then(function () {
          Auth.lock();
          if (Auth._onLock) Auth._onLock('idle');
        });
      }, mins * 60 * 1000);
    },

    startIdleWatch: function (onLock) {
      Auth._onLock = onLock;
      ['click', 'keydown', 'touchstart', 'focus'].forEach(function (ev) {
        global.addEventListener(ev, Auth.touchActivity, { passive: true });
      });
      global.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden' && DB.isOpen()) DB.saveNow();
        else Auth.touchActivity();
      });
      Auth.touchActivity();
    }
  };

  Dm.Auth = Auth;
})(typeof window !== 'undefined' ? window : globalThis);
