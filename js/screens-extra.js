/* ═══════════════════════════════════════════════════════════════
   Dominus Finance — CARTEIRA · NOTAS · CONFIGURAÇÕES
   A carteira calcula preço médio a partir dos lotes (custo médio
   ponderado), não de um número digitado à mão. As notas são um
   bloco de verdade: texto, checklist, etiquetas e cor. E as
   configurações guardam o histórico de versões do cofre.
═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var Dm = global.Dominus;
  var UI = Dm.UI, DB = Dm.DB, F = Dm.F, Money = Dm.Money, D = Dm.D, Chart = Dm.Chart;
  var esc = Dm.esc, clamp = Dm.clamp, uid = Dm.uid, Auth = Dm.Auth, History = Dm.History;
  var Backup = Dm.Backup, Store = Dm.Store, Sec = Dm.Sec;

  /* ═══════════════════════════════════════════
     CARTEIRA
  ═══════════════════════════════════════════ */

  var invFilter = 'all';
  var TYPE_META = {
    acao: { label: 'Ações', emoji: '📈', color: Chart.PAL.acao },
    fii: { label: 'FIIs', emoji: '🏢', color: Chart.PAL.fii },
    rf: { label: 'Renda Fixa', emoji: '🏦', color: Chart.PAL.rf }
  };

  UI.renderers.investments = function () {
    var data = DB.data;
    var pf = F.portfolio(data);
    var html = '';

    html += '<div class="hero-card">' +
      '<p class="hero-label">Patrimônio investido</p>' +
      '<p class="hero-value money-mask">' + esc(Money.fmt(pf.market)) + '</p>' +
      '<p class="hero-note">' + (pf.invested
        ? 'Aportado ' + UI.money(pf.invested) + ' · resultado <span style="color:' +
        (pf.unrealized >= 0 ? Chart.incomeColor() : 'var(--expense)') + '">' +
        esc(Money.fmt(pf.unrealized, { sign: true })) + ' (' + (pf.pct >= 0 ? '+' : '') + pf.pct + '%)</span>'
        : 'Cadastre seus ativos para acompanhar aqui') + '</p>' +
      '<div class="split-3" style="margin-top:14px">' +
      '<div class="mini"><p class="mini-label">Proventos</p><p class="mini-value" style="color:var(--warn)">' +
      UI.money(pf.dividends, { noCents: true }) + '</p></div>' +
      '<div class="mini"><p class="mini-label">Yield s/ custo</p><p class="mini-value">' + pf.yieldOnCost + '%</p></div>' +
      '<div class="mini"><p class="mini-label">Realizado</p><p class="mini-value">' +
      UI.money(pf.realized, { noCents: true }) + '</p></div>' +
      '</div></div>';

    if (pf.count) {
      html += '<div class="card" style="margin-top:12px"><div class="row-between">' +
        '<div><p class="tiny muted">Cotações atualizadas</p>' +
        '<p class="small" style="font-weight:600">' + (pf.lastUpdated
          ? new Date(pf.lastUpdated).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
          : 'nunca') + '</p></div>' +
        '<button class="btn btn-soft btn-sm" type="button" data-act="refresh-prices">↻ Atualizar</button>' +
        '</div></div>';

      html += Chart.donut([
        { label: '📈 Ações', value: pf.byType.acao || 0, color: Chart.PAL.acao },
        { label: '🏢 FIIs', value: pf.byType.fii || 0, color: Chart.PAL.fii },
        { label: '🏦 Renda Fixa', value: pf.byType.rf || 0, color: Chart.PAL.rf }
      ], {
        title: 'Alocação da carteira',
        subtitle: pf.count + ' ativo(s) · maior posição ' + pf.topShare + '%',
        centerLabel: 'investido'
      });

      html += '<div class="chip-scroll">' +
        '<button class="chip' + (invFilter === 'all' ? ' active' : '') + '" type="button" data-act="inv-filter" data-f="all">Todos (' + pf.count + ')</button>' +
        ['acao', 'fii', 'rf'].map(function (k) {
          return '<button class="chip' + (invFilter === k ? ' active' : '') + '" type="button" data-act="inv-filter" data-f="' + k + '">' +
            TYPE_META[k].emoji + ' ' + TYPE_META[k].label + ' (' + (pf.countType[k] || 0) + ')</button>';
        }).join('') + '</div>';

      var rows = pf.rows.filter(function (r) { return invFilter === 'all' || r.inv.type === invFilter; });
      rows.sort(function (a, b) { return b.pos.market - a.pos.market; });
      html += rows.length
        ? rows.map(function (r) { return invCard(r.inv, r.pos, pf.market); }).join('')
        : '<div class="empty"><span class="ic">🔍</span><h4>Nada nesta categoria</h4><p>Nenhum ativo cadastrado deste tipo.</p></div>';
    } else {
      html += '<div class="empty" style="margin-top:14px"><span class="ic">🧺</span><h4>Carteira vazia</h4>' +
        '<p>Cadastre ações, FIIs e renda fixa. O app calcula preço médio a partir dos seus aportes, ' +
        'busca a cotação e acompanha proventos.</p>' +
        '<button class="btn btn-primary btn-sm" type="button" data-act="add-inv">Adicionar ativo</button></div>';
    }

    document.getElementById('inv-content').innerHTML = html;
  };

  function invCard(inv, pos, totalMarket) {
    var tm = TYPE_META[inv.type];
    var share = totalMarket ? Dm.roundTo(pos.market / totalMarket * 100, 1) : 0;
    var up = pos.unrealized >= 0;

    if (inv.type === 'rf') {
      return '<div class="inv-card"><div class="inv-top">' +
        '<div class="row"><span class="inv-ticker" style="background:' + UI.hexA(tm.color, .15) +
        ';border:1px solid ' + UI.hexA(tm.color, .35) + ';color:' + tm.color + '">🏦</span>' +
        '<div><p style="font-size:.88rem;font-weight:600">' + esc(inv.name) + '</p>' +
        '<p class="tiny muted">' + esc(inv.indexer || 'CDI') + (inv.ratePct ? ' ' + inv.ratePct + '%' : '') +
        (inv.maturity ? ' · vence ' + D.fmt(inv.maturity) : ' · sem vencimento') + '</p></div></div>' +
        '<div style="text-align:right"><p style="font-weight:600;font-size:.9rem">' + UI.money(pos.market) + '</p>' +
        '<p class="tiny" style="color:' + Chart.incomeColor() + '">' + share + '% da carteira</p></div></div>' +
        '<div class="inv-grid">' +
        cell('Aplicado', Money.fmt(pos.cost)) +
        cell('Rendimento', Money.fmt(pos.unrealized, { sign: true })) +
        cell('Rentab.', (pos.pct >= 0 ? '+' : '') + pos.pct + '%') +
        cell('Proventos', Money.fmt(pos.dividends)) +
        '</div>' +
        '<div class="inv-actions">' +
        '<button class="btn btn-soft btn-xs" type="button" data-act="inv-yield" data-id="' + inv.id + '">Atualizar saldo</button>' +
        '<button class="btn btn-ghost btn-xs" type="button" data-act="inv-edit" data-id="' + inv.id + '">✏️ Editar</button>' +
        '<button class="btn btn-danger btn-xs" type="button" data-act="inv-delete" data-id="' + inv.id + '">🗑️</button>' +
        '</div></div>';
    }

    return '<div class="inv-card"><div class="inv-top">' +
      '<div class="row"><span class="inv-ticker" style="background:' + UI.hexA(tm.color, .15) +
      ';border:1px solid ' + UI.hexA(tm.color, .35) + ';color:' + tm.color + '">' +
      esc((inv.ticker || '??').slice(0, 4)) + '</span>' +
      '<div><p style="font-size:.88rem;font-weight:600">' + esc(inv.ticker) + '</p>' +
      '<p class="tiny muted truncate" style="max-width:150px">' + esc(inv.longName || tm.label) + '</p></div></div>' +
      '<div style="text-align:right">' +
      (pos.hasPrice
        ? '<p style="font-weight:600;font-size:.9rem">' + esc(Money.fmt(inv.currentPrice)) + '</p>' +
        '<p class="tiny" style="color:' + (inv.changePct >= 0 ? Chart.incomeColor() : 'var(--expense)') + '">' +
        (inv.changePct >= 0 ? '+' : '') + Dm.roundTo(inv.changePct, 2) + '% hoje</p>'
        : '<p class="tiny muted">sem cotação</p>' +
        '<button class="btn btn-ghost btn-xs" type="button" data-act="inv-price" data-id="' + inv.id + '">buscar</button>') +
      '</div></div>' +
      '<div class="inv-grid">' +
      cell('Qtd.', Dm.roundTo(pos.qty, 8).toLocaleString('pt-BR')) +
      cell('Preço médio', Money.fmt(pos.avgPrice)) +
      cell('Posição', Money.fmt(pos.market)) +
      cell('% carteira', share + '%') +
      '</div>' +
      '<div class="row-between" style="margin-bottom:11px">' +
      '<div><p class="tiny muted">Resultado não realizado</p>' +
      '<p class="small" style="font-weight:600;color:' + (up ? Chart.incomeColor() : 'var(--expense)') + '">' +
      (pos.hasPrice ? UI.money(pos.unrealized, { sign: true }) + ' (' + (pos.pct >= 0 ? '+' : '') + pos.pct + '%)'
        : '<span class="muted">aguardando cotação</span>') + '</p></div>' +
      '<div style="text-align:right"><p class="tiny muted">Proventos</p>' +
      '<p class="small" style="font-weight:600;color:var(--warn)">' + UI.money(pos.dividends) + '</p></div>' +
      '</div>' +
      '<div class="inv-actions">' +
      '<button class="btn btn-soft btn-xs" type="button" data-act="inv-lot" data-id="' + inv.id + '" data-kind="buy">+ Aporte</button>' +
      '<button class="btn btn-ghost btn-xs" type="button" data-act="inv-lot" data-id="' + inv.id + '" data-kind="sell">− Venda</button>' +
      '<button class="btn btn-ghost btn-xs" type="button" data-act="inv-div" data-id="' + inv.id + '">💰</button>' +
      '<button class="btn btn-ghost btn-xs" type="button" data-act="inv-detail" data-id="' + inv.id + '">⋯</button>' +
      '</div></div>';
  }

  function cell(k, v) {
    return '<div class="inv-cell"><span class="k">' + esc(k) + '</span>' +
      '<span class="v money-mask">' + esc(v) + '</span></div>';
  }

  UI.openInvSheet = function (invId, presetType) {
    var inv = invId ? DB.data.investments.filter(function (x) { return x.id === invId; })[0] : null;
    var isEdit = !!inv;
    var type = inv ? inv.type : (presetType || 'acao');

    var marketFields = function (t) {
      return '<div class="field"><label for="i-ticker">Código na B3</label>' +
        '<input type="text" id="i-ticker" maxlength="12" placeholder="ex: PETR4 ou MXRF11" ' +
        'style="text-transform:uppercase" value="' + esc(t && t.ticker || '') + '" /></div>' +
        (isEdit ? '' :
          '<div class="split" style="margin-top:0">' +
          '<div class="field"><label for="i-qty">Quantidade</label>' +
          '<input type="text" id="i-qty" inputmode="decimal" placeholder="ex: 100" /></div>' +
          '<div class="field"><label for="i-price">Preço pago (R$)</label>' +
          '<input type="text" id="i-price" inputmode="decimal" placeholder="ex: 35,50" /></div></div>' +
          '<div class="split" style="margin-top:0">' +
          '<div class="field"><label for="i-fees">Taxas (R$)</label>' +
          '<input type="text" id="i-fees" inputmode="decimal" placeholder="0,00" /></div>' +
          '<div class="field"><label for="i-date">Data da compra</label>' +
          '<input type="date" id="i-date" value="' + D.today() + '" /></div></div>' +
          '<p class="hint">Depois você adiciona novos aportes e o preço médio é recalculado pelo custo médio ponderado.</p>');
    };

    var rfFields = function (t) {
      return '<div class="field"><label for="i-name">Nome do investimento</label>' +
        '<input type="text" id="i-name" maxlength="80" placeholder="ex: CDB Banco X 110% CDI" value="' + esc(t && t.name || '') + '" /></div>' +
        '<div class="split" style="margin-top:0">' +
        '<div class="field"><label for="i-principal">Valor aplicado (R$)</label>' +
        '<input type="text" id="i-principal" inputmode="decimal" value="' + (t && t.principal ? Money.plain(t.principal) : '') + '" /></div>' +
        '<div class="field"><label for="i-yield">Rendimento atual (R$)</label>' +
        '<input type="text" id="i-yield" inputmode="decimal" value="' + (t && t.yieldValue ? Money.plain(t.yieldValue) : '') + '" /></div></div>' +
        '<div class="split" style="margin-top:0">' +
        '<div class="field"><label for="i-indexer">Indexador</label>' +
        '<select id="i-indexer">' + ['CDI', 'IPCA+', 'Prefixado', 'Selic', 'Poupança', 'Outro'].map(function (x) {
          return '<option' + (t && t.indexer === x ? ' selected' : '') + '>' + x + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field"><label for="i-rate">Taxa (% a.a.)</label>' +
        '<input type="number" id="i-rate" step="0.01" value="' + (t && t.ratePct || '') + '" /></div></div>' +
        '<div class="field"><label for="i-maturity">Vencimento</label>' +
        '<input type="date" id="i-maturity" value="' + esc(t && t.maturity || '') + '" /></div>';
    };

    UI.openSheet(
      UI.sheetHead(isEdit ? 'Editar ativo' : 'Novo ativo', { flag: isEdit ? 'Editando' : null }) +
      (isEdit ? '' : '<label class="label">Tipo</label><div class="split-3" id="i-types" style="margin-bottom:14px">' +
        ['acao', 'fii', 'rf'].map(function (k) {
          return '<button type="button" class="pick' + (k === type ? ' active' : '') + '" data-t="' + k + '">' +
            '<span class="ic">' + TYPE_META[k].emoji + '</span>' + TYPE_META[k].label + '</button>';
        }).join('') + '</div>') +
      '<div id="i-fields">' + (type === 'rf' ? rfFields(inv) : marketFields(inv)) + '</div>' +
      '<div class="field"><label for="i-note">Observação</label>' +
      '<input type="text" id="i-note" maxlength="300" placeholder="opcional" value="' + esc(inv && inv.note || '') + '" /></div>' +
      '<button class="btn btn-primary btn-block" type="button" id="i-save" style="margin-top:10px">' +
      (isEdit ? 'Salvar' : 'Adicionar ativo') + '</button>' +
      (isEdit ? '<button class="btn btn-danger btn-block btn-sm" type="button" data-act="inv-delete" data-id="' +
        inv.id + '" style="margin-top:9px">Excluir ativo</button>' : ''),
      {
        onOpen: function (body) {
          var cur = type;
          var types = body.querySelector('#i-types');
          if (types) types.addEventListener('click', function (e) {
            var b = e.target.closest('[data-t]');
            if (!b) return;
            cur = b.getAttribute('data-t');
            body.querySelectorAll('#i-types .pick').forEach(function (x) { x.classList.remove('active'); });
            b.classList.add('active');
            body.querySelector('#i-fields').innerHTML = cur === 'rf' ? rfFields(null) : marketFields(null);
          });

          body.querySelector('#i-save').addEventListener('click', function () {
            var note = UI.val(body, 'i-note');
            if (cur === 'rf') {
              var name = UI.val(body, 'i-name');
              var principal = Money.parse(UI.val(body, 'i-principal'));
              if (!name) { UI.err('Informe o nome do investimento.'); return; }
              if (!isFinite(principal) || principal <= 0) { UI.err('Informe o valor aplicado.'); return; }
              var y = Money.parse(UI.val(body, 'i-yield'));
              var mat = UI.val(body, 'i-maturity');
              var payload = {
                type: 'rf', name: name, principal: Math.abs(principal),
                yieldValue: isFinite(y) ? y : 0,
                indexer: UI.val(body, 'i-indexer') || 'CDI',
                ratePct: parseFloat(UI.val(body, 'i-rate')) || 0,
                maturity: D.isValid(mat) ? mat : null, note: note
              };
              if (isEdit) Object.keys(payload).forEach(function (k) { inv[k] = payload[k]; });
              else DB.data.investments.push(Object.assign({
                id: uid('inv'), addedAt: new Date().toISOString(), dividends: [], lots: []
              }, payload));
              UI.closeSheet();
              UI.commit(isEdit ? 'Ativo atualizado' : 'Renda fixa adicionada');
              return;
            }

            var ticker = UI.val(body, 'i-ticker').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (!ticker) { UI.err('Informe o código do ativo.'); return; }
            if (isEdit) {
              if (inv.ticker !== ticker) {
                inv.currentPrice = null; inv.lastUpdated = null; inv.changePct = 0; inv.longName = ticker;
              }
              inv.ticker = ticker; inv.name = ticker; inv.note = note;
              UI.closeSheet();
              UI.commit('Ativo atualizado');
              if (!inv.currentPrice) Dm.fetchPrice(inv.id);
              return;
            }
            var qty = parseFloat(String(UI.val(body, 'i-qty')).replace(',', '.'));
            var price = Money.parse(UI.val(body, 'i-price'));
            var fees = Money.parse(UI.val(body, 'i-fees'));
            var date = UI.val(body, 'i-date');
            if (!isFinite(qty) || qty <= 0) { UI.err('Informe a quantidade.'); return; }
            if (!isFinite(price) || price <= 0) { UI.err('Informe o preço pago.'); return; }
            var newInv = {
              id: uid('inv'), type: cur, ticker: ticker, name: ticker, longName: ticker,
              addedAt: new Date().toISOString(), currentPrice: null, changePct: 0, lastUpdated: null,
              note: note, dividends: [],
              lots: [{
                id: uid('lot'), kind: 'buy', date: D.isValid(date) ? date : D.today(),
                qty: Dm.roundTo(Math.abs(qty), 8), price: Math.abs(price),
                fees: isFinite(fees) ? Math.abs(fees) : 0
              }]
            };
            DB.data.investments.push(newInv);
            UI.closeSheet();
            UI.commit(ticker + ' adicionado à carteira');
            Dm.fetchPrice(newInv.id);
          });
        }
      }
    );
  };

  UI.register({
    'add-inv': function () { UI.openInvSheet(null); },
    'inv-edit': function (ds) { UI.openInvSheet(ds.id); },
    'inv-filter': function (ds) { invFilter = ds.f; UI.renderers.investments(); },
    'inv-price': function (ds) { Dm.fetchPrice(ds.id, true); },
    'refresh-prices': function () { Dm.refreshPrices(); },

    'inv-lot': function (ds) {
      var inv = DB.data.investments.filter(function (x) { return x.id === ds.id; })[0];
      if (!inv) return;
      var pos = F.position(inv);
      var isSell = ds.kind === 'sell';
      UI.openSheet(
        UI.sheetHead((isSell ? 'Vender ' : 'Aportar em ') + inv.ticker, {
          sub: 'Posição atual: <b>' + Dm.roundTo(pos.qty, 8).toLocaleString('pt-BR') + '</b> a preço médio de <b>' +
            esc(Money.fmt(pos.avgPrice)) + '</b>'
        }) +
        '<div class="split" style="margin-top:0">' +
        '<div class="field"><label for="l-qty">Quantidade</label>' +
        '<input type="text" id="l-qty" inputmode="decimal" /></div>' +
        '<div class="field"><label for="l-price">Preço (R$)</label>' +
        '<input type="text" id="l-price" inputmode="decimal" value="' +
        (inv.currentPrice ? Money.plain(inv.currentPrice) : '') + '" /></div></div>' +
        '<div class="split" style="margin-top:0">' +
        '<div class="field"><label for="l-fees">Taxas (R$)</label>' +
        '<input type="text" id="l-fees" inputmode="decimal" placeholder="0,00" /></div>' +
        '<div class="field"><label for="l-date">Data</label>' +
        '<input type="date" id="l-date" value="' + D.today() + '" /></div></div>' +
        '<p class="hint" id="l-echo"></p>' +
        (isSell ? '<p class="fine-print">Na venda, o preço médio das cotas restantes não muda — ' +
          'o resultado vai para "realizado". É a convenção de custo médio usada no Brasil.</p>' : '') +
        '<button class="btn btn-primary btn-block" type="button" id="l-save" style="margin-top:14px">' +
        (isSell ? 'Registrar venda' : 'Registrar aporte') + '</button>',
        {
          focus: '#l-qty',
          onOpen: function (body) {
            var upd = function () {
              var q = parseFloat(String(UI.val(body, 'l-qty')).replace(',', '.'));
              var p = Money.parse(UI.val(body, 'l-price'));
              var f = Money.parse(UI.val(body, 'l-fees'));
              if (!isFinite(q) || !isFinite(p)) { body.querySelector('#l-echo').textContent = ''; return; }
              var total = Dm.roundHalfUp(q * p) + (isFinite(f) ? Math.abs(f) : 0) * (isSell ? -1 : 1);
              body.querySelector('#l-echo').innerHTML = (isSell ? 'Você recebe ' : 'Total desembolsado: ') +
                '<b style="color:var(--ink)">' + esc(Money.fmt(Math.abs(total))) + '</b>';
            };
            ['l-qty', 'l-price', 'l-fees'].forEach(function (id) {
              body.querySelector('#' + id).addEventListener('input', upd);
            });
            body.querySelector('#l-save').addEventListener('click', function () {
              var q = parseFloat(String(UI.val(body, 'l-qty')).replace(',', '.'));
              var p = Money.parse(UI.val(body, 'l-price'));
              var f = Money.parse(UI.val(body, 'l-fees'));
              var date = UI.val(body, 'l-date');
              if (!isFinite(q) || q <= 0) { UI.err('Informe a quantidade.'); return; }
              if (!isFinite(p) || p <= 0) { UI.err('Informe o preço.'); return; }
              if (isSell && q > pos.qty + 1e-8) {
                UI.err('Você tem apenas ' + Dm.roundTo(pos.qty, 8) + ' em carteira.');
                return;
              }
              inv.lots.push({
                id: uid('lot'), kind: isSell ? 'sell' : 'buy',
                date: D.isValid(date) ? date : D.today(),
                qty: Dm.roundTo(Math.abs(q), 8), price: Math.abs(p),
                fees: isFinite(f) ? Math.abs(f) : 0
              });
              inv.lots.sort(function (a, b) { return a.date.localeCompare(b.date); });
              UI.closeSheet();
              var np = F.position(inv);
              UI.commit(isSell ? 'Venda registrada · restam ' + Dm.roundTo(np.qty, 8)
                : 'Aporte registrado · preço médio ' + Money.fmt(np.avgPrice));
            });
          }
        }
      );
    },

    'inv-div': function (ds) {
      var inv = DB.data.investments.filter(function (x) { return x.id === ds.id; })[0];
      if (!inv) return;
      UI.openSheet(
        UI.sheetHead('Provento de ' + (inv.ticker || inv.name), {
          sub: 'Total já recebido: <b>' + esc(Money.fmt(F.dividendTotal(inv))) + '</b>'
        }) +
        '<div class="field"><input type="text" id="d-amount" class="input-amount" inputmode="decimal" placeholder="0,00" />' +
        '<p class="hint center" id="d-amount-echo"></p></div>' +
        '<div class="field"><label for="d-date">Data do crédito</label>' +
        '<input type="date" id="d-date" value="' + D.today() + '" /></div>' +
        '<div class="field"><label for="d-note">Tipo</label>' +
        '<select id="d-note"><option>Dividendo</option><option>JCP</option><option>Rendimento</option><option>Outro</option></select></div>' +
        '<div class="switch-row"><div class="sr-text"><b>Lançar como receita no extrato</b>' +
        '<span>Entra na categoria "Dividendos" e soma ao seu saldo.</span></div>' +
        '<label class="switch"><input type="checkbox" id="d-tx" checked /><i></i></label></div>' +
        '<button class="btn btn-primary btn-block" type="button" id="d-save" style="margin-top:16px">Registrar</button>',
        {
          focus: '#d-amount',
          onOpen: function (body) {
            UI.bindAmountField(body, 'd-amount', 'd-amount-echo');
            body.querySelector('#d-save').addEventListener('click', function () {
              var v = UI.readAmount(body, 'd-amount');
              if (!isFinite(v) || v <= 0) { UI.err('Informe o valor recebido.'); return; }
              var date = UI.val(body, 'd-date');
              var kind = UI.val(body, 'd-note');
              inv.dividends.push({
                id: uid('div'), date: D.isValid(date) ? date : D.today(),
                amount: v, note: kind
              });
              if (UI.checked(body, 'd-tx')) {
                var now = new Date().toISOString();
                DB.data.transactions.unshift({
                  id: uid('tx'), desc: kind + ' ' + (inv.ticker || inv.name), amount: v, type: 'income',
                  categoryId: 'cat_dividendos', accountId: 'acc_corrente',
                  date: D.isValid(date) ? date : D.today(),
                  createdAt: now, updatedAt: now, note: 'Provento de ' + (inv.ticker || inv.name),
                  tags: ['provento'], recurrenceId: null, installment: null, goalId: null
                });
                DB.data.transactions.sort(function (a, b) { return b.date.localeCompare(a.date); });
              }
              UI.closeSheet();
              UI.commit('+' + Money.fmt(v) + ' em proventos');
            });
          }
        }
      );
    },

    'inv-yield': function (ds) {
      var inv = DB.data.investments.filter(function (x) { return x.id === ds.id; })[0];
      if (!inv || inv.type !== 'rf') return;
      UI.openSheet(
        UI.sheetHead('Atualizar ' + inv.name, {
          sub: 'Informe o saldo que aparece hoje no app do banco — o app calcula o rendimento.'
        }) +
        '<div class="field"><label for="y-total">Saldo bruto atual</label>' +
        '<input type="text" id="y-total" class="input-amount" inputmode="decimal" value="' +
        Money.plain((inv.principal || 0) + (inv.yieldValue || 0)) + '" />' +
        '<p class="hint center" id="y-echo"></p></div>' +
        '<button class="btn btn-primary btn-block" type="button" id="y-save">Salvar</button>',
        {
          focus: '#y-total',
          onOpen: function (body) {
            var upd = function () {
              var v = Money.parse(UI.val(body, 'y-total'));
              if (!isFinite(v)) { body.querySelector('#y-echo').textContent = ''; return; }
              var y = v - (inv.principal || 0);
              body.querySelector('#y-echo').innerHTML = 'Rendimento: <b style="color:' +
                (y >= 0 ? Chart.incomeColor() : 'var(--expense)') + '">' + esc(Money.fmt(y, { sign: true })) +
                '</b> sobre ' + esc(Money.fmt(inv.principal || 0));
            };
            body.querySelector('#y-total').addEventListener('input', upd);
            upd();
            body.querySelector('#y-save').addEventListener('click', function () {
              var v = Money.parse(UI.val(body, 'y-total'));
              if (!isFinite(v) || v < 0) { UI.err('Valor inválido.'); return; }
              inv.yieldValue = v - (inv.principal || 0);
              inv.lastUpdated = new Date().toISOString();
              UI.closeSheet();
              UI.commit('Saldo atualizado');
            });
          }
        }
      );
    },

    'inv-detail': function (ds) {
      var inv = DB.data.investments.filter(function (x) { return x.id === ds.id; })[0];
      if (!inv) return;
      var pos = F.position(inv);
      var lots = (inv.lots || []).slice().reverse();
      var divs = (inv.dividends || []).slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
      UI.openSheet(
        UI.sheetHead(inv.ticker || inv.name) +
        '<div class="card card-tight"><div class="kv-list">' +
        '<div class="kv"><span class="k">Quantidade</span><span class="v">' + Dm.roundTo(pos.qty, 8).toLocaleString('pt-BR') + '</span></div>' +
        '<div class="kv"><span class="k">Preço médio</span><span class="v">' + UI.money(pos.avgPrice) + '</span></div>' +
        '<div class="kv"><span class="k">Custo total</span><span class="v">' + UI.money(pos.cost) + '</span></div>' +
        '<div class="kv"><span class="k">Valor de mercado</span><span class="v">' + UI.money(pos.market) + '</span></div>' +
        '<div class="kv"><span class="k">Não realizado</span><span class="v">' + UI.signed(pos.unrealized) + '</span></div>' +
        '<div class="kv"><span class="k">Realizado em vendas</span><span class="v">' + UI.signed(pos.realized) + '</span></div>' +
        '<div class="kv"><span class="k">Proventos</span><span class="v">' + UI.money(pos.dividends) + '</span></div>' +
        '</div></div>' +
        '<div class="btn-row" style="margin-top:12px">' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="inv-edit" data-id="' + inv.id + '">✏️ Editar</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-act="inv-delete" data-id="' + inv.id + '">🗑️ Excluir</button>' +
        '</div>' +
        '<div class="section-title"><h3>Movimentações (' + lots.length + ')</h3></div>' +
        (lots.length ? '<div class="stack-sm">' + lots.map(function (l) {
          return '<div class="lot-row"><span>' + (l.kind === 'buy' ? '🟢' : '🔴') + '</span>' +
            '<span class="grow"><b>' + (l.kind === 'buy' ? 'Compra' : 'Venda') + '</b> de ' +
            Dm.roundTo(l.qty, 8).toLocaleString('pt-BR') + ' a ' + esc(Money.fmt(l.price)) +
            (l.fees ? ' + ' + esc(Money.fmt(l.fees)) + ' taxas' : '') +
            '<br><span class="tiny muted">' + esc(D.fmt(l.date)) + '</span></span>' +
            '<button class="btn btn-ghost btn-xs" type="button" data-act="lot-delete" data-id="' + inv.id +
            '" data-lot="' + l.id + '">✕</button></div>';
        }).join('') + '</div>' : '<p class="fine-print center">Nenhum lote registrado.</p>') +
        (divs.length ? '<div class="section-title"><h3>Proventos (' + divs.length + ')</h3></div>' +
          '<div class="stack-sm">' + divs.map(function (dv) {
            return '<div class="lot-row"><span>💰</span><span class="grow"><b>' + esc(dv.note || 'Provento') + '</b>' +
              '<br><span class="tiny muted">' + esc(D.fmt(dv.date)) + '</span></span>' +
              '<b>' + esc(Money.fmt(dv.amount)) + '</b>' +
              '<button class="btn btn-ghost btn-xs" type="button" data-act="div-delete" data-id="' + inv.id +
              '" data-div="' + dv.id + '">✕</button></div>';
          }).join('') + '</div>' : ''),
        {}
      );
    },

    'lot-delete': function (ds) {
      var inv = DB.data.investments.filter(function (x) { return x.id === ds.id; })[0];
      if (!inv) return;
      inv.lots = inv.lots.filter(function (l) { return l.id !== ds.lot; });
      DB.save();
      UI.actions['inv-detail'](ds);
      UI.ok('Movimentação removida');
    },

    'div-delete': function (ds) {
      var inv = DB.data.investments.filter(function (x) { return x.id === ds.id; })[0];
      if (!inv) return;
      inv.dividends = inv.dividends.filter(function (x) { return x.id !== ds.div; });
      DB.save();
      UI.actions['inv-detail'](ds);
      UI.ok('Provento removido');
    },

    'inv-delete': function (ds) {
      var inv = DB.data.investments.filter(function (x) { return x.id === ds.id; })[0];
      if (!inv) return;
      UI.confirm({
        title: 'Excluir ativo?',
        text: '"' + esc(inv.ticker || inv.name) + '", seus lotes e seus proventos registrados serão removidos da carteira.',
        confirmLabel: 'Excluir', danger: true
      }).then(function (yes) {
        if (!yes) return;
        DB.data.investments = DB.data.investments.filter(function (x) { return x.id !== ds.id; });
        UI.closeAllSheets();
        UI.commit('Ativo removido');
      });
    }
  });

  /* ═══════════ COTAÇÕES (BRAPI) ═══════════ */

  function brapiToken() {
    return (DB.data.settings.brapiToken || '').trim() || 'demo';
  }

  Dm.fetchPrice = function (invId, loud) {
    var inv = DB.data.investments.filter(function (x) { return x.id === invId; })[0];
    if (!inv || inv.type === 'rf' || !inv.ticker) return Promise.resolve(false);
    if (loud) UI.toast('Buscando ' + inv.ticker + '…');
    return fetch('https://brapi.dev/api/quote/' + encodeURIComponent(inv.ticker) +
      '?token=' + encodeURIComponent(brapiToken()))
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        var q = j && j.results && j.results[0];
        if (!q || !q.regularMarketPrice) throw new Error('sem cotação');
        inv.currentPrice = Money.fromFloat(q.regularMarketPrice);
        inv.changePct = Dm.roundTo(parseFloat(q.regularMarketChangePercent) || 0, 2);
        inv.longName = q.longName || q.shortName || inv.ticker;
        inv.lastUpdated = new Date().toISOString();
        DB.save();
        if (loud) { UI.ok(inv.ticker + ': ' + Money.fmt(inv.currentPrice)); UI.refresh(); }
        return true;
      })
      .catch(function (e) {
        console.warn('[Dominus] cotação de', inv.ticker, 'falhou:', e.message);
        if (loud) {
          UI.err('Não consegui a cotação de ' + inv.ticker +
            '. Sem internet, ou o limite do token gratuito foi atingido — configure um token da BRAPI em Configurações.');
        }
        return false;
      });
  };

  Dm.refreshPrices = function () {
    var list = DB.data.investments.filter(function (i) { return i.type !== 'rf' && i.ticker; });
    if (!list.length) { UI.toast('Nenhum ativo de mercado cadastrado.'); return; }
    UI.toast('⏳ Atualizando ' + list.length + ' cotação(ões)…');
    var ok = 0;
    /* em série, para não estourar o limite de requisições do token */
    list.reduce(function (p, inv) {
      return p.then(function () {
        return Dm.fetchPrice(inv.id).then(function (r) { if (r) ok++; });
      });
    }, Promise.resolve()).then(function () {
      UI.refresh();
      if (ok === list.length) UI.ok('Cotações atualizadas');
      else if (ok) UI.toast(ok + ' de ' + list.length + ' atualizadas');
      else UI.err('Nenhuma cotação obtida. Verifique a internet ou o token da BRAPI.');
    });
  };

  /* ═══════════════════════════════════════════
     NOTAS
  ═══════════════════════════════════════════ */

  var NOTE_COLORS = [
    ['default', 'Padrão'], ['amber', 'Âmbar'], ['blue', 'Azul'],
    ['green', 'Verde'], ['violet', 'Violeta'], ['red', 'Vermelho']
  ];
  var noteTag = null;

  UI.renderers.notes = function () {
    var data = DB.data;
    var q = ((document.getElementById('note-search') || {}).value || '').toLowerCase().trim();

    var tags = {};
    data.notes.forEach(function (n) { (n.tags || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; }); });
    var tagKeys = Object.keys(tags).sort();
    document.getElementById('note-tag-filter').innerHTML = tagKeys.length
      ? '<button class="chip' + (!noteTag ? ' active' : '') + '" type="button" data-act="note-tag" data-t="">Todas</button>' +
      tagKeys.map(function (t) {
        return '<button class="chip' + (noteTag === t ? ' active' : '') + '" type="button" data-act="note-tag" data-t="' +
          esc(t) + '">#' + esc(t) + ' (' + tags[t] + ')</button>';
      }).join('')
      : '';

    var list = data.notes.filter(function (n) { return !n.archived; });
    if (noteTag) list = list.filter(function (n) { return (n.tags || []).indexOf(noteTag) >= 0; });
    if (q) {
      list = list.filter(function (n) {
        return (n.title + ' ' + n.body + ' ' + (n.tags || []).join(' ') +
          (n.checklist || []).map(function (c) { return c.text; }).join(' ')).toLowerCase().indexOf(q) >= 0;
      });
    }
    list.sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });

    var archived = data.notes.filter(function (n) { return n.archived; });
    var html = '';

    if (!data.notes.length) {
      html = '<div class="empty"><span class="ic">📝</span><h4>Seu bloco está vazio</h4>' +
        '<p>Anote o que não é número: a senha do consórcio, a lista do mercado, a ideia de corte de gasto, ' +
        'o combinado com alguém. Dá para marcar com etiqueta, cor e lista de tarefas.</p>' +
        '<button class="btn btn-primary btn-sm" type="button" data-act="add-note">Criar primeira nota</button></div>';
    } else if (!list.length) {
      html = '<div class="empty"><span class="ic">🔍</span><h4>Nada encontrado</h4>' +
        '<p>Nenhuma nota corresponde à busca ou à etiqueta selecionada.</p></div>';
    } else {
      html = '<div class="notes-grid">' + list.map(noteCard).join('') + '</div>';
    }

    if (archived.length) {
      html += '<div class="section-title"><h3>Arquivadas (' + archived.length + ')</h3></div>' +
        '<div class="notes-grid">' + archived.map(noteCard).join('') + '</div>';
    }

    document.getElementById('notes-content').innerHTML = html;
  };

  function noteCard(n) {
    var done = (n.checklist || []).filter(function (c) { return c.done; }).length;
    var preview = n.body ? n.body.slice(0, 220) : '';
    return '<button class="note-card c-' + esc(n.color) + '" type="button" data-act="note-edit" data-id="' + n.id + '">' +
      (n.pinned ? '<span class="note-pin">📌</span>' : '') +
      (n.title ? '<span class="note-title">' + esc(n.title) + '</span>' : '') +
      (preview ? '<span class="note-body">' + esc(preview) + '</span>' : '') +
      (n.checklist && n.checklist.length
        ? '<span class="note-chk" style="margin-top:6px">☑ ' + done + '/' + n.checklist.length + '</span>' : '') +
      '<span class="note-foot">' +
      (n.tags || []).slice(0, 3).map(function (t) {
        return '<span class="tag" style="background:rgba(255,255,255,.07);color:var(--ink-2)">#' + esc(t) + '</span>';
      }).join('') +
      '<span class="tiny muted" style="margin-left:auto">' + esc(D.fmtRel(D.norm(n.updatedAt))) + '</span>' +
      '</span></button>';
  }

  UI.openNoteSheet = function (noteId) {
    var n = noteId ? DB.data.notes.filter(function (x) { return x.id === noteId; })[0] : null;
    var isEdit = !!n;
    var base = n || {
      title: '', body: '', color: 'default', pinned: false, archived: false,
      tags: [], checklist: [], remindAt: null
    };
    var checklist = (base.checklist || []).map(function (c) {
      return { id: c.id, text: c.text, done: c.done };
    });

    var chkRow = function (c) {
      return '<div class="chk-row' + (c.done ? ' done' : '') + '" data-chk="' + c.id + '">' +
        '<input type="checkbox"' + (c.done ? ' checked' : '') + ' aria-label="Concluído" />' +
        '<input type="text" class="grow" value="' + esc(c.text) + '" maxlength="200" placeholder="item da lista" />' +
        '<button class="chk-del" type="button" aria-label="Remover item">✕</button></div>';
    };

    UI.openSheet(
      UI.sheetHead(isEdit ? 'Editar nota' : 'Nova nota', { flag: isEdit ? 'Editando' : null }) +
      '<div class="field"><input type="text" id="n-title" maxlength="120" placeholder="Título" ' +
      'style="font-size:1.05rem;font-weight:600" value="' + esc(base.title) + '" /></div>' +
      '<div class="field"><textarea id="n-body" rows="7" maxlength="20000" ' +
      'placeholder="Escreva o que quiser lembrar…">' + esc(base.body) + '</textarea></div>' +
      '<div class="section-title" style="margin-top:4px"><h3 style="font-size:.84rem">Lista de tarefas</h3>' +
      '<button class="link" type="button" id="n-add-chk">+ Item</button></div>' +
      '<div class="checklist" id="n-chk">' + checklist.map(chkRow).join('') + '</div>' +
      '<div class="field" style="margin-top:14px"><label for="n-tags">Etiquetas</label>' +
      '<input type="text" id="n-tags" placeholder="separe por vírgula: mercado, ideias" value="' +
      esc((base.tags || []).join(', ')) + '" /></div>' +
      '<div class="field"><label for="n-remind">Lembrar em</label>' +
      '<input type="date" id="n-remind" value="' + esc(base.remindAt || '') + '" /></div>' +
      '<label class="label">Cor</label>' +
      '<div class="chip-scroll" data-picker="noteColor">' +
      NOTE_COLORS.map(function (c) {
        return '<button class="chip' + (c[0] === base.color ? ' active' : '') + '" type="button" data-pick="' + c[0] + '">' +
          esc(c[1]) + '</button>';
      }).join('') + '</div>' +
      '<div class="switch-row" style="margin-top:14px"><div class="sr-text"><b>Fixar no topo</b>' +
      '<span>Notas fixadas aparecem antes das outras.</span></div>' +
      '<label class="switch"><input type="checkbox" id="n-pinned"' + (base.pinned ? ' checked' : '') + ' /><i></i></label></div>' +
      (isEdit ? '<div class="switch-row"><div class="sr-text"><b>Arquivar</b>' +
        '<span>Sai da lista principal, continua pesquisável.</span></div>' +
        '<label class="switch"><input type="checkbox" id="n-archived"' + (base.archived ? ' checked' : '') + ' /><i></i></label></div>' : '') +
      '<button class="btn btn-primary btn-block" type="button" id="n-save" style="margin-top:16px">' +
      (isEdit ? 'Salvar nota' : 'Criar nota') + '</button>' +
      (isEdit ? '<button class="btn btn-danger btn-block btn-sm" type="button" data-act="note-delete" data-id="' +
        n.id + '" style="margin-top:9px">Excluir nota</button>' : ''),
      {
        focus: isEdit ? '#n-body' : '#n-title',
        onOpen: function (body) {
          UI.bindPickers(body);
          var wrap = body.querySelector('#n-chk');

          body.querySelector('#n-add-chk').addEventListener('click', function () {
            var c = { id: uid('chk'), text: '', done: false };
            checklist.push(c);
            wrap.insertAdjacentHTML('beforeend', chkRow(c));
            var rows = wrap.querySelectorAll('.chk-row');
            var last = rows[rows.length - 1].querySelector('input[type=text]');
            if (last) last.focus();
          });

          wrap.addEventListener('click', function (e) {
            var del = e.target.closest('.chk-del');
            if (!del) return;
            var row = del.closest('[data-chk]');
            var id = row.getAttribute('data-chk');
            checklist = checklist.filter(function (c) { return c.id !== id; });
            row.remove();
          });
          wrap.addEventListener('change', function (e) {
            if (e.target.type !== 'checkbox') return;
            var row = e.target.closest('[data-chk]');
            row.classList.toggle('done', e.target.checked);
          });
          /* Enter num item cria o próximo — ritmo de lista de verdade */
          wrap.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && e.target.type === 'text') {
              e.preventDefault();
              body.querySelector('#n-add-chk').click();
            }
          });

          body.querySelector('#n-save').addEventListener('click', function () {
            var items = [];
            wrap.querySelectorAll('[data-chk]').forEach(function (row) {
              var txt = row.querySelector('input[type=text]').value.trim();
              if (!txt) return;
              items.push({
                id: row.getAttribute('data-chk'), text: txt,
                done: row.querySelector('input[type=checkbox]').checked
              });
            });
            var title = UI.val(body, 'n-title');
            var text = body.querySelector('#n-body').value;
            if (!title && !text.trim() && !items.length) { UI.err('Escreva algo antes de salvar.'); return; }
            var rem = UI.val(body, 'n-remind');
            var payload = {
              title: title, body: text,
              color: UI.pick.noteColor || 'default',
              pinned: UI.checked(body, 'n-pinned'),
              archived: isEdit ? UI.checked(body, 'n-archived') : false,
              tags: UI.val(body, 'n-tags').split(',').map(function (s) { return s.trim().toLowerCase(); })
                .filter(Boolean).slice(0, 12),
              checklist: items,
              remindAt: D.isValid(rem) ? rem : null,
              updatedAt: new Date().toISOString()
            };
            if (isEdit) Object.keys(payload).forEach(function (k) { n[k] = payload[k]; });
            else DB.data.notes.unshift(Object.assign({
              id: uid('note'), createdAt: new Date().toISOString()
            }, payload));
            UI.closeSheet();
            UI.commit(isEdit ? 'Nota salva' : 'Nota criada 📝');
          });
        }
      }
    );
  };

  UI.register({
    'add-note': function () { UI.openNoteSheet(null); },
    'note-edit': function (ds) { UI.openNoteSheet(ds.id); },
    'note-tag': function (ds) { noteTag = ds.t || null; UI.renderers.notes(); },
    'note-delete': function (ds) {
      var n = DB.data.notes.filter(function (x) { return x.id === ds.id; })[0];
      if (!n) return;
      UI.confirm({
        title: 'Excluir nota?',
        text: (n.title ? '"' + esc(n.title) + '"' : 'Esta nota') + ' será removida. ' +
          'Se quiser apenas tirá-la da lista, use <b>Arquivar</b>.',
        confirmLabel: 'Excluir', danger: true
      }).then(function (yes) {
        if (!yes) return;
        DB.data.notes = DB.data.notes.filter(function (x) { return x.id !== ds.id; });
        UI.closeAllSheets();
        UI.commit('Nota excluída');
      });
    }
  });

  /* ═══════════════════════════════════════════
     CONFIGURAÇÕES
  ═══════════════════════════════════════════ */

  UI.renderers.settings = function () {
    var data = DB.data, s = data.settings;
    var usage = Store.usage();
    var snaps = History.list(DB.userId);
    var user = Auth.current || {};

    var html = '';

    /* ── perfil ── */
    html += '<div class="card"><div class="row">' +
      '<span class="item-icon" style="background:var(--surface-3);font-size:1.4rem;width:48px;height:48px">' +
      (data.profile.avatar || '🦅') + '</span>' +
      '<div class="grow"><p style="font-weight:600">' + esc(data.profile.displayName) + '</p>' +
      '<p class="tiny muted">@' + esc(user.username || '—') + ' · conta criada em ' +
      (user.createdAt ? D.fmt(D.norm(user.createdAt)) : '—') + '</p></div>' +
      '<button class="btn btn-soft btn-xs" type="button" data-act="edit-profile">Editar</button>' +
      '</div></div>';

    /* ── aparência ── */
    html += '<div class="section-title"><h3>Aparência</h3></div><div class="card">' +
      '<label class="label">Cor de destaque</label>' +
      '<div class="swatch-grid" id="st-accent">' +
      ['#FF1F3D', '#3987e5', '#199e70', '#c98500', '#d55181', '#9085e9', '#12a594', '#e66767'].map(function (c) {
        return '<button class="swatch-pick' + (s.accent.toLowerCase() === c.toLowerCase() ? ' active' : '') +
          '" type="button" data-act="set-accent" data-c="' + c + '" style="background:' + c + '" aria-label="' + c + '"></button>';
      }).join('') + '</div>' +
      '<hr class="divider" />' +
      sw('amoled', '🌑 Modo AMOLED', 'Preto absoluto: economiza bateria em telas OLED.', s.amoled) +
      sw('compactList', '📏 Lista compacta', 'Mais lançamentos visíveis por tela.', s.compactList) +
      sw('cvdSafe', '🎨 Paleta para daltonismo', 'Troca o verde de receita por azul, separando melhor do vermelho de despesa.', s.cvdSafe) +
      sw('hideValues', '🙈 Modo privacidade', 'Embaça os valores; um toque revela o que você quiser ver.', s.hideValues) +
      '<div class="field" style="margin-top:14px"><label for="st-start">Tela inicial</label>' +
      '<select id="st-start" data-act="noop">' +
      [['dashboard', 'Painel'], ['transactions', 'Extrato'], ['goals', 'Metas'],
      ['investments', 'Carteira'], ['notes', 'Notas']].map(function (p) {
        return '<option value="' + p[0] + '"' + (s.startPage === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
      }).join('') + '</select></div>' +
      '<button class="btn btn-ghost btn-block btn-sm" type="button" data-act="pick-charts">📊 Escolher gráficos do painel</button>' +
      '</div>';

    /* ── segurança ── */
    var encOn = user.enc === 'aes';
    html += '<div class="section-title" id="anchor-seguranca"><h3>Segurança</h3></div><div class="card">' +
      '<div class="callout ' + (encOn ? 'callout-good' : 'callout-warn') + '" style="margin-bottom:14px">' +
      '<span class="ic">' + (encOn ? '🔐' : '⚠️') + '</span><span>' +
      (encOn
        ? 'Seus dados estão criptografados com <b>AES-256-GCM</b>. A chave é derivada da sua senha com ' +
        '<b>PBKDF2-SHA256</b>, ' + (user.kdf ? user.kdf.iters.toLocaleString('pt-BR') : '') +
        ' iterações. Nem o app nem ninguém lê o cofre sem a senha ou o código de recuperação.'
        : 'A criptografia está <b>indisponível</b> neste contexto (o navegador não expõe <code>crypto.subtle</code>). ' +
        'A senha protege o acesso, mas o conteúdo fica legível no armazenamento. Abra o app por <b>https://</b> ou <b>localhost</b>.') +
      '</span></div>' +
      '<div class="field"><label for="st-lock">Trancar após inatividade: <b id="st-lock-val">' +
      (s.autoLockMin ? s.autoLockMin + ' min' : 'nunca') + '</b></label>' +
      '<input type="range" id="st-lock" min="0" max="120" step="5" value="' + s.autoLockMin + '" />' +
      '<p class="hint">Em 0, o app nunca tranca sozinho.</p></div>' +
      '<div class="menu-list">' +
      mi('change-password', '🔑', 'Trocar senha', 'A chave dos dados não muda: é instantâneo') +
      (encOn ? mi('new-recovery', '🎫', 'Novo código de recuperação',
        user.recovery && user.recovery.acknowledged ? 'Invalida o código atual' : '⚠️ você ainda não confirmou ter guardado o atual') : '') +
      mi('logout', '🚪', 'Sair da conta', 'Tranca o cofre neste aparelho') +
      '</div></div>';

    /* ── dados e histórico ── */
    html += '<div class="section-title" id="anchor-dados"><h3>Dados e histórico</h3></div><div class="card">' +
      '<div class="kv-list">' +
      '<div class="kv"><span class="k">Lançamentos</span><span class="v">' + data.transactions.length + '</span></div>' +
      '<div class="kv"><span class="k">Metas · Notas · Ativos</span><span class="v">' +
      data.goals.length + ' · ' + data.notes.length + ' · ' + data.investments.length + '</span></div>' +
      '<div class="kv"><span class="k">Pontos de restauração</span><span class="v">' + snaps.length + '</span></div>' +
      '<div class="kv"><span class="k">Espaço usado</span><span class="v">' + Dm.fmtBytes(usage.mine) + '</span></div>' +
      '<div class="kv"><span class="k">Formato do cofre</span><span class="v">v' + data.schema + '</span></div>' +
      '</div>' +
      sw('autoSnapshot', '🕒 Backup automático',
        'Guarda um ponto de restauração a cada 30 minutos de uso, e sempre antes de uma atualização do app.', s.autoSnapshot) +
      '<div class="field" style="margin-top:14px"><label for="st-keep">Pontos guardados: <b id="st-keep-val">' +
      s.snapshotKeep + '</b></label>' +
      '<input type="range" id="st-keep" min="5" max="100" step="5" value="' + s.snapshotKeep + '" />' +
      '<p class="hint">Pontos manuais, de importação e de atualização nunca são descartados automaticamente.</p></div>' +
      '<div class="btn-row" style="margin-top:12px">' +
      '<button class="btn btn-soft btn-sm" type="button" data-act="snapshot-now">📌 Criar ponto</button>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-act="show-history">🕘 Histórico</button>' +
      '</div>' +
      '<div class="btn-row" style="margin-top:9px">' +
      '<button class="btn btn-ghost btn-sm" type="button" data-act="export-json">💾 Exportar</button>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-act="import-json">📥 Importar</button>' +
      '</div>' +
      '<p class="fine-print" style="margin-top:11px">O backup exportado é um JSON <b>sem criptografia</b> — ' +
      'guarde-o em lugar seguro. É o único jeito de levar seus dados para outro aparelho.</p>' +
      '</div>';

    /* ── cotações ── */
    html += '<div class="section-title"><h3>Cotações</h3></div><div class="card">' +
      '<div class="field"><label for="st-brapi">Token da BRAPI</label>' +
      '<input type="text" id="st-brapi" placeholder="deixe vazio para usar o token de demonstração" ' +
      'value="' + esc(s.brapiToken || '') + '" autocapitalize="off" spellcheck="false" />' +
      '<p class="hint">O token gratuito de demonstração tem limite baixo de requisições. ' +
      'Crie um token em brapi.dev e cole aqui para atualizar a carteira sem bloqueio.</p></div>' +
      '<button class="btn btn-ghost btn-block btn-sm" type="button" data-act="save-brapi">Salvar token</button>' +
      '</div>';

    /* ── zona de risco ── */
    html += '<div class="section-title"><h3>Zona de risco</h3></div><div class="card">' +
      '<button class="btn btn-danger btn-block btn-sm" type="button" data-act="wipe-data">🧹 Apagar todos os dados</button>' +
      '<button class="btn btn-danger btn-block btn-sm" type="button" data-act="delete-account" style="margin-top:9px">' +
      '💥 Excluir conta e cofre</button>' +
      '<p class="fine-print" style="margin-top:11px">Apagar dados cria um ponto de restauração antes, e dá para voltar atrás. ' +
      'Excluir a conta <b>não</b> — some tudo, sem volta.</p></div>';

    /* ── sobre ── */
    html += '<div class="card" style="margin-top:12px">' +
      '<p class="tiny muted" style="letter-spacing:.14em;text-transform:uppercase">Sobre</p>' +
      '<p style="font-weight:600;margin-top:3px">Dominus Finance v' + Dm.version + '</p>' +
      '<p class="fine-print" style="margin-top:6px">Aplicativo instalável que funciona sem internet. ' +
      'Nenhum dado seu sai deste aparelho: não existe servidor, conta na nuvem nem rastreamento. ' +
      'Cotações são a única chamada externa, e só quando você pede.</p>' +
      '<p class="fine-print" style="margin-top:8px">Formato do cofre v' + Dm.schema +
      ' · migração automática com ponto de restauração em toda atualização.</p>' +
      '</div>';

    document.getElementById('settings-content').innerHTML = html;
    bindSettings();
  };

  function sw(key, title, desc, on) {
    return '<div class="switch-row"><div class="sr-text"><b>' + title + '</b><span>' + desc + '</span></div>' +
      '<label class="switch"><input type="checkbox" data-setting="' + key + '"' + (on ? ' checked' : '') + ' /><i></i></label></div>';
  }
  function mi(act, icon, title, sub) {
    return '<button class="menu-item" type="button" data-act="' + act + '">' +
      '<span class="mi-ic">' + icon + '</span><span class="mi-text"><b>' + esc(title) + '</b>' +
      '<span>' + esc(sub) + '</span></span><span class="mi-arrow">›</span></button>';
  }

  function bindSettings() {
    var root = document.getElementById('settings-content');

    root.querySelectorAll('[data-setting]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        DB.data.settings[inp.getAttribute('data-setting')] = inp.checked;
        DB.save();
        UI.applySettings();
        if (['amoled', 'cvdSafe', 'compactList'].indexOf(inp.getAttribute('data-setting')) >= 0) {
          UI.renderers.settings();
        }
      });
    });

    var lock = root.querySelector('#st-lock');
    if (lock) {
      lock.addEventListener('input', function () {
        root.querySelector('#st-lock-val').textContent = +lock.value ? lock.value + ' min' : 'nunca';
      });
      lock.addEventListener('change', function () {
        DB.data.settings.autoLockMin = +lock.value;
        DB.save();
        Auth.touchActivity();
        UI.ok(+lock.value ? 'Tranca em ' + lock.value + ' min de inatividade' : 'Tranca automática desligada');
      });
    }

    var keep = root.querySelector('#st-keep');
    if (keep) {
      keep.addEventListener('input', function () { root.querySelector('#st-keep-val').textContent = keep.value; });
      keep.addEventListener('change', function () {
        DB.data.settings.snapshotKeep = +keep.value;
        DB.save();
      });
    }

    var start = root.querySelector('#st-start');
    if (start) start.addEventListener('change', function () {
      DB.data.settings.startPage = start.value;
      DB.save();
      UI.ok('Tela inicial: ' + start.options[start.selectedIndex].text);
    });
  }

  UI.register({
    'noop': function () { },

    'set-accent': function (ds) {
      DB.data.settings.accent = ds.c;
      DB.save();
      UI.applySettings();
      UI.renderers.settings();
    },

    'save-brapi': function () {
      var inp = document.getElementById('st-brapi');
      DB.data.settings.brapiToken = (inp.value || '').trim();
      DB.save();
      UI.ok('Token salvo');
    },

    'edit-profile': function () {
      var p = DB.data.profile;
      UI.openSheet(
        UI.sheetHead('Seu perfil') +
        '<div class="field"><label for="pf-name">Nome exibido</label>' +
        '<input type="text" id="pf-name" maxlength="40" value="' + esc(p.displayName) + '" /></div>' +
        '<label class="label">Ícone</label>' + UI.emojiPicker(p.avatar, 'avatar') +
        '<p class="fine-print" style="margin-top:14px">O nome de usuário (@' +
        esc((Auth.current || {}).username || '') + ') não muda: é a sua credencial de acesso.</p>' +
        '<button class="btn btn-primary btn-block" type="button" id="pf-save" style="margin-top:14px">Salvar</button>',
        {
          onOpen: function (body) {
            UI.bindPickers(body);
            body.querySelector('#pf-save').addEventListener('click', function () {
              var nm = UI.val(body, 'pf-name');
              if (!nm) { UI.err('Informe um nome.'); return; }
              DB.data.profile.displayName = nm;
              DB.data.profile.avatar = UI.pick.avatar || p.avatar;
              if (Auth.current) {
                Auth.current.displayName = nm;
                Auth.current.avatar = DB.data.profile.avatar;
                Auth.update(Auth.current);
              }
              UI.closeSheet();
              UI.applySettings();
              UI.commit('Perfil atualizado');
            });
          }
        }
      );
    },

    'change-password': function () {
      UI.openSheet(
        UI.sheetHead('Trocar senha', {
          sub: 'A chave que criptografa seus dados continua a mesma — ela é apenas reembrulhada com a senha nova. ' +
            'Por isso é instantâneo, mesmo com anos de histórico.'
        }) +
        '<div class="field"><label for="cp-old">Senha atual</label>' +
        '<input type="password" id="cp-old" autocomplete="current-password" /></div>' +
        '<div class="field"><label for="cp-new">Nova senha</label>' +
        '<input type="password" id="cp-new" autocomplete="new-password" />' +
        '<div class="pw-meter" id="cp-meter"><i></i><i></i><i></i><i></i><i></i></div></div>' +
        '<div class="field"><label for="cp-new2">Repita a nova senha</label>' +
        '<input type="password" id="cp-new2" autocomplete="new-password" /></div>' +
        '<p class="field err" id="cp-err" hidden></p>' +
        '<button class="btn btn-primary btn-block" type="button" id="cp-save">Trocar senha</button>',
        {
          focus: '#cp-old',
          onOpen: function (body) {
            var np = body.querySelector('#cp-new');
            np.addEventListener('input', function () {
              body.querySelector('#cp-meter').className = 'pw-meter s' + Sec.strength(np.value).score;
            });
            body.querySelector('#cp-save').addEventListener('click', function () {
              var btn = body.querySelector('#cp-save');
              var err = body.querySelector('#cp-err');
              var p1 = np.value, p2 = body.querySelector('#cp-new2').value;
              if (p1 !== p2) { err.hidden = false; err.textContent = 'As senhas novas não são iguais.'; return; }
              err.hidden = true;
              btn.disabled = true;
              btn.innerHTML = '<span class="spin">⏳</span> Derivando chave…';
              setTimeout(function () {
                Auth.changePassword(body.querySelector('#cp-old').value, p1)
                  .then(function () { UI.closeSheet(); UI.ok('Senha trocada'); UI.renderers.settings(); })
                  .catch(function (e) {
                    btn.disabled = false;
                    btn.textContent = 'Trocar senha';
                    err.hidden = false;
                    err.textContent = e.message || 'Não foi possível trocar.';
                  });
              }, 60);
            });
          }
        }
      );
    },

    'new-recovery': function () {
      UI.openSheet(
        UI.sheetHead('Novo código de recuperação', {
          sub: 'Confirme sua senha. O código atual deixa de funcionar na hora.'
        }) +
        '<div class="field"><label for="nr-pass">Sua senha</label>' +
        '<input type="password" id="nr-pass" autocomplete="current-password" /></div>' +
        '<p class="field err" id="nr-err" hidden></p>' +
        '<button class="btn btn-primary btn-block" type="button" id="nr-go">Gerar novo código</button>',
        {
          focus: '#nr-pass',
          onOpen: function (body) {
            body.querySelector('#nr-go').addEventListener('click', function () {
              var btn = body.querySelector('#nr-go'), err = body.querySelector('#nr-err');
              btn.disabled = true;
              btn.innerHTML = '<span class="spin">⏳</span> Gerando…';
              setTimeout(function () {
                Auth.regenerateRecovery(body.querySelector('#nr-pass').value)
                  .then(function (code) {
                    UI.closeSheet();
                    Dm.AuthUI.showRecovery(code, false);
                  })
                  .catch(function (e) {
                    btn.disabled = false;
                    btn.textContent = 'Gerar novo código';
                    err.hidden = false;
                    err.textContent = e.message || 'Falhou.';
                  });
              }, 60);
            });
          }
        }
      );
    },

    'logout': function () {
      UI.confirm({
        title: 'Sair da conta?',
        text: 'O cofre é trancado neste aparelho. Seus dados continuam aqui, criptografados, ' +
          'e voltam quando você entrar de novo.',
        confirmLabel: 'Sair'
      }).then(function (yes) {
        if (!yes) return;
        DB.saveNow().then(function () {
          Auth.logout();
          UI.closeAllSheets();
          Dm.AuthUI.login();
        });
      });
    },

    'snapshot-now': function () {
      DB.snapshot('Ponto criado por você', 'manual').then(function (r) {
        if (r && r.ok === false) UI.err('Sem espaço para gravar o ponto. Apague pontos antigos no histórico.');
        else { UI.ok('Ponto de restauração criado'); UI.renderers.settings(); }
      });
    },

    'show-history': function () {
      var snaps = History.list(DB.userId);
      var LABELS = {
        auto: ['🕒', 'automático'], manual: ['📌', 'você criou'],
        migration: ['🔧', 'antes de migrar o formato'], update: ['⬆️', 'antes de atualizar o app'],
        import: ['📥', 'antes de importar'], 'pre-restore': ['↩︎', 'antes de restaurar'],
        'pre-wipe': ['🧹', 'antes de apagar tudo']
      };
      UI.openSheet(
        UI.sheetHead('Histórico de versões', {
          sub: 'Cada ponto é uma fotografia completa do seu cofre. Restaurar não apaga nada: ' +
            'o estado atual é guardado antes, então sempre dá para voltar.'
        }) +
        (snaps.length
          ? '<div class="stack-sm">' + snaps.map(function (sn) {
            var L = LABELS[sn.reason] || ['💾', sn.reason];
            return '<div class="snap-row"><span class="sn-ic">' + L[0] + '</span>' +
              '<span class="sn-body"><b>' + esc(sn.label) + '</b>' +
              '<span>' + new Date(sn.at).toLocaleString('pt-BR') + ' · ' + L[1] + '</span>' +
              '<span>' + (sn.counts.tx || 0) + ' lançamentos · ' + (sn.counts.goals || 0) + ' metas · ' +
              (sn.counts.notes || 0) + ' notas · ' + Dm.fmtBytes(sn.bytes) + '</span></span>' +
              '<span class="item-side">' +
              '<button class="btn btn-soft btn-xs" type="button" data-act="restore-snap" data-id="' + sn.id + '">restaurar</button>' +
              '<button class="btn btn-ghost btn-xs" type="button" data-act="del-snap" data-id="' + sn.id + '">✕</button>' +
              '</span></div>';
          }).join('') + '</div>'
          : '<div class="empty"><span class="ic">🕘</span><h4>Nenhum ponto ainda</h4>' +
          '<p>Os pontos automáticos começam a aparecer conforme você usa o app.</p>' +
          '<button class="btn btn-soft btn-sm" type="button" data-act="snapshot-now">Criar o primeiro</button></div>'),
        {}
      );
    },

    'restore-snap': function (ds) {
      var sn = History.list(DB.userId).filter(function (x) { return x.id === ds.id; })[0];
      if (!sn) return;
      UI.confirm({
        title: 'Restaurar este ponto?',
        text: 'Seus dados voltam ao estado de <b>' + new Date(sn.at).toLocaleString('pt-BR') + '</b> (' +
          (sn.counts.tx || 0) + ' lançamentos). O estado atual é salvo como um novo ponto antes, ' +
          'então isso pode ser desfeito.',
        confirmLabel: 'Restaurar'
      }).then(function (yes) {
        if (!yes) return;
        DB.restore(ds.id).then(function () {
          UI.closeAllSheets();
          UI.applySettings();
          UI.go('dashboard');
          UI.ok('Dados restaurados');
        }).catch(function (e) {
          UI.err('Não foi possível restaurar: ' + (e.message || e));
        });
      });
    },

    'del-snap': function (ds) {
      History.remove(DB.userId, ds.id);
      UI.actions['show-history']();
      UI.ok('Ponto removido');
    },

    'export-json': function () {
      var pack = Backup.build(DB.data);
      var ok = UI.download(Backup.filename(DB.data), JSON.stringify(pack, null, 2));
      if (ok) {
        DB.data.meta.lastExportAt = new Date().toISOString();
        DB.save();
        UI.ok('Backup exportado');
      } else UI.err('O navegador bloqueou o download.');
    },

    'import-json': function () {
      UI.openSheet(
        UI.sheetHead('Importar backup', {
          sub: 'Aceita o backup do Dominus e também o JSON cru da versão antiga. ' +
            'Um ponto de restauração é criado antes de qualquer alteração.'
        }) +
        '<div class="field"><label for="im-file">Arquivo .json</label>' +
        '<input type="file" id="im-file" accept=".json,application/json" ' +
        'style="width:100%;padding:12px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r)" /></div>' +
        '<label class="label">Como juntar com o que já existe</label>' +
        '<div class="opt-list" data-picker="mode">' +
        '<button type="button" class="opt active" data-pick="merge"><span class="ic">🔗</span>' +
        '<span class="grow"><b>Mesclar</b><span>Adiciona o que falta e ignora o que já existe. Nada é perdido.</span></span>' +
        '<span class="check">✓</span></button>' +
        '<button type="button" class="opt" data-pick="replace"><span class="ic">♻️</span>' +
        '<span class="grow"><b>Substituir</b><span>Troca todos os dados pelos do arquivo. Use ao mudar de aparelho.</span></span>' +
        '<span class="check">✓</span></button>' +
        '</div>' +
        '<p class="field err" id="im-err" hidden></p>' +
        '<button class="btn btn-primary btn-block" type="button" id="im-go" style="margin-top:14px">Importar</button>',
        {
          onOpen: function (body) {
            UI.bindPickers(body);
            body.querySelector('#im-go').addEventListener('click', function () {
              var f = body.querySelector('#im-file').files[0];
              var err = body.querySelector('#im-err');
              if (!f) { err.hidden = false; err.textContent = 'Escolha um arquivo.'; return; }
              var btn = body.querySelector('#im-go');
              btn.disabled = true;
              btn.innerHTML = '<span class="spin">⏳</span> Lendo…';
              var fr = new FileReader();
              fr.onload = function () {
                var parsed;
                try { parsed = Backup.parse(String(fr.result)); }
                catch (e) {
                  btn.disabled = false; btn.textContent = 'Importar';
                  err.hidden = false;
                  err.textContent = e.message === 'BACKUP_INVALIDO'
                    ? 'Esse arquivo não parece um backup do Dominus.'
                    : 'Não consegui ler o arquivo: ' + e.message;
                  return;
                }
                Backup.apply(parsed, UI.pick.mode || 'merge').then(function () {
                  UI.closeAllSheets();
                  UI.applySettings();
                  UI.go('dashboard');
                  UI.ok('Backup importado · ' + DB.data.transactions.length + ' lançamentos');
                }).catch(function (e) {
                  btn.disabled = false; btn.textContent = 'Importar';
                  err.hidden = false;
                  err.textContent = 'Falhou: ' + (e.message || e);
                });
              };
              fr.onerror = function () {
                btn.disabled = false; btn.textContent = 'Importar';
                err.hidden = false; err.textContent = 'Não consegui abrir o arquivo.';
              };
              fr.readAsText(f);
            });
          }
        }
      );
    },

    'wipe-data': function () {
      UI.confirm({
        title: 'Apagar todos os dados?',
        text: 'Lançamentos, metas, notas, carteira e plano voltam ao zero. Sua conta e sua senha permanecem.' +
          '<br><br>Um ponto de restauração é criado antes, então <b>isso pode ser desfeito</b> no histórico.',
        confirmLabel: 'Apagar tudo', danger: true
      }).then(function (yes) {
        if (!yes) return;
        DB.snapshot('Antes de apagar todos os dados', 'pre-wipe').then(function () {
          var keepSettings = Dm.deepClone(DB.data.settings);
          var keepProfile = Dm.deepClone(DB.data.profile);
          DB.data = Dm.Schema.normalize(Dm.Schema.blank(keepProfile.displayName));
          DB.data.settings = keepSettings;
          DB.data.profile = keepProfile;
          DB.data.profile.onboarded = true;
          return DB.saveNow({ noSnapshot: true });
        }).then(function () {
          UI.closeAllSheets();
          UI.go('dashboard');
          UI.ok('Dados apagados — recuperáveis no histórico');
        });
      });
    },

    'delete-account': function () {
      UI.openSheet(
        UI.sheetHead('Excluir conta', { level: 2 }) +
        '<div class="callout callout-danger"><span class="ic">💥</span>' +
        '<span>Isto apaga <b>a conta, o cofre e todo o histórico de versões</b> deste aparelho. ' +
        'Não existe cópia em servidor nenhum — <b>não há como recuperar</b>. ' +
        'Se quiser guardar seus dados, exporte o backup antes.</span></div>' +
        '<div class="field" style="margin-top:14px"><label for="da-pass">Confirme com sua senha</label>' +
        '<input type="password" id="da-pass" autocomplete="current-password" /></div>' +
        '<div class="field"><label for="da-word">Digite EXCLUIR para confirmar</label>' +
        '<input type="text" id="da-word" placeholder="EXCLUIR" autocapitalize="characters" /></div>' +
        '<p class="field err" id="da-err" hidden></p>' +
        '<button class="btn btn-ghost btn-block btn-sm" type="button" data-act="export-json">💾 Exportar backup primeiro</button>' +
        '<button class="btn btn-danger btn-block" type="button" id="da-go" style="margin-top:9px">Excluir definitivamente</button>',
        {
          level: 2,
          onOpen: function (body) {
            body.querySelector('#da-go').addEventListener('click', function () {
              var err = body.querySelector('#da-err');
              if (UI.val(body, 'da-word').toUpperCase() !== 'EXCLUIR') {
                err.hidden = false; err.textContent = 'Digite EXCLUIR para confirmar.';
                return;
              }
              var btn = body.querySelector('#da-go');
              btn.disabled = true;
              btn.innerHTML = '<span class="spin">⏳</span> Excluindo…';
              Auth.deleteAccount(body.querySelector('#da-pass').value)
                .then(function () {
                  UI.closeAllSheets();
                  Dm.AuthUI.login();
                  UI.toast('Conta excluída');
                })
                .catch(function (e) {
                  btn.disabled = false;
                  btn.textContent = 'Excluir definitivamente';
                  err.hidden = false;
                  err.textContent = e.message || 'Falhou.';
                });
            });
          }
        }
      );
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
