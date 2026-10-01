/* ═══════════════════════════════════════════════════════════════
   Dominus Finance — GRÁFICOS
   SVG puro, sem biblioteca externa: funciona offline, no avião e
   em qualquer navegador. Cada gráfico traz legenda, rótulo direto
   onde cabe, tooltip no toque/hover e uma tabela equivalente —
   a cor nunca é a única pista de identidade.
═══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var Dm = global.Dominus;
  var Money = Dm.Money, D = Dm.D, esc = Dm.esc, roundTo = Dm.roundTo, clamp = Dm.clamp;

  /* ═══════════ PALETA ═══════════
     Validada contra a superfície escura do app (#1A1A1A):
     faixa de luminosidade, piso de croma, separação sob
     daltonismo (ΔE ≥ 8) e contraste ≥ 3:1 — todos aprovados.   */
  var PAL = {
    surface: '#1A1A1A',
    plane: '#0D0D0D',
    ink: '#F5F5F5',
    ink2: '#C3C2B7',
    muted: '#898781',
    grid: '#2C2C2A',
    axis: '#383835',

    /* receita × despesa: o verde foi deslocado para o azul-esverdeado
       porque o verde puro e o vermelho da marca ficam a ΔE 4,9 sob
       deuteranopia. Assim o par vai a ΔE 9,5 e passa. */
    income: '#199E70',
    expense: '#FF1F3D',
    /* alternativa para quem ativa "paleta p/ daltonismo" */
    incomeCvd: '#3987E5',

    /* fatias categóricas na ordem fixa validada */
    series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],

    /* tipos de ativo — trio aprovado em todos os pares */
    acao: '#3987e5', fii: '#d55181', rf: '#c98500',

    /* rampa sequencial de um só matiz (o vermelho da marca),
       clara → escura, para o mapa de calor de gastos */
    ramp: ['#241016', '#44131f', '#6a1628', '#911a31', '#bb1d39', '#e52042', '#ff5c73'],

    good: '#0CA30C', warn: '#FAB219', serious: '#EC835A', critical: '#D03B3B'
  };

  function incomeColor() {
    var s = Dm.DB && Dm.DB.data && Dm.DB.data.settings;
    return (s && s.cvdSafe) ? PAL.incomeCvd : PAL.income;
  }

  /* ═══════════ PRIMITIVAS ═══════════ */

  function svg(w, h, inner, label, cls) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" ' +
      'preserveAspectRatio="xMidYMid meet" role="img" class="dv ' + (cls || '') + '" ' +
      'aria-label="' + esc(label || '') + '" style="display:block;overflow:visible">' + inner + '</svg>';
  }

  /* barra com as pontas de dado arredondadas (4px) presas à linha de base */
  function barPath(x, y, w, h, r, flip) {
    if (h <= 0.4) h = 0.4;
    r = Math.min(r == null ? 4 : r, w / 2, h);
    if (r <= 0.3) return 'M' + x + ',' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z';
    if (flip) {  /* valor negativo: arredonda embaixo */
      return 'M' + x + ',' + y + 'h' + w + 'v' + (h - r) +
        'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + r +
        'h' + (-(w - 2 * r)) + 'a' + r + ',' + r + ' 0 0 1 ' + (-r) + ',' + (-r) + 'Z';
    }
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) +
      'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + (-r) +
      'h' + (w - 2 * r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r +
      'V' + (y + h) + 'Z';
  }

  function txt(x, y, s, opts) {
    opts = opts || {};
    return '<text x="' + x + '" y="' + y + '" fill="' + (opts.fill || PAL.muted) + '" ' +
      'font-size="' + (opts.size || 9) + '" ' +
      'font-weight="' + (opts.weight || 400) + '" ' +
      'text-anchor="' + (opts.anchor || 'middle') + '" ' +
      'font-family="DM Sans, system-ui, sans-serif"' +
      (opts.tabular ? ' style="font-variant-numeric:tabular-nums"' : '') +
      '>' + esc(s) + '</text>';
  }

  function gridline(x1, y, x2) {
    return '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" ' +
      'stroke="' + PAL.grid + '" stroke-width="1" shape-rendering="crispEdges"/>';
  }

  /* alvo de toque invisível que carrega o tooltip */
  function hit(x, y, w, h, tip) {
    return '<rect x="' + x + '" y="' + y + '" width="' + Math.max(w, 1) + '" height="' + Math.max(h, 1) + '" ' +
      'fill="transparent" class="dv-hit" data-tip="' + esc(tip) + '"/>';
  }

  /* escala "bonita": topo arredondado para um número legível */
  function niceMax(v) {
    if (v <= 0) return 100;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var n = v / mag;
    var step = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 5 ? 5 : n <= 7.5 ? 7.5 : 10;
    return step * mag;
  }

  function legend(items, opts) {
    opts = opts || {};
    return '<div class="dv-legend' + (opts.wrap ? ' dv-legend-wrap' : '') + '">' +
      items.map(function (it) {
        return '<span class="dv-leg-item">' +
          '<i class="dv-swatch" style="background:' + it.color + '"></i>' +
          '<span class="dv-leg-label">' + esc(it.label) + '</span>' +
          (it.value ? '<b class="dv-leg-value">' + esc(it.value) + '</b>' : '') +
          '</span>';
      }).join('') + '</div>';
  }

  /* tabela equivalente — a via de leitura sem depender de cor */
  function table(cols, rows, id) {
    return '<div class="dv-table-wrap" id="' + id + '" hidden>' +
      '<table class="dv-table"><thead><tr>' +
      cols.map(function (c, i) { return '<th' + (i ? ' class="num"' : '') + '>' + esc(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr>' + r.map(function (c, i) {
          return '<td' + (i ? ' class="num"' : '') + '>' + (c == null ? '—' : esc(String(c))) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  var _n = 0;
  function nextId() { return 'dvt' + (++_n); }

  /* moldura padrão: título, ação opcional, gráfico, legenda, tabela */
  function card(opts) {
    var tid = nextId();
    return '<section class="dv-card">' +
      '<header class="dv-head">' +
      '<div><h3 class="dv-title">' + esc(opts.title) + '</h3>' +
      (opts.subtitle ? '<p class="dv-sub">' + esc(opts.subtitle) + '</p>' : '') + '</div>' +
      (opts.action || '') +
      '</header>' +
      (opts.hero || '') +
      '<div class="dv-body">' + opts.body + '</div>' +
      (opts.legend || '') +
      (opts.tableCols
        ? '<button type="button" class="dv-table-btn" data-dv-table="' + tid + '">Ver dados</button>' +
        table(opts.tableCols, opts.tableRows || [], tid)
        : '') +
      (opts.footnote ? '<p class="dv-foot">' + opts.footnote + '</p>' : '') +
      '</section>';
  }

  function emptyCard(title, msg, icon) {
    return '<section class="dv-card dv-empty">' +
      '<h3 class="dv-title">' + esc(title) + '</h3>' +
      '<div class="dv-empty-body"><span class="dv-empty-icon">' + (icon || '📊') + '</span>' +
      '<p>' + esc(msg) + '</p></div></section>';
  }

  var Chart = { PAL: PAL, incomeColor: incomeColor, legend: legend, card: card, empty: emptyCard };

  /* ═══════════ 1. FLUXO DE CAIXA — barras agrupadas ═══════════
     Receita e despesa compartilham o mesmo eixo de reais: nunca
     dois eixos y, que é a forma mais fácil de mentir num gráfico. */
  Chart.cashflow = function (series, opts) {
    opts = opts || {};
    var W = 320, H = 168, padL = 38, padR = 6, padB = 22, padT = 10;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var n = series.length;
    if (!n) return emptyCard('Fluxo de caixa', 'Lance receitas e despesas para ver o fluxo mês a mês.', '💸');

    var max = niceMax(Math.max.apply(null, [1].concat(series.map(function (m) {
      return Math.max(m.income, m.expense);
    }))));
    var slot = innerW / n;
    var gap = 2;                                   /* folga de superfície entre barras */
    var bw = Math.max(5, Math.min(14, (slot - gap * 3) / 2));
    var inc = incomeColor();
    var g = '';

    /* grade recessiva + eixo de valores */
    [0, 0.5, 1].forEach(function (f) {
      var y = padT + innerH - innerH * f;
      g += gridline(padL, y, W - padR);
      g += txt(padL - 5, y + 3, Money.short(max * f), { anchor: 'end', size: 8 });
    });

    series.forEach(function (m, i) {
      var cx = padL + slot * i + slot / 2;
      var xi = cx - bw - gap / 2, xe = cx + gap / 2;
      var hi = innerH * (m.income / max), he = innerH * (m.expense / max);
      g += '<path d="' + barPath(xi, padT + innerH - hi, bw, hi, 4) + '" fill="' + inc + '"/>';
      g += '<path d="' + barPath(xe, padT + innerH - he, bw, he, 4) + '" fill="' + PAL.expense + '"/>';
      g += txt(cx, H - 6, m.label, { size: 8 });
      g += hit(padL + slot * i, padT, slot, innerH,
        '<b>' + D.monthLabel(m.key, true) + '</b>' +
        '<i style="background:' + inc + '"></i>Receitas <b>' + Money.fmt(m.income) + '</b>' +
        '<i style="background:' + PAL.expense + '"></i>Despesas <b>' + Money.fmt(m.expense) + '</b>' +
        '<hr>Resultado <b>' + Money.fmt(m.net, { sign: true }) + '</b>' +
        (m.savingsRate != null ? '<br>Poupou <b>' + m.savingsRate + '%</b> da renda' : ''));
    });

    var tot = series.reduce(function (s, m) { return { i: s.i + m.income, e: s.e + m.expense }; }, { i: 0, e: 0 });

    return card({
      title: opts.title || 'Fluxo de caixa',
      subtitle: n + (n === 1 ? ' mês' : ' meses') + ' · resultado ' + Money.fmt(tot.i - tot.e, { sign: true }),
      body: svg(W, H, g, 'Barras de receitas e despesas por mês'),
      legend: legend([
        { label: 'Receitas', color: inc, value: Money.short(tot.i) },
        { label: 'Despesas', color: PAL.expense, value: Money.short(tot.e) }
      ]),
      tableCols: ['Mês', 'Receitas', 'Despesas', 'Resultado'],
      tableRows: series.map(function (m) {
        return [D.monthLabel(m.key), Money.fmt(m.income), Money.fmt(m.expense), Money.fmt(m.net)];
      })
    });
  };

  /* ═══════════ 2. SALDO ACUMULADO — área + linha ═══════════ */
  Chart.balance = function (series, opts) {
    opts = opts || {};
    var W = 320, H = 158, padL = 38, padR = 8, padB = 20, padT = 12;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var n = series.length;
    if (n < 2) return emptyCard('Evolução do saldo', 'Precisa de pelo menos dois meses de histórico.', '📈');

    var vals = series.map(function (m) { return m.balance; });
    var lo = Math.min.apply(null, vals.concat([0]));
    var hi = Math.max.apply(null, vals.concat([0]));
    if (hi === lo) hi = lo + 100;
    var pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;
    var yOf = function (v) { return padT + innerH - innerH * ((v - lo) / (hi - lo)); };
    var xOf = function (i) { return padL + (n === 1 ? innerW / 2 : innerW * i / (n - 1)); };

    var g = '';
    [0, 0.5, 1].forEach(function (f) {
      var v = lo + (hi - lo) * f, y = yOf(v);
      g += gridline(padL, y, W - padR);
      g += txt(padL - 5, y + 3, Money.short(v), { anchor: 'end', size: 8 });
    });
    if (lo < 0 && hi > 0) {
      g += '<line x1="' + padL + '" y1="' + yOf(0) + '" x2="' + (W - padR) + '" y2="' + yOf(0) +
        '" stroke="' + PAL.axis + '" stroke-width="1" stroke-dasharray="3 3"/>';
    }

    var line = series.map(function (m, i) { return (i ? 'L' : 'M') + roundTo(xOf(i), 1) + ',' + roundTo(yOf(m.balance), 1); }).join('');
    var last = series[n - 1].balance;
    var up = last >= series[0].balance;
    var col = up ? incomeColor() : PAL.expense;
    var gid = 'bgrad' + (++_n);

    g = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + col + '" stop-opacity=".30"/>' +
      '<stop offset="100%" stop-color="' + col + '" stop-opacity="0"/>' +
      '</linearGradient></defs>' + g +
      '<path d="' + line + 'L' + xOf(n - 1) + ',' + (padT + innerH) + 'L' + xOf(0) + ',' + (padT + innerH) + 'Z" fill="url(#' + gid + ')"/>' +
      '<path d="' + line + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';

    series.forEach(function (m, i) {
      var isLast = i === n - 1;
      if (isLast) {
        /* anel de 2px na cor da superfície destaca o ponto atual */
        g += '<circle cx="' + xOf(i) + '" cy="' + yOf(m.balance) + '" r="4.5" fill="' + col +
          '" stroke="' + PAL.surface + '" stroke-width="2"/>';
      }
      if (i === 0 || isLast || n <= 6 || i % 2 === 0) g += txt(xOf(i), H - 5, m.label, { size: 8 });
      g += hit(xOf(i) - innerW / (n - 1) / 2, padT, innerW / (n - 1), innerH,
        '<b>' + D.monthLabel(m.key, true) + '</b>Saldo acumulado <b>' + Money.fmt(m.balance) + '</b>' +
        '<br>No mês <b>' + Money.fmt(m.net, { sign: true }) + '</b>');
    });

    return card({
      title: opts.title || 'Evolução do saldo',
      subtitle: 'Hoje: ' + Money.fmt(last),
      body: svg(W, H, g, 'Linha do saldo acumulado por mês'),
      tableCols: ['Mês', 'Saldo acumulado', 'Resultado do mês'],
      tableRows: series.map(function (m) { return [D.monthLabel(m.key), Money.fmt(m.balance), Money.fmt(m.net)]; })
    });
  };

  /* ═══════════ 3. CATEGORIAS — barras horizontais rotuladas ═══════════
     Cada barra carrega nome e valor ao lado: a cor é identidade
     da categoria, nunca a única forma de distingui-la.         */
  Chart.categories = function (byCat, opts) {
    opts = opts || {};
    var rows = byCat.rows || [];
    if (!rows.length) return emptyCard(opts.title || 'Para onde foi o dinheiro', 'Nenhuma despesa no período selecionado.', '🧾');

    var shown = rows.slice(0, opts.limit || 8);
    var max = shown[0].total || 1;

    var body = '<div class="dv-hbars">' + shown.map(function (r) {
      var w = clamp(r.total / max * 100, 1.5, 100);
      return '<div class="dv-hbar" data-tip="' + esc('<b>' + r.emoji + ' ' + r.name + '</b>' +
        Money.fmt(r.total) + ' · <b>' + r.share + '%</b> das despesas<br>' +
        r.count + (r.count === 1 ? ' lançamento' : ' lançamentos')) + '">' +
        '<div class="dv-hbar-top">' +
        '<span class="dv-hbar-name">' + r.emoji + ' ' + esc(r.name) + '</span>' +
        '<span class="dv-hbar-val"><em>' + r.share + '%</em> ' + Money.fmt(r.total) + '</span>' +
        '</div>' +
        '<div class="dv-hbar-track"><div class="dv-hbar-fill" style="width:' + w + '%;background:' + r.color + '"></div></div>' +
        '</div>';
    }).join('') + '</div>';

    return card({
      title: opts.title || 'Para onde foi o dinheiro',
      subtitle: 'Total ' + Money.fmt(byCat.total) + (rows.length > shown.length ? ' · top ' + shown.length + ' de ' + rows.length : ''),
      body: body,
      tableCols: ['Categoria', 'Valor', 'Parte', 'Lançamentos'],
      tableRows: rows.map(function (r) { return [r.emoji + ' ' + r.name, Money.fmt(r.total), r.share + '%', r.count]; })
    });
  };

  /* ═══════════ 4. ROSCA — composição ═══════════ */
  Chart.donut = function (slices, opts) {
    opts = opts || {};
    slices = (slices || []).filter(function (s) { return s.value > 0; });
    var total = slices.reduce(function (s, x) { return s + x.value; }, 0);
    if (!total) return emptyCard(opts.title || 'Composição', opts.emptyMsg || 'Sem dados para compor o gráfico.', '🍩');

    var S = 128, cx = S / 2, cy = S / 2, r = 48, sw = 15;
    var C = 2 * Math.PI * r;
    /* folga de 2px de superfície entre fatias */
    var gapLen = slices.length > 1 ? 2 : 0;
    var g = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + PAL.grid + '" stroke-width="' + sw + '"/>';
    var off = 0;

    slices.forEach(function (s) {
      var len = Math.max(C * (s.value / total) - gapLen, 0.6);
      g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.color +
        '" stroke-width="' + sw + '" stroke-linecap="butt" ' +
        'stroke-dasharray="' + roundTo(len, 2) + ' ' + roundTo(C - len, 2) + '" ' +
        'stroke-dashoffset="' + roundTo(-off, 2) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')" class="dv-ring"/>';
      off += C * (s.value / total);
    });

    g += txt(cx, cy - 1, opts.centerValue || Money.short(total), { fill: PAL.ink, size: 13, weight: 600 });
    g += txt(cx, cy + 12, opts.centerLabel || 'total', { size: 8 });

    return card({
      title: opts.title || 'Composição',
      subtitle: opts.subtitle,
      body: '<div class="dv-donut-row">' + svg(S, S, g, 'Rosca de composição', 'dv-donut') +
        '<div class="dv-donut-legend">' + slices.map(function (s) {
          return '<div class="dv-dl-row" data-tip="' + esc('<b>' + s.label + '</b>' + Money.fmt(s.value) +
            ' · ' + roundTo(s.value / total * 100, 1) + '%') + '">' +
            '<i class="dv-swatch" style="background:' + s.color + '"></i>' +
            '<span class="dv-dl-name">' + esc(s.label) + '</span>' +
            '<span class="dv-dl-pct">' + roundTo(s.value / total * 100, 0) + '%</span>' +
            '<span class="dv-dl-val">' + Money.short(s.value) + '</span>' +
            '</div>';
        }).join('') + '</div></div>',
      tableCols: ['Item', 'Valor', 'Parte'],
      tableRows: slices.map(function (s) { return [s.label, Money.fmt(s.value), roundTo(s.value / total * 100, 1) + '%']; })
    });
  };

  /* ═══════════ 5. TAXA DE POUPANÇA — linha com meta ═══════════ */
  Chart.savings = function (series, targetPct, opts) {
    opts = opts || {};
    var pts = series.filter(function (m) { return m.savingsRate != null; });
    if (pts.length < 2) return emptyCard('Taxa de poupança', 'Registre receitas em pelo menos dois meses para ver a sua taxa.', '🪙');

    var W = 320, H = 150, padL = 32, padR = 10, padB = 20, padT = 14;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var rates = pts.map(function (m) { return m.savingsRate; });
    var hi = Math.max.apply(null, rates.concat([targetPct || 0, 10]));
    var lo = Math.min.apply(null, rates.concat([0]));
    hi = Math.ceil((hi + 5) / 10) * 10;
    lo = Math.floor((lo - 5) / 10) * 10;
    var yOf = function (v) { return padT + innerH - innerH * ((v - lo) / (hi - lo)); };
    var n = pts.length;
    var xOf = function (i) { return padL + innerW * i / (n - 1); };

    var g = '';
    [lo, (lo + hi) / 2, hi].forEach(function (v) {
      g += gridline(padL, yOf(v), W - padR);
      g += txt(padL - 5, yOf(v) + 3, Math.round(v) + '%', { anchor: 'end', size: 8 });
    });
    if (lo < 0) g += '<line x1="' + padL + '" y1="' + yOf(0) + '" x2="' + (W - padR) + '" y2="' + yOf(0) + '" stroke="' + PAL.axis + '" stroke-width="1"/>';

    /* linha de referência da meta — tracejada e rotulada */
    if (targetPct > 0) {
      var ty = yOf(targetPct);
      g += '<line x1="' + padL + '" y1="' + ty + '" x2="' + (W - padR) + '" y2="' + ty +
        '" stroke="' + PAL.warn + '" stroke-width="1.5" stroke-dasharray="4 3"/>';
      g += txt(W - padR, ty - 5, 'meta ' + targetPct + '%', { anchor: 'end', size: 8, fill: PAL.warn, weight: 600 });
    }

    var line = pts.map(function (m, i) { return (i ? 'L' : 'M') + roundTo(xOf(i), 1) + ',' + roundTo(yOf(m.savingsRate), 1); }).join('');
    g += '<path d="' + line + '" fill="none" stroke="' + PAL.series[0] + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';

    pts.forEach(function (m, i) {
      var ok = targetPct > 0 && m.savingsRate >= targetPct;
      g += '<circle cx="' + xOf(i) + '" cy="' + yOf(m.savingsRate) + '" r="4" fill="' +
        (ok ? incomeColor() : PAL.series[0]) + '" stroke="' + PAL.surface + '" stroke-width="2"/>';
      if (i === n - 1) {
        g += txt(xOf(i), yOf(m.savingsRate) - 10, m.savingsRate + '%',
          { fill: PAL.ink, size: 10, weight: 600, anchor: i === n - 1 && xOf(i) > W - 30 ? 'end' : 'middle' });
      }
      if (i === 0 || i === n - 1 || n <= 6 || i % 2 === 0) g += txt(xOf(i), H - 5, m.label, { size: 8 });
      g += hit(xOf(i) - innerW / (n - 1) / 2, padT, innerW / (n - 1), innerH,
        '<b>' + D.monthLabel(m.key, true) + '</b>Poupou <b>' + m.savingsRate + '%</b> da renda' +
        '<br>' + Money.fmt(m.net, { sign: true }) + ' sobre ' + Money.fmt(m.income) +
        (targetPct > 0 ? '<hr>' + (ok ? '✓ acima da meta de ' + targetPct + '%' : '↓ ' + roundTo(targetPct - m.savingsRate, 1) + ' p.p. abaixo da meta') : ''));
    });

    var avg = roundTo(rates.reduce(function (a, b) { return a + b; }, 0) / n, 1);
    return card({
      title: 'Taxa de poupança',
      subtitle: 'Média de ' + avg + '% nos últimos ' + n + ' meses',
      body: svg(W, H, g, 'Linha da taxa de poupança mensal com linha de meta'),
      footnote: 'Quanto da sua renda sobra no fim do mês. A linha pontilhada é a meta definida no seu plano.',
      tableCols: ['Mês', 'Taxa', 'Sobrou', 'Receita'],
      tableRows: pts.map(function (m) { return [D.monthLabel(m.key), m.savingsRate + '%', Money.fmt(m.net), Money.fmt(m.income)]; })
    });
  };

  /* ═══════════ 6. ORÇAMENTO — barras-marcador ═══════════
     Cada linha mostra o gasto, o teto e um traço no ritmo
     esperado para o dia do mês em que estamos.                 */
  Chart.budget = function (report, opts) {
    opts = opts || {};
    var rows = (report.rows || []).filter(function (r) { return r.budget > 0; });
    if (!rows.length) {
      return emptyCard('Orçamento do mês',
        'Defina tetos por categoria em Configurações › Plano para acompanhar seu orçamento aqui.', '🎚️');
    }
    var body = '<div class="dv-bullets">' + rows.map(function (r) {
      var usedPct = clamp(r.pct, 0, 100);
      var overPct = r.over ? clamp((r.used - r.budget) / r.budget * 100, 0, 100) : 0;
      var markPct = clamp(report.elapsed * 100, 0, 100);
      var state = r.over ? 'over' : (r.atRisk ? 'risk' : 'ok');
      var icon = r.over ? '⚠️' : (r.atRisk ? '⏱️' : '✓');
      var statusTxt = r.over ? 'Passou do teto' : (r.atRisk ? 'Ritmo acelerado' : 'No ritmo');
      return '<div class="dv-bullet dv-' + state + '" data-tip="' + esc('<b>' + r.emoji + ' ' + r.name + '</b>' +
        'Gasto <b>' + Money.fmt(r.used) + '</b> de ' + Money.fmt(r.budget) +
        '<br>' + (r.over ? 'Excedeu ' + Money.fmt(r.used - r.budget) : 'Ainda cabem ' + Money.fmt(r.left)) +
        '<hr>Esperado até hoje: ' + Money.fmt(r.expected) + '<br>' + icon + ' ' + statusTxt) + '">' +
        '<div class="dv-bullet-top">' +
        '<span class="dv-bullet-name">' + r.emoji + ' ' + esc(r.name) + '</span>' +
        '<span class="dv-bullet-val">' + Money.fmt(r.used) + ' <em>/ ' + Money.short(r.budget) + '</em></span>' +
        '</div>' +
        '<div class="dv-bullet-track">' +
        '<div class="dv-bullet-fill" style="width:' + usedPct + '%;background:' + (r.over ? PAL.critical : r.color) + '"></div>' +
        (overPct ? '<div class="dv-bullet-over" style="width:' + overPct + '%"></div>' : '') +
        '<span class="dv-bullet-mark" style="left:' + markPct + '%" title="ritmo esperado"></span>' +
        '</div>' +
        '<div class="dv-bullet-foot"><span class="dv-chip dv-chip-' + state + '">' + icon + ' ' + statusTxt + '</span>' +
        '<span>' + (r.over ? '+' + Money.fmt(r.used - r.budget) + ' acima' : Money.fmt(r.left) + ' disponível') + '</span></div>' +
        '</div>';
    }).join('') + '</div>';

    return card({
      title: 'Orçamento de ' + D.monthLabel(report.monthKey, true),
      subtitle: Money.fmt(report.totalUsed) + ' de ' + Money.fmt(report.totalBudget) +
        ' · faltam ' + report.daysLeft + (report.daysLeft === 1 ? ' dia' : ' dias'),
      body: body,
      footnote: 'O traço vertical marca quanto você já <em>deveria</em> ter gasto para o dia de hoje — ficar à esquerda dele é estar no ritmo.',
      tableCols: ['Categoria', 'Gasto', 'Teto', 'Saldo'],
      tableRows: rows.map(function (r) { return [r.emoji + ' ' + r.name, Money.fmt(r.used), Money.fmt(r.budget), Money.fmt(r.left)]; })
    });
  };

  /* ═══════════ 7. MÉTODO 50/30/20 — real × planejado ═══════════ */
  Chart.groups = function (actual, income, targets, opts) {
    opts = opts || {};
    var LB = { essencial: 'Essencial', estilo: 'Estilo de vida', futuro: 'Futuro' };
    var CL = { essencial: PAL.series[0], estilo: PAL.series[4], futuro: incomeColor() };
    var keys = ['essencial', 'estilo', 'futuro'];
    var totalSpent = keys.reduce(function (s, k) { return s + (actual[k] || 0); }, 0);
    if (!totalSpent && !income) {
      return emptyCard('Equilíbrio do mês', 'Informe sua renda no plano e lance despesas para ver o equilíbrio.', '⚖️');
    }
    var base = income || totalSpent;

    var body = '<div class="dv-groups">' + keys.map(function (k) {
      var val = actual[k] || 0;
      var realPct = base ? roundTo(val / base * 100, 1) : 0;
      var tgtPct = targets[k] || 0;
      var tgtVal = Math.round(base * tgtPct / 100);
      var over = val > tgtVal && tgtVal > 0;
      return '<div class="dv-group" data-tip="' + esc('<b>' + LB[k] + '</b>' +
        Money.fmt(val) + ' = <b>' + realPct + '%</b> da renda<br>Planejado: ' + tgtPct + '% (' + Money.fmt(tgtVal) + ')' +
        '<hr>' + (over ? '⚠️ ' + Money.fmt(val - tgtVal) + ' acima do plano' : '✓ dentro do plano')) + '">' +
        '<div class="dv-group-top"><span>' + LB[k] + '</span>' +
        '<b class="' + (over ? 'dv-neg' : '') + '">' + realPct + '%</b>' +
        '<em>meta ' + tgtPct + '%</em></div>' +
        '<div class="dv-group-track">' +
        '<div class="dv-group-fill" style="width:' + clamp(realPct, 0, 100) + '%;background:' + CL[k] + '"></div>' +
        '<span class="dv-group-mark" style="left:' + clamp(tgtPct, 0, 100) + '%"></span>' +
        '</div>' +
        '<div class="dv-group-foot">' + Money.fmt(val) + ' <span>de ' + Money.fmt(tgtVal) + '</span></div>' +
        '</div>';
    }).join('') + '</div>';

    return card({
      title: 'Equilíbrio do mês',
      subtitle: 'Método ' + (opts.method || '50/30/20') + ' sobre ' + Money.fmt(base),
      body: body,
      footnote: 'Essencial = o que não dá para cortar. Estilo de vida = o que dá. Futuro = poupança, aportes e educação.',
      tableCols: ['Grupo', 'Gasto', '% da renda', 'Meta'],
      tableRows: keys.map(function (k) {
        return [LB[k], Money.fmt(actual[k] || 0), (base ? roundTo((actual[k] || 0) / base * 100, 1) : 0) + '%', (targets[k] || 0) + '%'];
      })
    });
  };

  /* ═══════════ 8. PROJEÇÃO DE PATRIMÔNIO ═══════════ */
  Chart.projection = function (proj, opts) {
    opts = opts || {};
    var pts = proj.points;
    if (!pts || pts.length < 2) return emptyCard('Projeção de patrimônio', 'Informe um aporte mensal no seu plano para projetar o futuro.', '🔮');

    var W = 320, H = 165, padL = 40, padR = 8, padB = 20, padT = 12;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var hi = niceMax(pts[pts.length - 1].value);
    var n = pts.length;
    var yOf = function (v) { return padT + innerH - innerH * (v / hi); };
    var xOf = function (i) { return padL + innerW * i / (n - 1); };

    var g = '';
    [0, 0.5, 1].forEach(function (f) {
      g += gridline(padL, yOf(hi * f), W - padR);
      g += txt(padL - 5, yOf(hi * f) + 3, Money.short(hi * f), { anchor: 'end', size: 8 });
    });

    var gid = 'pgrad' + (++_n);
    var lineTotal = pts.map(function (p, i) { return (i ? 'L' : 'M') + roundTo(xOf(i), 1) + ',' + roundTo(yOf(p.value), 1); }).join('');
    var lineInv = pts.map(function (p, i) { return (i ? 'L' : 'M') + roundTo(xOf(i), 1) + ',' + roundTo(yOf(p.contributed), 1); }).join('');

    g = '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + incomeColor() + '" stop-opacity=".28"/>' +
      '<stop offset="100%" stop-color="' + incomeColor() + '" stop-opacity="0"/></linearGradient></defs>' + g +
      '<path d="' + lineTotal + 'L' + xOf(n - 1) + ',' + (padT + innerH) + 'L' + padL + ',' + (padT + innerH) + 'Z" fill="url(#' + gid + ')"/>' +
      '<path d="' + lineInv + '" fill="none" stroke="' + PAL.series[3] + '" stroke-width="2" stroke-dasharray="5 3"/>' +
      '<path d="' + lineTotal + '" fill="none" stroke="' + incomeColor() + '" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="' + xOf(n - 1) + '" cy="' + yOf(pts[n - 1].value) + '" r="4.5" fill="' + incomeColor() +
      '" stroke="' + PAL.surface + '" stroke-width="2"/>';

    var step = Math.max(1, Math.round((n - 1) / 4));
    for (var i = 0; i < n; i += step) {
      var yrs = roundTo(pts[i].month / 12, 1);
      g += txt(xOf(i), H - 5, pts[i].month === 0 ? 'hoje' : (yrs >= 1 ? yrs + 'a' : pts[i].month + 'm'), { size: 8 });
    }
    pts.forEach(function (p, i) {
      if (i % Math.max(1, Math.round(n / 24)) !== 0 && i !== n - 1) return;
      g += hit(xOf(i) - innerW / n / 2, padT, innerW / n, innerH,
        '<b>' + (p.month === 0 ? 'Hoje' : 'Em ' + roundTo(p.month / 12, 1) + ' anos') + '</b>' +
        '<i style="background:' + incomeColor() + '"></i>Patrimônio <b>' + Money.fmt(p.value) + '</b>' +
        '<i style="background:' + PAL.series[3] + '"></i>Aportado <b>' + Money.fmt(p.contributed) + '</b>' +
        '<hr>Juros <b>' + Money.fmt(p.value - p.contributed) + '</b>' +
        '<br><span style="opacity:.7">vale ' + Money.fmt(p.real) + ' no poder de compra de hoje</span>');
    });

    return card({
      title: 'Projeção de patrimônio',
      subtitle: opts.subtitle || ('Em ' + roundTo(pts[n - 1].month / 12, 0) + ' anos: ' + Money.fmt(proj.final)),
      hero: '<div class="dv-hero-row">' +
        '<div class="dv-hero"><span>Patrimônio projetado</span><b>' + Money.fmt(proj.final) + '</b></div>' +
        '<div class="dv-hero dv-hero-sm"><span>Só de juros</span><b class="dv-pos">' + Money.fmt(proj.earnings) + '</b></div>' +
        '</div>',
      body: svg(W, H, g, 'Projeção do patrimônio com aportes e juros compostos'),
      legend: legend([
        { label: 'Com juros', color: incomeColor(), value: Money.short(proj.final) },
        { label: 'Só os aportes', color: PAL.series[3], value: Money.short(proj.invested) }
      ]),
      footnote: 'Estimativa com juros compostos mensais. Rentabilidade passada não garante rentabilidade futura.',
      tableCols: ['Prazo', 'Patrimônio', 'Aportado', 'Juros'],
      tableRows: pts.filter(function (p) { return p.month % 12 === 0; }).map(function (p) {
        return [(p.month / 12) + ' ano(s)', Money.fmt(p.value), Money.fmt(p.contributed), Money.fmt(p.value - p.contributed)];
      })
    });
  };

  /* ═══════════ 9. MAPA DE CALOR — gasto por dia ═══════════
     Rampa de um único matiz, claro → escuro = pouco → muito.   */
  Chart.heatmap = function (daily, opts) {
    opts = opts || {};
    if (!daily.max) return emptyCard('Ritmo de gastos', 'Sem despesas neste mês ainda.', '🗓️');

    var first = D.dow(D.firstOfMonth(daily.monthKey));
    var cells = '';
    var head = D.DIA_CURTO.map(function (d) { return '<span class="dv-hm-dow">' + d[0] + '</span>'; }).join('');
    for (var b = 0; b < first; b++) cells += '<span class="dv-hm-cell dv-hm-blank"></span>';

    daily.days.forEach(function (d) {
      var lvl = d.total === 0 ? -1 : Math.min(PAL.ramp.length - 1,
        Math.floor(d.total / daily.max * (PAL.ramp.length - 0.001)));
      var bg = lvl < 0 ? PAL.grid : PAL.ramp[lvl];
      var isToday = daily.monthKey + '-' + (d.day < 10 ? '0' : '') + d.day === D.today();
      cells += '<span class="dv-hm-cell' + (isToday ? ' dv-hm-today' : '') + '" style="background:' + bg + '" ' +
        'data-tip="' + esc('<b>Dia ' + d.day + '</b>' +
          (d.total ? Money.fmt(d.total) + '<br>' + d.count + (d.count === 1 ? ' lançamento' : ' lançamentos') : 'Nenhum gasto 🎉')) + '">' +
        '<em>' + d.day + '</em></span>';
    });

    var top = daily.days.slice().sort(function (a, b) { return b.total - a.total; })[0];
    return card({
      title: 'Ritmo de gastos',
      subtitle: D.monthLabel(daily.monthKey, true) + ' · pico no dia ' + top.day + ' (' + Money.fmt(top.total) + ')',
      body: '<div class="dv-heat"><div class="dv-hm-head">' + head + '</div>' +
        '<div class="dv-hm-grid">' + cells + '</div>' +
        '<div class="dv-hm-scale"><span>pouco</span>' +
        PAL.ramp.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') +
        '<span>muito</span></div></div>',
      tableCols: ['Dia', 'Gasto', 'Lançamentos'],
      tableRows: daily.days.filter(function (d) { return d.total > 0; })
        .map(function (d) { return ['Dia ' + d.day, Money.fmt(d.total), d.count]; })
    });
  };

  /* ═══════════ 10. ANEL DE PROGRESSO (metas) ═══════════ */
  Chart.ring = function (pct, color, size, label, sub) {
    size = size || 64;
    var r = size / 2 - 6, C = 2 * Math.PI * r, len = C * clamp(pct, 0, 100) / 100;
    var g = '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + PAL.grid + '" stroke-width="6"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color +
      '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + roundTo(len, 2) + ' ' + roundTo(C - len, 2) +
      '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')" class="dv-ring"/>' +
      txt(size / 2, size / 2 + (sub ? 0 : 4), label != null ? label : Math.round(pct) + '%',
        { fill: PAL.ink, size: size > 56 ? 13 : 11, weight: 600 });
    if (sub) g += txt(size / 2, size / 2 + 12, sub, { size: 7 });
    return svg(size, size, g, 'Progresso de ' + Math.round(pct) + '%', 'dv-ring-svg');
  };

  /* ═══════════ 11. MINILINHA (sparkline) ═══════════ */
  Chart.spark = function (values, color, w, h) {
    w = w || 72; h = h || 24;
    if (!values || values.length < 2) return '';
    var lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    if (hi === lo) { hi = lo + 1; }
    var d = values.map(function (v, i) {
      return (i ? 'L' : 'M') + roundTo(w * i / (values.length - 1), 1) + ',' +
        roundTo(h - 2 - (h - 4) * ((v - lo) / (hi - lo)), 1);
    }).join('');
    return svg(w, h, '<path d="' + d + '" fill="none" stroke="' + (color || PAL.series[0]) +
      '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>', 'Tendência', 'dv-spark');
  };

  /* ═══════════ 12. GASTO POR DIA DA SEMANA ═══════════ */
  Chart.weekdays = function (data, monthKey) {
    var F = Dm.F;
    var txs = monthKey ? F.inMonth(data.transactions, monthKey) : F.lastNDays(data.transactions, 90);
    var buckets = [0, 0, 0, 0, 0, 0, 0], counts = [0, 0, 0, 0, 0, 0, 0];
    txs.forEach(function (t) {
      if (t.type !== 'expense') return;
      var w = D.dow(t.date);
      buckets[w] += t.amount; counts[w]++;
    });
    var tot = buckets.reduce(function (a, b) { return a + b; }, 0);
    if (!tot) return emptyCard('Dias que pesam mais', 'Sem despesas no período.', '📅');

    var W = 320, H = 130, padL = 34, padR = 6, padT = 12, padB = 20;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var max = niceMax(Math.max.apply(null, buckets));
    var slot = innerW / 7, bw = Math.min(26, slot - 6);
    var g = '';
    [0, 0.5, 1].forEach(function (f) {
      g += gridline(padL, padT + innerH - innerH * f, W - padR);
      g += txt(padL - 5, padT + innerH - innerH * f + 3, Money.short(max * f), { anchor: 'end', size: 8 });
    });
    var topIdx = buckets.indexOf(Math.max.apply(null, buckets));
    buckets.forEach(function (v, i) {
      var hgt = innerH * (v / max);
      var x = padL + slot * i + (slot - bw) / 2;
      g += '<path d="' + barPath(x, padT + innerH - hgt, bw, hgt, 4) + '" fill="' +
        (i === topIdx ? PAL.expense : PAL.series[0]) + '"/>';
      g += txt(padL + slot * i + slot / 2, H - 5, D.DIA_CURTO[i], { size: 8, weight: i === topIdx ? 600 : 400, fill: i === topIdx ? PAL.ink2 : PAL.muted });
      g += hit(padL + slot * i, padT, slot, innerH,
        '<b>' + ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][i] + '</b>' +
        Money.fmt(v) + ' · ' + roundTo(v / tot * 100, 1) + '% do total<br>' +
        counts[i] + (counts[i] === 1 ? ' lançamento' : ' lançamentos'));
    });

    return card({
      title: 'Dias que pesam mais',
      subtitle: (monthKey ? D.monthLabel(monthKey, true) : 'Últimos 90 dias') + ' · ' +
        ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][topIdx] + ' lidera',
      body: svg(W, H, g, 'Barras de gasto por dia da semana'),
      tableCols: ['Dia', 'Gasto', 'Parte'],
      tableRows: buckets.map(function (v, i) { return [D.DIA_CURTO[i], Money.fmt(v), roundTo(v / tot * 100, 1) + '%']; })
    });
  };

  /* ═══════════ TOOLTIP GLOBAL ═══════════ */

  var tipEl = null;

  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div');
    tipEl.className = 'dv-tip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function showTip(target, clientX, clientY) {
    var html = target.getAttribute('data-tip');
    if (!html) return;
    var el = ensureTip();
    el.innerHTML = html;
    el.classList.add('show');
    var r = el.getBoundingClientRect();
    var x = clamp(clientX - r.width / 2, 8, global.innerWidth - r.width - 8);
    var y = clientY - r.height - 14;
    if (y < 8) y = clientY + 18;
    el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }

  function hideTip() { if (tipEl) tipEl.classList.remove('show'); }

  Chart.hideTip = hideTip;

  Chart.bindTooltips = function () {
    var find = function (e) {
      var n = e.target;
      while (n && n !== document.body) {
        if (n.getAttribute && n.getAttribute('data-tip')) return n;
        n = n.parentNode;
      }
      return null;
    };
    document.addEventListener('mousemove', function (e) {
      var t = find(e);
      if (t) showTip(t, e.clientX, e.clientY); else hideTip();
    }, { passive: true });
    document.addEventListener('mouseleave', hideTip);
    document.addEventListener('touchstart', function (e) {
      var t = find(e);
      if (t && e.touches[0]) showTip(t, e.touches[0].clientX, e.touches[0].clientY);
      else hideTip();
    }, { passive: true });
    document.addEventListener('scroll', hideTip, { passive: true });

    /* botão "Ver dados" de cada gráfico */
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-dv-table]');
      if (!b) return;
      var t = document.getElementById(b.getAttribute('data-dv-table'));
      if (!t) return;
      var open = t.hasAttribute('hidden');
      if (open) t.removeAttribute('hidden'); else t.setAttribute('hidden', '');
      b.textContent = open ? 'Ocultar dados' : 'Ver dados';
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  };

  Dm.Chart = Chart;
})(typeof window !== 'undefined' ? window : globalThis);
