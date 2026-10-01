/* ═══════════════════════════════════════════════════════════════
   Dominus Finance — METAS · MEU PLANO · CONFIGURAÇÕES
   Aqui o usuário molda o plano: renda, método de divisão, teto de
   cada categoria, reserva, expectativas de retorno e metas com
   aporte mensal calculado. E aqui vive o histórico de versões,
   que é a rede de segurança de tudo.
═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var Dm = global.Dominus;
  var UI = Dm.UI, DB = Dm.DB, F = Dm.F, Money = Dm.Money, D = Dm.D, Chart = Dm.Chart;
  var esc = Dm.esc, clamp = Dm.clamp, uid = Dm.uid, Auth = Dm.Auth, History = Dm.History, Backup = Dm.Backup;

  /* ═══════════════════════════════════════════
     METAS
  ═══════════════════════════════════════════ */

  var showArchived = false;

  UI.renderers.goals = function () {
    var data = DB.data;
    var active = data.goals.filter(function (g) { return !g.archived; });
    var archived = data.goals.filter(function (g) { return g.archived; });
    var sum = F.goalsSummary(data);
    var html = '';

    if (active.length) {
      html += '<div class="card">' +
        '<div class="card-head"><div><h3>Visão geral</h3>' +
        '<p class="sub">' + sum.count + ' meta(s) ativa(s)' + (sum.late ? ' · ' + sum.late + ' atrasada(s)' : '') + '</p></div>' +
        '<div>' + Chart.ring(sum.pct, 'var(--accent)', 56) + '</div></div>' +
        '<div class="kv-list">' +
        '<div class="kv"><span class="k">Soma dos alvos</span><span class="v">' + UI.money(sum.target) + '</span></div>' +
        '<div class="kv"><span class="k">Já conquistado</span><span class="v" style="color:' + Chart.incomeColor() + '">' +
        UI.money(sum.saved) + '</span></div>' +
        '<div class="kv"><span class="k">Falta</span><span class="v">' + UI.money(sum.target - sum.saved) + '</span></div>' +
        '<div class="kv"><span class="k">Aporte mensal planejado</span><span class="v">' + UI.money(sum.planned) + '</span></div>' +
        '</div></div>';

      html += '<div class="section-title"><h3>Suas metas</h3></div>';
      html += active.sort(function (a, b) {
        var sa = F.goalStatus(data, a), sb = F.goalStatus(data, b);
        if (sa.late !== sb.late) return sa.late ? -1 : 1;
        if (a.priority !== b.priority) return a.priority - b.priority;
        return sb.pct - sa.pct;
      }).map(function (g) { return goalCard(g, data); }).join('');
    } else {
      html += '<div class="empty"><span class="ic">🎯</span><h4>Nenhuma meta ainda</h4>' +
        '<p>Uma meta é um valor com prazo. Com os dois, o app calcula quanto você precisa guardar por mês e avisa se o ritmo não fecha.</p>' +
        '<div class="btn-row" style="margin-top:16px">' +
        '<button class="btn btn-primary btn-sm" type="button" data-act="add-goal">Criar meta</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="rerun-wizard">Usar assistente</button>' +
        '</div></div>';
    }

    if (archived.length) {
      html += '<div class="section-title"><h3>Arquivadas (' + archived.length + ')</h3>' +
        '<button class="link" type="button" data-act="toggle-archived">' +
        (showArchived ? 'Ocultar' : 'Mostrar') + '</button></div>';
      if (showArchived) html += archived.map(function (g) { return goalCard(g, data); }).join('');
    }

    document.getElementById('goals-content').innerHTML = html;
  };

  function goalCard(g, data) {
    var st = F.goalStatus(data, g);
    var badge = st.done ? '<span class="badge badge-good">Concluída</span>'
      : st.late ? '<span class="badge badge-crit">Atrasada</span>'
        : st.onTrack === false ? '<span class="badge badge-warn">Fora do ritmo</span>'
          : st.onTrack === true ? '<span class="badge badge-good">No ritmo</span>' : '';
    return '<div class="goal-card">' +
      '<div class="goal-top">' +
      '<span class="goal-emoji" style="background:' + UI.hexA(g.color, .15) +
      ';border:1px solid ' + UI.hexA(g.color, .35) + '">' + g.emoji + '</span>' +
      '<div class="grow">' +
      '<div class="row-between"><p class="goal-name truncate">' + esc(g.name) + '</p>' + badge + '</div>' +
      '<p class="goal-sub">' + (g.deadline
        ? (st.late ? 'Prazo venceu em ' + D.fmt(g.deadline) : 'Até ' + D.fmt(g.deadline) +
          (st.monthsLeft != null ? ' · ' + st.monthsLeft + ' mês(es)' : ''))
        : 'Sem prazo definido') + '</p>' +
      '</div></div>' +
      '<div class="goal-bar"><div class="goal-fill" style="width:' + st.pct + '%;background:' + g.color + '"></div></div>' +
      '<div class="goal-nums"><span>' + UI.money(st.saved) + ' <span class="muted">de ' +
      esc(Money.fmt(g.target)) + '</span></span><b>' + st.pct + '%</b></div>' +
      (st.missing > 0 && st.neededMonthly ? '<p class="tiny muted" style="margin-top:8px">' +
        'Precisa de <b style="color:var(--ink)">' + esc(Money.fmt(st.neededMonthly)) + '/mês</b> para fechar no prazo' +
        (st.pace ? ' · seu ritmo atual é ' + esc(Money.fmt(st.pace)) + '/mês' : '') +
        (st.onTrack === false && st.projectedDate ? ' · no ritmo de hoje, só em ' + D.fmt(st.projectedDate) : '') +
        '</p>' : '') +
      (st.done ? '<p class="tiny" style="margin-top:8px;color:' + Chart.incomeColor() + '">🏆 Alvo atingido. Arquive ou aumente o alvo.</p>' : '') +
      '<div class="goal-foot">' +
      (g.archived
        ? '<button class="btn btn-ghost btn-xs" type="button" data-act="goal-unarchive" data-id="' + g.id + '">↩︎ Reativar</button>'
        : '<button class="btn btn-soft btn-xs" type="button" data-act="goal-contrib" data-id="' + g.id + '">+ Aportar</button>' +
        '<button class="btn btn-ghost btn-xs" type="button" data-act="goal-detail" data-id="' + g.id + '">Detalhes</button>' +
        '<button class="btn btn-ghost btn-xs" type="button" data-act="goal-edit" data-id="' + g.id + '">✏️</button>') +
      '</div></div>';
  }

  var GOAL_KINDS = [
    { id: 'reserva', emoji: '🛡️', name: 'Reserva de emergência', color: '#199e70' },
    { id: 'divida', emoji: '🧾', name: 'Quitar dívida', color: '#FF1F3D' },
    { id: 'viagem', emoji: '✈️', name: 'Viagem', color: '#3987e5' },
    { id: 'casa', emoji: '🏠', name: 'Imóvel', color: '#9085e9' },
    { id: 'carro', emoji: '🚗', name: 'Veículo', color: '#c98500' },
    { id: 'estudo', emoji: '🎓', name: 'Estudos', color: '#008300' },
    { id: 'aposentadoria', emoji: '🌅', name: 'Independência financeira', color: '#d55181' },
    { id: 'outro', emoji: '⭐', name: 'Outro', color: '#12a594' }
  ];

  UI.openGoalSheet = function (goalId, preset) {
    var data = DB.data;
    var g = goalId ? data.goals.filter(function (x) { return x.id === goalId; })[0] : null;
    var isEdit = !!g;
    var kindPreset = preset && GOAL_KINDS.filter(function (k) { return k.id === preset; })[0];
    var base = g || {
      name: kindPreset ? kindPreset.name : '', emoji: kindPreset ? kindPreset.emoji : '🎯',
      color: kindPreset ? kindPreset.color : '#3987e5', kind: kindPreset ? kindPreset.id : 'outro',
      target: 0, deadline: D.addMonths(D.today(), 12), priority: 2, monthlyPlan: 0, note: ''
    };
    if (preset === 'reserva' && !isEdit) {
      var em = F.emergency(data);
      if (em.target) base.target = em.target;
      base.deadline = D.addMonths(D.today(), 18);
    }

    UI.openSheet(
      UI.sheetHead(isEdit ? 'Editar meta' : 'Nova meta', { flag: isEdit ? 'Editando' : null }) +
      '<label class="label">Tipo de objetivo</label>' +
      '<div class="chip-scroll" data-picker="kind" id="g-kinds">' +
      GOAL_KINDS.map(function (k) {
        return '<button class="chip' + (k.id === base.kind ? ' active' : '') + '" type="button" data-pick="' + k.id +
          '" data-emoji="' + k.emoji + '" data-color="' + k.color + '" data-name="' + esc(k.name) + '">' +
          k.emoji + ' ' + esc(k.name) + '</button>';
      }).join('') + '</div>' +
      '<div class="field" style="margin-top:14px"><label for="g-name">Nome da meta</label>' +
      '<input type="text" id="g-name" maxlength="80" placeholder="ex: Reserva de 6 meses" value="' + esc(base.name) + '" /></div>' +
      '<div class="field"><label for="g-target">Valor da meta</label>' +
      '<input type="text" id="g-target" class="input-amount" inputmode="decimal" placeholder="0,00" ' +
      'value="' + (base.target ? Money.plain(base.target) : '') + '" />' +
      '<p class="hint center" id="g-target-echo"></p></div>' +
      '<div class="field"><label for="g-deadline">Prazo</label>' +
      '<div class="chip-scroll" id="g-quick-dl">' +
      [[6, '6 meses'], [12, '1 ano'], [24, '2 anos'], [60, '5 anos'], [120, '10 anos']].map(function (p) {
        return '<button class="chip" type="button" data-mo="' + p[0] + '">' + p[1] + '</button>';
      }).join('') + '</div>' +
      '<input type="date" id="g-deadline" value="' + esc(base.deadline || '') + '" style="margin-top:8px" />' +
      '<p class="hint" id="g-calc"></p></div>' +
      '<div class="field"><label for="g-monthly">Aporte mensal planejado (opcional)</label>' +
      '<input type="text" id="g-monthly" inputmode="decimal" placeholder="deixe vazio para usar o cálculo automático" ' +
      'value="' + (base.monthlyPlan ? Money.plain(base.monthlyPlan) : '') + '" /></div>' +
      '<div class="field"><label for="g-priority">Prioridade</label>' +
      '<div class="segmented" id="g-prio">' +
      [[1, 'Alta'], [2, 'Média'], [3, 'Baixa']].map(function (p) {
        return '<button type="button" class="' + (base.priority === p[0] ? 'active' : '') + '" data-p="' + p[0] + '">' + p[1] + '</button>';
      }).join('') + '</div></div>' +
      '<label class="label">Ícone</label>' + UI.emojiPicker(base.emoji, 'emoji') +
      '<label class="label" style="margin-top:14px">Cor</label>' + UI.colorPicker(base.color, 'color') +
      '<div class="field" style="margin-top:14px"><label for="g-note">Observação</label>' +
      '<textarea id="g-note" rows="2" maxlength="500" placeholder="Por que essa meta importa para você?">' + esc(base.note || '') + '</textarea></div>' +
      '<button class="btn btn-primary btn-block" type="button" id="g-save" style="margin-top:8px">' +
      (isEdit ? 'Salvar meta' : 'Criar meta') + '</button>' +
      (isEdit ? '<div class="btn-row" style="margin-top:9px">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="goal-archive" data-id="' + g.id + '">📦 Arquivar</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-act="goal-delete" data-id="' + g.id + '">🗑️ Excluir</button>' +
        '</div>' : ''),
      {
        onOpen: function (body) {
          UI.bindPickers(body);
          UI.bindAmountField(body, 'g-target', 'g-target-echo');

          var prio = base.priority;
          body.querySelector('#g-prio').addEventListener('click', function (e) {
            var b = e.target.closest('[data-p]');
            if (!b) return;
            prio = parseInt(b.getAttribute('data-p'), 10);
            body.querySelectorAll('#g-prio button').forEach(function (x) { x.classList.remove('active'); });
            b.classList.add('active');
          });

          var recalc = function () {
            var v = Money.parse(body.querySelector('#g-target').value);
            var dl = body.querySelector('#g-deadline').value;
            var el = body.querySelector('#g-calc');
            if (!isFinite(v) || v <= 0 || !D.isValid(dl)) { el.textContent = ''; return; }
            var saved = g ? g.saved : 0;
            var months = Math.max(1, D.diffMonths(dl, D.today()) + 1);
            el.innerHTML = 'Para chegar em ' + esc(Money.fmt(v)) + ' até ' + D.fmt(dl) + ', guarde cerca de <b style="color:var(--ink)">' +
              esc(Money.fmt(Math.ceil(Math.max(0, v - saved) / months))) + ' por mês</b> (' + months + ' meses).';
          };
          body.querySelector('#g-target').addEventListener('input', recalc);
          body.querySelector('#g-deadline').addEventListener('change', recalc);
          body.querySelector('#g-quick-dl').addEventListener('click', function (e) {
            var b = e.target.closest('[data-mo]');
            if (!b) return;
            body.querySelector('#g-deadline').value = D.addMonths(D.today(), parseInt(b.getAttribute('data-mo'), 10));
            body.querySelectorAll('#g-quick-dl .chip').forEach(function (x) { x.classList.remove('active'); });
            b.classList.add('active');
            recalc();
          });
          recalc();

          /* escolher o tipo preenche nome, ícone e cor quando o
             usuário ainda não digitou nada próprio */
          body.querySelector('#g-kinds').addEventListener('click', function (e) {
            var b = e.target.closest('[data-pick]');
            if (!b) return;
            var nameInp = body.querySelector('#g-name');
            if (!nameInp.value.trim() || GOAL_KINDS.some(function (k) { return k.name === nameInp.value.trim(); })) {
              nameInp.value = b.getAttribute('data-name');
            }
            var em = body.querySelector('[data-picker="emoji"] [data-pick="' + b.getAttribute('data-emoji') + '"]');
            if (em) em.click();
            var co = body.querySelector('[data-picker="color"] [data-pick="' + b.getAttribute('data-color') + '"]');
            if (co) co.click();
          });

          body.querySelector('#g-save').addEventListener('click', function () {
            var name = UI.val(body, 'g-name');
            var target = UI.readAmount(body, 'g-target');
            var dl = UI.val(body, 'g-deadline');
            if (!name) { UI.err('Dê um nome à meta.'); return; }
            if (!isFinite(target) || target <= 0) { UI.err('Informe o valor da meta.'); return; }
            var monthly = Money.parse(UI.val(body, 'g-monthly'));
            var payload = {
              name: name, target: target,
              deadline: D.isValid(dl) ? dl : null,
              priority: prio,
              monthlyPlan: isFinite(monthly) && monthly > 0 ? Math.abs(monthly) : 0,
              emoji: UI.pick.emoji || base.emoji,
              color: UI.pick.color || base.color,
              kind: UI.pick.kind || base.kind,
              note: UI.val(body, 'g-note')
            };
            if (isEdit) {
              Object.keys(payload).forEach(function (k) { g[k] = payload[k]; });
            } else {
              DB.data.goals.push(Object.assign({
                id: uid('goal'), contributions: [], saved: 0, archived: false,
                linkAccountId: null, createdAt: new Date().toISOString()
              }, payload));
            }
            UI.closeSheet();
            UI.commit(isEdit ? 'Meta atualizada' : 'Meta criada 🎯');
          });
        }
      }
    );
  };

  UI.openContribSheet = function (goalId) {
    var g = DB.data.goals.filter(function (x) { return x.id === goalId; })[0];
    if (!g) return;
    var st = F.goalStatus(DB.data, g);
    var sug = st.neededMonthly || st.planned || 0;

    UI.openSheet(
      UI.sheetHead('Aportar em ' + g.name, {
        sub: 'Já guardado: <b>' + esc(Money.fmt(st.saved)) + '</b> de ' + esc(Money.fmt(g.target)) +
          ' · falta ' + esc(Money.fmt(st.missing))
      }) +
      '<div class="field"><input type="text" id="c-amount" class="input-amount" inputmode="decimal" ' +
      'placeholder="0,00" value="' + (sug ? Money.plain(sug) : '') + '" />' +
      '<p class="hint center" id="c-amount-echo"></p></div>' +
      (sug ? '<div class="chip-scroll" id="c-quick">' +
        [sug, Math.round(sug / 2), st.missing].filter(function (v, i, a) {
          return v > 0 && a.indexOf(v) === i;
        }).map(function (v, i) {
          return '<button class="chip" type="button" data-v="' + v + '">' +
            (i === 0 ? 'Planejado ' : (v === st.missing ? 'Completar ' : 'Metade ')) + Money.fmt(v) + '</button>';
        }).join('') + '</div>' : '') +
      '<div class="field" style="margin-top:14px"><label for="c-date">Data</label>' +
      '<input type="date" id="c-date" value="' + D.today() + '" /></div>' +
      '<div class="field"><label for="c-note">Observação</label>' +
      '<input type="text" id="c-note" maxlength="160" placeholder="opcional" /></div>' +
      '<div class="switch-row"><div class="sr-text"><b>Lançar também no extrato</b>' +
      '<span>Cria uma despesa na categoria "Aporte / Investimento" para o seu saldo refletir o dinheiro reservado.</span></div>' +
      '<label class="switch"><input type="checkbox" id="c-tx" checked /><i></i></label></div>' +
      '<button class="btn btn-primary btn-block" type="button" id="c-save" style="margin-top:16px">Registrar aporte</button>' +
      '<button class="btn btn-ghost btn-block btn-sm" type="button" id="c-withdraw" style="margin-top:9px">Registrar retirada</button>',
      {
        focus: '#c-amount',
        onOpen: function (body) {
          UI.bindAmountField(body, 'c-amount', 'c-amount-echo');
          var q = body.querySelector('#c-quick');
          if (q) q.addEventListener('click', function (e) {
            var b = e.target.closest('[data-v]');
            if (!b) return;
            body.querySelector('#c-amount').value = Money.plain(parseInt(b.getAttribute('data-v'), 10));
            body.querySelector('#c-amount').dispatchEvent(new Event('input'));
          });

          var commit = function (sign) {
            var v = UI.readAmount(body, 'c-amount');
            if (!isFinite(v) || v <= 0) { UI.err('Informe um valor.'); return; }
            var date = UI.val(body, 'c-date');
            if (!D.isValid(date)) { UI.err('Data inválida.'); return; }
            g.contributions.push({
              id: uid('ctb'), date: date, amount: sign * v,
              note: UI.val(body, 'c-note') || (sign < 0 ? 'Retirada' : '')
            });
            g.saved = g.contributions.reduce(function (s, c) { return s + c.amount; }, 0);

            if (sign > 0 && UI.checked(body, 'c-tx')) {
              var now = new Date().toISOString();
              DB.data.transactions.unshift({
                id: uid('tx'), desc: 'Aporte: ' + g.name, amount: v, type: 'expense',
                categoryId: 'cat_investimento', accountId: 'acc_corrente', date: date,
                createdAt: now, updatedAt: now, note: 'Aporte na meta "' + g.name + '"',
                tags: ['meta'], recurrenceId: null, installment: null, goalId: g.id
              });
              DB.data.transactions.sort(function (a, b) { return b.date.localeCompare(a.date); });
            }
            UI.closeSheet();
            var after = F.goalStatus(DB.data, g);
            UI.commit(after.done ? '🏆 Meta conquistada!' :
              (sign < 0 ? 'Retirada registrada' : 'Aporte de ' + Money.fmt(v) + ' registrado · ' + after.pct + '%'));
          };
          body.querySelector('#c-save').addEventListener('click', function () { commit(1); });
          body.querySelector('#c-withdraw').addEventListener('click', function () { commit(-1); });
        }
      }
    );
  };

  UI.register({
    'add-goal': function () { UI.openGoalSheet(null); },
    'goal-edit': function (ds) { UI.openGoalSheet(ds.id); },
    'open-goal': function (ds) { UI.actions['goal-detail'](ds); },
    'goal-contrib': function (ds) { UI.openContribSheet(ds.id); },
    'toggle-archived': function () { showArchived = !showArchived; UI.renderers.goals(); },

    'goal-detail': function (ds) {
      var g = DB.data.goals.filter(function (x) { return x.id === ds.id; })[0];
      if (!g) return;
      var st = F.goalStatus(DB.data, g);
      var contribs = g.contributions.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
      UI.openSheet(
        UI.sheetHead(g.emoji + ' ' + g.name) +
        '<div class="center" style="margin-bottom:14px">' + Chart.ring(st.pct, g.color, 110) +
        '<p class="small" style="margin-top:6px">' + UI.money(st.saved) + ' de ' + esc(Money.fmt(g.target)) + '</p></div>' +
        '<div class="card card-tight"><div class="kv-list">' +
        '<div class="kv"><span class="k">Falta</span><span class="v">' + UI.money(st.missing) + '</span></div>' +
        (g.deadline ? '<div class="kv"><span class="k">Prazo</span><span class="v">' + D.fmt(g.deadline) +
          (st.monthsLeft != null ? ' (' + st.monthsLeft + ' meses)' : '') + '</span></div>' : '') +
        (st.neededMonthly ? '<div class="kv"><span class="k">Necessário por mês</span><span class="v">' +
          UI.money(st.neededMonthly) + '</span></div>' : '') +
        (st.pace ? '<div class="kv"><span class="k">Seu ritmo real</span><span class="v">' + UI.money(st.pace) + '/mês</span></div>' : '') +
        (st.projectedDate ? '<div class="kv"><span class="k">Previsão no ritmo atual</span><span class="v">' +
          D.fmt(st.projectedDate) + '</span></div>' : '') +
        '<div class="kv"><span class="k">Aportes registrados</span><span class="v">' + contribs.length + '</span></div>' +
        '</div>' + (g.note ? '<p class="fine-print" style="margin-top:11px">💬 ' + esc(g.note) + '</p>' : '') + '</div>' +
        '<div class="btn-row" style="margin-top:12px">' +
        '<button class="btn btn-primary btn-sm" type="button" data-act="goal-contrib" data-id="' + g.id + '">+ Aportar</button>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="goal-edit" data-id="' + g.id + '">✏️ Editar</button>' +
        '</div>' +
        '<div class="section-title"><h3>Histórico de aportes</h3></div>' +
        (contribs.length ? '<div class="list">' + contribs.map(function (c) {
          return '<div class="item"><span class="item-icon" style="background:' + UI.hexA(g.color, .14) + '">' +
            (c.amount < 0 ? '↩︎' : '💰') + '</span>' +
            '<span class="item-body"><span class="item-title">' + esc(D.fmt(c.date)) + '</span>' +
            (c.note ? '<span class="item-meta"><span class="tiny muted">' + esc(c.note) + '</span></span>' : '') + '</span>' +
            '<span class="item-side"><span class="item-amount" style="color:' +
            (c.amount < 0 ? 'var(--expense)' : Chart.incomeColor()) + '">' +
            esc(Money.fmt(c.amount, { sign: true })) + '</span>' +
            '<button class="btn btn-ghost btn-xs" type="button" data-act="contrib-delete" data-id="' + g.id +
            '" data-cid="' + c.id + '">remover</button></span></div>';
        }).join('') + '</div>'
          : '<p class="fine-print center" style="padding:16px 0">Nenhum aporte registrado ainda.</p>'),
        {}
      );
    },

    'contrib-delete': function (ds) {
      var g = DB.data.goals.filter(function (x) { return x.id === ds.id; })[0];
      if (!g) return;
      g.contributions = g.contributions.filter(function (c) { return c.id !== ds.cid; });
      g.saved = g.contributions.reduce(function (s, c) { return s + c.amount; }, 0);
      DB.save();
      UI.actions['goal-detail'](ds);
      UI.ok('Aporte removido');
    },

    'goal-archive': function (ds) {
      var g = DB.data.goals.filter(function (x) { return x.id === ds.id; })[0];
      if (!g) return;
      g.archived = true;
      UI.closeAllSheets();
      UI.commit('Meta arquivada');
    },
    'goal-unarchive': function (ds) {
      var g = DB.data.goals.filter(function (x) { return x.id === ds.id; })[0];
      if (!g) return;
      g.archived = false;
      UI.commit('Meta reativada');
    },
    'goal-delete': function (ds) {
      var g = DB.data.goals.filter(function (x) { return x.id === ds.id; })[0];
      if (!g) return;
      UI.confirm({
        title: 'Excluir a meta?',
        text: '"' + esc(g.name) + '" e seus ' + g.contributions.length +
          ' aporte(s) registrados serão removidos. Os lançamentos do extrato continuam lá.' +
          '<br><br>Se preferir manter o histórico, use <b>Arquivar</b>.',
        confirmLabel: 'Excluir', danger: true
      }).then(function (yes) {
        if (!yes) return;
        DB.data.goals = DB.data.goals.filter(function (x) { return x.id !== ds.id; });
        UI.closeAllSheets();
        UI.commit('Meta excluída');
      });
    }
  });

  /* ═══════════════════════════════════════════
     MEU PLANO
  ═══════════════════════════════════════════ */

  UI.renderers.plan = function () {
    var data = DB.data, plan = data.plan;
    var em = F.emergency(data);
    var cur = D.monthKey(D.today());
    var budget = F.budgetReport(data, cur);
    var avg = F.avgMonthly(data, 3);
    var pf = F.portfolio(data);
    var pool = Math.round(plan.monthlyIncome * plan.groupTargets.futuro / 100);
    var aporte = avg.net > 0 ? avg.net : pool;

    var html = '';

    /* ── renda e divisão ── */
    html += '<div class="card" id="anchor-renda">' +
      '<div class="card-head"><div><h3>Renda e divisão</h3>' +
      '<p class="sub">A base de todo o resto</p></div>' +
      '<button class="btn btn-soft btn-xs" type="button" data-act="edit-income">Editar</button></div>' +
      '<div class="kv-list">' +
      '<div class="kv"><span class="k">Renda mensal declarada</span><span class="v">' + UI.money(plan.monthlyIncome) + '</span></div>' +
      '<div class="kv"><span class="k">Renda média realizada (3 meses)</span><span class="v">' + UI.money(avg.income) + '</span></div>' +
      '<div class="kv"><span class="k">Método</span><span class="v">' +
      plan.groupTargets.essencial + ' / ' + plan.groupTargets.estilo + ' / ' + plan.groupTargets.futuro + '</span></div>' +
      '<div class="kv"><span class="k">Meta de poupança</span><span class="v">' + plan.savingsTargetPct + '%</span></div>' +
      '<div class="kv"><span class="k">Reservado ao futuro</span><span class="v" style="color:' +
      Chart.incomeColor() + '">' + UI.money(pool) + '/mês</span></div>' +
      '</div></div>';

    html += Chart.groups(F.byGroup(data, F.inMonth(data.transactions, cur)),
      plan.monthlyIncome, plan.groupTargets, { method: plan.method });

    /* ── orçamento ── */
    html += '<div class="section-title" id="anchor-orcamento"><h3>Tetos por categoria</h3>' +
      '<button class="link" type="button" data-act="suggest-budgets">Sugerir</button></div>';
    html += Chart.budget(budget);
    html += '<button class="btn btn-ghost btn-block btn-sm" type="button" data-act="edit-budgets" style="margin-bottom:12px">' +
      '🎚️ Ajustar tetos manualmente</button>';

    /* ── reserva ── */
    html += '<div class="card" id="anchor-reserva">' +
      '<div class="card-head"><div><h3>🛡️ Reserva de emergência</h3>' +
      '<p class="sub">' + em.months + ' meses de gastos essenciais</p></div>' +
      '<div>' + Chart.ring(em.pct, em.pct >= 100 ? Chart.incomeColor() : 'var(--warn)', 56) + '</div></div>' +
      '<div class="kv-list">' +
      '<div class="kv"><span class="k">Gasto essencial médio</span><span class="v">' + UI.money(em.monthly) + '/mês</span></div>' +
      '<div class="kv"><span class="k">Alvo</span><span class="v">' + UI.money(em.target) + '</span></div>' +
      '<div class="kv"><span class="k">Você tem</span><span class="v">' + UI.money(em.current) + '</span></div>' +
      '<div class="kv"><span class="k">Cobertura atual</span><span class="v">' + em.coveredMonths + ' meses</span></div>' +
      '</div>' +
      '<p class="fine-print" style="margin-top:11px">Conta como reserva: metas do tipo "reserva de emergência" ' +
      'mais o saldo das contas marcadas como poupança.</p>' +
      (em.pct < 100 ? '<button class="btn btn-soft btn-block btn-sm" type="button" data-act="insight-action" ' +
        'data-kind="new-goal" data-preset="reserva" style="margin-top:11px">Criar meta de reserva</button>' : '') +
      '</div>';

    /* ── expectativas e projeção ── */
    html += '<div class="card" id="anchor-projecao" style="margin-top:12px">' +
      '<div class="card-head"><div><h3>Expectativas</h3>' +
      '<p class="sub">As premissas da sua projeção</p></div>' +
      '<button class="btn btn-soft btn-xs" type="button" data-act="edit-expect">Editar</button></div>' +
      '<div class="kv-list">' +
      '<div class="kv"><span class="k">Perfil de risco</span><span class="v">' + esc(plan.riskProfile) + '</span></div>' +
      '<div class="kv"><span class="k">Horizonte</span><span class="v">' + plan.horizonYears + ' anos</span></div>' +
      '<div class="kv"><span class="k">Retorno esperado</span><span class="v">' + plan.expectedReturnPct + '% a.a.</span></div>' +
      '<div class="kv"><span class="k">Inflação esperada</span><span class="v">' + plan.inflationPct + '% a.a.</span></div>' +
      '</div></div>';

    if (aporte > 0) {
      html += Chart.projection(F.project({
        start: pf.market, monthly: aporte, months: plan.horizonYears * 12,
        annualPct: plan.expectedReturnPct, inflationPct: plan.inflationPct
      }), { subtitle: 'Partindo de ' + Money.fmt(pf.market) + ', aportando ' + Money.fmt(aporte) + '/mês' });
    }

    /* ── recorrências ── */
    var recs = data.recurrences || [];
    var pend = F.pendingRecurrences(data);
    html += '<div class="section-title" id="anchor-recorrencias"><h3>🔁 Lançamentos recorrentes</h3>' +
      '<button class="link" type="button" data-act="add-rec">+ Nova</button></div>';
    if (pend.length) {
      html += '<div class="callout callout-info" style="margin-bottom:10px"><span class="ic">📌</span>' +
        '<span><b>' + pend.length + ' pendente(s)</b> para lançar. ' +
        '<button class="link" type="button" data-act="run-recurrences">Lançar agora</button></span></div>';
    }
    html += recs.length
      ? '<div class="list">' + recs.map(function (r) {
        var c = F.cat(data, r.categoryId);
        return '<button class="item" type="button" data-act="rec-edit" data-id="' + r.id + '">' +
          '<span class="item-icon" style="background:' + UI.hexA(c.color, .14) + '">' + c.emoji + '</span>' +
          '<span class="item-body"><span class="item-title truncate">' + esc(r.desc) + '</span>' +
          '<span class="item-meta"><span class="tiny muted">' +
          (r.frequency === 'monthly' ? 'todo dia ' + r.dayOfMonth : r.frequency === 'weekly' ? 'toda ' + D.DIA_CURTO[r.weekday] : 'todo ano') +
          (r.active ? '' : ' · pausada') + '</span></span></span>' +
          '<span class="item-amount" style="color:' + (r.type === 'income' ? Chart.incomeColor() : 'var(--expense)') + '">' +
          (r.type === 'income' ? '+' : '−') + esc(Money.fmt(r.amount)) + '</span></button>';
      }).join('') + '</div>'
      : '<div class="empty"><span class="ic">🔁</span><h4>Nenhuma recorrência</h4>' +
      '<p>Cadastre aluguel, salário e assinaturas uma vez — o app lança automaticamente todo mês.</p>' +
      '<button class="btn btn-soft btn-sm" type="button" data-act="add-rec">Cadastrar</button></div>';

    /* ── assinaturas detectadas ── */
    var subs = F.detectSubscriptions(data);
    if (subs.length) {
      html += '<div class="section-title"><h3>🔎 Cobranças repetidas detectadas</h3></div>' +
        '<div class="card card-tight"><p class="fine-print" style="margin-bottom:11px">' +
        'Lançamentos com o mesmo valor em 3 meses ou mais. Somam <b>' +
        esc(Money.fmt(subs.reduce(function (s, x) { return s + x.amount; }, 0))) + '/mês</b> (' +
        esc(Money.fmt(subs.reduce(function (s, x) { return s + x.yearly; }, 0))) + '/ano).</p>' +
        '<div class="list">' + subs.slice(0, 8).map(function (s, i) {
          var c = F.cat(data, s.categoryId);
          return '<div class="item"><span class="item-icon" style="background:' + UI.hexA(c.color, .14) + '">' + c.emoji + '</span>' +
            '<span class="item-body"><span class="item-title truncate">' + esc(s.desc) + '</span>' +
            '<span class="item-meta"><span class="tiny muted">visto em ' + s.months + ' meses · ' +
            esc(Money.fmt(s.yearly)) + '/ano</span></span></span>' +
            '<button class="btn btn-soft btn-xs" type="button" data-act="sub-to-rec" data-i="' + i + '">cadastrar</button></div>';
        }).join('') + '</div></div>';
      Dm._subsCache = subs;
    }

    /* ── gerenciadores ── */
    html += '<div class="section-title"><h3>Gerenciar</h3></div>' +
      '<div class="menu-list">' +
      menuItem('categories', '🏷️', 'Categorias', data.categories.length + ' categorias · crie, renomeie, mude cor') +
      menuItem('accounts', '🏦', 'Contas e carteiras', data.accounts.length + ' contas · saldo inicial de cada uma') +
      menuItem('rerun-wizard', '🧭', 'Refazer o assistente', 'Remonta o plano do zero, mantendo seus lançamentos') +
      '</div>';

    document.getElementById('plan-content').innerHTML = html;
  };

  function menuItem(act, icon, title, sub, extra) {
    return '<button class="menu-item" type="button" data-act="' + act + '"' + (extra || '') + '>' +
      '<span class="mi-ic">' + icon + '</span>' +
      '<span class="mi-text"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></span>' +
      '<span class="mi-arrow">›</span></button>';
  }

  UI.register({
    'edit-income': function () {
      var plan = DB.data.plan;
      var METHODS = [
        { id: '50-30-20', t: { essencial: 50, estilo: 30, futuro: 20 }, n: '50/30/20' },
        { id: '70-20-10', t: { essencial: 70, estilo: 20, futuro: 10 }, n: '70/20/10' },
        { id: '60-20-20', t: { essencial: 60, estilo: 20, futuro: 20 }, n: '60/20/20' },
        { id: 'agressivo', t: { essencial: 50, estilo: 20, futuro: 30 }, n: '50/20/30' }
      ];
      UI.openSheet(
        UI.sheetHead('Renda e divisão') +
        '<div class="field"><label for="p-income">Renda mensal</label>' +
        '<input type="text" id="p-income" class="input-amount" inputmode="decimal" ' +
        'value="' + (plan.monthlyIncome ? Money.plain(plan.monthlyIncome) : '') + '" />' +
        '<p class="hint center" id="p-income-echo"></p></div>' +
        '<div class="field"><label for="p-payday">Dia do recebimento</label>' +
        '<input type="number" id="p-payday" min="1" max="31" value="' + plan.payday + '" /></div>' +
        '<label class="label">Método de divisão</label>' +
        '<div class="chip-scroll" data-picker="method">' +
        METHODS.map(function (m) {
          return '<button class="chip' + (m.id === plan.method ? ' active' : '') + '" type="button" ' +
            'data-pick="' + m.id + '" data-t=\'' + JSON.stringify(m.t) + '\'>' + m.n + '</button>';
        }).join('') +
        '<button class="chip' + (plan.method === 'custom' ? ' active' : '') + '" type="button" data-pick="custom">Personalizado</button>' +
        '</div>' +
        '<div class="field" style="margin-top:14px"><label>Essencial: <b id="p-e-val">' + plan.groupTargets.essencial + '%</b></label>' +
        '<input type="range" id="p-ess" min="0" max="100" value="' + plan.groupTargets.essencial + '" /></div>' +
        '<div class="field"><label>Estilo de vida: <b id="p-s-val">' + plan.groupTargets.estilo + '%</b></label>' +
        '<input type="range" id="p-est" min="0" max="100" value="' + plan.groupTargets.estilo + '" /></div>' +
        '<div class="field"><label>Futuro: <b id="p-f-val">' + plan.groupTargets.futuro + '%</b></label>' +
        '<input type="range" id="p-fut" min="0" max="100" value="' + plan.groupTargets.futuro + '" /></div>' +
        '<p class="hint" id="p-sum"></p>' +
        '<button class="btn btn-primary btn-block" type="button" id="p-save" style="margin-top:16px">Salvar</button>',
        {
          onOpen: function (body) {
            UI.bindPickers(body);
            UI.bindAmountField(body, 'p-income', 'p-income-echo');
            var ess = body.querySelector('#p-ess'), est = body.querySelector('#p-est'), fut = body.querySelector('#p-fut');
            var upd = function () {
              body.querySelector('#p-e-val').textContent = ess.value + '%';
              body.querySelector('#p-s-val').textContent = est.value + '%';
              body.querySelector('#p-f-val').textContent = fut.value + '%';
              var sum = +ess.value + +est.value + +fut.value;
              var el = body.querySelector('#p-sum');
              var income = Money.parse(body.querySelector('#p-income').value) || 0;
              el.innerHTML = 'Soma: <b>' + sum + '%</b>' +
                (sum !== 100 ? ' <span style="color:var(--warn)">— o ideal é fechar em 100%</span>' : ' ✓') +
                (income ? '<br>Futuro = ' + esc(Money.fmt(Math.round(income * fut.value / 100))) + '/mês' : '');
            };
            [ess, est, fut].forEach(function (i) { i.addEventListener('input', upd); });
            body.querySelector('#p-income').addEventListener('input', upd);
            body.querySelector('[data-picker="method"]').addEventListener('click', function (e) {
              var b = e.target.closest('[data-pick]');
              if (!b || !b.getAttribute('data-t')) return;
              var t = JSON.parse(b.getAttribute('data-t'));
              ess.value = t.essencial; est.value = t.estilo; fut.value = t.futuro;
              upd();
            });
            upd();
            body.querySelector('#p-save').addEventListener('click', function () {
              var inc = UI.readAmount(body, 'p-income');
              DB.data.plan.monthlyIncome = isFinite(inc) ? inc : 0;
              DB.data.plan.payday = clamp(parseInt(UI.val(body, 'p-payday'), 10) || 5, 1, 31);
              DB.data.plan.method = UI.pick.method || 'custom';
              DB.data.plan.groupTargets = {
                essencial: +ess.value, estilo: +est.value, futuro: +fut.value
              };
              DB.data.plan.savingsTargetPct = +fut.value;
              DB.data.plan.updatedAt = new Date().toISOString();
              UI.closeSheet();
              UI.commit('Plano atualizado');
            });
          }
        }
      );
    },

    'edit-expect': function () {
      var plan = DB.data.plan;
      UI.openSheet(
        UI.sheetHead('Expectativas', { sub: 'Premissas que alimentam a projeção e algumas recomendações.' }) +
        '<label class="label">Perfil de risco</label>' +
        '<div class="segmented" data-picker="risk" id="e-risk">' +
        ['conservador', 'moderado', 'arrojado'].map(function (r) {
          return '<button type="button" class="' + (plan.riskProfile === r ? 'active' : '') + '" data-pick="' + r + '">' +
            r.charAt(0).toUpperCase() + r.slice(1) + '</button>';
        }).join('') + '</div>' +
        '<div class="field" style="margin-top:16px"><label>Horizonte: <b id="e-h-val">' + plan.horizonYears + ' anos</b></label>' +
        '<input type="range" id="e-horizon" min="1" max="40" value="' + plan.horizonYears + '" /></div>' +
        '<div class="field"><label>Retorno esperado: <b id="e-r-val">' + plan.expectedReturnPct + '% a.a.</b></label>' +
        '<input type="range" id="e-ret" min="0" max="25" step="0.5" value="' + plan.expectedReturnPct + '" /></div>' +
        '<div class="field"><label>Inflação esperada: <b id="e-i-val">' + plan.inflationPct + '% a.a.</b></label>' +
        '<input type="range" id="e-infl" min="0" max="20" step="0.5" value="' + plan.inflationPct + '" /></div>' +
        '<div class="field"><label>Meses de reserva: <b id="e-e-val">' + plan.emergencyMonths + '</b></label>' +
        '<input type="range" id="e-emerg" min="1" max="24" value="' + plan.emergencyMonths + '" /></div>' +
        '<p class="fine-print">O retorno real depende dos seus investimentos e do mercado. ' +
        'Estes números são a <em>sua</em> premissa, não uma previsão do app.</p>' +
        '<button class="btn btn-primary btn-block" type="button" id="e-save" style="margin-top:16px">Salvar</button>',
        {
          onOpen: function (body) {
            UI.bindPickers(body);
            /* o segmentado também é um picker: repinta o ativo */
            body.querySelector('#e-risk').addEventListener('click', function (e) {
              var b = e.target.closest('[data-pick]');
              if (!b) return;
              body.querySelectorAll('#e-risk button').forEach(function (x) { x.classList.remove('active'); });
              b.classList.add('active');
            });
            var bind = function (id, out, fmt) {
              var inp = body.querySelector('#' + id), l = body.querySelector('#' + out);
              inp.addEventListener('input', function () { l.textContent = fmt(inp.value); });
            };
            bind('e-horizon', 'e-h-val', function (v) { return v + (v === '1' ? ' ano' : ' anos'); });
            bind('e-ret', 'e-r-val', function (v) { return v + '% a.a.'; });
            bind('e-infl', 'e-i-val', function (v) { return v + '% a.a.'; });
            bind('e-emerg', 'e-e-val', function (v) { return v; });
            body.querySelector('#e-save').addEventListener('click', function () {
              var p = DB.data.plan;
              p.riskProfile = UI.pick.risk || p.riskProfile;
              p.horizonYears = parseInt(UI.val(body, 'e-horizon'), 10) || 10;
              p.expectedReturnPct = parseFloat(UI.val(body, 'e-ret'));
              p.inflationPct = parseFloat(UI.val(body, 'e-infl'));
              p.emergencyMonths = parseInt(UI.val(body, 'e-emerg'), 10) || 6;
              p.updatedAt = new Date().toISOString();
              UI.closeSheet();
              UI.commit('Expectativas atualizadas');
            });
          }
        }
      );
    },

    'suggest-budgets': function () {
      var data = DB.data;
      if (!data.plan.monthlyIncome) {
        UI.err('Informe sua renda mensal primeiro.');
        UI.actions['edit-income']();
        return;
      }
      var sug = F.suggestBudgets(data, data.plan.monthlyIncome, data.plan.groupTargets);
      var idx = F.catIndex(data);
      var keys = Object.keys(sug);
      if (!keys.length) { UI.err('Não há categorias para distribuir.'); return; }
      UI.confirm({
        title: 'Aplicar tetos sugeridos?',
        text: 'Distribuí ' + esc(Money.fmt(Math.round(data.plan.monthlyIncome *
          (data.plan.groupTargets.essencial + data.plan.groupTargets.estilo) / 100))) +
          ' entre ' + keys.length + ' categorias, usando o peso dos seus últimos 3 meses onde há histórico.',
        extra: '<div class="list" style="max-height:230px;overflow:auto;margin-top:12px">' +
          keys.sort(function (a, b) { return sug[b] - sug[a]; }).map(function (k) {
            var c = idx[k] || {};
            return '<div class="item"><span class="item-icon" style="background:' + UI.hexA(c.color || '#6b7280', .14) + '">' +
              (c.emoji || '📦') + '</span><span class="item-body"><span class="item-title">' + esc(c.name || k) + '</span></span>' +
              '<span class="item-amount">' + esc(Money.fmt(sug[k])) + '</span></div>';
          }).join('') + '</div>',
        confirmLabel: 'Aplicar'
      }).then(function (yes) {
        if (!yes) return;
        DB.data.plan.budgets = sug;
        DB.data.plan.updatedAt = new Date().toISOString();
        UI.commit('Tetos aplicados');
      });
    },

    'edit-budgets': function () {
      var data = DB.data;
      var cats = data.categories.filter(function (c) { return c.kind === 'expense' && !c.archived; });
      UI.openSheet(
        UI.sheetHead('Tetos por categoria', {
          sub: 'Deixe em branco ou zero para não acompanhar teto numa categoria.'
        }) +
        '<div id="b-rows">' + cats.map(function (c) {
          var v = F.budgetOf(data, c.id);
          return '<div class="field" style="margin-bottom:10px"><label>' + c.emoji + ' ' + esc(c.name) +
            ' <span class="muted">(' + c.group + ')</span></label>' +
            '<div class="input-prefix"><span class="pfx">R$</span>' +
            '<input type="text" inputmode="decimal" data-bcat="' + c.id + '" value="' + (v ? Money.plain(v) : '') + '" />' +
            '</div></div>';
        }).join('') + '</div>' +
        '<p class="hint" id="b-total"></p>' +
        '<button class="btn btn-primary btn-block" type="button" id="b-save" style="margin-top:14px">Salvar tetos</button>',
        {
          onOpen: function (body) {
            var upd = function () {
              var sum = 0;
              body.querySelectorAll('[data-bcat]').forEach(function (i) {
                var v = Money.parse(i.value);
                if (isFinite(v) && v > 0) sum += v;
              });
              var inc = DB.data.plan.monthlyIncome;
              body.querySelector('#b-total').innerHTML = 'Soma dos tetos: <b>' + esc(Money.fmt(sum)) + '</b>' +
                (inc ? ' = ' + Money.pctOf(sum, inc) + '% da sua renda' : '');
            };
            body.querySelectorAll('[data-bcat]').forEach(function (i) { i.addEventListener('input', upd); });
            upd();
            body.querySelector('#b-save').addEventListener('click', function () {
              var out = {};
              body.querySelectorAll('[data-bcat]').forEach(function (i) {
                var v = Money.parse(i.value);
                if (isFinite(v) && v > 0) out[i.getAttribute('data-bcat')] = Math.abs(v);
              });
              DB.data.plan.budgets = out;
              DB.data.plan.updatedAt = new Date().toISOString();
              UI.closeSheet();
              UI.commit('Tetos salvos');
            });
          }
        }
      );
    },

    'add-rec': function () { UI.openRecSheet(null); },
    'rec-edit': function (ds) { UI.openRecSheet(ds.id); },

    'sub-to-rec': function (ds) {
      var s = (Dm._subsCache || [])[+ds.i];
      if (!s) return;
      UI.openRecSheet(null, s);
    },

    'run-recurrences': function () { Dm.runRecurrencesNow(); },

    'rerun-wizard': function () {
      UI.confirm({
        title: 'Refazer o assistente?',
        text: 'Você responde tudo de novo e o plano é remontado. Seus lançamentos, metas e notas ' +
          'existentes <b>não são apagados</b> — e um ponto de restauração é criado antes.',
        confirmLabel: 'Refazer'
      }).then(function (yes) {
        if (!yes) return;
        DB.snapshot('Antes de refazer o assistente', 'manual').then(function () {
          UI.closeAllSheets();
          Dm.Wizard.start();
        });
      });
    },

    'categories': function () { UI.openCategoriesSheet(); },
    'accounts': function () { UI.openAccountsSheet(); }
  });

  UI.openRecSheet = function (recId, fromSub) {
    var data = DB.data;
    var r = recId ? data.recurrences.filter(function (x) { return x.id === recId; })[0] : null;
    var isEdit = !!r;
    var base = r || (fromSub ? {
      desc: fromSub.desc, amount: fromSub.amount, type: 'expense',
      categoryId: fromSub.categoryId, accountId: fromSub.accountId,
      frequency: 'monthly', dayOfMonth: fromSub.dayOfMonth, weekday: 1,
      startDate: D.today(), endDate: null, active: true
    } : {
      desc: '', amount: 0, type: 'expense', categoryId: 'cat_contas', accountId: 'acc_corrente',
      frequency: 'monthly', dayOfMonth: 5, weekday: 1, startDate: D.today(), endDate: null, active: true
    });

    UI.openSheet(
      UI.sheetHead(isEdit ? 'Editar recorrência' : 'Nova recorrência', {
        flag: isEdit ? 'Editando' : null,
        sub: 'O app lança isso automaticamente quando a data chega. Você confirma antes de entrar no extrato.'
      }) +
      '<div class="segmented" id="r-type" style="margin-bottom:14px">' +
      '<button type="button" class="is-income' + (base.type === 'income' ? ' active' : '') + '" data-type="income">↑ Receita</button>' +
      '<button type="button" class="is-expense' + (base.type === 'expense' ? ' active' : '') + '" data-type="expense">↓ Despesa</button>' +
      '</div>' +
      '<div class="field"><label for="r-desc">Descrição</label>' +
      '<input type="text" id="r-desc" maxlength="120" placeholder="ex: Aluguel" value="' + esc(base.desc) + '" /></div>' +
      '<div class="field"><label for="r-amount">Valor</label>' +
      '<div class="input-prefix"><span class="pfx">R$</span>' +
      '<input type="text" id="r-amount" inputmode="decimal" value="' + (base.amount ? Money.plain(base.amount) : '') + '" /></div></div>' +
      '<label class="label">Categoria</label><div id="r-cats">' + UI.categoryGrid(base.type, base.categoryId, 'categoryId') + '</div>' +
      '<div class="field" style="margin-top:14px"><label>Frequência</label>' +
      '<div class="segmented" id="r-freq">' +
      [['monthly', 'Mensal'], ['weekly', 'Semanal'], ['yearly', 'Anual']].map(function (p) {
        return '<button type="button" class="' + (base.frequency === p[0] ? 'active' : '') + '" data-f="' + p[0] + '">' + p[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field" id="r-dom-wrap"><label for="r-dom">Dia do mês</label>' +
      '<input type="number" id="r-dom" min="1" max="31" value="' + base.dayOfMonth + '" />' +
      '<p class="hint">Em meses mais curtos, cai no último dia disponível.</p></div>' +
      '<div class="field" id="r-dow-wrap" hidden><label for="r-dow">Dia da semana</label>' +
      '<select id="r-dow">' + D.DIA_CURTO.map(function (d, i) {
        return '<option value="' + i + '"' + (base.weekday === i ? ' selected' : '') + '>' + d + '</option>';
      }).join('') + '</select></div>' +
      '<div class="split" style="margin-top:0">' +
      '<div class="field"><label for="r-start">Começa em</label>' +
      '<input type="date" id="r-start" value="' + esc(base.startDate) + '" /></div>' +
      '<div class="field"><label for="r-end">Termina em</label>' +
      '<input type="date" id="r-end" value="' + esc(base.endDate || '') + '" /></div></div>' +
      '<div class="switch-row"><div class="sr-text"><b>Ativa</b><span>Desligue para pausar sem excluir.</span></div>' +
      '<label class="switch"><input type="checkbox" id="r-active"' + (base.active ? ' checked' : '') + ' /><i></i></label></div>' +
      '<button class="btn btn-primary btn-block" type="button" id="r-save" style="margin-top:16px">' +
      (isEdit ? 'Salvar' : 'Criar recorrência') + '</button>' +
      (isEdit ? '<button class="btn btn-danger btn-block btn-sm" type="button" data-act="rec-delete" data-id="' +
        r.id + '" style="margin-top:9px">Excluir recorrência</button>' : ''),
      {
        onOpen: function (body) {
          UI.bindPickers(body);
          var curType = base.type, curFreq = base.frequency;
          body.querySelector('#r-type').addEventListener('click', function (e) {
            var b = e.target.closest('[data-type]');
            if (!b) return;
            curType = b.getAttribute('data-type');
            body.querySelectorAll('#r-type button').forEach(function (x) { x.classList.remove('active'); });
            b.classList.add('active');
            body.querySelector('#r-cats').innerHTML = UI.categoryGrid(curType,
              curType === 'income' ? 'cat_salario' : 'cat_contas', 'categoryId');
            UI.bindPickers(body);
          });
          body.querySelector('#r-freq').addEventListener('click', function (e) {
            var b = e.target.closest('[data-f]');
            if (!b) return;
            curFreq = b.getAttribute('data-f');
            body.querySelectorAll('#r-freq button').forEach(function (x) { x.classList.remove('active'); });
            b.classList.add('active');
            body.querySelector('#r-dom-wrap').hidden = curFreq === 'weekly';
            body.querySelector('#r-dow-wrap').hidden = curFreq !== 'weekly';
          });
          body.querySelector('#r-dom-wrap').hidden = curFreq === 'weekly';
          body.querySelector('#r-dow-wrap').hidden = curFreq !== 'weekly';

          body.querySelector('#r-save').addEventListener('click', function () {
            var desc = UI.val(body, 'r-desc');
            var amt = Money.parse(UI.val(body, 'r-amount'));
            if (!desc) { UI.err('Informe a descrição.'); return; }
            if (!isFinite(amt) || amt === 0) { UI.err('Informe o valor.'); return; }
            var end = UI.val(body, 'r-end');
            var payload = {
              desc: desc, amount: Math.abs(amt), type: curType,
              categoryId: UI.pick.categoryId || base.categoryId,
              accountId: base.accountId || 'acc_corrente',
              frequency: curFreq,
              dayOfMonth: clamp(parseInt(UI.val(body, 'r-dom'), 10) || 5, 1, 31),
              weekday: parseInt(UI.val(body, 'r-dow'), 10) || 0,
              startDate: UI.val(body, 'r-start') || D.today(),
              endDate: D.isValid(end) ? end : null,
              active: UI.checked(body, 'r-active')
            };
            if (isEdit) Object.keys(payload).forEach(function (k) { r[k] = payload[k]; });
            else DB.data.recurrences.push(Object.assign({ id: uid('rec'), lastRun: null }, payload));
            UI.closeSheet();
            UI.commit(isEdit ? 'Recorrência salva' : 'Recorrência criada 🔁');
          });
        }
      }
    );
  };

  UI.register({
    'rec-delete': function (ds) {
      UI.confirm({
        title: 'Excluir recorrência?',
        text: 'Os lançamentos já criados por ela continuam no extrato. Só a regra é removida.',
        confirmLabel: 'Excluir', danger: true
      }).then(function (yes) {
        if (!yes) return;
        DB.data.recurrences = DB.data.recurrences.filter(function (x) { return x.id !== ds.id; });
        UI.closeAllSheets();
        UI.commit('Recorrência excluída');
      });
    }
  });

  /* ═══════════════════════════════════════════
     CATEGORIAS E CONTAS
  ═══════════════════════════════════════════ */

  UI.openCategoriesSheet = function () {
    var data = DB.data;
    var render = function () {
      var byKind = { expense: [], income: [] };
      data.categories.forEach(function (c) { (byKind[c.kind] || byKind.expense).push(c); });
      return UI.sheetHead('Categorias', { sub: 'Use grupos para o método 50/30/20 funcionar: essencial, estilo de vida ou futuro.' }) +
        '<button class="btn btn-soft btn-block btn-sm" type="button" data-act="cat-new" style="margin-bottom:14px">+ Nova categoria</button>' +
        ['expense', 'income'].map(function (k) {
          return '<div class="section-title"><h3>' + (k === 'expense' ? 'Despesas' : 'Receitas') + '</h3></div>' +
            '<div class="list">' + byKind[k].map(function (c) {
              var budget = F.budgetOf(data, c.id);
              return '<button class="item" type="button" data-act="cat-edit" data-id="' + c.id + '">' +
                '<span class="item-icon" style="background:' + UI.hexA(c.color, .14) +
                ';border:1px solid ' + UI.hexA(c.color, .34) + '">' + c.emoji + '</span>' +
                '<span class="item-body"><span class="item-title">' + esc(c.name) +
                (c.archived ? ' <span class="badge badge-warn">oculta</span>' : '') + '</span>' +
                '<span class="item-meta"><span class="tiny muted">' + esc(c.group) +
                (budget ? ' · teto ' + Money.fmt(budget) : '') + '</span></span></span>' +
                '<span class="mi-arrow muted">›</span></button>';
            }).join('') + '</div>';
        }).join('');
    };
    UI.openSheet(render(), {});
  };

  var GROUPS = [['essencial', 'Essencial'], ['estilo', 'Estilo de vida'], ['futuro', 'Futuro'], ['renda', 'Renda']];

  UI.register({
    'cat-new': function () { UI.openCatEditor(null); },
    'cat-edit': function (ds) { UI.openCatEditor(ds.id); },

    'cat-save': function (ds, el) {
      var body = el.closest('#sheet2-body') || el.closest('#sheet-body');
      var id = ds.id || null;
      var name = UI.val(body, 'c-name');
      if (!name) { UI.err('Dê um nome à categoria.'); return; }
      var kind = body.querySelector('#c-kind-exp').classList.contains('active') ? 'expense' : 'income';
      var budget = Money.parse(UI.val(body, 'c-budget'));
      var payload = {
        name: name, emoji: UI.pick.catEmoji || '📦', color: UI.pick.catColor || '#6b7280',
        kind: kind, group: UI.val(body, 'c-group') || (kind === 'income' ? 'renda' : 'estilo'),
        archived: UI.checked(body, 'c-archived')
      };
      if (id) {
        var c = DB.data.categories.filter(function (x) { return x.id === id; })[0];
        if (c) Object.keys(payload).forEach(function (k) { c[k] = payload[k]; });
      } else {
        id = uid('cat');
        DB.data.categories.push(Object.assign({ id: id, budget: 0, system: false }, payload));
      }
      if (isFinite(budget) && budget > 0) DB.data.plan.budgets[id] = Math.abs(budget);
      else delete DB.data.plan.budgets[id];
      UI.closeSheet(2);
      DB.save();
      UI.openCategoriesSheet();
      UI.ok('Categoria salva');
    },

    'cat-delete': function (ds) {
      var c = DB.data.categories.filter(function (x) { return x.id === ds.id; })[0];
      if (!c) return;
      var used = DB.data.transactions.filter(function (t) { return t.categoryId === ds.id; }).length;
      if (c.system) {
        UI.err('Categorias padrão não podem ser excluídas — oculte-a em vez disso.');
        return;
      }
      UI.confirm({
        title: 'Excluir categoria?',
        text: used
          ? '<b>' + used + ' lançamento(s)</b> usam "' + esc(c.name) + '". Eles serão movidos para "' +
          (c.kind === 'income' ? 'Outras receitas' : 'Outros') + '".'
          : 'A categoria "' + esc(c.name) + '" será removida.',
        confirmLabel: 'Excluir', danger: true
      }).then(function (yes) {
        if (!yes) return;
        var fallback = c.kind === 'income' ? 'cat_outras_receitas' : 'cat_outros';
        DB.data.transactions.forEach(function (t) { if (t.categoryId === ds.id) t.categoryId = fallback; });
        DB.data.recurrences.forEach(function (r) { if (r.categoryId === ds.id) r.categoryId = fallback; });
        DB.data.categories = DB.data.categories.filter(function (x) { return x.id !== ds.id; });
        delete DB.data.plan.budgets[ds.id];
        UI.closeSheet(2);
        DB.save();
        UI.openCategoriesSheet();
        UI.ok('Categoria excluída');
      });
    }
  });

  UI.openCatEditor = function (catId) {
    var c = catId ? DB.data.categories.filter(function (x) { return x.id === catId; })[0] : null;
    var base = c || { name: '', emoji: '📦', color: '#6b7280', kind: 'expense', group: 'estilo', archived: false };
    var budget = c ? F.budgetOf(DB.data, c.id) : 0;
    UI.openSheet(
      UI.sheetHead(c ? 'Editar categoria' : 'Nova categoria', { level: 2 }) +
      '<div class="field"><label for="c-name">Nome</label>' +
      '<input type="text" id="c-name" maxlength="40" value="' + esc(base.name) + '" /></div>' +
      '<div class="segmented" style="margin-bottom:14px">' +
      '<button type="button" id="c-kind-exp" class="' + (base.kind === 'expense' ? 'active' : '') + '">Despesa</button>' +
      '<button type="button" id="c-kind-inc" class="' + (base.kind === 'income' ? 'active' : '') + '">Receita</button>' +
      '</div>' +
      '<div class="field"><label for="c-group">Grupo (para o 50/30/20)</label>' +
      '<select id="c-group">' + GROUPS.map(function (g) {
        return '<option value="' + g[0] + '"' + (base.group === g[0] ? ' selected' : '') + '>' + g[1] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label for="c-budget">Teto mensal (opcional)</label>' +
      '<div class="input-prefix"><span class="pfx">R$</span>' +
      '<input type="text" id="c-budget" inputmode="decimal" value="' + (budget ? Money.plain(budget) : '') + '" /></div></div>' +
      '<label class="label">Ícone</label>' +
      '<div class="chip-scroll" data-picker="catEmoji">' +
      ['🍔', '🛒', '🚗', '🏠', '💡', '💊', '📚', '🎮', '🛍️', '🔁', '🧾', '🏛️', '📈', '📦', '💼', '🧑‍💻', '📊', '💰', '🎁', '📥', '🐶', '👶', '✈️', '🎸']
        .map(function (e) {
          return '<button class="chip' + (e === base.emoji ? ' active' : '') + '" type="button" data-pick="' + e +
            '" style="font-size:1.05rem;padding:5px 10px">' + e + '</button>';
        }).join('') + '</div>' +
      '<label class="label" style="margin-top:14px">Cor</label>' + UI.colorPicker(base.color, 'catColor') +
      '<div class="switch-row" style="margin-top:14px"><div class="sr-text"><b>Ocultar da lista</b>' +
      '<span>Some dos formulários sem afetar lançamentos antigos.</span></div>' +
      '<label class="switch"><input type="checkbox" id="c-archived"' + (base.archived ? ' checked' : '') + ' /><i></i></label></div>' +
      '<button class="btn btn-primary btn-block" type="button" data-act="cat-save" data-id="' + (catId || '') + '" style="margin-top:16px">Salvar</button>' +
      (c && !c.system ? '<button class="btn btn-danger btn-block btn-sm" type="button" data-act="cat-delete" data-id="' +
        c.id + '" style="margin-top:9px">Excluir categoria</button>' : ''),
      {
        level: 2,
        onOpen: function (body) {
          UI.bindPickers(body);
          var exp = body.querySelector('#c-kind-exp'), inc = body.querySelector('#c-kind-inc');
          var sel = function (isExp) {
            exp.classList.toggle('active', isExp);
            inc.classList.toggle('active', !isExp);
            body.querySelector('#c-group').value = isExp ? 'estilo' : 'renda';
          };
          exp.addEventListener('click', function () { sel(true); });
          inc.addEventListener('click', function () { sel(false); });
        }
      }
    );
  };

  UI.openAccountsSheet = function () {
    var data = DB.data;
    var bal = F.accountBalances(data);
    UI.openSheet(
      UI.sheetHead('Contas e carteiras', {
        sub: 'O saldo inicial é quanto já existia na conta antes de você começar a usar o app.'
      }) +
      '<button class="btn btn-soft btn-block btn-sm" type="button" data-act="acc-new" style="margin-bottom:14px">+ Nova conta</button>' +
      '<div class="list">' + data.accounts.map(function (a) {
        return '<button class="item" type="button" data-act="acc-edit" data-id="' + a.id + '">' +
          '<span class="item-icon" style="background:' + UI.hexA(a.color, .14) +
          ';border:1px solid ' + UI.hexA(a.color, .34) + '">' + a.emoji + '</span>' +
          '<span class="item-body"><span class="item-title">' + esc(a.name) +
          (a.archived ? ' <span class="badge badge-warn">oculta</span>' : '') + '</span>' +
          '<span class="item-meta"><span class="tiny muted">saldo inicial ' + Money.fmt(a.opening) + '</span></span></span>' +
          '<span class="item-amount">' + UI.money(bal[a.id] || 0) + '</span></button>';
      }).join('') + '</div>' +
      '<p class="fine-print" style="margin-top:12px">Total: <b>' + esc(Money.fmt(F.balance(data))) + '</b></p>',
      {}
    );
  };

  var ACC_KINDS = [['checking', 'Conta corrente'], ['savings', 'Poupança / reserva'], ['cash', 'Dinheiro'], ['credit', 'Cartão de crédito'], ['invest', 'Investimento']];

  UI.register({
    'acc-new': function () { UI.openAccEditor(null); },
    'acc-edit': function (ds) { UI.openAccEditor(ds.id); },

    'acc-save': function (ds, el) {
      var body = el.closest('#sheet2-body');
      var name = UI.val(body, 'a-name');
      if (!name) { UI.err('Dê um nome à conta.'); return; }
      var opening = Money.parse(UI.val(body, 'a-opening'));
      var payload = {
        name: name, emoji: UI.pick.accEmoji || '🏦', color: UI.pick.accColor || '#3987e5',
        kind: UI.val(body, 'a-kind') || 'checking',
        opening: isFinite(opening) ? opening : 0,
        archived: UI.checked(body, 'a-archived')
      };
      if (ds.id) {
        var a = DB.data.accounts.filter(function (x) { return x.id === ds.id; })[0];
        if (a) Object.keys(payload).forEach(function (k) { a[k] = payload[k]; });
      } else {
        DB.data.accounts.push(Object.assign({ id: uid('acc'), system: false }, payload));
      }
      UI.closeSheet(2);
      DB.save();
      UI.openAccountsSheet();
      UI.ok('Conta salva');
    },

    'acc-delete': function (ds) {
      var a = DB.data.accounts.filter(function (x) { return x.id === ds.id; })[0];
      if (!a) return;
      if (a.system) { UI.err('Contas padrão não podem ser excluídas — oculte-a em vez disso.'); return; }
      var used = DB.data.transactions.filter(function (t) { return t.accountId === ds.id; }).length;
      UI.confirm({
        title: 'Excluir conta?',
        text: used ? '<b>' + used + ' lançamento(s)</b> serão movidos para a Conta Corrente.'
          : 'A conta "' + esc(a.name) + '" será removida.',
        confirmLabel: 'Excluir', danger: true
      }).then(function (yes) {
        if (!yes) return;
        DB.data.transactions.forEach(function (t) { if (t.accountId === ds.id) t.accountId = 'acc_corrente'; });
        DB.data.accounts = DB.data.accounts.filter(function (x) { return x.id !== ds.id; });
        UI.closeSheet(2);
        DB.save();
        UI.openAccountsSheet();
        UI.ok('Conta excluída');
      });
    }
  });

  UI.openAccEditor = function (accId) {
    var a = accId ? DB.data.accounts.filter(function (x) { return x.id === accId; })[0] : null;
    var base = a || { name: '', emoji: '🏦', color: '#3987e5', kind: 'checking', opening: 0, archived: false };
    UI.openSheet(
      UI.sheetHead(a ? 'Editar conta' : 'Nova conta', { level: 2 }) +
      '<div class="field"><label for="a-name">Nome</label>' +
      '<input type="text" id="a-name" maxlength="40" value="' + esc(base.name) + '" /></div>' +
      '<div class="field"><label for="a-kind">Tipo</label><select id="a-kind">' +
      ACC_KINDS.map(function (k) {
        return '<option value="' + k[0] + '"' + (base.kind === k[0] ? ' selected' : '') + '>' + k[1] + '</option>';
      }).join('') + '</select>' +
      '<p class="hint">Contas do tipo "Poupança / reserva" entram no cálculo da sua reserva de emergência.</p></div>' +
      '<div class="field"><label for="a-opening">Saldo inicial</label>' +
      '<div class="input-prefix"><span class="pfx">R$</span>' +
      '<input type="text" id="a-opening" inputmode="decimal" value="' + (base.opening ? Money.plain(base.opening) : '') + '" /></div></div>' +
      '<label class="label">Ícone</label>' +
      '<div class="chip-scroll" data-picker="accEmoji">' +
      ['🏦', '👛', '🐷', '💳', '📈', '💵', '🪙', '🏧', '📱'].map(function (e) {
        return '<button class="chip' + (e === base.emoji ? ' active' : '') + '" type="button" data-pick="' + e +
          '" style="font-size:1.05rem;padding:5px 10px">' + e + '</button>';
      }).join('') + '</div>' +
      '<label class="label" style="margin-top:14px">Cor</label>' + UI.colorPicker(base.color, 'accColor') +
      '<div class="switch-row" style="margin-top:14px"><div class="sr-text"><b>Ocultar</b>' +
      '<span>Some dos formulários; lançamentos antigos continuam válidos.</span></div>' +
      '<label class="switch"><input type="checkbox" id="a-archived"' + (base.archived ? ' checked' : '') + ' /><i></i></label></div>' +
      '<button class="btn btn-primary btn-block" type="button" data-act="acc-save" data-id="' + (accId || '') + '" style="margin-top:16px">Salvar</button>' +
      (a && !a.system ? '<button class="btn btn-danger btn-block btn-sm" type="button" data-act="acc-delete" data-id="' +
        a.id + '" style="margin-top:9px">Excluir conta</button>' : ''),
      { level: 2, onOpen: function (body) { UI.bindPickers(body); } }
    );
  };
})(typeof window !== 'undefined' ? window : globalThis);
