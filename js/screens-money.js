/* ═══════════════════════════════════════════════════════════════
   Dominus Finance — PAINEL · EXTRATO · RELATÓRIOS
   O lançamento rápido entende o que você escreve ("mercado 89,90
   ontem") e já preenche valor, data e categoria. O formulário
   completo continua ali, um toque abaixo.
═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var Dm = global.Dominus;
  var UI = Dm.UI, DB = Dm.DB, F = Dm.F, Money = Dm.Money, D = Dm.D, Chart = Dm.Chart;
  var esc = Dm.esc, clamp = Dm.clamp, uid = Dm.uid, Insights = Dm.Insights;

  /* ═══════════════════════════════════════════
     PAINEL
  ═══════════════════════════════════════════ */

  UI.renderers.dashboard = function () {
    var data = DB.data;
    var el = document.getElementById('dash-content');
    var g = document.getElementById('dash-greeting');
    var h = new Date().getHours();
    if (g) {
      g.textContent = (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite') + ', ' +
        data.profile.displayName.split(' ')[0] + ' ' + (data.profile.avatar || '👋');
    }

    var cur = D.monthKey(D.today());
    var month = F.totals(F.inMonth(data.transactions, cur));
    var prev = F.totals(F.inMonth(data.transactions, D.addMonthKey(cur, -1)));
    var nw = F.netWorth(data);
    var em = F.emergency(data);
    var goals = F.goalsSummary(data);
    var score = Insights.score(data);
    var insights = Insights.build(data);
    var series = F.monthlySeries(data, 6);

    var html = '';

    /* ── saldo ── */
    html += '<div class="hero-card">' +
      '<p class="hero-label">Saldo em conta</p>' +
      '<p class="hero-value money-mask"' + (nw.cash < 0 ? ' style="color:var(--expense)"' : '') + '>' +
      esc(Money.fmt(nw.cash)) + '</p>' +
      '<p class="hero-note">Patrimônio total ' + UI.money(nw.total) +
      (nw.invested ? ' · investido ' + UI.money(nw.invested) : '') + '</p>' +
      '<div class="split">' +
      '<div class="mini pos-tint"><p class="mini-label">Receitas de ' + D.monthLabelShort(cur) + '</p>' +
      '<p class="mini-value" style="color:' + Chart.incomeColor() + '">' + UI.money(month.income) + '</p></div>' +
      '<div class="mini neg-tint"><p class="mini-label">Despesas de ' + D.monthLabelShort(cur) + '</p>' +
      '<p class="mini-value" style="color:var(--expense)">' + UI.money(month.expense) + '</p></div>' +
      '</div></div>';

    /* ── nota de saúde ── */
    var circ = 2 * Math.PI * 36;
    html += '<div class="card" style="margin-top:12px">' +
      '<div class="score-card">' +
      '<div class="score-ring"><svg viewBox="0 0 84 84" aria-hidden="true">' +
      '<circle cx="42" cy="42" r="36" fill="none" stroke="var(--border)" stroke-width="7"/>' +
      '<circle cx="42" cy="42" r="36" fill="none" stroke="' + score.color + '" stroke-width="7" stroke-linecap="round" ' +
      'stroke-dasharray="' + (circ * score.value / 100).toFixed(1) + ' ' + circ.toFixed(1) + '" class="dv-ring"/>' +
      '</svg><span class="val"><b>' + score.value + '</b><span>de 100</span></span></div>' +
      '<div class="score-info">' +
      '<p class="lbl" style="color:' + score.color + '">Saúde financeira: ' + score.label + '</p>' +
      '<p class="msg">' + esc(score.message) + '</p>' +
      '</div></div>' +
      '<button class="dv-table-btn" type="button" data-act="toggle-pillars" aria-expanded="false">Como essa nota é calculada</button>' +
      '<div class="pillars" id="score-pillars" hidden>' +
      score.pillars.map(function (p) {
        var pts = p.points == null ? 0 : p.points;
        var pctFill = p.weight ? clamp(pts / p.weight * 100, 0, 100) : 0;
        return '<div><div class="pillar-row">' +
          '<span class="pl-name">' + esc(p.label) + '</span>' +
          '<span class="pl-track"><span class="pl-fill" style="width:' + pctFill + '%;background:' +
          (p.points == null ? 'var(--border)' : score.color) + '"></span></span>' +
          '<span class="pl-pts">' + (p.points == null ? '—' : Math.round(pts) + '/' + p.weight) + '</span>' +
          '</div><p class="pillar-detail">' + esc(p.detail) + '</p></div>';
      }).join('') +
      (score.measurable < 100 ? '<p class="fine-print">Pilares sem dado não derrubam a nota: ela é calculada sobre os ' +
        score.measurable + ' pontos que dá para medir hoje. Quanto mais você lança, mais honesta ela fica.</p>' : '') +
      '</div></div>';

    /* ── recomendações do topo ── */
    var topIns = insights.slice(0, 2);
    if (topIns.length) {
      html += '<div class="section-title"><h3>💡 Para você agora</h3>' +
        '<button class="link" type="button" data-act="all-insights">Ver todas (' + insights.length + ')</button></div>';
      html += topIns.map(insightHTML).join('');
    }

    /* ── atalhos de estado ── */
    html += '<div class="split-3" style="margin-top:14px">' +
      '<button class="stat-tile" type="button" data-act="goto" data-page="goals">' +
      '<span class="k">Metas</span><span class="v">' + (goals.count ? goals.pct + '%' : '—') + '</span></button>' +
      '<button class="stat-tile" type="button" data-act="goto" data-page="plan" data-anchor="reserva">' +
      '<span class="k">Reserva</span><span class="v">' + (em.target ? em.pct + '%' : '—') + '</span></button>' +
      '<button class="stat-tile" type="button" data-act="goto" data-page="investments">' +
      '<span class="k">Carteira</span><span class="v">' + (nw.portfolio.count ? UI.money(nw.portfolio.market, { noCents: true }) : '—') + '</span></button>' +
      '</div>';

    /* ── gráficos escolhidos pelo usuário ── */
    var picked = data.settings.dashboardCharts || [];
    if (picked.length) {
      html += '<div class="section-title"><h3>Seus gráficos</h3>' +
        '<button class="link" type="button" data-act="pick-charts">Escolher</button></div>';
      html += picked.map(function (k) { return chartByKey(k, data, series, cur); }).join('');
    } else {
      html += '<div class="section-title"><h3>Seus gráficos</h3></div>' +
        '<div class="empty"><span class="ic">📊</span><h4>Nenhum gráfico no painel</h4>' +
        '<p>Escolha quais visualizações você quer ver aqui todo dia.</p>' +
        '<button class="btn btn-soft btn-sm" type="button" data-act="pick-charts">Escolher gráficos</button></div>';
    }

    /* ── últimos lançamentos ── */
    html += '<div class="section-title"><h3>Últimos lançamentos</h3>' +
      '<button class="link" type="button" data-act="goto" data-page="transactions">Ver extrato</button></div>';
    var recent = data.transactions.slice(0, 5);
    html += recent.length
      ? '<div class="list">' + recent.map(function (t) { return txItem(t, data); }).join('') + '</div>'
      : '<div class="empty"><span class="ic">🧾</span><h4>Nada lançado ainda</h4>' +
      '<p>Registre sua primeira receita ou despesa — o painel inteiro se monta a partir daí.</p>' +
      '<button class="btn btn-primary btn-sm" type="button" data-act="quick-add">Lançar agora</button></div>';

    html += '<p class="fine-print center" style="margin:22px 0 6px">' +
      'Comparado a ' + D.monthLabel(D.addMonthKey(cur, -1)) + ': despesas ' +
      (prev.expense ? Money.growth(month.expense, prev.expense) + '%' : 'sem base') +
      ' · receitas ' + (prev.income ? Money.growth(month.income, prev.income) + '%' : 'sem base') + '</p>';

    el.innerHTML = html;
  };

  var CHART_CATALOG = [
    { key: 'cashflow', name: 'Fluxo de caixa', desc: 'Receitas × despesas mês a mês', icon: '💸' },
    { key: 'categories', name: 'Para onde foi o dinheiro', desc: 'Ranking de despesas por categoria', icon: '🧾' },
    { key: 'balance', name: 'Evolução do saldo', desc: 'Linha do saldo acumulado', icon: '📈' },
    { key: 'savings', name: 'Taxa de poupança', desc: 'Quanto da renda sobra, contra a sua meta', icon: '🪙' },
    { key: 'budget', name: 'Orçamento do mês', desc: 'Gasto × teto, com marca de ritmo', icon: '🎚️' },
    { key: 'groups', name: 'Equilíbrio 50/30/20', desc: 'Essencial × estilo de vida × futuro', icon: '⚖️' },
    { key: 'donut', name: 'Composição das despesas', desc: 'Rosca das maiores categorias', icon: '🍩' },
    { key: 'heatmap', name: 'Ritmo de gastos', desc: 'Mapa de calor por dia do mês', icon: '🗓️' },
    { key: 'weekdays', name: 'Dias que pesam mais', desc: 'Gasto por dia da semana', icon: '📅' },
    { key: 'allocation', name: 'Alocação da carteira', desc: 'Ações, FIIs e renda fixa', icon: '🧺' },
    { key: 'projection', name: 'Projeção de patrimônio', desc: 'Para onde o seu aporte leva', icon: '🔮' },
    { key: 'goals', name: 'Progresso das metas', desc: 'Anéis de cada objetivo', icon: '🎯' }
  ];
  Dm.CHART_CATALOG = CHART_CATALOG;

  function chartByKey(key, data, series, cur) {
    try {
      switch (key) {
        case 'cashflow': return Chart.cashflow(series);
        case 'balance': return Chart.balance(series);
        case 'savings': return Chart.savings(series, data.plan.savingsTargetPct);
        case 'budget': return Chart.budget(F.budgetReport(data, cur));
        case 'groups': return Chart.groups(F.byGroup(data, F.inMonth(data.transactions, cur)),
          data.plan.monthlyIncome, data.plan.groupTargets, { method: data.plan.method });
        case 'categories': return Chart.categories(F.byCategory(data, F.inMonth(data.transactions, cur), 'expense'),
          { title: 'Despesas de ' + D.monthLabel(cur, true) });
        case 'donut': {
          var bc = F.byCategory(data, F.inMonth(data.transactions, cur), 'expense');
          return Chart.donut(F.foldCategories(bc.rows, 6).map(function (r) {
            return { label: r.emoji + ' ' + r.name, value: r.total, color: r.color };
          }), {
            title: 'Composição das despesas', subtitle: D.monthLabel(cur, true),
            centerLabel: 'no mês', emptyMsg: 'Nenhuma despesa neste mês.'
          });
        }
        case 'heatmap': return Chart.heatmap(F.dailySpend(data, cur));
        case 'weekdays': return Chart.weekdays(data, null);
        case 'allocation': {
          var pf = F.portfolio(data);
          return Chart.donut([
            { label: '📈 Ações', value: pf.byType.acao || 0, color: Chart.PAL.acao },
            { label: '🏢 FIIs', value: pf.byType.fii || 0, color: Chart.PAL.fii },
            { label: '🏦 Renda Fixa', value: pf.byType.rf || 0, color: Chart.PAL.rf }
          ], {
            title: 'Alocação da carteira',
            subtitle: pf.count + ' ativo(s) · ' + Money.fmt(pf.market),
            centerLabel: 'investido',
            emptyMsg: 'Cadastre ativos para ver a alocação da carteira.'
          });
        }
        case 'projection': {
          var avg = F.avgMonthly(data, 3);
          var pf2 = F.portfolio(data);
          var aporte = avg.net > 0 ? avg.net : Math.round(data.plan.monthlyIncome * data.plan.savingsTargetPct / 100);
          if (aporte <= 0) return Chart.empty('Projeção de patrimônio',
            'Precisa de um aporte mensal para projetar: registre receitas e despesas ou defina sua renda no plano.', '🔮');
          return Chart.projection(F.project({
            start: pf2.market, monthly: aporte, months: data.plan.horizonYears * 12,
            annualPct: data.plan.expectedReturnPct, inflationPct: data.plan.inflationPct
          }), { subtitle: 'Aportando ' + Money.fmt(aporte) + '/mês a ' + data.plan.expectedReturnPct + '% a.a.' });
        }
        case 'goals': return goalsRingCard(data);
        default: return '';
      }
    } catch (e) {
      console.error('[Dominus] gráfico "' + key + '" falhou', e);
      return Chart.empty('Gráfico indisponível', 'Não foi possível desenhar este gráfico agora.', '⚠️');
    }
  }
  Dm.chartByKey = chartByKey;

  function goalsRingCard(data) {
    var gs = (data.goals || []).filter(function (g) { return !g.archived; }).slice(0, 6);
    if (!gs.length) return Chart.empty('Progresso das metas', 'Crie uma meta para acompanhar o progresso aqui.', '🎯');
    return '<section class="dv-card"><header class="dv-head"><div>' +
      '<h3 class="dv-title">Progresso das metas</h3>' +
      '<p class="dv-sub">' + gs.length + ' meta(s) ativa(s)</p></div></header>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:12px">' +
      gs.map(function (g) {
        var st = F.goalStatus(data, g);
        return '<button type="button" class="center" style="background:none;border:0;padding:0" ' +
          'data-act="open-goal" data-id="' + g.id + '" data-tip="' + esc('<b>' + g.emoji + ' ' + g.name + '</b>' +
            Money.fmt(st.saved) + ' de ' + Money.fmt(g.target) + '<br>' + st.pct + '% concluído' +
            (st.neededMonthly ? '<hr>Precisa de ' + Money.fmt(st.neededMonthly) + '/mês' : '')) + '">' +
          Chart.ring(st.pct, g.color, 72, st.pct + '%', null) +
          '<span class="tiny truncate" style="display:block;margin-top:5px">' + g.emoji + ' ' + esc(g.name) + '</span>' +
          '</button>';
      }).join('') + '</div></section>';
  }

  function insightHTML(ins) {
    var act = '';
    if (ins.action) {
      act = '<div class="ins-act"><button class="btn btn-soft btn-sm" type="button" ' +
        'data-act="insight-action" data-kind="' + esc(ins.action.kind) + '" ' +
        'data-page="' + esc(ins.action.page || '') + '" data-anchor="' + esc(ins.action.anchor || '') + '" ' +
        'data-id="' + esc(ins.action.goalId || ins.action.txId || ins.action.categoryId || '') + '" ' +
        'data-preset="' + esc(ins.action.preset || ins.action.type || '') + '">' +
        esc(ins.action.label) + '</button></div>';
    }
    return '<article class="insight sev-' + ins.severity + '">' +
      '<span class="ins-ic" aria-hidden="true">' + ins.icon + '</span>' +
      '<div class="ins-body"><p class="ins-title">' + esc(ins.title) + '</p>' +
      '<p class="ins-text">' + ins.text + '</p>' + act + '</div></article>';
  }
  Dm.insightHTML = insightHTML;

  /* ═══════════════════════════════════════════
     EXTRATO
  ═══════════════════════════════════════════ */

  var txState = { month: null, type: 'all', cat: null, limit: 60 };
  Dm.txState = txState;

  UI.renderers.transactions = function (opts) {
    var data = DB.data;
    renderMonthChips(data);
    renderCatChips(data);

    var q = (document.getElementById('tx-search') || {}).value || '';
    q = q.toLowerCase().trim();
    var list = data.transactions.slice();

    if (txState.month) list = list.filter(function (t) { return D.monthKey(t.date) === txState.month; });
    if (txState.type !== 'all') list = list.filter(function (t) { return t.type === txState.type; });
    if (txState.cat) list = list.filter(function (t) { return t.categoryId === txState.cat; });
    if (q) {
      list = list.filter(function (t) {
        return t.desc.toLowerCase().indexOf(q) >= 0 ||
          (t.note || '').toLowerCase().indexOf(q) >= 0 ||
          (t.tags || []).join(' ').toLowerCase().indexOf(q) >= 0 ||
          Money.plain(t.amount).indexOf(q) >= 0;
      });
    }

    var tot = F.totals(list);
    document.getElementById('tx-summary').innerHTML =
      '<div class="split-3" style="margin-top:12px">' +
      '<div class="stat-tile"><span class="k">Entradas</span><span class="v" style="color:' +
      Chart.incomeColor() + '">' + UI.money(tot.income, { noCents: true }) + '</span></div>' +
      '<div class="stat-tile"><span class="k">Saídas</span><span class="v" style="color:var(--expense)">' +
      UI.money(tot.expense, { noCents: true }) + '</span></div>' +
      '<div class="stat-tile"><span class="k">Resultado</span><span class="v">' + UI.signed(tot.net) + '</span></div>' +
      '</div>' +
      (tot.count ? '<p class="fine-print center" style="margin-top:9px">' + tot.count +
        (tot.count === 1 ? ' lançamento' : ' lançamentos') +
        (txState.month || txState.cat || txState.type !== 'all' || q
          ? ' · <button class="link" type="button" data-act="clear-tx-filters">limpar filtros</button>' : '') +
        '</p>' : '');

    var shown = list.slice(0, txState.limit);
    var elList = document.getElementById('tx-list');

    if (!shown.length) {
      elList.innerHTML = '<div class="empty"><span class="ic">🔍</span><h4>Nada por aqui</h4>' +
        '<p>' + (data.transactions.length ? 'Nenhum lançamento corresponde aos filtros atuais.'
          : 'Seu extrato está vazio. Lance a primeira movimentação.') + '</p>' +
        '<button class="btn btn-primary btn-sm" type="button" data-act="' +
        (data.transactions.length ? 'clear-tx-filters' : 'quick-add') + '">' +
        (data.transactions.length ? 'Limpar filtros' : 'Novo lançamento') + '</button></div>';
    } else {
      /* agrupa por dia, com subtotal do dia no cabeçalho */
      var byDay = {}, order = [];
      shown.forEach(function (t) {
        if (!byDay[t.date]) { byDay[t.date] = []; order.push(t.date); }
        byDay[t.date].push(t);
      });
      elList.innerHTML = order.map(function (day) {
        var dt = F.totals(byDay[day]);
        return '<div class="date-sep"><span>' + esc(D.fmtRel(day)) + ' · ' +
          D.DIA_CURTO[D.dow(day)] + '</span><span>' + esc(Money.fmt(dt.net, { sign: true })) + '</span></div>' +
          byDay[day].map(function (t) { return txItem(t, data); }).join('');
      }).join('');
    }

    document.getElementById('tx-more').innerHTML = list.length > shown.length
      ? '<button class="btn btn-ghost btn-sm" type="button" data-act="tx-more">Mostrar mais (' +
      (list.length - shown.length) + ' restantes)</button>'
      : '';
  };

  function renderMonthChips(data) {
    var months = F.monthsWithData(data).slice(0, 18);
    var el = document.getElementById('tx-month-filter');
    if (!months.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<button class="chip' + (!txState.month ? ' active' : '') +
      '" type="button" data-act="tx-month" data-m="">Todos os meses</button>' +
      months.map(function (m) {
        return '<button class="chip' + (txState.month === m ? ' active' : '') +
          '" type="button" data-act="tx-month" data-m="' + m + '">' + D.monthLabel(m) + '</button>';
      }).join('');
  }

  function renderCatChips(data) {
    var used = {};
    data.transactions.forEach(function (t) { used[t.categoryId] = true; });
    var cats = data.categories.filter(function (c) { return used[c.id]; });
    var el = document.getElementById('tx-cat-filter');
    if (cats.length < 2) { el.innerHTML = ''; return; }
    el.innerHTML = '<button class="chip' + (!txState.cat ? ' active' : '') +
      '" type="button" data-act="tx-cat" data-c="">Todas</button>' +
      cats.map(function (c) {
        return '<button class="chip' + (txState.cat === c.id ? ' active' : '') +
          '" type="button" data-act="tx-cat" data-c="' + c.id + '">' + c.emoji + ' ' + esc(c.name) + '</button>';
      }).join('');
  }

  function txItem(t, data) {
    var c = F.cat(data, t.categoryId);
    var inc = t.type === 'income';
    var color = inc ? Chart.incomeColor() : 'var(--expense)';
    var extra = [];
    if (t.installment) extra.push(t.installment.n + '/' + t.installment.of);
    if (t.recurrenceId) extra.push('🔁');
    if (t.note) extra.push('📝');
    return '<button class="item" type="button" data-act="tx-menu" data-id="' + t.id + '">' +
      '<span class="item-icon" style="background:' + UI.hexA(c.color, .14) +
      ';border:1px solid ' + UI.hexA(c.color, .34) + '">' + c.emoji + '</span>' +
      '<span class="item-body">' +
      '<span class="item-title truncate">' + esc(t.desc) + '</span>' +
      '<span class="item-meta">' +
      '<span class="tag" style="background:' + UI.hexA(c.color, .14) + ';color:' + c.color + '">' + esc(c.name) + '</span>' +
      '<span class="tiny muted">' + esc(D.fmtShort(t.date)) + (extra.length ? ' · ' + extra.join(' ') : '') + '</span>' +
      '</span></span>' +
      '<span class="item-amount" style="color:' + color + '"><span class="money-mask">' +
      (inc ? '+' : '−') + esc(Money.fmt(t.amount)) + '</span></span>' +
      '</button>';
  }
  Dm.txItem = txItem;

  /* ═══════════════════════════════════════════
     LANÇAMENTO RÁPIDO
  ═══════════════════════════════════════════ */

  /* Palavras que identificam uma categoria pelo que a pessoa
     costuma escrever, não pelo nome oficial da categoria. */
  var KEYWORDS = {
    cat_mercado: ['mercado', 'supermercado', 'feira', 'hortifruti', 'atacad', 'compras do mes', 'açougue', 'padaria'],
    cat_alimentacao: ['ifood', 'lanche', 'almoço', 'almoco', 'jantar', 'restaurante', 'pizza', 'hamburguer', 'café', 'cafe', 'delivery', 'rappi', 'bar', 'sorvete'],
    cat_transporte: ['uber', 'gasolina', 'combustivel', 'combustível', 'ônibus', 'onibus', 'metrô', 'metro', 'estacionamento', 'pedágio', 'pedagio', 'taxi', '99', 'etanol', 'ipva', 'oficina', 'pneu'],
    cat_moradia: ['aluguel', 'condominio', 'condomínio', 'iptu', 'reforma', 'faxina', 'moveis', 'móveis'],
    cat_contas: ['luz', 'energia', 'água', 'agua', 'gás', 'gas', 'internet', 'telefone', 'celular', 'conta de', 'boleto'],
    cat_saude: ['farmacia', 'farmácia', 'remedio', 'remédio', 'medico', 'médico', 'dentista', 'plano de saude', 'exame', 'consulta', 'psicolog', 'academia'],
    cat_educacao: ['curso', 'faculdade', 'livro', 'escola', 'mensalidade', 'apostila', 'certificação'],
    cat_lazer: ['cinema', 'show', 'viagem', 'bar', 'festa', 'jogo', 'game', 'steam', 'balada', 'passeio', 'parque'],
    cat_compras: ['roupa', 'tenis', 'tênis', 'sapato', 'shopping', 'presente', 'eletronico', 'eletrônico', 'amazon', 'mercado livre', 'shopee'],
    cat_assinaturas: ['netflix', 'spotify', 'assinatura', 'youtube', 'disney', 'hbo', 'max', 'prime', 'icloud', 'drive', 'plano'],
    cat_dividas: ['cartao', 'cartão', 'fatura', 'juros', 'emprestimo', 'empréstimo', 'financiamento', 'parcela', 'divida', 'dívida'],
    cat_impostos: ['imposto', 'taxa', 'multa', 'darf', 'inss', 'irpf'],
    cat_investimento: ['aporte', 'investi', 'tesouro', 'cdb', 'acao', 'ação', 'fii'],
    cat_salario: ['salario', 'salário', 'pagamento', 'holerite', 'contracheque'],
    cat_extra: ['freela', 'freelance', 'bico', 'venda', 'vendi', 'servico', 'serviço', 'extra'],
    cat_rendimentos: ['rendimento', 'juros recebidos', 'cdi', 'poupança'],
    cat_dividendos: ['dividendo', 'provento', 'jcp', 'rendimento fii'],
    cat_reembolso: ['reembolso', 'presente', 'devolução', 'devolucao', 'estorno', 'cashback']
  };

  var INCOME_HINTS = ['salario', 'salário', 'recebi', 'receber', 'freela', 'venda', 'vendi', 'rendimento',
    'dividendo', 'provento', 'reembolso', 'estorno', 'cashback', 'pix recebido', 'entrada', 'bonus', 'bônus', '13'];

  function parseQuick(text) {
    var raw = String(text || '').trim();
    if (!raw) return null;
    var out = { type: null, amount: NaN, desc: '', date: D.today(), categoryId: null };

    if (/^\+/.test(raw)) { out.type = 'income'; raw = raw.slice(1).trim(); }
    else if (/^-/.test(raw)) { out.type = 'expense'; raw = raw.slice(1).trim(); }

    var rest = raw;

    /* data por palavra ou por dd/mm */
    var dateRe = /\b(hoje|ontem|anteontem|amanh[ãa]|\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?)\b/i;
    var dm = rest.match(dateRe);
    if (dm) {
      var parsed = D.fromText(dm[1]);
      if (parsed) { out.date = parsed; rest = rest.replace(dm[0], ' '); }
    }

    /* valor: o último número da frase, para "12x 200" cair em 200 */
    var nums = rest.match(/(?:r\$\s*)?\d+(?:[.,]\d+)*(?:\s*[kK])?/g);
    if (nums && nums.length) {
      var pick = nums[nums.length - 1];
      var cents = Money.parse(pick);
      if (isFinite(cents) && cents !== 0) {
        out.amount = Math.abs(cents);
        var at = rest.lastIndexOf(pick);
        rest = rest.slice(0, at) + ' ' + rest.slice(at + pick.length);
      }
    }

    out.desc = rest.replace(/\s+/g, ' ').replace(/^[\s,;:\-]+|[\s,;:\-]+$/g, '').slice(0, 80);

    var low = (out.desc + ' ' + raw).toLowerCase();
    if (!out.type) {
      out.type = INCOME_HINTS.some(function (w) { return low.indexOf(w) >= 0; }) ? 'income' : 'expense';
    }

    var best = null, bestLen = 0;
    Object.keys(KEYWORDS).forEach(function (cid) {
      KEYWORDS[cid].forEach(function (w) {
        if (low.indexOf(w) >= 0 && w.length > bestLen) { best = cid; bestLen = w.length; }
      });
    });
    if (best) {
      var c = F.catIndex(DB.data)[best];
      /* só aceita o palpite se a categoria for do tipo certo */
      if (c && c.kind === out.type) out.categoryId = best;
    }
    if (!out.categoryId) out.categoryId = out.type === 'income' ? 'cat_outras_receitas' : 'cat_outros';
    if (!out.desc) {
      out.desc = F.cat(DB.data, out.categoryId).name;
    }
    return out;
  }
  Dm.parseQuick = parseQuick;

  /* Combinações mais usadas nos últimos 90 dias — um toque
     repete um lançamento habitual por inteiro. */
  function frequentTemplates(data, limit) {
    var since = D.addDays(D.today(), -90);
    var groups = {};
    data.transactions.forEach(function (t) {
      if (t.date < since) return;
      var k = t.type + '|' + t.categoryId + '|' + t.desc.toLowerCase().trim();
      if (!groups[k]) groups[k] = { count: 0, t: t };
      groups[k].count++;
      if (t.date > groups[k].t.date) groups[k].t = t;
    });
    return Object.keys(groups).map(function (k) { return groups[k]; })
      .filter(function (g) { return g.count >= 2; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, limit || 6);
  }

  var txForm = { editing: null, advanced: false };

  UI.openTxSheet = function (tx, preset) {
    var data = DB.data;
    txForm.editing = tx ? tx.id : null;
    txForm.advanced = !!tx;
    var isEdit = !!tx;
    var t = tx || {
      type: (preset && preset.type) || 'expense', amount: 0, desc: '',
      categoryId: (preset && preset.categoryId) || null, accountId: 'acc_corrente',
      date: D.today(), note: '', tags: []
    };
    if (!t.categoryId) t.categoryId = t.type === 'income' ? 'cat_salario' : 'cat_mercado';

    var templates = isEdit ? [] : frequentTemplates(data, 6);

    var html = UI.sheetHead(isEdit ? 'Editar lançamento' : 'Novo lançamento',
      { flag: isEdit ? 'Editando' : null });

    if (!isEdit) {
      html += '<div class="field">' +
        '<label for="q-smart">Escreva do seu jeito</label>' +
        '<input type="text" id="q-smart" placeholder="ex: mercado 189,90 ontem" autocomplete="off" />' +
        '<p class="hint" id="q-echo">Eu identifico valor, data e categoria sozinho. Se errar, ajuste abaixo.</p>' +
        '</div>';
      if (templates.length) {
        html += '<label class="label">Repetir um lançamento habitual</label>' +
          '<div class="chip-scroll" id="q-templates">' +
          templates.map(function (g, i) {
            var c = F.cat(data, g.t.categoryId);
            return '<button class="chip" type="button" data-tpl="' + i + '">' + c.emoji + ' ' +
              esc(g.t.desc.slice(0, 20)) + ' · ' + Money.fmt(g.t.amount, { noCents: true }) + '</button>';
          }).join('') + '</div>';
      }
      html += '<hr class="divider" />';
    }

    html += '<div class="segmented" id="q-type" style="margin-bottom:14px">' +
      '<button type="button" class="is-income' + (t.type === 'income' ? ' active' : '') + '" data-type="income">↑ Receita</button>' +
      '<button type="button" class="is-expense' + (t.type === 'expense' ? ' active' : '') + '" data-type="expense">↓ Despesa</button>' +
      '</div>' +
      '<div class="field"><label for="q-amount">Valor</label>' +
      '<input type="text" id="q-amount" class="input-amount" inputmode="decimal" placeholder="0,00" ' +
      'value="' + (t.amount ? Money.plain(t.amount) : '') + '" />' +
      '<p class="hint center" id="q-amount-echo"></p></div>' +
      '<div class="field"><label for="q-desc">Descrição</label>' +
      '<input type="text" id="q-desc" maxlength="120" placeholder="ex: Mercado do mês" value="' + esc(t.desc) + '" /></div>' +
      '<label class="label">Categoria</label>' +
      '<div id="q-cats">' + UI.categoryGrid(t.type, t.categoryId, 'categoryId') + '</div>' +
      '<div class="field" style="margin-top:14px"><label>Data</label>' +
      '<div class="chip-scroll" id="q-dates">' +
      [['Hoje', D.today()], ['Ontem', D.addDays(D.today(), -1)], ['Anteontem', D.addDays(D.today(), -2)]]
        .map(function (p) {
          return '<button class="chip' + (t.date === p[1] ? ' active' : '') + '" type="button" data-date="' + p[1] + '">' + p[0] + '</button>';
        }).join('') +
      '</div>' +
      '<input type="date" id="q-date" value="' + esc(t.date) + '" style="margin-top:8px" /></div>' +
      '<button class="dv-table-btn" type="button" id="q-adv-toggle">' +
      (txForm.advanced ? 'Ocultar' : 'Mais opções') + '</button>' +
      '<div id="q-advanced"' + (txForm.advanced ? '' : ' hidden') + '>' +
      '<div class="field"><label for="f-account">Conta</label>' + UI.accountSelect(t.accountId, 'f-account') + '</div>' +
      '<div class="field"><label for="q-note">Observação</label>' +
      '<textarea id="q-note" maxlength="500" rows="2" placeholder="Algum detalhe que você queira lembrar depois">' + esc(t.note || '') + '</textarea></div>' +
      '<div class="field"><label for="q-tags">Etiquetas</label>' +
      '<input type="text" id="q-tags" placeholder="separe por vírgula: trabalho, reembolsável" value="' + esc((t.tags || []).join(', ')) + '" /></div>' +
      (!isEdit ? '<div class="field"><label for="q-inst">Parcelar em</label>' +
        '<input type="number" id="q-inst" min="1" max="72" value="1" />' +
        '<p class="hint">Com 2 ou mais, o app cria uma parcela por mês e divide o valor sem perder centavo.</p></div>' +
        '<div class="switch-row"><div class="sr-text"><b>Repetir todo mês</b>' +
        '<span>Cria uma recorrência: o app lança sozinho nos próximos meses.</span></div>' +
        '<label class="switch"><input type="checkbox" id="q-rec" /><i></i></label></div>' : '') +
      '</div>' +
      '<button class="btn btn-primary btn-block" type="button" id="q-save" style="margin-top:18px">' +
      (isEdit ? 'Salvar alterações' : 'Adicionar lançamento') + '</button>' +
      (isEdit ? '<button class="btn btn-danger btn-block" type="button" data-act="tx-delete" data-id="' + t.id +
        '" style="margin-top:9px">Excluir lançamento</button>' : '');

    UI.openSheet(html, {
      focus: isEdit ? '#q-amount' : '#q-smart',
      onOpen: function (body) {
        UI.bindPickers(body);
        UI.bindAmountField(body, 'q-amount', 'q-amount-echo');

        var curType = t.type;
        var setType = function (ty) {
          curType = ty;
          body.querySelectorAll('#q-type button').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-type') === ty);
          });
          /* a grade de categorias muda com o tipo: receita e
             despesa não compartilham categoria */
          var keep = UI.pick.categoryId;
          body.querySelector('#q-cats').innerHTML = UI.categoryGrid(ty,
            (F.catIndex(DB.data)[keep] && F.catIndex(DB.data)[keep].kind === ty)
              ? keep : (ty === 'income' ? 'cat_salario' : 'cat_mercado'), 'categoryId');
          UI.bindPickers(body);
        };
        body.querySelector('#q-type').addEventListener('click', function (e) {
          var b = e.target.closest('[data-type]');
          if (b) { setType(b.getAttribute('data-type')); UI.buzz(8); }
        });

        body.querySelector('#q-dates').addEventListener('click', function (e) {
          var b = e.target.closest('[data-date]');
          if (!b) return;
          body.querySelectorAll('#q-dates .chip').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
          body.querySelector('#q-date').value = b.getAttribute('data-date');
        });
        body.querySelector('#q-date').addEventListener('change', function () {
          body.querySelectorAll('#q-dates .chip').forEach(function (x) {
            x.classList.toggle('active', x.getAttribute('data-date') === body.querySelector('#q-date').value);
          });
        });

        var adv = body.querySelector('#q-advanced'), advBtn = body.querySelector('#q-adv-toggle');
        advBtn.addEventListener('click', function () {
          var open = adv.hasAttribute('hidden');
          if (open) adv.removeAttribute('hidden'); else adv.setAttribute('hidden', '');
          advBtn.textContent = open ? 'Ocultar' : 'Mais opções';
          txForm.advanced = open;
        });

        /* ── interpretação do campo livre ── */
        var smart = body.querySelector('#q-smart');
        if (smart) {
          var applyParse = function (commit) {
            var p = parseQuick(smart.value);
            var echo = body.querySelector('#q-echo');
            if (!p || (!isFinite(p.amount) && !p.desc)) {
              echo.textContent = 'Eu identifico valor, data e categoria sozinho. Se errar, ajuste abaixo.';
              return null;
            }
            var c = F.cat(DB.data, p.categoryId);
            echo.innerHTML = '→ ' + (p.type === 'income' ? 'Receita' : 'Despesa') + ' · <b>' +
              esc(p.desc) + '</b> · ' + (isFinite(p.amount) ? esc(Money.fmt(p.amount)) : '<i>valor?</i>') +
              ' · ' + c.emoji + ' ' + esc(c.name) + ' · ' + esc(D.fmtRel(p.date));
            if (commit) {
              if (p.type !== curType) setType(p.type);
              if (isFinite(p.amount)) {
                body.querySelector('#q-amount').value = Money.plain(p.amount);
                body.querySelector('#q-amount').dispatchEvent(new Event('input'));
              }
              body.querySelector('#q-desc').value = p.desc;
              body.querySelector('#q-date').value = p.date;
              body.querySelectorAll('#q-dates .chip').forEach(function (x) {
                x.classList.toggle('active', x.getAttribute('data-date') === p.date);
              });
              var btn = body.querySelector('#q-cats [data-pick="' + p.categoryId + '"]');
              if (btn) btn.click();
            }
            return p;
          };
          smart.addEventListener('input', function () { applyParse(false); });
          smart.addEventListener('change', function () { applyParse(true); });
          smart.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            var p = applyParse(true);
            if (p && isFinite(p.amount) && p.amount > 0) save();
          });
        }

        var tplEl = body.querySelector('#q-templates');
        if (tplEl) {
          tplEl.addEventListener('click', function (e) {
            var b = e.target.closest('[data-tpl]');
            if (!b) return;
            var g = templates[+b.getAttribute('data-tpl')];
            if (!g) return;
            if (g.t.type !== curType) setType(g.t.type);
            body.querySelector('#q-amount').value = Money.plain(g.t.amount);
            body.querySelector('#q-amount').dispatchEvent(new Event('input'));
            body.querySelector('#q-desc').value = g.t.desc;
            var cb = body.querySelector('#q-cats [data-pick="' + g.t.categoryId + '"]');
            if (cb) cb.click();
            UI.buzz(10);
            UI.toast('Preenchido: ' + g.t.desc);
          });
        }

        function save() {
          var amount = UI.readAmount(body, 'q-amount');
          var desc = UI.val(body, 'q-desc');
          var date = UI.val(body, 'q-date');
          var catId = UI.pick.categoryId;
          if (!isFinite(amount) || amount <= 0) { UI.err('Informe um valor maior que zero.'); return; }
          if (!D.isValid(date)) { UI.err('Data inválida.'); return; }
          if (!catId) { UI.err('Escolha uma categoria.'); return; }
          if (!desc) desc = F.cat(DB.data, catId).name;

          var tags = UI.val(body, 'q-tags').split(',').map(function (s) { return s.trim(); })
            .filter(Boolean).slice(0, 10);
          var note = UI.val(body, 'q-note');
          var accountId = UI.val(body, 'f-account') || 'acc_corrente';
          var now = new Date().toISOString();

          if (txForm.editing) {
            var ex = DB.data.transactions.filter(function (x) { return x.id === txForm.editing; })[0];
            if (ex) {
              ex.type = curType; ex.amount = amount; ex.desc = desc; ex.date = date;
              ex.categoryId = catId; ex.accountId = accountId; ex.note = note;
              ex.tags = tags; ex.updatedAt = now;
            }
            sortTx();
            UI.closeSheet();
            UI.commit('Lançamento atualizado');
            return;
          }

          var inst = clamp(parseInt(UI.val(body, 'q-inst'), 10) || 1, 1, 72);
          if (inst > 1) {
            var parts = Money.split(amount, inst);
            var groupId = uid('inst');
            parts.forEach(function (p, i) {
              DB.data.transactions.push({
                id: uid('tx'), desc: desc + ' (' + (i + 1) + '/' + inst + ')', amount: p,
                type: curType, categoryId: catId, accountId: accountId,
                date: i === 0 ? date : D.addMonths(date, i),
                createdAt: now, updatedAt: now, note: note, tags: tags,
                recurrenceId: null, installment: { n: i + 1, of: inst, groupId: groupId }, goalId: null
              });
            });
            sortTx();
            UI.closeSheet();
            UI.commit(inst + ' parcelas de ' + Money.fmt(parts[0]) + ' criadas');
            return;
          }

          DB.data.transactions.unshift({
            id: uid('tx'), desc: desc, amount: amount, type: curType,
            categoryId: catId, accountId: accountId, date: date,
            createdAt: now, updatedAt: now, note: note, tags: tags,
            recurrenceId: null, installment: null, goalId: null
          });
          sortTx();

          if (UI.checked(body, 'q-rec')) {
            DB.data.recurrences.push({
              id: uid('rec'), desc: desc, amount: amount, type: curType,
              categoryId: catId, accountId: accountId, frequency: 'monthly',
              dayOfMonth: D.parse(date).getDate(), weekday: 1,
              startDate: date, endDate: null, lastRun: date, active: true
            });
          }
          UI.closeSheet();
          UI.commit((curType === 'income' ? 'Receita' : 'Despesa') + ' de ' + Money.fmt(amount) + ' lançada');
        }

        body.querySelector('#q-save').addEventListener('click', save);
      }
    });
  };

  function sortTx() {
    DB.data.transactions.sort(function (a, b) {
      return a.date === b.date ? String(b.createdAt).localeCompare(String(a.createdAt))
        : b.date.localeCompare(a.date);
    });
  }

  /* ═══════════════════════════════════════════
     RELATÓRIOS
  ═══════════════════════════════════════════ */

  var RANGES = [
    { id: 'this', label: 'Este mês' },
    { id: 'last', label: 'Mês passado' },
    { id: '3m', label: '3 meses' },
    { id: '6m', label: '6 meses' },
    { id: '12m', label: '12 meses' },
    { id: 'all', label: 'Tudo' }
  ];
  var reportRange = 'this';

  UI.renderers.reports = function () {
    var data = DB.data;
    document.getElementById('report-range').innerHTML = RANGES.map(function (r) {
      return '<button class="chip' + (reportRange === r.id ? ' active' : '') +
        '" type="button" data-act="report-range" data-r="' + r.id + '">' + r.label + '</button>';
    }).join('');

    var cur = D.monthKey(D.today());
    var from, to, months, label, prevFrom, prevTo;

    if (reportRange === 'this') { from = D.firstOfMonth(cur); to = D.lastOfMonth(cur); months = 1; label = D.monthLabel(cur, true); }
    else if (reportRange === 'last') {
      var lk = D.addMonthKey(cur, -1);
      from = D.firstOfMonth(lk); to = D.lastOfMonth(lk); months = 1; label = D.monthLabel(lk, true);
    } else if (reportRange === 'all') {
      var all = F.monthsWithData(data);
      var first = all.length ? all[all.length - 1] : cur;
      from = D.firstOfMonth(first); to = D.lastOfMonth(cur);
      months = Math.max(1, D.diffMonths(to, from) + 1); label = 'Todo o histórico';
    } else {
      months = parseInt(reportRange, 10);
      from = D.firstOfMonth(D.addMonthKey(cur, -(months - 1)));
      to = D.lastOfMonth(cur); label = 'Últimos ' + months + ' meses';
    }
    prevTo = D.addDays(from, -1);
    prevFrom = D.firstOfMonth(D.addMonthKey(D.monthKey(from), -months));

    var txs = F.between(data.transactions, from, to);
    var prevTxs = F.between(data.transactions, prevFrom, prevTo);
    var tot = F.totals(txs), ptot = F.totals(prevTxs);
    var series = F.monthlySeries(data, clamp(months, 2, 24));
    var byCat = F.byCategory(data, txs, 'expense');
    var byInc = F.byCategory(data, txs, 'income');

    var html = '<div class="card">' +
      '<div class="card-head"><div><h3>' + esc(label) + '</h3>' +
      '<p class="sub">' + D.fmt(from) + ' a ' + D.fmt(to) + ' · ' + tot.count + ' lançamentos</p></div></div>' +
      '<div class="kv-list">' +
      '<div class="kv"><span class="k">Receitas</span><span class="v">' + UI.money(tot.income) + ' ' +
      UI.deltaTag(ptot.income ? Money.growth(tot.income, ptot.income) : null) + '</span></div>' +
      '<div class="kv"><span class="k">Despesas</span><span class="v">' + UI.money(tot.expense) + ' ' +
      UI.deltaTag(ptot.expense ? Money.growth(tot.expense, ptot.expense) : null, true) + '</span></div>' +
      '<div class="kv"><span class="k">Resultado</span><span class="v">' + UI.signed(tot.net) + '</span></div>' +
      '<div class="kv"><span class="k">Taxa de poupança</span><span class="v">' +
      (tot.income ? Money.pctOf(tot.net, tot.income) + '%' : '—') + '</span></div>' +
      '<div class="kv"><span class="k">Média por mês</span><span class="v">' +
      UI.money(Math.round(tot.expense / months)) + ' de despesa</span></div>' +
      '<div class="kv"><span class="k">Média por dia</span><span class="v">' +
      UI.money(Math.round(tot.expense / Math.max(1, D.diffDays(to, from) + 1))) + '</span></div>' +
      '</div></div>';

    if (months > 1) {
      html += Chart.cashflow(series, { title: 'Fluxo de caixa' });
      html += Chart.balance(series);
      html += Chart.savings(series, data.plan.savingsTargetPct);
    }
    html += Chart.categories(byCat, { title: 'Despesas por categoria', limit: 12 });
    html += Chart.donut(F.foldCategories(byCat.rows, 6).map(function (r) {
      return { label: r.emoji + ' ' + r.name, value: r.total, color: r.color };
    }), { title: 'Composição das despesas', centerLabel: 'no período', emptyMsg: 'Nenhuma despesa no período.' });
    html += Chart.groups(F.byGroup(data, txs),
      months === 1 ? data.plan.monthlyIncome : tot.income,
      data.plan.groupTargets, { method: data.plan.method });
    if (byInc.rows.length) {
      html += Chart.categories(byInc, { title: 'De onde veio o dinheiro', limit: 8 });
    }
    html += Chart.weekdays(data, months === 1 ? D.monthKey(from) : null);
    if (months === 1) html += Chart.heatmap(F.dailySpend(data, D.monthKey(from)));
    html += Chart.budget(F.budgetReport(data, months === 1 ? D.monthKey(from) : cur));

    html += '<div class="card"><div class="card-head"><div><h3>Exportar</h3>' +
      '<p class="sub">Leve estes números para a planilha que você usa</p></div></div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-ghost btn-sm" type="button" data-act="export-csv" data-from="' + from + '" data-to="' + to + '">📄 CSV do período</button>' +
      '<button class="btn btn-ghost btn-sm" type="button" data-act="export-json">💾 Backup completo</button>' +
      '</div></div>';

    document.getElementById('reports-content').innerHTML = html;
  };

  /* ═══════════════════════════════════════════
     AÇÕES
  ═══════════════════════════════════════════ */

  UI.register({
    'quick-add': function () { UI.openTxSheet(null); },
    'add-tx': function () { UI.openTxSheet(null); },

    'tx-more': function () { txState.limit += 60; UI.renderers.transactions({}); },

    'tx-month': function (ds) {
      txState.month = ds.m || null;
      txState.limit = 60;
      UI.renderers.transactions({});
    },
    'tx-cat': function (ds) {
      txState.cat = ds.c || null;
      txState.limit = 60;
      UI.renderers.transactions({});
    },
    'clear-tx-filters': function () {
      txState.month = null; txState.cat = null; txState.type = 'all'; txState.limit = 60;
      var s = document.getElementById('tx-search');
      if (s) s.value = '';
      document.querySelectorAll('#tx-type-filter button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-txfilter') === 'all');
      });
      UI.renderers.transactions({});
    },

    'tx-menu': function (ds) {
      var t = DB.data.transactions.filter(function (x) { return x.id === ds.id; })[0];
      if (!t) return;
      var c = F.cat(DB.data, t.categoryId);
      var acc = F.accIndex(DB.data)[t.accountId];
      UI.openSheet(
        UI.sheetHead(t.desc) +
        '<div class="card card-tight" style="margin-bottom:14px"><div class="kv-list">' +
        '<div class="kv"><span class="k">Valor</span><span class="v" style="color:' +
        (t.type === 'income' ? Chart.incomeColor() : 'var(--expense)') + '">' +
        (t.type === 'income' ? '+' : '−') + esc(Money.fmt(t.amount)) + '</span></div>' +
        '<div class="kv"><span class="k">Categoria</span><span class="v">' + c.emoji + ' ' + esc(c.name) + '</span></div>' +
        '<div class="kv"><span class="k">Data</span><span class="v">' + esc(D.fmt(t.date)) + ' (' + D.DIA_CURTO[D.dow(t.date)] + ')</span></div>' +
        '<div class="kv"><span class="k">Conta</span><span class="v">' + (acc ? acc.emoji + ' ' + esc(acc.name) : '—') + '</span></div>' +
        (t.installment ? '<div class="kv"><span class="k">Parcela</span><span class="v">' +
          t.installment.n + ' de ' + t.installment.of + '</span></div>' : '') +
        (t.recurrenceId ? '<div class="kv"><span class="k">Origem</span><span class="v">🔁 recorrência</span></div>' : '') +
        (t.tags && t.tags.length ? '<div class="kv"><span class="k">Etiquetas</span><span class="v">' +
          esc(t.tags.join(', ')) + '</span></div>' : '') +
        '</div>' +
        (t.note ? '<p class="fine-print" style="margin-top:11px">📝 ' + esc(t.note) + '</p>' : '') +
        '</div>' +
        '<div class="menu-list">' +
        '<button class="menu-item" type="button" data-act="tx-edit" data-id="' + t.id + '">' +
        '<span class="mi-ic">✏️</span><span class="mi-text"><b>Editar</b><span>Mudar valor, categoria ou data</span></span>' +
        '<span class="mi-arrow">›</span></button>' +
        '<button class="menu-item" type="button" data-act="tx-duplicate" data-id="' + t.id + '">' +
        '<span class="mi-ic">📑</span><span class="mi-text"><b>Duplicar para hoje</b><span>Mesmo valor e categoria, data de hoje</span></span>' +
        '<span class="mi-arrow">›</span></button>' +
        (t.installment ? '<button class="menu-item" type="button" data-act="tx-del-group" data-g="' +
          t.installment.groupId + '"><span class="mi-ic">🗂️</span><span class="mi-text">' +
          '<b>Excluir todas as parcelas</b><span>Remove as ' + t.installment.of + ' parcelas deste grupo</span></span>' +
          '<span class="mi-arrow">›</span></button>' : '') +
        '<button class="menu-item" type="button" data-act="tx-delete" data-id="' + t.id + '">' +
        '<span class="mi-ic">🗑️</span><span class="mi-text"><b>Excluir</b><span>Remove apenas este lançamento</span></span>' +
        '<span class="mi-arrow">›</span></button>' +
        '</div>',
        {}
      );
    },

    'tx-edit': function (ds) {
      var t = DB.data.transactions.filter(function (x) { return x.id === ds.id; })[0];
      if (t) UI.openTxSheet(t);
    },

    'tx-duplicate': function (ds) {
      var t = DB.data.transactions.filter(function (x) { return x.id === ds.id; })[0];
      if (!t) return;
      var now = new Date().toISOString();
      DB.data.transactions.unshift({
        id: uid('tx'), desc: t.desc, amount: t.amount, type: t.type,
        categoryId: t.categoryId, accountId: t.accountId, date: D.today(),
        createdAt: now, updatedAt: now, note: t.note, tags: (t.tags || []).slice(),
        recurrenceId: null, installment: null, goalId: null
      });
      sortTx();
      UI.closeSheet();
      UI.commit('Duplicado para hoje');
    },

    'tx-delete': function (ds) {
      var t = DB.data.transactions.filter(function (x) { return x.id === ds.id; })[0];
      if (!t) return;
      UI.confirm({
        title: 'Excluir lançamento?',
        text: '<b>' + esc(t.desc) + '</b> · ' + esc(Money.fmt(t.amount)) + ' · ' + esc(D.fmt(t.date)) +
          '<br><br>Um ponto de restauração automático guarda o estado atual, então isso pode ser desfeito em Configurações › Histórico.',
        confirmLabel: 'Excluir', danger: true
      }).then(function (yes) {
        if (!yes) return;
        DB.data.transactions = DB.data.transactions.filter(function (x) { return x.id !== ds.id; });
        UI.closeSheet();
        UI.commit('Lançamento excluído');
      });
    },

    'tx-del-group': function (ds) {
      var n = DB.data.transactions.filter(function (x) {
        return x.installment && x.installment.groupId === ds.g;
      }).length;
      UI.confirm({
        title: 'Excluir ' + n + ' parcelas?',
        text: 'Todas as parcelas deste grupo serão removidas do extrato.',
        confirmLabel: 'Excluir tudo', danger: true
      }).then(function (yes) {
        if (!yes) return;
        DB.data.transactions = DB.data.transactions.filter(function (x) {
          return !(x.installment && x.installment.groupId === ds.g);
        });
        UI.closeSheet();
        UI.commit(n + ' parcelas excluídas');
      });
    },

    'report-range': function (ds) { reportRange = ds.r; UI.renderers.reports(); },

    'toggle-pillars': function (ds, el) {
      var p = document.getElementById('score-pillars');
      if (!p) return;
      var open = p.hasAttribute('hidden');
      if (open) p.removeAttribute('hidden'); else p.setAttribute('hidden', '');
      el.textContent = open ? 'Ocultar o cálculo' : 'Como essa nota é calculada';
      el.setAttribute('aria-expanded', open ? 'true' : 'false');
    },

    'all-insights': function () {
      var list = Insights.build(DB.data);
      UI.openSheet(
        UI.sheetHead('💡 Recomendações', { sub: 'Geradas a partir dos seus próprios números, agora.' }) +
        (list.length ? list.map(Dm.insightHTML).join('')
          : '<div class="empty"><span class="ic">✨</span><h4>Nada a apontar</h4>' +
          '<p>Quando houver algo digno de atenção nos seus números, aparece aqui.</p></div>'),
        {}
      );
    },

    'insight-action': function (ds) {
      UI.closeAllSheets();
      switch (ds.kind) {
        case 'page': UI.go(ds.page, { anchor: ds.anchor || null }); break;
        case 'add-tx': UI.openTxSheet(null); break;
        case 'wizard': Dm.Wizard.start(); break;
        case 'new-goal': UI.go('goals'); setTimeout(function () { UI.openGoalSheet(null, ds.preset); }, 260); break;
        case 'open-goal': UI.go('goals'); setTimeout(function () { UI.openGoalSheet(ds.id); }, 260); break;
        case 'contribute': UI.go('goals'); setTimeout(function () { UI.openContribSheet(ds.id); }, 260); break;
        case 'add-inv': UI.go('investments'); setTimeout(function () { UI.openInvSheet(null, ds.preset); }, 260); break;
        case 'refresh-prices': UI.go('investments'); setTimeout(function () { Dm.refreshPrices(); }, 200); break;
        case 'filter-cat':
          txState.cat = ds.id; txState.month = D.monthKey(D.today()); txState.limit = 60;
          UI.go('transactions');
          break;
        case 'open-tx':
          UI.go('transactions');
          setTimeout(function () { UI.actions['tx-menu']({ id: ds.id }); }, 260);
          break;
        case 'run-recurrences': Dm.runRecurrencesNow(); break;
        case 'suggest-budget': UI.go('plan'); setTimeout(function () { UI.actions['suggest-budgets'](); }, 260); break;
        case 'export': UI.actions['export-json'](); break;
        default: UI.go('dashboard');
      }
    },

    'pick-charts': function () {
      var picked = (DB.data.settings.dashboardCharts || []).slice();
      UI.openSheet(
        UI.sheetHead('Escolher gráficos', { sub: 'Marque o que você quer ver no painel, na ordem em que aparecem aqui.' }) +
        '<div class="opt-list" id="chart-pick">' +
        CHART_CATALOG.map(function (c) {
          return '<button type="button" class="opt' + (picked.indexOf(c.key) >= 0 ? ' active' : '') +
            '" data-ck="' + c.key + '"><span class="ic">' + c.icon + '</span>' +
            '<span class="grow"><b>' + c.name + '</b><span>' + c.desc + '</span></span>' +
            '<span class="check">✓</span></button>';
        }).join('') + '</div>' +
        '<button class="btn btn-primary btn-block" type="button" id="chart-save" style="margin-top:16px">Salvar</button>',
        {
          onOpen: function (body) {
            body.querySelector('#chart-pick').addEventListener('click', function (e) {
              var b = e.target.closest('[data-ck]');
              if (!b) return;
              var k = b.getAttribute('data-ck'), i = picked.indexOf(k);
              if (i >= 0) { picked.splice(i, 1); b.classList.remove('active'); }
              else { picked.push(k); b.classList.add('active'); }
              UI.buzz(8);
            });
            body.querySelector('#chart-save').addEventListener('click', function () {
              DB.data.settings.dashboardCharts = picked;
              UI.closeSheet();
              UI.commit('Painel atualizado');
            });
          }
        }
      );
    },

    'export-csv': function (ds) {
      var data = DB.data;
      var txs = F.between(data.transactions, ds.from, ds.to);
      var idx = F.catIndex(data), acc = F.accIndex(data);
      var sep = ';';   /* ponto e vírgula: o Excel pt-BR abre direto */
      var rows = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Grupo', 'Conta', 'Valor (R$)', 'Etiquetas', 'Observação']];
      txs.forEach(function (t) {
        var c = idx[t.categoryId] || {}, a = acc[t.accountId] || {};
        rows.push([
          D.fmt(t.date),
          t.type === 'income' ? 'Receita' : 'Despesa',
          t.desc, c.name || '', c.group || '', a.name || '',
          (t.type === 'income' ? '' : '-') + Money.plain(t.amount),
          (t.tags || []).join(' '), (t.note || '').replace(/[\r\n]+/g, ' ')
        ]);
      });
      var csv = '﻿' + rows.map(function (r) {
        return r.map(function (c) {
          var s = String(c == null ? '' : c);
          return /["\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(sep);
      }).join('\r\n');
      UI.download('dominus-extrato-' + ds.from + '-a-' + ds.to + '.csv', csv, 'text/csv');
      UI.ok(txs.length + ' lançamentos exportados');
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
