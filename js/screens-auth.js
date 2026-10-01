/* ═══════════════════════════════════════════════════════════════
   Dominus Finance — TELAS DE CONTA E ASSISTENTE DE PLANO
   Entrar, cadastrar, destrancar, recuperar — e, na primeira vez,
   o assistente que transforma quatro respostas num plano
   financeiro com orçamento, metas e projeção.
═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var Dm = global.Dominus;
  var UI = Dm.UI, Auth = Dm.Auth, DB = Dm.DB, Sec = Dm.Sec, Money = Dm.Money, D = Dm.D;
  var esc = Dm.esc, F = Dm.F, clamp = Dm.clamp;

  var A = { view: 'login', busy: false };

  function screen() { return document.getElementById('auth-screen'); }
  function box() { return document.getElementById('auth-box'); }
  function content() { return document.getElementById('auth-content'); }

  A.showScreen = function () {
    var s = screen();
    if (s) s.hidden = false;
    var app = document.getElementById('app-shell');
    if (app) app.hidden = true;
    document.body.style.overflow = '';
  };

  A.hideScreen = function () {
    var s = screen();
    if (s) s.hidden = true;
  };

  /* Restaura a moldura padrão (logo + conteúdo) depois que o
     assistente a substituiu por completo */
  function resetBox() {
    var b = box();
    if (!b) return;
    if (!document.getElementById('auth-content')) {
      b.innerHTML = '<div class="auth-logo"><span class="mark">DOMINUS</span>' +
        '<span class="sub">Finance</span></div><div id="auth-content"></div>';
    }
  }

  function busy(btn, on, label) {
    A.busy = on;
    if (!btn) return;
    btn.disabled = on;
    if (on) {
      btn.dataset.label = btn.textContent;
      btn.innerHTML = '<span class="spin">⏳</span> ' + (label || 'Aguarde…');
    } else if (btn.dataset.label) {
      btn.textContent = btn.dataset.label;
    }
  }

  function pwField(id, placeholder, autocomplete) {
    return '<div class="pw-wrap">' +
      '<input type="password" id="' + id + '" placeholder="' + esc(placeholder) + '" ' +
      'autocomplete="' + (autocomplete || 'current-password') + '" autocapitalize="off" spellcheck="false" />' +
      '<button class="pw-toggle" type="button" data-pwtoggle="' + id + '" aria-label="Mostrar senha">👁️</button>' +
      '</div>';
  }

  function bindPwToggles(root) {
    root.querySelectorAll('[data-pwtoggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        var inp = root.querySelector('#' + b.getAttribute('data-pwtoggle'));
        if (!inp) return;
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        b.textContent = show ? '🙈' : '👁️';
        b.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
      });
    });
  }

  function errBox(msg) {
    var el = document.getElementById('auth-err');
    if (el) {
      el.textContent = msg || '';
      el.hidden = !msg;
    }
  }

  /* ═══════════════════════════════════════════
     ENTRAR
  ═══════════════════════════════════════════ */
  A.login = function (prefill) {
    A.view = 'login';
    A.showScreen();
    resetBox();
    var users = Auth.users();
    var last = Dm.Store.get(Dm.Store.lastUserKey, null);
    var suggested = prefill || (last && users.some(function (u) { return u.usernameLower === last; }) ? last : '');

    content().innerHTML =
      '<h2 class="auth-title">Bem-vindo de volta</h2>' +
      '<p class="auth-desc">Seus dados estão guardados neste aparelho' +
      (Sec.canEncrypt() ? ', criptografados com a sua senha' : '') + '.</p>' +
      (users.length > 1 && !prefill ? '<div class="stack-sm" style="margin-bottom:16px">' +
        users.slice(0, 4).map(function (u) {
          return '<button class="user-pick" type="button" data-pickuser="' + esc(u.username) + '">' +
            '<span class="av">' + (u.avatar || '🦅') + '</span>' +
            '<span class="grow"><b>' + esc(u.displayName) + '</b>' +
            '<span>' + (u.lastLogin ? 'último acesso ' + D.fmtRel(D.norm(u.lastLogin)).toLowerCase() : 'nunca acessou') + '</span></span>' +
            '<span class="muted">›</span></button>';
        }).join('') + '</div><hr class="divider" />' : '') +
      '<div class="field"><label for="in-user">Nome de usuário</label>' +
      '<input type="text" id="in-user" value="' + esc(suggested) + '" placeholder="seu usuário" ' +
      'autocomplete="username" autocapitalize="off" spellcheck="false" /></div>' +
      '<div class="field"><label for="in-pass">Senha</label>' + pwField('in-pass', '••••••••') + '</div>' +
      '<div class="switch-row" style="padding:4px 0 12px">' +
      '<div class="sr-text"><b>Manter conectado</b>' +
      '<span>Dispensa a senha ao reabrir o app por 7 dias. Deixe desligado se outras pessoas usam este aparelho.</span></div>' +
      '<label class="switch"><input type="checkbox" id="in-remember" /><i></i></label></div>' +
      '<p class="field err" id="auth-err" hidden></p>' +
      '<button class="btn btn-primary btn-block" type="button" id="btn-do-login">Entrar</button>' +
      '<p class="auth-foot">Esqueceu a senha? <button type="button" id="lk-recover">Usar código de recuperação</button></p>' +
      '<p class="auth-foot">Não tem conta? <button type="button" id="lk-register">Criar uma agora</button></p>';

    var root = content();
    bindPwToggles(root);
    root.querySelectorAll('[data-pickuser]').forEach(function (b) {
      b.addEventListener('click', function () {
        root.querySelector('#in-user').value = b.getAttribute('data-pickuser');
        root.querySelector('#in-pass').focus();
      });
    });
    root.querySelector('#lk-register').addEventListener('click', function () { A.register(); });
    root.querySelector('#lk-recover').addEventListener('click', function () { A.recover(); });

    var submit = function () {
      if (A.busy) return;
      var btn = root.querySelector('#btn-do-login');
      var u = root.querySelector('#in-user').value.trim();
      var p = root.querySelector('#in-pass').value;
      if (!u || !p) { errBox('Preencha usuário e senha.'); return; }
      errBox('');
      busy(btn, true, 'Abrindo cofre…');
      Auth.login(u, p, root.querySelector('#in-remember').checked)
        .then(function () { A.afterSession(); })
        .catch(function (e) {
          busy(btn, false);
          errBox(e.message || 'Não foi possível entrar.');
          var pi = root.querySelector('#in-pass');
          if (pi) { pi.value = ''; pi.focus(); }
        });
    };
    root.querySelector('#btn-do-login').addEventListener('click', submit);
    root.querySelector('#in-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    root.querySelector('#in-user').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') root.querySelector('#in-pass').focus();
    });
    if (suggested) setTimeout(function () { root.querySelector('#in-pass').focus(); }, 180);
  };

  /* ═══════════════════════════════════════════
     CADASTRAR
  ═══════════════════════════════════════════ */
  A.register = function () {
    A.view = 'register';
    A.showScreen();
    resetBox();
    var legacy = Auth.legacyFound();

    content().innerHTML =
      '<h2 class="auth-title">Criar sua conta</h2>' +
      '<p class="auth-desc">A conta vive só neste aparelho. Nada é enviado para servidor nenhum — ' +
      'e por isso ninguém, nem nós, consegue ler ou recuperar seus dados sem a sua senha.</p>' +
      (legacy ? '<div class="callout callout-info" style="margin-bottom:16px"><span class="ic">📦</span>' +
        '<span>Encontrei dados da versão anterior do app: <b>' + legacy.txCount + ' lançamento(s)</b>' +
        (legacy.invCount ? ' e <b>' + legacy.invCount + ' investimento(s)</b>' : '') +
        '. Depois de criar a conta você decide se quer importá-los.</span></div>' : '') +
      '<div class="field"><label for="rg-name">Como quer ser chamado</label>' +
      '<input type="text" id="rg-name" placeholder="ex: Lucas" maxlength="40" autocomplete="name" /></div>' +
      '<div class="field"><label for="rg-user">Nome de usuário</label>' +
      '<input type="text" id="rg-user" placeholder="ex: lucas.m" maxlength="24" ' +
      'autocomplete="username" autocapitalize="off" spellcheck="false" />' +
      '<p class="hint">3 a 24 caracteres. É o que você digita para entrar.</p></div>' +
      '<div class="field"><label for="rg-pass">Senha</label>' + pwField('rg-pass', 'mínimo 8 caracteres', 'new-password') +
      '<div class="pw-meter" id="rg-meter"><i></i><i></i><i></i><i></i><i></i></div>' +
      '<p class="hint" id="rg-hint">Misture maiúsculas, números e um símbolo.</p></div>' +
      '<div class="field"><label for="rg-pass2">Repita a senha</label>' + pwField('rg-pass2', 'confirme', 'new-password') + '</div>' +
      '<label class="label">Escolha um ícone</label>' + UI.emojiPicker('🦅', 'avatar') +
      '<p class="field err" id="auth-err" hidden></p>' +
      (Sec.canEncrypt()
        ? '<div class="auth-note"><span class="ic">🔐</span><span>Seus dados serão criptografados com <b>AES-256-GCM</b>. ' +
        'A chave é derivada da sua senha com <b>PBKDF2-SHA256</b> (' + Sec.iterations().toLocaleString('pt-BR') + ' iterações). ' +
        'No próximo passo você recebe um <b>código de recuperação</b> — é a única forma de voltar ao cofre se esquecer a senha.</span></div>'
        : '<div class="callout callout-warn" style="margin-top:14px"><span class="ic">⚠️</span>' +
        '<span>Este navegador não oferece <code>crypto.subtle</code>, então a criptografia dos dados fica indisponível. ' +
        'A senha ainda protege o acesso, mas o conteúdo ficará em texto legível no armazenamento do navegador. ' +
        'Abra o app por <b>https://</b> ou <b>localhost</b> para ativar a criptografia.</span></div>') +
      '<button class="btn btn-primary btn-block" type="button" id="btn-do-register" style="margin-top:16px">Criar conta</button>' +
      '<p class="auth-foot">Já tem conta? <button type="button" id="lk-login">Entrar</button></p>';

    var root = content();
    bindPwToggles(root);
    UI.bindPickers(root);
    root.querySelector('#lk-login').addEventListener('click', function () { A.login(); });

    var pass = root.querySelector('#rg-pass');
    pass.addEventListener('input', function () {
      var s = Sec.strength(pass.value);
      root.querySelector('#rg-meter').className = 'pw-meter s' + s.score;
      root.querySelector('#rg-hint').textContent = pass.value
        ? (s.score >= 4 ? 'Senha forte 👍' : (s.tips[0] ? 'Para reforçar: ' + s.tips[0] + '.' : 'Boa.'))
        : 'Misture maiúsculas, números e um símbolo.';
    });

    /* sugere o usuário a partir do nome, sem atropelar edição manual */
    var userInp = root.querySelector('#rg-user');
    root.querySelector('#rg-name').addEventListener('input', function (e) {
      if (userInp.dataset.touched) return;
      userInp.value = e.target.value.toLowerCase().replace(/[^a-z0-9._\- ]/g, '').slice(0, 24);
    });
    userInp.addEventListener('input', function () { userInp.dataset.touched = '1'; });

    root.querySelector('#btn-do-register').addEventListener('click', function () {
      if (A.busy) return;
      var btn = root.querySelector('#btn-do-register');
      var name = UI.val(root, 'rg-name');
      var user = UI.val(root, 'rg-user');
      var p1 = root.querySelector('#rg-pass').value;
      var p2 = root.querySelector('#rg-pass2').value;
      if (p1 !== p2) { errBox('As senhas não são iguais.'); return; }
      errBox('');
      busy(btn, true, 'Gerando chaves…');
      /* um quadro de respiro para o spinner aparecer antes do
         PBKDF2 ocupar a thread */
      setTimeout(function () {
        Auth.register({ username: user, password: p1, displayName: name || user, avatar: UI.pick.avatar || '🦅' })
          .then(function (res) {
            if (res.recoveryCode) A.showRecovery(res.recoveryCode, true);
            else A.afterSession();
          })
          .catch(function (e) { busy(btn, false); errBox(e.message || 'Não foi possível criar a conta.'); });
      }, 60);
    });
  };

  /* ═══════════════════════════════════════════
     CÓDIGO DE RECUPERAÇÃO
  ═══════════════════════════════════════════ */
  A.showRecovery = function (code, isNew) {
    A.view = 'recovery';
    A.showScreen();
    resetBox();
    content().innerHTML =
      '<h2 class="auth-title">Guarde seu código de recuperação</h2>' +
      '<p class="auth-desc">Este código abre o seu cofre se você esquecer a senha. ' +
      'Ele aparece <b>uma única vez</b> e não fica guardado em lugar nenhum de forma legível — ' +
      'se perder os dois, os dados não têm como ser recuperados.</p>' +
      '<div class="recovery-box"><div class="recovery-code" id="rec-code">' + esc(code) + '</div></div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-ghost" type="button" id="rec-copy">📋 Copiar</button>' +
      '<button class="btn btn-ghost" type="button" id="rec-save">💾 Baixar</button>' +
      '</div>' +
      '<div class="switch-row" style="margin-top:16px">' +
      '<div class="sr-text"><b>Guardei em lugar seguro</b>' +
      '<span>Anote no papel, no gerenciador de senhas ou baixe o arquivo.</span></div>' +
      '<label class="switch"><input type="checkbox" id="rec-ack" /><i></i></label></div>' +
      '<button class="btn btn-primary btn-block" type="button" id="rec-next" disabled style="margin-top:14px">Continuar</button>';

    var root = content();
    root.querySelector('#rec-copy').addEventListener('click', function () { UI.copy(code); });
    root.querySelector('#rec-save').addEventListener('click', function () {
      UI.download('dominus-codigo-recuperacao.txt',
        'Dominus Finance — código de recuperação\n' +
        'Usuário: ' + (Auth.current ? Auth.current.username : '') + '\n' +
        'Gerado em: ' + new Date().toLocaleString('pt-BR') + '\n\n' + code +
        '\n\nGuarde este arquivo em local seguro. Ele permite redefinir a sua senha\n' +
        'e abrir o cofre de dados. Sem ele e sem a senha, os dados não podem ser recuperados.\n',
        'text/plain');
      UI.ok('Arquivo baixado');
    });
    var ack = root.querySelector('#rec-ack');
    ack.addEventListener('change', function () { root.querySelector('#rec-next').disabled = !ack.checked; });
    root.querySelector('#rec-next').addEventListener('click', function () {
      Auth.acknowledgeRecovery();
      if (isNew) A.afterSession(); else { A.hideScreen(); UI.go('settings'); }
    });
  };

  /* ═══════════════════════════════════════════
     RECUPERAR ACESSO
  ═══════════════════════════════════════════ */
  A.recover = function () {
    A.view = 'recover';
    A.showScreen();
    resetBox();
    content().innerHTML =
      '<h2 class="auth-title">Recuperar acesso</h2>' +
      '<p class="auth-desc">Informe o código de recuperação que você guardou ao criar a conta e escolha uma senha nova. ' +
      'Seus dados continuam intactos — só a senha muda.</p>' +
      '<div class="field"><label for="rc-user">Nome de usuário</label>' +
      '<input type="text" id="rc-user" autocomplete="username" autocapitalize="off" spellcheck="false" /></div>' +
      '<div class="field"><label for="rc-code">Código de recuperação</label>' +
      '<input type="text" id="rc-code" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" ' +
      'autocapitalize="characters" spellcheck="false" style="font-family:ui-monospace,monospace;letter-spacing:.06em" />' +
      '<p class="hint">Os hífens são opcionais.</p></div>' +
      '<div class="field"><label for="rc-pass">Nova senha</label>' + pwField('rc-pass', 'mínimo 8 caracteres', 'new-password') +
      '<div class="pw-meter" id="rc-meter"><i></i><i></i><i></i><i></i><i></i></div></div>' +
      '<div class="field"><label for="rc-pass2">Repita a nova senha</label>' + pwField('rc-pass2', 'confirme', 'new-password') + '</div>' +
      '<p class="field err" id="auth-err" hidden></p>' +
      '<button class="btn btn-primary btn-block" type="button" id="btn-do-recover">Redefinir senha</button>' +
      '<p class="auth-foot"><button type="button" id="lk-back">Voltar ao login</button></p>';

    var root = content();
    bindPwToggles(root);
    root.querySelector('#lk-back').addEventListener('click', function () { A.login(); });
    var pass = root.querySelector('#rc-pass');
    pass.addEventListener('input', function () {
      root.querySelector('#rc-meter').className = 'pw-meter s' + Sec.strength(pass.value).score;
    });

    root.querySelector('#btn-do-recover').addEventListener('click', function () {
      if (A.busy) return;
      var btn = root.querySelector('#btn-do-recover');
      var p1 = root.querySelector('#rc-pass').value;
      if (p1 !== root.querySelector('#rc-pass2').value) { errBox('As senhas não são iguais.'); return; }
      errBox('');
      busy(btn, true, 'Verificando código…');
      setTimeout(function () {
        Auth.resetWithRecovery(UI.val(root, 'rc-user'), UI.val(root, 'rc-code'), p1)
          .then(function (r) {
            UI.ok('Senha redefinida');
            return Auth.openSession(r.user, r.dek, {});
          })
          .then(function () { A.afterSession(); })
          .catch(function (e) { busy(btn, false); errBox(e.message || 'Não foi possível recuperar.'); });
      }, 60);
    });
  };

  /* ═══════════════════════════════════════════
     TRANCA
  ═══════════════════════════════════════════ */
  A.lockScreen = function (reason) {
    A.view = 'lock';
    A.showScreen();
    resetBox();
    var name = Auth.current ? Auth.current.displayName : '';
    content().innerHTML =
      '<h2 class="auth-title">🔒 App trancado</h2>' +
      '<p class="auth-desc">' +
      (reason === 'idle' ? 'Trancamos por inatividade para proteger seus dados. ' : '') +
      (name ? 'Digite a senha de <b>' + esc(name) + '</b> para continuar.' : 'Digite sua senha para continuar.') +
      '</p>' +
      '<div class="field">' + pwField('lk-pass', 'sua senha') + '</div>' +
      '<p class="field err" id="auth-err" hidden></p>' +
      '<button class="btn btn-primary btn-block" type="button" id="btn-do-unlock">Destrancar</button>' +
      '<p class="auth-foot"><button type="button" id="lk-other">Entrar com outra conta</button></p>';

    var root = content();
    bindPwToggles(root);
    root.querySelector('#lk-other').addEventListener('click', function () { Auth.logout(); A.login(); });
    var submit = function () {
      if (A.busy) return;
      var btn = root.querySelector('#btn-do-unlock');
      errBox('');
      busy(btn, true, 'Abrindo…');
      setTimeout(function () {
        Auth.unlock(root.querySelector('#lk-pass').value)
          .then(function () { A.afterSession(); })
          .catch(function (e) {
            busy(btn, false);
            errBox(e.message || 'Senha incorreta.');
            root.querySelector('#lk-pass').value = '';
          });
      }, 60);
    };
    root.querySelector('#btn-do-unlock').addEventListener('click', submit);
    root.querySelector('#lk-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    setTimeout(function () { root.querySelector('#lk-pass').focus(); }, 180);
  };

  /* ═══════════════════════════════════════════
     DEPOIS DA SESSÃO ABERTA
  ═══════════════════════════════════════════ */
  A.afterSession = function () {
    var legacy = Auth.legacyFound();
    var imported = DB.data.meta && DB.data.meta.legacyImportedFrom;
    if (legacy && !imported && DB.data.transactions.length === 0) return A.legacyPrompt(legacy);
    if (!DB.data.profile.onboarded) return Wizard.start();
    Dm.App.enter();
  };

  A.legacyPrompt = function (legacy) {
    A.view = 'legacy';
    A.showScreen();
    resetBox();
    content().innerHTML =
      '<h2 class="auth-title">📦 Trazer seus dados antigos?</h2>' +
      '<p class="auth-desc">Encontrei no armazenamento deste navegador os dados da versão anterior do Dominus. ' +
      'Posso importar tudo para a sua conta nova, já convertido para o formato atual.</p>' +
      '<div class="card" style="margin-bottom:16px"><div class="kv-list">' +
      '<div class="kv"><span class="k">Lançamentos</span><span class="v">' + legacy.txCount + '</span></div>' +
      '<div class="kv"><span class="k">Investimentos</span><span class="v">' + legacy.invCount + '</span></div>' +
      (legacy.goal ? '<div class="kv"><span class="k">Meta antiga</span><span class="v">' +
        Money.fmt(Money.fromFloat(legacy.goal)) + '</span></div>' : '') +
      '</div></div>' +
      '<div class="callout callout-good" style="margin-bottom:16px"><span class="ic">🛟</span>' +
      '<span>Importar <b>não apaga</b> os dados antigos: eles ficam onde estão como rede de segurança, ' +
      'e um ponto de restauração é criado antes da importação.</span></div>' +
      '<button class="btn btn-primary btn-block" type="button" id="lg-import">Importar meus dados</button>' +
      '<button class="btn btn-ghost btn-block" type="button" id="lg-skip" style="margin-top:9px">Começar do zero</button>';

    var root = content();
    root.querySelector('#lg-import').addEventListener('click', function () {
      var btn = root.querySelector('#lg-import');
      busy(btn, true, 'Importando…');
      Auth.importLegacy().then(function (r) {
        busy(btn, false);
        UI.ok(r.ok ? 'Importados ' + r.txCount + ' lançamento(s)' : 'Nada para importar');
        if (!DB.data.profile.onboarded) Wizard.start(); else Dm.App.enter();
      }).catch(function (e) {
        busy(btn, false);
        UI.err('Falha ao importar: ' + (e.message || e));
      });
    });
    root.querySelector('#lg-skip').addEventListener('click', function () {
      DB.data.meta.legacyImportedFrom = 'skipped';
      DB.saveNow().then(function () {
        if (!DB.data.profile.onboarded) Wizard.start(); else Dm.App.enter();
      });
    });
  };

  /* ═══════════════════════════════════════════════════════════
     ASSISTENTE DE PLANO
     Quatro perguntas de verdade e duas de ajuste fino. No fim,
     o app não devolve "parabéns": devolve orçamento por
     categoria, metas com valor mensal calculado e a projeção
     do patrimônio no prazo escolhido.
  ═══════════════════════════════════════════════════════════ */

  var OBJETIVOS = [
    { id: 'reserva', emoji: '🛡️', name: 'Reserva de emergência', desc: 'O colchão que evita dívida quando algo dá errado', months: 18, color: '#199e70', calc: function (inc) { return Math.max(inc * 3, 300000); } },
    { id: 'divida', emoji: '🧾', name: 'Quitar dívidas', desc: 'Cartão, empréstimo, cheque especial', months: 12, color: '#FF1F3D', calc: function (inc) { return inc * 2; } },
    { id: 'viagem', emoji: '✈️', name: 'Viagem', desc: 'Aquele destino que você já escolheu', months: 12, color: '#3987e5', calc: function (inc) { return Math.max(inc, 500000); } },
    { id: 'casa', emoji: '🏠', name: 'Casa própria', desc: 'Entrada do imóvel', months: 60, color: '#9085e9', calc: function (inc) { return inc * 12; } },
    { id: 'carro', emoji: '🚗', name: 'Carro ou moto', desc: 'À vista ou entrada', months: 36, color: '#c98500', calc: function (inc) { return inc * 8; } },
    { id: 'estudo', emoji: '🎓', name: 'Estudos', desc: 'Curso, faculdade, certificação', months: 24, color: '#008300', calc: function (inc) { return Math.max(inc * 2, 600000); } },
    { id: 'aposentadoria', emoji: '🌅', name: 'Independência financeira', desc: 'Viver de renda — regra dos 25x do gasto anual', months: 240, color: '#d55181', calc: function (inc) { return inc * 12 * 25; } },
    { id: 'outro', emoji: '⭐', name: 'Outro objetivo', desc: 'Você define o nome e o valor', months: 24, color: '#12a594', calc: function (inc) { return Math.max(inc, 200000); } }
  ];

  var Wizard = {
    step: 0,
    total: 7,
    draft: null
  };

  Wizard.start = function () {
    Wizard.step = 0;
    Wizard.draft = {
      displayName: DB.data.profile.displayName,
      avatar: DB.data.profile.avatar,
      income: DB.data.plan.monthlyIncome || 0,
      method: '50-30-20',
      groupTargets: { essencial: 50, estilo: 30, futuro: 20 },
      savingsPct: DB.data.plan.savingsTargetPct || 20,
      emergencyMonths: DB.data.plan.emergencyMonths || 6,
      risk: DB.data.plan.riskProfile || 'moderado',
      horizon: DB.data.plan.horizonYears || 10,
      ret: DB.data.plan.expectedReturnPct || 10.5,
      infl: DB.data.plan.inflationPct || 4.5,
      payday: DB.data.plan.payday || 5,
      objectives: ['reserva'],
      goalValues: {},
      goalMonths: {},
      applyBudgets: true
    };
    A.showScreen();
    Wizard.render();
  };

  Wizard.render = function () {
    var b = box();
    if (!b) return;
    var steps = [
      Wizard.s0, Wizard.s1, Wizard.s2, Wizard.s3, Wizard.s4, Wizard.s5, Wizard.s6
    ];
    var s = steps[Wizard.step].call(Wizard);
    b.innerHTML =
      '<div class="wizard-progress">' +
      Array.apply(null, Array(Wizard.total)).map(function (_, i) {
        return '<i class="' + (i <= Wizard.step ? 'done' : '') + '"></i>';
      }).join('') + '</div>' +
      '<div class="wizard-step">' +
      '<p class="wizard-kicker">' + s.kicker + '</p>' +
      '<h2 class="wizard-q">' + s.q + '</h2>' +
      (s.help ? '<p class="wizard-help">' + s.help + '</p>' : '') +
      s.body +
      '<div class="wizard-nav">' +
      (Wizard.step > 0 ? '<button class="btn btn-ghost" type="button" id="wz-back">Voltar</button>' : '') +
      '<button class="btn btn-primary" type="button" id="wz-next" style="flex:2">' + (s.nextLabel || 'Continuar') + '</button>' +
      '</div>' +
      (s.skip ? '<p class="auth-foot"><button type="button" id="wz-skip">' + s.skip + '</button></p>' : '') +
      '</div>';

    var root = b;
    UI.bindPickers(root);
    if (s.onMount) s.onMount(root);
    var back = root.querySelector('#wz-back');
    if (back) back.addEventListener('click', function () { Wizard.step--; Wizard.render(); });
    root.querySelector('#wz-next').addEventListener('click', function () {
      var ok = s.onNext ? s.onNext(root) : true;
      if (ok === false) return;
      if (Wizard.step >= Wizard.total - 1) return;
      Wizard.step++;
      Wizard.render();
      global.scrollTo({ top: 0 });
    });
    var skip = root.querySelector('#wz-skip');
    if (skip) skip.addEventListener('click', function () {
      if (s.onSkip) s.onSkip();
      else { Wizard.step++; Wizard.render(); }
    });
  };

  /* ── passo 0: boas-vindas ── */
  Wizard.s0 = function () {
    var d = Wizard.draft;
    return {
      kicker: 'Passo 1 de ' + Wizard.total,
      q: 'Vamos montar o seu plano',
      help: 'Seis perguntas rápidas. No final você sai daqui com orçamento por categoria, ' +
        'metas com valor mensal calculado e uma projeção de quanto seu patrimônio pode chegar. ' +
        'Tudo editável depois — nada aqui é definitivo.',
      body: '<div class="field"><label for="wz-name">Como quer ser chamado no painel?</label>' +
        '<input type="text" id="wz-name" maxlength="40" value="' + esc(d.displayName) + '" /></div>' +
        '<label class="label">Seu ícone</label>' + UI.emojiPicker(d.avatar, 'avatar'),
      nextLabel: 'Começar',
      onNext: function (root) {
        d.displayName = UI.val(root, 'wz-name') || d.displayName;
        d.avatar = UI.pick.avatar || d.avatar;
        return true;
      }
    };
  };

  /* ── passo 1: renda ── */
  Wizard.s1 = function () {
    var d = Wizard.draft;
    return {
      kicker: 'Passo 2 de ' + Wizard.total,
      q: 'Quanto entra por mês?',
      help: 'Some tudo que costuma cair: salário líquido, freelas, aluguéis, benefícios. ' +
        'Se varia bastante, use a média dos últimos três meses — o app recalcula sozinho conforme você lança.',
      body: '<div class="field">' +
        '<input type="text" id="wz-income" class="input-amount" inputmode="decimal" placeholder="0,00" ' +
        'value="' + (d.income ? Money.plain(d.income) : '') + '" />' +
        '<p class="hint center" id="wz-income-echo"></p></div>' +
        '<div class="field"><label for="wz-payday">Dia em que a renda costuma cair</label>' +
        '<input type="number" id="wz-payday" min="1" max="31" value="' + d.payday + '" /></div>',
      onMount: function (root) {
        UI.bindAmountField(root, 'wz-income', 'wz-income-echo');
        setTimeout(function () { var i = root.querySelector('#wz-income'); if (i) i.focus(); }, 200);
      },
      onNext: function (root) {
        var v = UI.readAmount(root, 'wz-income');
        if (!isFinite(v) || v <= 0) { UI.err('Informe um valor de renda para continuar.'); return false; }
        d.income = v;
        d.payday = clamp(parseInt(UI.val(root, 'wz-payday'), 10) || 5, 1, 31);
        return true;
      }
    };
  };

  /* ── passo 2: método de orçamento ── */
  Wizard.s2 = function () {
    var d = Wizard.draft;
    var METHODS = [
      { id: '50-30-20', emoji: '⚖️', name: '50 / 30 / 20', desc: 'Metade no essencial, 30% no estilo de vida, 20% guardado. O equilíbrio clássico.', t: { essencial: 50, estilo: 30, futuro: 20 } },
      { id: '70-20-10', emoji: '🧱', name: '70 / 20 / 10', desc: 'Para quem tem custo fixo alto e está começando a organizar.', t: { essencial: 70, estilo: 20, futuro: 10 } },
      { id: '60-20-20', emoji: '🎯', name: '60 / 20 / 20', desc: 'Meio-termo: aperta o estilo de vida e mantém 20% guardados.', t: { essencial: 60, estilo: 20, futuro: 20 } },
      { id: 'agressivo', emoji: '🚀', name: '50 / 20 / 30', desc: 'Acelerado: 30% da renda para o futuro. Exige disciplina.', t: { essencial: 50, estilo: 20, futuro: 30 } }
    ];
    return {
      kicker: 'Passo 3 de ' + Wizard.total,
      q: 'Como quer dividir a renda?',
      help: 'Essencial é o que não dá para cortar (moradia, mercado, transporte, saúde). ' +
        'Estilo de vida é o que dá (lazer, delivery, assinaturas). Futuro é poupança, aportes e estudos. ' +
        'Com ' + Money.fmt(d.income) + ' de renda, cada opção fica assim:',
      body: '<div class="opt-list" data-picker="method">' +
        METHODS.map(function (m) {
          return '<button type="button" class="opt' + (m.id === d.method ? ' active' : '') + '" data-pick="' + m.id + '" ' +
            'data-t=\'' + JSON.stringify(m.t) + '\'>' +
            '<span class="ic">' + m.emoji + '</span>' +
            '<span class="grow"><b>' + m.name + '</b><span>' + m.desc + '</span>' +
            '<span style="color:var(--ink-2);margin-top:5px">' +
            Money.fmt(Math.round(d.income * m.t.essencial / 100)) + ' · ' +
            Money.fmt(Math.round(d.income * m.t.estilo / 100)) + ' · ' +
            '<b style="color:var(--income)">' + Money.fmt(Math.round(d.income * m.t.futuro / 100)) + '</b></span>' +
            '</span><span class="check">✓</span></button>';
        }).join('') + '</div>' +
        '<div class="switch-row" style="margin-top:14px">' +
        '<div class="sr-text"><b>Sugerir tetos por categoria</b>' +
        '<span>Distribui cada fatia entre as categorias, usando seu histórico quando existir.</span></div>' +
        '<label class="switch"><input type="checkbox" id="wz-budgets"' + (d.applyBudgets ? ' checked' : '') + ' /><i></i></label></div>',
      onNext: function (root) {
        var sel = root.querySelector('[data-picker="method"] .active');
        if (sel) {
          d.method = sel.getAttribute('data-pick');
          try { d.groupTargets = JSON.parse(sel.getAttribute('data-t')); } catch (e) { }
          d.savingsPct = d.groupTargets.futuro;
        }
        d.applyBudgets = UI.checked(root, 'wz-budgets');
        return true;
      }
    };
  };

  /* ── passo 3: objetivos ── */
  Wizard.s3 = function () {
    var d = Wizard.draft;
    return {
      kicker: 'Passo 4 de ' + Wizard.total,
      q: 'O que você quer conquistar?',
      help: 'Escolha de um a quatro objetivos. No próximo passo você ajusta valor e prazo de cada um, ' +
        'e o app calcula quanto precisa sair do seu bolso por mês.',
      body: '<div class="opt-list" id="wz-objs">' +
        OBJETIVOS.map(function (o) {
          var on = d.objectives.indexOf(o.id) >= 0;
          return '<button type="button" class="opt' + (on ? ' active' : '') + '" data-obj="' + o.id + '">' +
            '<span class="ic">' + o.emoji + '</span>' +
            '<span class="grow"><b>' + o.name + '</b><span>' + o.desc + '</span></span>' +
            '<span class="check">✓</span></button>';
        }).join('') + '</div>',
      onMount: function (root) {
        root.querySelector('#wz-objs').addEventListener('click', function (e) {
          var b = e.target.closest('[data-obj]');
          if (!b) return;
          var id = b.getAttribute('data-obj');
          var i = d.objectives.indexOf(id);
          if (i >= 0) { d.objectives.splice(i, 1); b.classList.remove('active'); }
          else if (d.objectives.length >= 4) { UI.err('Escolha no máximo 4 objetivos.'); return; }
          else { d.objectives.push(id); b.classList.add('active'); }
          UI.buzz(8);
        });
      },
      onNext: function () {
        if (!d.objectives.length) { UI.err('Escolha pelo menos um objetivo.'); return false; }
        return true;
      }
    };
  };

  /* ── passo 4: valores e prazos ── */
  Wizard.s4 = function () {
    var d = Wizard.draft;
    var chosen = OBJETIVOS.filter(function (o) { return d.objectives.indexOf(o.id) >= 0; });
    return {
      kicker: 'Passo 5 de ' + Wizard.total,
      q: 'Quanto e até quando?',
      help: 'Já preenchi uma estimativa com base na sua renda. Ajuste o que fizer sentido — ' +
        'o valor mensal necessário é recalculado na hora.',
      body: chosen.map(function (o) {
        var val = d.goalValues[o.id] != null ? d.goalValues[o.id] :
          (o.id === 'reserva' ? Math.round(d.income * 0.6) * d.emergencyMonths : o.calc(d.income));
        var mo = d.goalMonths[o.id] != null ? d.goalMonths[o.id] : o.months;
        return '<div class="card card-tight" style="margin-bottom:10px" data-goalrow="' + o.id + '">' +
          '<div class="row" style="margin-bottom:11px">' +
          '<span style="font-size:1.25rem">' + o.emoji + '</span>' +
          '<b class="grow" style="font-size:.88rem">' + o.name + '</b></div>' +
          (o.id === 'outro' ? '<div class="field" style="margin-bottom:9px">' +
            '<input type="text" id="gv-name-outro" placeholder="Nome do objetivo" maxlength="60" ' +
            'value="' + esc(d.goalValues.outroName || '') + '" /></div>' : '') +
          '<div class="split" style="margin-top:0">' +
          '<div class="field" style="margin:0"><label>Valor (R$)</label>' +
          '<input type="text" class="num" inputmode="decimal" id="gv-' + o.id + '" value="' + Money.plain(val) + '" /></div>' +
          '<div class="field" style="margin:0"><label>Prazo (meses)</label>' +
          '<input type="number" class="num" id="gm-' + o.id + '" min="1" max="600" value="' + mo + '" /></div>' +
          '</div>' +
          '<p class="hint" id="gh-' + o.id + '"></p>' +
          '</div>';
      }).join('') +
        '<div class="callout callout-info" id="wz-total-callout"><span class="ic">🧮</span><span id="wz-total-text"></span></div>',
      onMount: function (root) {
        var recalc = function () {
          var sum = 0;
          chosen.forEach(function (o) {
            var v = Money.parse(root.querySelector('#gv-' + o.id).value);
            var m = clamp(parseInt(root.querySelector('#gm-' + o.id).value, 10) || 1, 1, 600);
            if (!isFinite(v) || v <= 0) { root.querySelector('#gh-' + o.id).textContent = ''; return; }
            var per = Math.ceil(v / m);
            sum += per;
            root.querySelector('#gh-' + o.id).innerHTML =
              '≈ <b style="color:var(--ink)">' + Money.fmt(per) + '</b> por mês durante ' + m +
              ' meses · conclui em ' + D.fmt(D.addMonths(D.today(), m));
          });
          var pool = Math.round(d.income * d.groupTargets.futuro / 100);
          var el = root.querySelector('#wz-total-text');
          var box2 = root.querySelector('#wz-total-callout');
          if (!el) return;
          if (sum <= pool) {
            box2.className = 'callout callout-good';
            el.innerHTML = 'Somando tudo, <b>' + Money.fmt(sum) + '/mês</b>. Cabe folgado nos ' +
              Money.fmt(pool) + ' que o seu plano reserva para o futuro — sobram ' + Money.fmt(pool - sum) + '.';
          } else {
            box2.className = 'callout callout-warn';
            el.innerHTML = 'Somando tudo, <b>' + Money.fmt(sum) + '/mês</b>, mas o seu plano reserva ' +
              Money.fmt(pool) + ' para o futuro. Faltam <b>' + Money.fmt(sum - pool) +
              '</b>. Dá para esticar os prazos, reduzir valores ou aumentar a fatia do futuro — ' +
              'o app vai te mostrar isso todo mês de qualquer forma.';
          }
        };
        root.querySelectorAll('[data-goalrow] input').forEach(function (i) {
          i.addEventListener('input', recalc);
        });
        recalc();
      },
      onNext: function (root) {
        var ok = true;
        chosen.forEach(function (o) {
          var v = Money.parse(root.querySelector('#gv-' + o.id).value);
          if (!isFinite(v) || v <= 0) { ok = false; return; }
          d.goalValues[o.id] = Math.abs(v);
          d.goalMonths[o.id] = clamp(parseInt(root.querySelector('#gm-' + o.id).value, 10) || o.months, 1, 600);
        });
        var nm = root.querySelector('#gv-name-outro');
        if (nm) d.goalValues.outroName = nm.value.trim();
        if (!ok) { UI.err('Preencha um valor válido em cada objetivo.'); return false; }
        return true;
      }
    };
  };

  /* ── passo 5: perfil e expectativas ── */
  Wizard.s5 = function () {
    var d = Wizard.draft;
    var RISKS = [
      { id: 'conservador', emoji: '🪨', name: 'Conservador', desc: 'Prioriza não perder. Renda fixa, liquidez, previsibilidade.', ret: 9 },
      { id: 'moderado', emoji: '⚖️', name: 'Moderado', desc: 'Aceita oscilação em parte da carteira para render mais.', ret: 11 },
      { id: 'arrojado', emoji: '🔥', name: 'Arrojado', desc: 'Tolera quedas fortes em troca de potencial maior no longo prazo.', ret: 14 }
    ];
    return {
      kicker: 'Passo 6 de ' + Wizard.total,
      q: 'Suas expectativas',
      help: 'Isso define a projeção de patrimônio e algumas recomendações. ' +
        'A rentabilidade esperada é uma premissa sua, não uma promessa do app.',
      body: '<div class="opt-list" data-picker="risk">' +
        RISKS.map(function (r) {
          return '<button type="button" class="opt' + (r.id === d.risk ? ' active' : '') + '" data-pick="' + r.id + '" data-ret="' + r.ret + '">' +
            '<span class="ic">' + r.emoji + '</span>' +
            '<span class="grow"><b>' + r.name + '</b><span>' + r.desc + '</span></span>' +
            '<span class="check">✓</span></button>';
        }).join('') + '</div>' +
        '<hr class="divider" />' +
        '<div class="field"><label>Horizonte do plano: <b id="wz-h-val">' + d.horizon + ' anos</b></label>' +
        '<div class="slider-row"><input type="range" id="wz-horizon" min="1" max="40" value="' + d.horizon + '" />' +
        '</div><p class="hint">Em quanto tempo você quer medir o resultado deste plano.</p></div>' +
        '<div class="field"><label>Rentabilidade esperada ao ano: <b id="wz-r-val">' + d.ret + '%</b></label>' +
        '<div class="slider-row"><input type="range" id="wz-ret" min="0" max="25" step="0.5" value="' + d.ret + '" /></div></div>' +
        '<div class="field"><label>Inflação esperada ao ano: <b id="wz-i-val">' + d.infl + '%</b></label>' +
        '<div class="slider-row"><input type="range" id="wz-infl" min="0" max="20" step="0.5" value="' + d.infl + '" /></div>' +
        '<p class="hint">Usada para mostrar quanto o seu patrimônio futuro vale em dinheiro de hoje.</p></div>' +
        '<div class="field"><label>Meses de reserva de emergência: <b id="wz-e-val">' + d.emergencyMonths + '</b></label>' +
        '<div class="slider-row"><input type="range" id="wz-emerg" min="1" max="24" value="' + d.emergencyMonths + '" /></div></div>',
      onMount: function (root) {
        var bind = function (id, out, fmt) {
          var inp = root.querySelector('#' + id), lbl = root.querySelector('#' + out);
          inp.addEventListener('input', function () { lbl.textContent = fmt(inp.value); });
        };
        bind('wz-horizon', 'wz-h-val', function (v) { return v + (v === '1' ? ' ano' : ' anos'); });
        bind('wz-ret', 'wz-r-val', function (v) { return v + '%'; });
        bind('wz-infl', 'wz-i-val', function (v) { return v + '%'; });
        bind('wz-emerg', 'wz-e-val', function (v) { return v; });
        /* escolher o perfil move a rentabilidade para a premissa típica */
        root.querySelector('[data-picker="risk"]').addEventListener('click', function (e) {
          var b = e.target.closest('[data-pick]');
          if (!b) return;
          var r = b.getAttribute('data-ret');
          if (r) {
            root.querySelector('#wz-ret').value = r;
            root.querySelector('#wz-r-val').textContent = r + '%';
          }
        });
      },
      onNext: function (root) {
        d.risk = UI.pick.risk || d.risk;
        d.horizon = parseInt(UI.val(root, 'wz-horizon'), 10) || 10;
        d.ret = parseFloat(UI.val(root, 'wz-ret'));
        d.infl = parseFloat(UI.val(root, 'wz-infl'));
        d.emergencyMonths = parseInt(UI.val(root, 'wz-emerg'), 10) || 6;
        return true;
      }
    };
  };

  /* ── passo 6: resumo ── */
  Wizard.s6 = function () {
    var d = Wizard.draft;
    var chosen = OBJETIVOS.filter(function (o) { return d.objectives.indexOf(o.id) >= 0; });
    var monthly = 0;
    chosen.forEach(function (o) {
      monthly += Math.ceil((d.goalValues[o.id] || 0) / (d.goalMonths[o.id] || o.months));
    });
    var pool = Math.round(d.income * d.groupTargets.futuro / 100);
    var aporte = Math.max(pool, monthly);
    var proj = F.project({
      start: 0, monthly: aporte, months: d.horizon * 12,
      annualPct: d.ret, inflationPct: d.infl
    });

    return {
      kicker: 'Último passo',
      q: 'Seu plano está pronto',
      help: 'Confira o resumo. Ao aplicar, as metas são criadas, os tetos entram no orçamento ' +
        'e o painel passa a medir tudo isso automaticamente.',
      body: '<div class="plan-summary">' +
        '<div class="plan-sum-row"><span class="k">Renda mensal</span><span class="v">' + Money.fmt(d.income) + '</span></div>' +
        '<div class="plan-sum-row"><span class="k">Método</span><span class="v">' +
        d.groupTargets.essencial + '/' + d.groupTargets.estilo + '/' + d.groupTargets.futuro + '</span></div>' +
        '<div class="plan-sum-row"><span class="k">Essencial (teto)</span><span class="v">' +
        Money.fmt(Math.round(d.income * d.groupTargets.essencial / 100)) + '</span></div>' +
        '<div class="plan-sum-row"><span class="k">Estilo de vida (teto)</span><span class="v">' +
        Money.fmt(Math.round(d.income * d.groupTargets.estilo / 100)) + '</span></div>' +
        '<div class="plan-sum-row"><span class="k">Para o futuro</span><span class="v" style="color:var(--income)">' +
        Money.fmt(pool) + '</span></div>' +
        '<div class="plan-sum-row"><span class="k">Soma das metas</span><span class="v">' + Money.fmt(monthly) + '/mês</span></div>' +
        '</div>' +
        '<h3 style="font-size:.9rem;margin:20px 0 9px">Metas que serão criadas</h3>' +
        '<div class="stack-sm">' + chosen.map(function (o) {
          var v = d.goalValues[o.id] || 0, m = d.goalMonths[o.id] || o.months;
          var nm = o.id === 'outro' && d.goalValues.outroName ? d.goalValues.outroName : o.name;
          return '<div class="item"><span class="item-icon" style="background:' + UI.hexA(o.color, .15) +
            ';border:1px solid ' + UI.hexA(o.color, .35) + '">' + o.emoji + '</span>' +
            '<span class="item-body"><span class="item-title">' + esc(nm) + '</span>' +
            '<span class="item-meta"><span class="tiny muted">' + Money.fmt(Math.ceil(v / m)) + '/mês · ' +
            m + ' meses · até ' + D.fmt(D.addMonths(D.today(), m)) + '</span></span></span>' +
            '<span class="item-amount">' + Money.fmt(v) + '</span></div>';
        }).join('') + '</div>' +
        '<h3 style="font-size:.9rem;margin:20px 0 9px">Para onde isso leva</h3>' +
        '<div class="card card-tight"><div class="kv-list">' +
        '<div class="kv"><span class="k">Aporte mensal considerado</span><span class="v">' + Money.fmt(aporte) + '</span></div>' +
        '<div class="kv"><span class="k">Total aportado em ' + d.horizon + ' anos</span><span class="v">' + Money.fmt(proj.invested) + '</span></div>' +
        '<div class="kv"><span class="k">Juros acumulados</span><span class="v" style="color:var(--income)">' + Money.fmt(proj.earnings) + '</span></div>' +
        '<div class="kv"><span class="k">Patrimônio projetado</span><span class="v" style="font-size:1rem">' + Money.fmt(proj.final) + '</span></div>' +
        '<div class="kv"><span class="k">Equivalente de hoje</span><span class="v">' + Money.fmt(proj.finalReal) + '</span></div>' +
        '</div></div>' +
        '<p class="fine-print" style="margin-top:11px">Projeção com juros compostos mensais sobre as premissas que você escolheu. ' +
        'Serve para orientar decisão, não como garantia de retorno.</p>',
      nextLabel: '✓ Aplicar meu plano',
      skip: 'Pular e configurar depois',
      onSkip: function () {
        DB.data.profile.onboarded = true;
        DB.saveNow().then(function () { Dm.App.enter(); });
      },
      onNext: function (root) {
        var btn = root.querySelector('#wz-next');
        busy(btn, true, 'Montando…');
        Wizard.apply(chosen).then(function () {
          Dm.App.enter();
          UI.ok('Plano criado! 🎯');
        }).catch(function (e) {
          busy(btn, false);
          UI.err('Não foi possível salvar o plano: ' + (e.message || e));
        });
        return false;
      }
    };
  };

  Wizard.apply = function (chosen) {
    var d = Wizard.draft;
    var data = DB.data;

    data.profile.displayName = d.displayName;
    data.profile.avatar = d.avatar;
    data.profile.onboarded = true;

    data.plan.monthlyIncome = d.income;
    data.plan.method = d.method;
    data.plan.groupTargets = d.groupTargets;
    data.plan.savingsTargetPct = d.groupTargets.futuro;
    data.plan.emergencyMonths = d.emergencyMonths;
    data.plan.riskProfile = d.risk;
    data.plan.horizonYears = d.horizon;
    data.plan.expectedReturnPct = d.ret;
    data.plan.inflationPct = d.infl;
    data.plan.payday = d.payday;
    data.plan.updatedAt = new Date().toISOString();

    if (d.applyBudgets) {
      data.plan.budgets = F.suggestBudgets(data, d.income, d.groupTargets);
    }

    chosen.forEach(function (o) {
      var v = d.goalValues[o.id] || 0;
      var m = d.goalMonths[o.id] || o.months;
      var nm = (o.id === 'outro' && d.goalValues.outroName) ? d.goalValues.outroName : o.name;
      var exists = data.goals.some(function (g) {
        return !g.archived && g.name.toLowerCase() === nm.toLowerCase();
      });
      if (exists) return;
      data.goals.push({
        id: Dm.uid('goal'), name: nm, emoji: o.emoji, color: o.color, kind: o.id,
        target: v, deadline: D.addMonths(D.today(), m),
        priority: o.id === 'reserva' || o.id === 'divida' ? 1 : 2,
        monthlyPlan: Math.ceil(v / m), contributions: [], saved: 0,
        note: 'Criada pelo assistente de plano.',
        createdAt: new Date().toISOString(), archived: false, linkAccountId: null
      });
    });

    DB.data = Dm.Schema.normalize(data);
    return DB.snapshot('Plano financeiro criado', 'manual')
      .then(function () { return DB.saveNow({ noSnapshot: true }); });
  };

  Dm.AuthUI = A;
  Dm.Wizard = Wizard;
  Dm.OBJETIVOS = OBJETIVOS;
})(typeof window !== 'undefined' ? window : globalThis);
