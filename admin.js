document.addEventListener('DOMContentLoaded', () => {

    // ─────────────────────────────────────────────────────────────────────────
    // LOGIN
    // ─────────────────────────────────────────────────────────────────────────
    const loginOverlay       = document.getElementById('login-overlay');
    const dashboardContainer = document.getElementById('admin-dashboard-container');
    const loginForm          = document.getElementById('admin-login-form');
    const loginError         = document.getElementById('login-error');

    if (sessionStorage.getItem('apex_admin_logged_in') === 'true') {
        loginOverlay.style.display      = 'none';
        dashboardContainer.style.display = 'flex';
        initAdmin();
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = document.getElementById('login-user').value.trim();
            const pass = document.getElementById('login-pass').value.trim();

            // Função para entrar no painel
            function entrarNoPainel() {
                sessionStorage.setItem('apex_admin_logged_in', 'true');
                loginOverlay.style.display       = 'none';
                dashboardContainer.style.display = 'flex';
                loginError.style.display         = 'none';
                initAdmin();
            }

            // Verificação local imediata (garante acesso mesmo se o servidor falhar)
            if (user === 'admin' && pass === 'apex2026') {
                entrarNoPainel();
                return;
            }

            // Tentativa via API do servidor
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user, pass })
                });
                const data = await response.json();
                if (response.ok && data.success) {
                    entrarNoPainel();
                } else {
                    loginError.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> ' + (data.error || 'Credenciais incorretas.');
                    loginError.style.display = 'block';
                }
            } catch (error) {
                console.error('Erro no login:', error);
                loginError.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Erro de conexão com o servidor.';
                loginError.style.display = 'block';
            }
        });
    }



    // ─────────────────────────────────────────────────────────────────────────
    // NAVEGAÇÃO
    // ─────────────────────────────────────────────────────────────────────────
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    const sections = document.querySelectorAll('.view-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            sections.forEach(sec => sec.classList.remove('active'));
            item.classList.add('active');
            const target = document.getElementById(item.dataset.target);
            if (target) {
                target.classList.add('active');
                if (item.dataset.target === 'relatorio-diario') {
                    setTimeout(() => {
                        window.dispatchEvent(new Event('resize'));
                    }, 50);
                }
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // INIT ADMIN
    // ─────────────────────────────────────────────────────────────────────────
    function initAdmin() {
        initLMEDashboard();
        initLMEExcelReport();
        initRelatorioDiario();
        initRelatorioDiarioHistorico();
        initSettings();
        initGaleria();
        initMateriais();
        initSolucoes();
        initNoticias();
        initLMEEmailConfig();
    }

    // =========================================================================
    // LME EXCEL REPORT
    // =========================================================================
    async function initLMEExcelReport() {
        const filterMes     = document.getElementById('lme-filter-mes');
        const selector      = document.getElementById('lme-week-selector');
        const preview       = document.getElementById('excel-table-preview');
        const previewWrap   = document.getElementById('excel-preview-wrapper');
        const btnDownload    = document.getElementById('btn-download-lme-excel');
        const btnDownloadPdf = document.getElementById('btn-download-lme-pdf');
        const btnRefresh     = document.getElementById('btn-refresh-excel');
        const loadingDiv    = document.getElementById('excel-loading');
        const errorDiv      = document.getElementById('excel-error');
        const errorMsg      = document.getElementById('excel-error-msg');
        const countNum      = document.getElementById('lme-count-num');
        const metalCbs      = document.querySelectorAll('.metal-toggle-cb');
        const btnToggleAll  = document.getElementById('btn-toggle-all-metals');

        if (!selector || !preview) return;

        const MONTH_NAMES = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        let excelWeeks = [];
        let activeMetals = new Set(['cobre','zinco','aluminio','chumbo','estanho','niquel','dolar']);
        let allMetalsOn = true;

        // ─── HELPERS ────────────────────────────────────────────────────
        function showLoading() {
            if (loadingDiv)  { loadingDiv.style.display  = 'flex'; }
            if (errorDiv)    { errorDiv.style.display    = 'none'; }
            if (previewWrap) { previewWrap.style.display = 'none'; }
        }
        function showError(msg) {
            if (loadingDiv)  { loadingDiv.style.display  = 'none'; }
            if (errorDiv)    { errorDiv.style.display    = 'flex'; }
            if (errorMsg)    { errorMsg.textContent      = msg;    }
            if (previewWrap) { previewWrap.style.display = 'none'; }
        }
        function showTable() {
            if (loadingDiv)  { loadingDiv.style.display  = 'none'; }
            if (errorDiv)    { errorDiv.style.display    = 'none'; }
            if (previewWrap) { previewWrap.style.display = 'block'; }
        }

        // ─── LOAD DATA ──────────────────────────────────────────────────
        async function loadWeeks(mesOverride = null) {
            showLoading();
            try {
                // 1. Fetch available months if not overriding
                let mesToFetch = mesOverride;
                if (!mesToFetch) {
                    const resMeses = await fetch('/api/lme/meses');
                    const mesesDisponiveis = await resMeses.json();
                    
                    filterMes.innerHTML = mesesDisponiveis.map(m => 
                        `<option value="${m.valor}">${m.texto}</option>`
                    ).join('');
                    
                    if (mesesDisponiveis.length > 0) {
                        mesToFetch = mesesDisponiveis[0].valor;
                        filterMes.value = mesToFetch;
                    } else {
                        throw new Error('Nenhum mês disponível na LME.');
                    }
                }

                // 2. Fetch weekly report for the selected month
                const res = await fetch(`/api/lme/relatorio-semanal?mes=${mesToFetch}`);
                if (!res.ok) throw new Error(`Servidor respondeu com erro ${res.status}`);
                
                const data = await res.json();
                excelWeeks = data.semanas || [];
                
                if (excelWeeks.length === 0) {
                    selector.innerHTML = '<option value="">Nenhuma semana encontrada</option>';
                    showError('Nenhuma semana encontrada neste mês.');
                    if (countNum) countNum.textContent = '0';
                    return;
                }

                if (countNum) countNum.textContent = excelWeeks.length;
                
                selector.innerHTML = excelWeeks.map(w => {
                    const lastDay = w.days && w.days.length > 0 ? w.days[w.days.length - 1]?.data : '—';
                    return `<option value="${w.header}">Semana ${w.header} → ${lastDay}</option>`;
                }).join('');

                renderPreview(excelWeeks[0].header);
            } catch(e) {
                console.error('Error loading LME weeks:', e);
                showError(`Erro ao carregar dados LME: ${e.message}`);
            }
        }

        // ─── RENDER PREVIEW TABLE ────────────────────────────────────────
        const formatVal = (v, formatType) => {
            if (v === null || v === undefined) return '—';
            if (v === 'feriado') return '<span class="excel-feriado">feriado</span>';
            if (typeof v === 'string') return v;

            if (formatType === 'percent') {
                const pct = (v * 100).toFixed(3);
                const cls = v >= 0 ? 'excel-up' : 'excel-down';
                return `<span class="${cls}">${pct}%</span>`;
            }
            if (formatType === 'currency_usd') {
                return `$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
            }
            if (formatType === 'currency3') {
                return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
            }
            if (formatType === 'currency4') {
                return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
            }
            if (formatType === 'dolar') {
                return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
            }
            return v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
        };

        const renderOscilacao = (v, isDolar) => {
            if (v === null || v === undefined || typeof v === 'string') return '—';
            const isUp = v >= 0;
            const arrow = isUp ? '▲' : '▼';
            const cls = isUp ? 'excel-up' : 'excel-down';
            // OSCILAÇÃO R$ é a variação convertida em reais brasileiros
            const prefix = 'R$ ';
            const formatted = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
            return `<span class="${cls}">${arrow} ${prefix}${formatted}</span>`;
        };

        // Metal column config: key, header text, header CSS class, cell CSS class, default format, dollar format
        const COLS = [
            { k: 'cobre',    lbl: 'COBRE',    hcls: 'excel-hdr-cobre',    ccls: 'excel-col-cobre',    fmt: 'currency_usd', dolFmt: null       },
            { k: 'zinco',    lbl: 'ZINCO',    hcls: 'excel-hdr-zinco',    ccls: 'excel-col-zinco',    fmt: 'currency_usd', dolFmt: null       },
            { k: 'aluminio', lbl: 'ALUMÍNIO', hcls: 'excel-hdr-aluminio', ccls: 'excel-col-aluminio', fmt: 'currency_usd', dolFmt: null       },
            { k: 'chumbo',   lbl: 'CHUMBO',   hcls: 'excel-hdr-chumbo',   ccls: 'excel-col-chumbo',   fmt: 'currency_usd', dolFmt: null       },
            { k: 'estanho',  lbl: 'ESTANHO',  hcls: 'excel-hdr-estanho',  ccls: 'excel-col-estanho',  fmt: 'currency_usd', dolFmt: null       },
            { k: 'niquel',   lbl: 'NÍQUEL',   hcls: 'excel-hdr-niquel',   ccls: 'excel-col-niquel',   fmt: 'currency_usd', dolFmt: null       },
            { k: 'dolar',    lbl: 'DÓLAR',    hcls: 'excel-hdr-dolar',    ccls: 'excel-col-dolar',    fmt: 'currency4',    dolFmt: 'currency4' },
        ];

        function visibleCols() {
            return COLS.filter(c => activeMetals.has(c.k));
        }

        function renderPreview(headerVal) {
            const block = excelWeeks.find(b => b.header === headerVal);
            if (!block) return;

            const vc = visibleCols();
            const colSpan = 1 + vc.length;
            const d = block.days || [];
            const comp = block.computed || {};

            const thHeaders = vc.map(c => `<th class="${c.hcls}">${c.lbl}</th>`).join('');
            const thSummary = vc.map(c => {
                const suffix = c.k === 'dolar' ? ' (R$)' : ' (R$/kg)';
                return `<th class="${c.hcls}">${c.lbl}${suffix}</th>`;
            }).join('');

            const firstDate = d[0]?.data || headerVal;
            const lastDate  = d[d.length - 1]?.data || '—';
            const monthName = filterMes.options[filterMes.selectedIndex]?.text || '';

            let html = `
            <div class="excel-title-row">
                <span class="excel-company">APEXTECH METAIS</span>
                <span class="excel-week-label">${monthName} &mdash; Semana de ${firstDate} a ${lastDate}</span>
            </div>
            <table class="excel-table">
                <thead>
                    <tr>
                        <th class="excel-hdr-date">DATA</th>${thHeaders}
                    </tr>
                </thead>
                <tbody>
            `;

            // Daily rows
            for (let i = 0; i < 5; i++) {
                const day = d[i] || {};
                const isFeriado = vc.every(c => day[c.k] === 'feriado' || day[c.k] === null);
                const rowCls = isFeriado ? ' class="excel-row-feriado"' : '';
                const dateTd = `<td class="excel-date-cell">${day.data || '—'}</td>`;
                const valTds = vc.map(c => `<td class="${c.ccls}">${formatVal(day[c.k], c.fmt)}</td>`).join('');
                html += `<tr${rowCls}>${dateTd}${valTds}</tr>`;
            }

            // Computed rows config
            const COMP_ROWS = [
                { lbl: 'MÉDIA SEMANAL',                    key: 'MEDIA SEMANAL',                    cls: 'excel-row-mensal',         fmt: 'currency_usd', dolFmt: 'dolar'     },
                { lbl: '100% LME (R$)',                    key: '100% LME',                         cls: 'excel-row-lme100',        fmt: 'currency3',    dolFmt: 'dolar'     },
                { lbl: 'SEMANA ANTERIOR',                  key: 'SEMANA ANTERIOR',                  cls: 'excel-row-anterior',      fmt: 'currency3',    dolFmt: 'dolar'     },
                { lbl: 'FECHAMENTO % (SEMANA ANTERIOR)',   key: 'FECHAMENTO % ( SEMANA ANTERIOR )', cls: 'excel-row-fechamento',    fmt: 'percent',      dolFmt: 'percent'   },
                { lbl: 'OSCILAÇÃO %',                      key: 'OSCILAÇÃO %',                      cls: 'excel-row-oscilacao-pct', fmt: 'percent',      dolFmt: 'percent'   },
                { lbl: 'OSCILAÇÃO R$',                     key: 'OSCILAÇÃO R$',                     cls: 'excel-row-oscilacao-rs',  fmt: 'currency4',    dolFmt: 'dolar'     },
                { lbl: 'MÉDIA MENSAL',                     key: 'MEDIA MENSAL',                     cls: 'excel-row-mensal',        fmt: 'currency3',    dolFmt: 'dolar'     },
            ];

            COMP_ROWS.forEach(row => {
                const vals = comp[row.key] || {};
                const isAnterior = row.cls === 'excel-row-anterior';
                const inlineStyle = isAnterior ? ' style="background-color:#1a1a1a;color:#ffffff;"' : '';
                // Indicar feriado: se a semana teve menos de 5 dias úteis, mostrar no label da média
                let lbl = row.lbl;
                if (row.key === 'MEDIA SEMANAL' && block.numDias !== undefined && block.numDias < 5) {
                    lbl += ` <span style="font-size:0.65em;font-weight:normal;opacity:0.7;font-style:italic">(${block.numDias} dias úteis)</span>`;
                }
                const labelTd = `<td class="excel-label-cell"${inlineStyle}>${lbl}</td>`;
                const valTds = vc.map(c => {
                    const fmtToUse = c.k === 'dolar' && row.dolFmt ? row.dolFmt : row.fmt;
                    return `<td class="excel-col-${c.k}">${formatVal(vals[c.k], fmtToUse)}</td>`;
                }).join('');
                html += `<tr class="${row.cls}">${labelTd}${valTds}</tr>`;
            });

            // Spacer
            html += `<tr class="excel-spacer"><td colspan="${colSpan}"></td></tr>`;

            // Summary mini-table header
            html += `
                <tr>
                    <th class="excel-hdr-date">TIPO</th>${thSummary}
                </tr>
            `;

            // Mini-tabela resumo: SEMANA ANTERIOR e LME ATUAL em R$/kg
            const SUMMARY_ROWS = [
                { lbl: 'SEMANA ANTERIOR (R$/kg)', key: 'SEMANA ANTERIOR', fmt: 'currency3', dolFmt: 'currency4' },
                { lbl: 'LME ATUAL (R$/kg)',       key: '100% LME',        fmt: 'currency3', dolFmt: 'currency4' },
            ];
            SUMMARY_ROWS.forEach(row => {
                const vals = comp[row.key] || {};
                const labelTd = `<td class="excel-label-cell">${row.lbl}</td>`;
                const valTds = vc.map(c => {
                    const fmtToUse = c.k === 'dolar' && row.dolFmt ? row.dolFmt : row.fmt;
                    return `<td class="excel-col-${c.k}">${formatVal(vals[c.k], fmtToUse)}</td>`;
                }).join('');
                html += `<tr class="excel-row-summary">${labelTd}${valTds}</tr>`;
            });

            // Oscillation row (with arrows)
            const osc = comp['OSCILAÇÃO R$'] || {};
            const oscTds = vc.map(c => `<td class="excel-col-${c.k}">${renderOscilacao(osc[c.k], false)}</td>`).join('');
            html += `
                <tr class="excel-row-oscilacao-arrow">
                    <td class="excel-label-cell" style="font-style:italic;">Oscilação R$/kg</td>
                    ${oscTds}
                </tr>
            `;

            html += '</tbody></table>';
            preview.innerHTML = '<div id="pdf-print-area">' + html + '</div>';
            showTable();
        }

        // ─── EVENT LISTENERS ─────────────────────────────────────────────
        filterMes.addEventListener('change', () => {
            loadWeeks(filterMes.value);
        });

        selector.addEventListener('change', () => {
            if (selector.value) renderPreview(selector.value);
        });

        btnDownload.addEventListener('click', async () => {
            const val = selector.value;
            if (!val) return;
            const block = excelWeeks.find(b => b.header === val);
            if (!block) return;
            
            btnDownload.classList.add('downloading');
            try {
                const res = await fetch('/api/lme/gerar-excel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        semana: block,
                        mesLabel: filterMes.options[filterMes.selectedIndex]?.text
                    })
                });
                if (!res.ok) throw new Error('Erro ao gerar Excel');
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `LME-Relatorio-${val.replace(/\//g, '-')}.xlsx`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
            } catch(e) {
                console.error(e);
                alert('Erro ao baixar Excel: ' + e.message);
            } finally {
                btnDownload.classList.remove('downloading');
            }
        });

        // ── PDF Download ──
        if (btnDownloadPdf) {
            btnDownloadPdf.addEventListener('click', () => {
                const val = selector.value;
                if (!val) { alert('Selecione uma semana primeiro.'); return; }
                const block = excelWeeks.find(b => b.header === val);
                if (!block) return;

                // Inject/update timestamp into the print area
                const area = document.getElementById('pdf-print-area');
                if (!area) { alert('Visualize o relatório antes de baixar o PDF.'); return; }

                const now = new Date();
                const ts = now.toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                });

                let tsEl = area.querySelector('.pdf-timestamp');
                if (!tsEl) {
                    tsEl = document.createElement('div');
                    tsEl.className = 'pdf-timestamp';
                    tsEl.style.cssText = 'font-size:9pt;color:#555;margin-bottom:8px;text-align:right;font-family:Calibri,sans-serif;border-bottom:1px solid #ccc;padding-bottom:6px;';
                    area.insertBefore(tsEl, area.firstChild);
                }
                tsEl.textContent = `Relatório gerado em: ${ts} — Apex Tech Metais`;

                window.print();
            });
        }

        btnRefresh.addEventListener('click', async () => {
            btnRefresh.classList.add('spinning');
            btnRefresh.disabled = true;
            await loadWeeks();
            btnRefresh.classList.remove('spinning');
            btnRefresh.disabled = false;
        });

        // Metal column toggles
        metalCbs.forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    activeMetals.add(cb.dataset.metal);
                } else {
                    activeMetals.delete(cb.dataset.metal);
                }
                if (selector.value) renderPreview(selector.value);
                // Update "Todos" button label
                allMetalsOn = activeMetals.size === 7;
                if (btnToggleAll) btnToggleAll.textContent = allMetalsOn ? 'Nenhum' : 'Todos';
            });
        });

        if (btnToggleAll) {
            btnToggleAll.addEventListener('click', () => {
                allMetalsOn = !allMetalsOn;
                metalCbs.forEach(cb => {
                    cb.checked = allMetalsOn;
                    if (allMetalsOn) activeMetals.add(cb.dataset.metal);
                    else activeMetals.delete(cb.dataset.metal);
                });
                btnToggleAll.textContent = allMetalsOn ? 'Nenhum' : 'Todos';
                if (selector.value) renderPreview(selector.value);
            });
        }

        // ─── INITIAL LOAD ────────────────────────────────────────────────
        await loadWeeks();
    }

    // =========================================================================
    // LME DASHBOARD — 20 ANALYSES
    // =========================================================================

    const METALS = ['cobre', 'aluminio', 'zinco', 'chumbo', 'estanho', 'niquel'];
    const METAL_LABELS = {
        cobre: 'Cobre', aluminio: 'Alumínio', zinco: 'Zinco',
        chumbo: 'Chumbo', estanho: 'Estanho', niquel: 'Níquel'
    };
    const METAL_COLORS = {
        cobre: '#e07b39', aluminio: '#7eb3d5', zinco: '#a8c5a0',
        chumbo: '#b0a0c0', estanho: '#d4b896', niquel: '#2AD07A'
    };
    const NBI_WEIGHTS = { cobre: 0.45, aluminio: 0.20, chumbo: 0.15, estanho: 0.10, zinco: 0.10 };

    const chartInstances = {};
    let activeMetalFilter = 'cobre';
    let currentData = null;
    let currentStats = null;

    function parsePrice(str) {
        if (!str || str === '—' || str === '-' || str.trim() === '') return null;
        // Brazilian format: "9.234,56" → 9234.56
        const cleaned = str.replace(/\./g, '').replace(',', '.');
        const val = parseFloat(cleaned);
        return isNaN(val) ? null : val;
    }

    function fmtPrice(val, dec = 2) {
        if (val === null || val === undefined || isNaN(val)) return '—';
        return val.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }

    function destroyChart(id) {
        if (chartInstances[id]) {
            chartInstances[id].destroy();
            delete chartInstances[id];
        }
    }

    const baseChartOpts = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { labels: { color: '#ccc', font: { family: 'Lato', size: 12 }, padding: 16 } },
            datalabels: { display: false }
        },
        scales: {
            x: { ticks: { color: '#888', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
            y: { ticks: { color: '#888', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
        }
    };

    function deepMerge(target, source) {
        const output = Object.assign({}, target);
        Object.keys(source).forEach(key => {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                output[key] = deepMerge(target[key] || {}, source[key]);
            } else {
                output[key] = source[key];
            }
        });
        return output;
    }

    // ─── Init LME Dashboard ────────────────────────────────────────────────────
    async function initLMEDashboard() {
        const mesSel   = document.getElementById('mes-selector');
        const btnRefresh = document.getElementById('btn-refresh-lme');

        const now        = new Date();
        const currentMes = `${now.getMonth() + 1}-${now.getFullYear()}`;

        // Try to get available months
        try {
            const res = await fetch(`/api/lme/tabela/atual`);
            if (res.ok) {
                const data = await res.json();
                if (data.mesesDisponiveis && data.mesesDisponiveis.length > 0) {
                    mesSel.innerHTML = data.mesesDisponiveis.map((m, idx) =>
                        `<option value="${m.valor}" ${idx === 0 ? 'selected' : ''}>${m.texto}</option>`
                    ).join('');
                } else {
                    mesSel.innerHTML = `<option value="${currentMes}">${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</option>`;
                }
            }
        } catch(e) {
            mesSel.innerHTML = `<option value="${currentMes}">Mês atual</option>`;
        }

        // Setup filter bar and fullscreen events
        setupAnalysisControls();

        await loadAndRenderLME(mesSel.value || currentMes);

        mesSel.addEventListener('change', () => loadAndRenderLME(mesSel.value));
        btnRefresh.addEventListener('click', () => loadAndRenderLME(mesSel.value));
    }

    function setupAnalysisControls() {
        const filterBtns = document.querySelectorAll('.analysis-filter-btn');
        const blocks = document.querySelectorAll('.analysis-block');
        const overlay = document.getElementById('fullscreen-overlay');
        const fsBody = document.getElementById('fullscreen-body');
        const fsTitle = document.getElementById('fullscreen-title');
        const btnCloseFs = document.getElementById('btn-close-fullscreen');
        const filterBar = document.getElementById('analysis-filter-bar');

        if (filterBar) filterBar.style.display = 'block';

        // Filters
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const filter = btn.dataset.filter;
                blocks.forEach(block => {
                    // Ignora a block do relatorio executivo se tivermos removido, 
                    // mas os que restaram usam data-aid
                    if (!block.dataset.aid) return; 
                    if (filter === 'all' || block.dataset.aid === filter) {
                        block.style.display = 'block';
                    } else {
                        block.style.display = 'none';
                    }
                });
            });
        });

        // Fullscreen
        document.querySelectorAll('.btn-fullscreen').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const aid = btn.dataset.aid;
                const block = document.querySelector(`.analysis-block[data-aid="${aid}"]`);
                if (!block) return;
                
                // Set title
                const titleEl = block.querySelector('.analysis-title');
                fsTitle.innerHTML = titleEl ? titleEl.innerHTML : `Análise ${aid}`;
                
                // Clone the chart container / content
                const contentToClone = block.querySelector('.chart-container, .charts-grid-2, .kpi-grid, .ranking-container, .momentum-grid, .alertas-grid, .canal-container');
                if (contentToClone) {
                    fsBody.innerHTML = '';
                    // We move the actual canvas/elements to the modal so the chart stays interactive,
                    // but wait, chart.js canvas cannot be easily moved without redrawing. 
                    // Since it's easier, we just temporarily move the elements.
                    
                    // Salva a referência original
                    const originalParent = contentToClone.parentNode;
                    const originalNextSibling = contentToClone.nextSibling;
                    
                    btn.dataset.originalParentId = 'temp-fs-storage'; // just a flag
                    
                    // Mover
                    fsBody.appendChild(contentToClone);
                    overlay.style.display = 'flex';
                    
                    // Ajustar tamanho se for grafico
                    window.dispatchEvent(new Event('resize'));
                    
                    btnCloseFs.onclick = () => {
                        overlay.style.display = 'none';
                        // Retornar ao lugar original
                        if (originalNextSibling) {
                            originalParent.insertBefore(contentToClone, originalNextSibling);
                        } else {
                            originalParent.appendChild(contentToClone);
                        }
                        fsBody.innerHTML = '';
                        window.dispatchEvent(new Event('resize'));
                    };
                }
            });
        });
    }

    async function loadAndRenderLME(mes) {
        const loading = document.getElementById('lme-loading');
        const errorEl = document.getElementById('lme-error');
        const content = document.getElementById('analysis-content');

        loading.style.display = 'flex';
        errorEl.style.display = 'none';
        content.style.display = 'none';

        try {
            const res = await fetch(`/api/lme/tabela/${mes}`);
            if (!res.ok) throw new Error('API error');
            const apiData = await res.json();

            // Filter only daily rows
            const diarias = (apiData.cotacoes || []).filter(r => r.tipo === 'diaria');
            if (!diarias.length) throw new Error('No daily data');

            // Parse each row
            const parsed = diarias.map(row => ({
                dia:      row.dia,
                cobre:    parsePrice(row.cobre),
                aluminio: parsePrice(row.aluminio),
                zinco:    parsePrice(row.zinco),
                chumbo:   parsePrice(row.chumbo),
                estanho:  parsePrice(row.estanho),
                niquel:   parsePrice(row.niquel),
                dolar:    parsePrice(row.dolar)
            })).filter(r => r.cobre !== null || r.aluminio !== null);

            if (!parsed.length) throw new Error('No valid rows');

            currentData  = parsed;
            currentStats = computeStats(parsed);

            loading.style.display = 'none';
            content.style.display = 'block';

            renderAllAnalyses(parsed, currentStats);

        } catch(e) {
            console.error('LME load error:', e);
            loading.style.display = 'none';
            errorEl.style.display = 'flex';
        }
    }

    // ─── Compute Stats ─────────────────────────────────────────────────────────
    function computeStats(data) {
        const stats = {};
        const latest = data[data.length - 1];
        const prev   = data.length > 1 ? data[data.length - 2] : null;

        METALS.forEach(m => {
            const vals = data.map(r => r[m]).filter(v => v !== null && !isNaN(v));
            if (!vals.length) { stats[m] = null; return; }

            const current   = latest[m] || vals[vals.length - 1];
            const min       = Math.min(...vals);
            const max       = Math.max(...vals);
            const avg       = vals.reduce((a, b) => a + b, 0) / vals.length;
            const channelPos = max > min ? ((current - min) / (max - min)) * 100 : 50;
            const prevVal   = prev ? prev[m] : null;
            const dayChange = (current && prevVal) ? ((current - prevVal) / prevVal) * 100 : 0;
            const first     = vals[0];
            const monthChange = first ? ((current - first) / first) * 100 : 0;

            // Standard deviation & risk
            const variance = vals.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / vals.length;
            const stddev   = Math.sqrt(variance);
            const riskIndex = avg ? (stddev / avg) * 100 : 0;

            // Zscore
            const zscore = stddev ? (current - avg) / stddev : 0;

            // SMA-5
            const sma5 = data.map((_, i) => {
                if (i < 4) return null;
                const slice = data.slice(i - 4, i + 1).map(r => r[m]).filter(v => v !== null);
                return slice.length === 5 ? slice.reduce((a, b) => a + b, 0) / 5 : null;
            });

            // Momentum: last 5 vs prev 5
            const last5Vals = vals.slice(-5);
            const prev5Vals = vals.slice(-10, -5);
            const avg5      = last5Vals.length ? last5Vals.reduce((a, b) => a + b, 0) / last5Vals.length : avg;
            const avgPrev5  = prev5Vals.length ? prev5Vals.reduce((a, b) => a + b, 0) / prev5Vals.length : avg;
            const momentum  = avgPrev5 ? ((avg5 - avgPrev5) / avgPrev5) * 100 : 0;

            // Opportunity Score (0–100)
            const chanScore = (channelPos / 100) * 40;
            const momScore  = Math.max(0, Math.min(1, (momentum + 5) / 10)) * 30;
            const dayScore  = Math.max(0, Math.min(1, (dayChange + 2) / 4)) * 30;
            const score     = chanScore + momScore + dayScore;

            // Signal
            let signal, signalClass;
            if (channelPos >= 85)      { signal = 'VENDER';   signalClass = 'signal-sell';  }
            else if (channelPos >= 60) { signal = 'ATENÇÃO';  signalClass = 'signal-watch'; }
            else if (channelPos >= 30) { signal = 'RETER';    signalClass = 'signal-hold';  }
            else                       { signal = 'ACUMULAR'; signalClass = 'signal-buy';   }

            stats[m] = {
                current, min, max, avg, channelPos, dayChange, monthChange,
                stddev, riskIndex, zscore, momentum, score, signal, signalClass,
                sma5, vals, avg5, avgPrev5
            };
        });

        return stats;
    }

    // ─── Render All ────────────────────────────────────────────────────────────
    function renderAllAnalyses(data, stats) {
        renderKPICards(stats);                         // Nova 01 (Antiga 01)
        renderTrendChart(data, activeMetalFilter);     // Nova 02 (Antiga 05)
        setupMetalFilters(data);
        renderRanking(stats);                          // Nova 03 (Antiga 08)
        renderOpportunityScore(stats);                 // Nova 04 (Antiga 09)
        renderWeekComparison(stats);                   // Nova 05 (Antiga 10)
        renderMomentum(stats);                         // Nova 06 (Antiga 12)
        renderSMAChart(data, stats);                   // Nova 07 (Antiga 14)
        renderAlerts(stats);                           // Nova 08 (Antiga 19)
        renderChannelBars(stats);                      // Nova 09 (Antiga 03)
    }

    function setupMetalFilters(data) {
        document.querySelectorAll('.btn-metal-filter').forEach(btn => {
            // Remove old listeners by cloning
            const clone = btn.cloneNode(true);
            btn.parentNode.replaceChild(clone, btn);
        });
        document.querySelectorAll('.btn-metal-filter').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-metal-filter').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeMetalFilter = btn.dataset.metal;
                renderTrendChart(data, activeMetalFilter);
            });
        });
    }

    // ── ANÁLISE 01: KPI Cards + Sinalizadores ──
    function renderKPICards(stats) {
        const container = document.getElementById('kpi-cards');
        if (!container) return;

        const icons = { cobre: 'fa-bolt', aluminio: 'fa-layer-group', zinco: 'fa-atom', chumbo: 'fa-weight-hanging', estanho: 'fa-microchip', niquel: 'fa-gem' };
        const signalIcons = { 'VENDER': 'fa-arrow-up-right-dots', 'ATENÇÃO': 'fa-eye', 'RETER': 'fa-pause', 'ACUMULAR': 'fa-cart-shopping' };

        container.innerHTML = METALS.map(m => {
            const s = stats[m];
            if (!s) return '';
            const upColor  = s.dayChange >= 0 ? '#2AD07A' : '#ff4d4d';
            const upIcon   = s.dayChange >= 0 ? 'fa-caret-up' : 'fa-caret-down';
            return `
            <div class="kpi-card">
                <div class="kpi-header">
                    <div class="kpi-icon">
                        <i class="fa-solid ${icons[m]}" style="color:${METAL_COLORS[m]};"></i>
                    </div>
                    <span class="signal-badge ${s.signalClass}">
                        <i class="fa-solid ${signalIcons[s.signal]}"></i> ${s.signal}
                    </span>
                </div>
                <div class="kpi-name">${METAL_LABELS[m]}</div>
                <div class="kpi-price">US$ ${fmtPrice(s.current)}</div>
                <div class="kpi-change" style="color:${upColor};">
                    <i class="fa-solid ${upIcon}"></i> ${Math.abs(s.dayChange).toFixed(2)}% hoje
                </div>
                <div class="kpi-footer">
                    <span>↓ US$ ${fmtPrice(s.min)}</span>
                    <span style="color:#555;">|</span>
                    <span>↑ US$ ${fmtPrice(s.max)}</span>
                </div>
            </div>`;
        }).join('');
    }

    // ── ANÁLISE 02: Noble Basket Index ──
    function renderNobleBasket(data, stats) {
        const nbiVals = data.map(row => {
            let v = 0, ok = true;
            for (const [m, w] of Object.entries(NBI_WEIGHTS)) {
                if (row[m] === null || isNaN(row[m])) { ok = false; break; }
                v += row[m] * w;
            }
            return ok ? v : null;
        }).filter(v => v !== null);

        if (!nbiVals.length) return;

        const curr  = nbiVals[nbiVals.length - 1];
        const prev2 = nbiVals.length > 1 ? nbiVals[nbiVals.length - 2] : curr;
        const chg   = ((curr - prev2) / prev2) * 100;

        document.getElementById('nbi-value').textContent = `US$ ${fmtPrice(curr)}`;
        const chgEl = document.getElementById('nbi-change');
        chgEl.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% vs. dia anterior`;
        chgEl.style.color = chg >= 0 ? '#2AD07A' : '#ff4d4d';

        const barsEl = document.getElementById('nbi-bars');
        if (barsEl) {
            barsEl.innerHTML = Object.entries(NBI_WEIGHTS).map(([m, w]) => {
                const s = stats[m];
                if (!s) return '';
                return `
                <div class="nbi-bar-item">
                    <span class="nbi-bar-label">${METAL_LABELS[m]} (${(w*100).toFixed(0)}%)</span>
                    <div class="nbi-bar-track">
                        <div class="nbi-bar-fill" style="width:${w*100*3}%;max-width:100%;background:${METAL_COLORS[m]};"></div>
                    </div>
                    <span class="nbi-bar-val">US$ ${fmtPrice(s.current)}</span>
                </div>`;
            }).join('');
        }

        destroyChart('nbiChart');
        const ctx = document.getElementById('nbiChart');
        if (ctx && nbiVals.length > 1) {
            const labels = data.slice(-nbiVals.length).map(r => r.dia);
            chartInstances['nbiChart'] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Noble Basket Index (US$/t)',
                        data: nbiVals,
                        borderColor: '#2AD07A',
                        backgroundColor: 'rgba(42,208,122,0.08)',
                        tension: 0.4, fill: true, pointRadius: 2, pointHoverRadius: 5
                    }]
                },
                options: { ...baseChartOpts }
            });
        }
    }

    // ── ANÁLISE 03: Canal de Preços ──
    function renderChannelBars(stats) {
        const el = document.getElementById('canal-bars');
        if (!el) return;

        el.innerHTML = METALS.map(m => {
            const s = stats[m];
            if (!s) return '';
            const pct   = Math.max(0, Math.min(100, s.channelPos));
            const color = pct >= 85 ? '#ff4d4d' : pct >= 60 ? '#ff9900' : pct >= 30 ? '#ffcc00' : '#2AD07A';
            return `
            <div class="canal-item">
                <div class="canal-header">
                    <span class="canal-name" style="color:${METAL_COLORS[m]};">${METAL_LABELS[m]}</span>
                    <span class="canal-pct" style="color:${color};">${pct.toFixed(1)}% do canal</span>
                    <span class="signal-badge ${s.signalClass}">${s.signal}</span>
                </div>
                <div class="canal-track">
                    <div class="canal-fill" style="width:${pct}%;background:${color};"></div>
                </div>
                <div class="canal-labels">
                    <span>Mín: US$ ${fmtPrice(s.min)}</span>
                    <span><strong>Atual: US$ ${fmtPrice(s.current)}</strong></span>
                    <span>Máx: US$ ${fmtPrice(s.max)}</span>
                </div>
            </div>`;
        }).join('');
    }

    // ── ANÁLISE 05: Tendência de Preços ──
    function renderTrendChart(data, metal) {
        destroyChart('trendChart');
        const ctx = document.getElementById('trendChart');
        if (!ctx) return;

        const labels = data.map(r => r.dia);
        const values = data.map(r => r[metal]);
        const color  = METAL_COLORS[metal];

        chartInstances['trendChart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: `${METAL_LABELS[metal]} (US$/t)`,
                    data: values,
                    borderColor: color,
                    backgroundColor: color + '18',
                    tension: 0.35, fill: true, pointRadius: 3, pointHoverRadius: 7,
                    pointBackgroundColor: color
                }]
            },
            options: deepMerge(baseChartOpts, {
                plugins: { tooltip: { callbacks: { label: ctx => `US$ ${fmtPrice(ctx.raw)}/t` } } }
            })
        });
    }

    // ── ANÁLISE 06: Variação Diária ──
    function renderDailyVariation(stats) {
        destroyChart('varDiariaChart');
        const ctx = document.getElementById('varDiariaChart');
        if (ctx) {
            const changes = METALS.map(m => stats[m] ? parseFloat(stats[m].dayChange.toFixed(2)) : 0);
            const colors  = changes.map(c => c >= 0 ? 'rgba(42,208,122,0.75)' : 'rgba(255,77,77,0.75)');
            chartInstances['varDiariaChart'] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: METALS.map(m => METAL_LABELS[m]),
                    datasets: [{
                        label: 'Variação Diária (%)',
                        data: changes,
                        backgroundColor: colors,
                        borderRadius: 6
                    }]
                },
                options: deepMerge(baseChartOpts, {
                    plugins: { tooltip: { callbacks: { label: ctx => `${ctx.raw >= 0 ? '+' : ''}${ctx.raw}%` } } }
                })
            });
        }

        const listEl = document.getElementById('var-diaria-list');
        if (listEl) {
            const sorted = [...METALS].sort((a, b) => (stats[b]?.dayChange || 0) - (stats[a]?.dayChange || 0));
            listEl.innerHTML = sorted.map(m => {
                const s = stats[m];
                if (!s) return '';
                const up = s.dayChange >= 0;
                return `
                <div class="var-item">
                    <span style="color:${METAL_COLORS[m]};font-weight:700;font-size:0.88rem;">${METAL_LABELS[m]}</span>
                    <span style="color:${up ? '#2AD07A' : '#ff4d4d'};font-weight:700;font-size:0.9rem;">
                        <i class="fa-solid ${up ? 'fa-caret-up' : 'fa-caret-down'}"></i>
                        ${Math.abs(s.dayChange).toFixed(2)}%
                    </span>
                    <span style="color:#666;font-size:0.8rem;">US$ ${fmtPrice(s.current)}</span>
                </div>`;
            }).join('');
        }
    }

    // ── ANÁLISE 07: Volatilidade ──
    function renderVolatility(stats) {
        destroyChart('volatChart');
        const ctx = document.getElementById('volatChart');
        if (!ctx) return;

        const labels  = METALS.map(m => METAL_LABELS[m]);
        const ampAbs  = METALS.map(m => stats[m] ? parseFloat((stats[m].max - stats[m].min).toFixed(2)) : 0);
        const ampPct  = METALS.map(m => {
            const s = stats[m];
            return (s && s.min) ? parseFloat(((s.max - s.min) / s.min * 100).toFixed(2)) : 0;
        });

        chartInstances['volatChart'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Amplitude Absoluta (US$/t)', data: ampAbs, backgroundColor: 'rgba(42,208,122,0.65)', yAxisID: 'y', borderRadius: 5 },
                    { label: 'Amplitude % (Max-Min/Min)', data: ampPct, backgroundColor: 'rgba(255,153,0,0.65)', yAxisID: 'y1', borderRadius: 5 }
                ]
            },
            options: {
                ...baseChartOpts,
                scales: {
                    x: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y:  { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.04)' }, position: 'left',  title: { display: true, text: 'US$/t', color: '#aaa' } },
                    y1: { ticks: { color: '#ff9900' }, grid: { drawOnChartArea: false }, position: 'right', title: { display: true, text: '%', color: '#ff9900' } }
                }
            }
        });
    }

    // ── ANÁLISE 08: Ranking de Performance ──
    function renderRanking(stats) {
        const el = document.getElementById('ranking-container');
        if (!el) return;

        const ranked = METALS
            .filter(m => stats[m])
            .map(m => ({ m, chg: stats[m].monthChange, s: stats[m] }))
            .sort((a, b) => b.chg - a.chg);

        const medals = ['🥇', '🥈', '🥉'];
        el.innerHTML = ranked.map((item, i) => {
            const isPos = item.chg >= 0;
            const barW  = Math.min(100, Math.abs(item.chg) * 10);
            return `
            <div class="rank-item ${i === 0 ? 'rank-first' : ''}">
                <span class="rank-pos">${medals[i] || (i + 1) + 'º'}</span>
                <div class="rank-bar-wrap">
                    <div style="display:flex;justify-content:space-between;margin-bottom:7px;">
                        <strong style="color:${METAL_COLORS[item.m]};font-size:0.95rem;">${METAL_LABELS[item.m]}</strong>
                        <span style="color:${isPos ? '#2AD07A' : '#ff4d4d'};font-weight:700;">
                            ${isPos ? '+' : ''}${item.chg.toFixed(2)}%
                        </span>
                    </div>
                    <div style="background:rgba(255,255,255,0.05);border-radius:4px;height:7px;overflow:hidden;">
                        <div style="height:100%;width:${barW}%;background:${isPos ? '#2AD07A' : '#ff4d4d'};border-radius:4px;transition:width 1s;"></div>
                    </div>
                    <small style="color:#555;font-size:0.75rem;margin-top:4px;display:block;">Primeiro dia do mês → Hoje</small>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                    <div style="color:#aaa;font-size:0.8rem;">US$ ${fmtPrice(item.s.current)}</div>
                    <div style="color:#555;font-size:0.72rem;">Média: US$ ${fmtPrice(item.s.avg)}</div>
                </div>
            </div>`;
        }).join('');
    }

    // ── ANÁLISE 09: Score de Oportunidade ──
    function renderOpportunityScore(stats) {
        destroyChart('scoreChart');
        const ctx = document.getElementById('scoreChart');
        if (ctx) {
            const scores = METALS.map(m => stats[m] ? parseFloat(stats[m].score.toFixed(1)) : 0);
            const colors = scores.map(s => s >= 75 ? 'rgba(255,77,77,0.8)' : s >= 55 ? 'rgba(255,153,0,0.8)' : s >= 35 ? 'rgba(255,204,0,0.8)' : 'rgba(42,208,122,0.8)');
            chartInstances['scoreChart'] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: METALS.map(m => METAL_LABELS[m]),
                    datasets: [{ label: 'Score (0–100)', data: scores, backgroundColor: colors, borderRadius: 8 }]
                },
                options: deepMerge(baseChartOpts, { scales: { y: { min: 0, max: 100 } } })
            });
        }

        const listEl = document.getElementById('score-list');
        if (listEl) {
            const sorted = [...METALS].filter(m => stats[m]).sort((a, b) => stats[b].score - stats[a].score);
            listEl.innerHTML = sorted.map(m => {
                const s = stats[m];
                const sc = s.score;
                const color = sc >= 75 ? '#ff4d4d' : sc >= 55 ? '#ff9900' : sc >= 35 ? '#ffcc00' : '#2AD07A';
                const label = sc >= 75 ? '🔴 VENDER AGORA' : sc >= 55 ? '🟠 ATENÇÃO' : sc >= 35 ? '🟡 RETER' : '🟢 ACUMULAR';
                return `
                <div class="score-item">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <strong style="color:${METAL_COLORS[m]};font-size:0.9rem;">${METAL_LABELS[m]}</strong>
                        <span style="font-size:1.3rem;font-weight:900;color:${color};">${sc.toFixed(0)}</span>
                    </div>
                    <div style="background:rgba(255,255,255,0.04);border-radius:4px;height:5px;overflow:hidden;margin-bottom:7px;">
                        <div style="height:100%;width:${sc}%;background:${color};border-radius:4px;"></div>
                    </div>
                    <small style="color:#666;font-size:0.78rem;">${label}</small>
                </div>`;
            }).join('');
        }
    }

    // ── ANÁLISE 05: Semana Atual vs Anterior ──
    function renderWeekComparison(stats) {
        destroyChart('semanaChart');
        const ctx = document.getElementById('semanaChart');
        if (!ctx) return;

        const labels = METALS.map(m => METAL_LABELS[m]);
        const last5  = METALS.map(m => stats[m] ? parseFloat(stats[m].avg5.toFixed(2))     : 0);
        const prev5  = METALS.map(m => stats[m] ? parseFloat(stats[m].avgPrev5.toFixed(2)) : 0);

        // Color each "Semana Atual" bar: green if up, red if down vs prev week
        const currentColors = METALS.map((m, i) => {
            if (!stats[m]) return 'rgba(100,100,100,0.5)';
            return last5[i] >= prev5[i] ? 'rgba(42,208,122,0.85)' : 'rgba(255,77,77,0.85)';
        });
        const currentBorders = METALS.map((m, i) => {
            if (!stats[m]) return 'rgba(100,100,100,0.8)';
            return last5[i] >= prev5[i] ? 'rgba(42,208,122,1)' : 'rgba(255,77,77,1)';
        });


        const customDatalabelsSemana = {
            id: 'customDatalabelsSemana',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    if (meta.hidden) return;
                    meta.data.forEach((point, idx) => {
                        const val = dataset.data[idx];
                        if (!val) return;
                        
                        if (i === 0) { // Semana Atual
                            const prevVal = prev5[idx] || 0;
                            const diff = val - prevVal;
                            const pct = prevVal ? ((diff / prevVal) * 100).toFixed(1) : '0.0';
                            const arrow = diff >= 0 ? '\u25b2' : '\u25bc';
                            const sign = diff >= 0 ? '+' : '';
                            const color = val >= prevVal ? '#2AD07A' : '#ff4d4d';
                            
                            ctx.save();
                            ctx.font = 'bold 10px Lato, sans-serif';
                            ctx.fillStyle = color;
                            ctx.textAlign = 'center';
                            ctx.fillText(arrow + ' US$ ' + fmtPrice(val), point.x, point.y - 18);
                            ctx.fillText(sign + pct + '%', point.x, point.y - 6);
                            ctx.restore();
                        } else if (i === 1) { // Semana Anterior
                            ctx.save();
                            ctx.font = '9px Lato, sans-serif';
                            ctx.fillStyle = '#aaaaaa';
                            ctx.textAlign = 'center';
                            ctx.fillText('US$ ' + fmtPrice(val), point.x, point.y - 6);
                            ctx.restore();
                        }
                    });
                });
            }
        };

        chartInstances['semanaChart'] = new Chart(ctx, {
            type: 'bar',
            plugins: [customDatalabelsSemana],
            data: {
                labels,
                datasets: [
                    {
                        label: 'Semana Atual (Media 5d)',
                        data: last5,
                        backgroundColor: currentColors,
                        borderColor: currentBorders,
                        borderWidth: 2,
                        borderRadius: 6,
                        order: 1
                    },
                    {
                        label: 'Semana Anterior (Media 5d)',
                        data: prev5,
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        borderColor: 'rgba(255,255,255,0.35)',
                        borderWidth: 2,
                        borderRadius: 6,
                        order: 2
                    }
                ]
            },
            options: deepMerge(baseChartOpts, {
                layout: { padding: { top: 55 } },
                plugins: {
                    legend: {
                        labels: {
                            color: '#ccc',
                            font: { family: 'Lato', size: 12 },
                            padding: 18,
                            usePointStyle: true,
                            pointStyle: 'rectRounded'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const i = context.dataIndex;
                                const val = context.raw;
                                const diff = last5[i] - prev5[i];
                                const pct  = prev5[i] ? ((diff / prev5[i]) * 100).toFixed(2) : '0.00';
                                const arrow = diff >= 0 ? '\u25b2' : '\u25bc';
                                const sign  = diff >= 0 ? '+' : '';
                                if (context.datasetIndex === 0) {
                                    return [
                                        ' Atual: US$ ' + fmtPrice(val) + '/t',
                                        ' ' + arrow + ' ' + sign + pct + '% vs semana anterior'
                                    ];
                                }
                                return ' Anterior: US$ ' + fmtPrice(val) + '/t';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#aaa', font: { size: 12, weight: 'bold' } },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        ticks: {
                            color: '#888',
                            font: { size: 11 },
                            callback: v => 'US$ ' + fmtPrice(v)
                        },
                        grid: { color: 'rgba(255,255,255,0.06)' }
                    }
                }
            })
        });

        // ── Render directional badges below the chart ──
        const badges = document.getElementById('semana-badges');
        if (!badges) return;
        badges.innerHTML = METALS.map((m, i) => {
            if (!stats[m]) return '';
            const diff   = last5[i] - prev5[i];
            const pct    = prev5[i] ? ((diff / prev5[i]) * 100) : 0;
            const isUp   = diff >= 0;
            const arrow  = isUp ? '▲' : '▼';
            const color  = isUp ? '#2AD07A' : '#ff4d4d';
            const bgClr  = isUp ? 'rgba(42,208,122,0.12)' : 'rgba(255,77,77,0.12)';
            const border = isUp ? 'rgba(42,208,122,0.4)' : 'rgba(255,77,77,0.4)';
            const sign   = isUp ? '+' : '';
            return `
            <div style="
                background:${bgClr};
                border:1px solid ${border};
                border-radius:10px;
                padding:10px 16px;
                min-width:110px;
                text-align:center;
                flex:1 1 110px;
                max-width:160px;
            ">
                <div style="font-size:0.75rem;color:#aaa;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:4px;">${METAL_LABELS[m]}</div>
                <div style="font-size:1.6rem;color:${color};line-height:1;">${arrow}</div>
                <div style="font-size:1rem;color:${color};font-weight:700;margin-top:2px;">${sign}${pct.toFixed(2)}%</div>
                <div style="font-size:0.7rem;color:#666;margin-top:3px;">US$ ${fmtPrice(last5[i])}</div>
            </div>`;
        }).join('');
    }

    // ── ANÁLISE 11: Melhor Dia da Semana ──
    function renderBestDayOfWeek(data) {
        destroyChart('diaSemanaChart');
        const ctx = document.getElementById('diaSemanaChart');
        if (!ctx) return;

        const mesSel  = document.getElementById('mes-selector');
        const mesVal  = mesSel ? mesSel.value : `${new Date().getMonth() + 1}-${new Date().getFullYear()}`;
        const [mesN, anoN] = mesVal.split('-').map(Number);

        const dow = { 'Seg': { sum: 0, cnt: 0 }, 'Ter': { sum: 0, cnt: 0 }, 'Qua': { sum: 0, cnt: 0 }, 'Qui': { sum: 0, cnt: 0 }, 'Sex': { sum: 0, cnt: 0 } };
        const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

        data.forEach(row => {
            const d = parseInt(row.dia);
            if (isNaN(d) || !row.cobre) return;
            const dt   = new Date(anoN, mesN - 1, d);
            const name = dayNames[dt.getDay()];
            if (dow[name]) { dow[name].sum += row.cobre; dow[name].cnt++; }
        });

        const workDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
        const avgs     = workDays.map(d => dow[d].cnt > 0 ? parseFloat((dow[d].sum / dow[d].cnt).toFixed(2)) : null);
        const maxAvg   = Math.max(...avgs.filter(v => v !== null));
        const colors   = avgs.map(v => v === maxAvg ? 'rgba(42,208,122,0.9)' : 'rgba(42,208,122,0.25)');

        chartInstances['diaSemanaChart'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: workDays,
                datasets: [{ label: 'Média do Cobre (US$/t)', data: avgs, backgroundColor: colors, borderRadius: 8 }]
            },
            options: deepMerge(baseChartOpts, {
                plugins: { tooltip: { callbacks: { label: ctx => `US$ ${fmtPrice(ctx.raw)}/t` } } }
            })
        });
    }

    // ── ANÁLISE 12: Momentum ──
    function renderMomentum(stats) {
        const el = document.getElementById('momentum-grid');
        if (!el) return;

        el.innerHTML = METALS.map(m => {
            const s = stats[m];
            if (!s) return '';
            const mom   = s.momentum;
            const up    = mom >= 0;
            const color = up ? '#2AD07A' : '#ff4d4d';
            const icon  = up ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
            const label = Math.abs(mom) > 2 ? (up ? 'Alta Expressiva' : 'Queda Expressiva') : Math.abs(mom) > 0.5 ? (up ? 'Leve Alta' : 'Leve Queda') : 'Estável';
            return `
            <div class="momentum-card">
                <div style="color:${METAL_COLORS[m]};font-weight:700;font-size:0.9rem;margin-bottom:10px;">${METAL_LABELS[m]}</div>
                <div style="font-size:2rem;color:${color};margin-bottom:6px;"><i class="fa-solid ${icon}"></i></div>
                <div style="font-size:1.4rem;font-weight:900;color:${color};">${up ? '+' : ''}${mom.toFixed(2)}%</div>
                <small style="color:#666;margin-top:4px;display:block;">${label}</small>
                <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.05);font-size:0.72rem;color:#555;">
                    <div>Ult.5d: US$ ${fmtPrice(s.avg5)}</div>
                    <div>Ant.: US$ ${fmtPrice(s.avgPrev5)}</div>
                </div>
            </div>`;
        }).join('');
    }

    // ── ANÁLISE 13: Dólar ──
    function renderDolarChart(data) {
        destroyChart('dolarChart');
        const ctx = document.getElementById('dolarChart');
        if (!ctx) return;

        const dolarRows = data.filter(r => r.dolar !== null);
        if (!dolarRows.length) {
            ctx.closest('.chart-container').innerHTML = '<p style="color:#666;text-align:center;padding:40px 20px;">Dados do câmbio não disponíveis neste período.</p>';
            return;
        }

        chartInstances['dolarChart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dolarRows.map(r => r.dia),
                datasets: [{
                    label: 'Dólar (BRL/USD)',
                    data: dolarRows.map(r => r.dolar),
                    borderColor: '#f5c518',
                    backgroundColor: 'rgba(245,197,24,0.08)',
                    tension: 0.3, fill: true, pointRadius: 3, pointHoverRadius: 6
                }]
            },
            options: deepMerge(baseChartOpts, {
                plugins: { tooltip: { callbacks: { label: ctx => `R$ ${fmtPrice(ctx.raw)}` } } }
            })
        });
    }

    // ── ANÁLISE 14: SMA-5 ──
    function renderSMAChart(data, stats) {
        destroyChart('smaChart');
        const ctx = document.getElementById('smaChart');
        if (!ctx || !stats['cobre']) return;

        const s = stats['cobre'];
        chartInstances['smaChart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(r => r.dia),
                datasets: [
                    {
                        label: 'Cobre (US$/t)',
                        data: data.map(r => r.cobre),
                        borderColor: METAL_COLORS['cobre'],
                        backgroundColor: METAL_COLORS['cobre'] + '15',
                        tension: 0.3, fill: false, pointRadius: 2, pointHoverRadius: 5
                    },
                    {
                        label: 'SMA-5 dias',
                        data: s.sma5,
                        borderColor: 'rgba(255,255,255,0.6)',
                        borderDash: [6, 4],
                        backgroundColor: 'transparent',
                        tension: 0.3, fill: false, pointRadius: 0
                    }
                ]
            },
            options: { ...baseChartOpts }
        });
    }

    // ── ANÁLISE 15: Preço Atual vs. Média Mensal ──
    function renderVsMedia(stats) {
        destroyChart('vsMediaChart');
        const ctx = document.getElementById('vsMediaChart');
        if (!ctx) return;

        const currents = METALS.map(m => stats[m] ? parseFloat(stats[m].current.toFixed(2)) : 0);
        const avgs     = METALS.map(m => stats[m] ? parseFloat(stats[m].avg.toFixed(2)) : 0);
        // Color current bar by above/below average
        const curColors = METALS.map((m, i) => currents[i] >= avgs[i] ? 'rgba(42,208,122,0.75)' : 'rgba(255,153,0,0.75)');

        chartInstances['vsMediaChart'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: METALS.map(m => METAL_LABELS[m]),
                datasets: [
                    { label: 'Preço Atual', data: currents, backgroundColor: curColors, borderRadius: 5 },
                    { label: 'Média Mensal', data: avgs, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 5, borderColor: 'rgba(255,255,255,0.25)', borderWidth: 1 }
                ]
            },
            options: { ...baseChartOpts }
        });
    }

    // ── ANÁLISE 16: Índice de Risco (Polar Area) ──
    function renderRiskChart(stats) {
        destroyChart('riscoChart');
        const ctx = document.getElementById('riscoChart');
        if (!ctx) return;

        const risks = METALS.map(m => stats[m] ? parseFloat(stats[m].riskIndex.toFixed(2)) : 0);
        chartInstances['riscoChart'] = new Chart(ctx, {
            type: 'polarArea',
            data: {
                labels: METALS.map(m => METAL_LABELS[m]),
                datasets: [{
                    data: risks,
                    backgroundColor: METALS.map(m => METAL_COLORS[m] + 'aa'),
                    borderColor: METALS.map(m => METAL_COLORS[m]),
                    borderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { labels: { color: '#ccc', font: { family: 'Lato', size: 12 } } },
                    tooltip: { callbacks: { label: ctx => ` Risco: ${ctx.raw}% (CV)` } }
                },
                scales: {
                    r: {
                        ticks: { color: '#888', backdropColor: 'transparent' },
                        grid: { color: 'rgba(255,255,255,0.07)' }
                    }
                }
            }
        });
    }

    // ── ANÁLISE 17: Radar Comparativo ──
    function renderRadar(stats) {
        destroyChart('radarChart');
        const ctx = document.getElementById('radarChart');
        if (!ctx) return;

        const datasets = METALS.map(m => {
            const s = stats[m];
            if (!s) return null;
            return {
                label: METAL_LABELS[m],
                data: [
                    s.channelPos,                                                // Canal
                    Math.max(0, Math.min(100, (s.momentum + 5) / 10 * 100)),    // Momentum
                    Math.max(0, Math.min(100, (s.dayChange + 2) / 4 * 100)),     // Var.Dia
                    s.score,                                                     // Score
                    Math.min(100, s.riskIndex * 15)                             // Volatilidade
                ],
                borderColor: METAL_COLORS[m],
                backgroundColor: METAL_COLORS[m] + '28',
                pointBackgroundColor: METAL_COLORS[m],
                pointRadius: 4
            };
        }).filter(Boolean);

        chartInstances['radarChart'] = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Canal (%)', 'Momentum', 'Var. Dia', 'Score', 'Volatilidade'],
                datasets
            },
            options: {
                responsive: true,
                plugins: { legend: { labels: { color: '#ccc', font: { family: 'Lato', size: 11 } } } },
                scales: {
                    r: {
                        min: 0, max: 100,
                        ticks: { color: '#888', backdropColor: 'transparent', stepSize: 25, font: { size: 10 } },
                        grid: { color: 'rgba(255,255,255,0.08)' },
                        pointLabels: { color: '#ccc', font: { size: 12 } }
                    }
                }
            }
        });
    }

    // ── ANÁLISE 18: Z-Score ──
    function renderZscore(stats) {
        const el = document.getElementById('zscore-container');
        if (!el) return;

        const sorted = [...METALS].filter(m => stats[m]).sort((a, b) => stats[b].zscore - stats[a].zscore);

        el.innerHTML = sorted.map(m => {
            const s = stats[m];
            const z = s.zscore;
            const color = z > 1 ? '#ff4d4d' : z > 0 ? '#ffcc00' : z > -1 ? '#ff9900' : '#2AD07A';
            const pct   = Math.max(0, Math.min(100, 50 + z * 25)); // Center=50%, 1 std = 25%
            const label = z > 1.5 ? 'Muito acima da média — VENDER' : z > 0.5 ? 'Acima da média — Momento favorável' : z < -1.5 ? 'Muito abaixo da média — ACUMULAR' : z < -0.5 ? 'Abaixo da média — Aguardar' : 'Na média — Neutro';
            return `
            <div class="zscore-item">
                <div class="zscore-name" style="color:${METAL_COLORS[m]};">${METAL_LABELS[m]}</div>
                <div class="zscore-bar-wrap">
                    <div style="position:relative;width:100%;height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;">
                        <div style="position:absolute;left:50%;top:0;width:1px;height:100%;background:rgba(255,255,255,0.2);"></div>
                        ${z >= 0
                            ? `<div style="position:absolute;left:50%;top:0;height:100%;width:${Math.min(50, Math.abs(z)*25)}%;background:${color};border-radius:0 4px 4px 0;"></div>`
                            : `<div style="position:absolute;right:${100 - (50)}%;top:0;height:100%;width:${Math.min(50, Math.abs(z)*25)}%;background:${color};border-radius:4px 0 0 4px;right:50%;"></div>`
                        }
                    </div>
                    <small style="color:#555;font-size:0.72rem;margin-top:5px;display:block;">${label}</small>
                </div>
                <div class="zscore-val" style="color:${color};">${z >= 0 ? '+' : ''}${z.toFixed(2)}σ</div>
            </div>`;
        }).join('');
    }

    // ── ANÁLISE 19: Alertas de Preço ──
    function renderAlerts(stats) {
        const el = document.getElementById('alertas-grid');
        if (!el) return;

        const saved = JSON.parse(localStorage.getItem('apex_price_alerts') || '{}');

        el.innerHTML = METALS.map(m => {
            const s         = stats[m];
            if (!s) return '';
            const alertVal  = saved[m] ? parseFloat(saved[m]) : null;
            const triggered = alertVal !== null && s.current >= alertVal;
            return `
            <div class="alerta-card ${triggered ? 'alerta-triggered' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <strong style="color:${METAL_COLORS[m]};font-size:0.95rem;">${METAL_LABELS[m]}</strong>
                    ${triggered ? '<span class="badge-triggered">🔔 ALERTA!</span>' : ''}
                </div>
                <p style="font-size:0.82rem;color:#888;margin-bottom:10px;">Atual: <strong style="color:#ddd;">US$ ${fmtPrice(s.current)}</strong></p>
                ${alertVal ? `<p style="font-size:0.78rem;color:#666;margin-bottom:10px;">Alvo: US$ ${fmtPrice(alertVal)} | Gap: ${((s.current - alertVal) / alertVal * 100).toFixed(1)}%</p>` : ''}
                <div style="display:flex;gap:8px;align-items:center;">
                    <input type="number" class="alert-input" data-metal="${m}"
                        value="${alertVal || ''}" placeholder="Preço alvo (US$)" step="10"
                        style="flex:1;padding:8px 10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-family:inherit;">
                    <button class="btn-set-alert" data-metal="${m}"
                        style="padding:8px 12px;background:${METAL_COLORS[m]}33;color:${METAL_COLORS[m]};border:1px solid ${METAL_COLORS[m]}55;border-radius:6px;cursor:pointer;font-weight:700;font-size:0.82rem;white-space:nowrap;transition:all 0.2s;">
                        Definir
                    </button>
                </div>
            </div>`;
        }).join('');

        el.querySelectorAll('.btn-set-alert').forEach(btn => {
            btn.addEventListener('click', () => {
                const metal  = btn.dataset.metal;
                const input  = el.querySelector(`.alert-input[data-metal="${metal}"]`);
                const alerts = JSON.parse(localStorage.getItem('apex_price_alerts') || '{}');
                if (input.value) { alerts[metal] = input.value; } else { delete alerts[metal]; }
                localStorage.setItem('apex_price_alerts', JSON.stringify(alerts));
                renderAlerts(stats);
            });
        });
    }

    // ── ANÁLISE 20: Resumo Executivo ──
    function renderResumo(stats) {
        const el = document.getElementById('resumo-executivo');
        if (!el) return;

        const sorted = METALS.filter(m => stats[m]).map(m => ({ m, s: stats[m] })).sort((a, b) => b.s.score - a.s.score);

        const groups = {
            'VENDER':   { items: [], color: '#ff4d4d',  icon: 'fa-arrow-up-right-dots', label: 'VENDER AGORA' },
            'ATENÇÃO':  { items: [], color: '#ff9900',  icon: 'fa-eye',                 label: 'ATENÇÃO — Perto do Topo' },
            'RETER':    { items: [], color: '#ffcc00',  icon: 'fa-pause',               label: 'RETER — Aguardar Alta' },
            'ACUMULAR': { items: [], color: '#2AD07A',  icon: 'fa-cart-shopping',       label: 'ACUMULAR — Preço em Baixa' }
        };
        sorted.forEach(x => { if (groups[x.s.signal]) groups[x.s.signal].items.push(x); });

        el.innerHTML = Object.entries(groups).map(([key, g]) => {
            if (!g.items.length) return '';
            return `
            <div class="resumo-group" style="border-color:${g.color}30;">
                <div class="resumo-group-header" style="background:${g.color}15;color:${g.color};">
                    <i class="fa-solid ${g.icon}"></i>
                    <strong>${g.label}</strong>
                </div>
                <div class="resumo-group-body">
                    ${g.items.map(x => `
                    <div class="resumo-item">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <div style="width:8px;height:8px;border-radius:50%;background:${METAL_COLORS[x.m]};flex-shrink:0;"></div>
                            <span style="color:${METAL_COLORS[x.m]};font-weight:700;font-size:0.9rem;">${METAL_LABELS[x.m]}</span>
                        </div>
                        <div style="text-align:right;">
                            <div style="color:#ddd;font-size:0.85rem;">US$ ${fmtPrice(x.s.current)}</div>
                            <div style="color:#555;font-size:0.72rem;">Score: ${x.s.score.toFixed(0)} · Canal: ${x.s.channelPos.toFixed(0)}%</div>
                        </div>
                    </div>`).join('')}
                </div>
            </div>`;
        }).join('');
    }

    // =========================================================================
    // SETTINGS — Configurar Homepage
    // =========================================================================
    async function initSettings() {
        try {
            const res      = await fetch('/api/settings');
            const settings = await res.json();

            document.querySelectorAll('.toggle-switch input[data-key]').forEach(toggle => {
                const key     = toggle.dataset.key;
                toggle.checked = settings[key] !== 'false';
            });
        } catch(e) {
            console.warn('Não foi possível carregar settings:', e);
        }

        // Configuração Local - Painel Admin
        const toggleLME = document.getElementById('toggle-relatorio-lme');
        const navLME = document.querySelector('a.nav-item[data-target="lme-excel-report"]');
        
        if (toggleLME && navLME) {
            // Load state
            const showLME = localStorage.getItem('admin_show_relatorio_lme') !== 'false';
            toggleLME.checked = showLME;
            navLME.style.display = showLME ? 'flex' : 'none';

            // Change event for immediate feedback
            toggleLME.addEventListener('change', (e) => {
                const isVisible = e.target.checked;
                localStorage.setItem('admin_show_relatorio_lme', isVisible ? 'true' : 'false');
                navLME.style.display = isVisible ? 'flex' : 'none';
                
                // If we hide it while being active, go to dashboard
                if (!isVisible && navLME.classList.contains('active')) {
                    document.querySelector('a.nav-item[data-target="home-config"]')?.click();
                }
            });
        }

        const btnSave = document.getElementById('btn-save-settings');
        const msgEl   = document.getElementById('settings-msg');

        if (btnSave) {
            btnSave.addEventListener('click', async () => {
                const settings = {};
                document.querySelectorAll('.toggle-switch input[data-key]').forEach(t => {
                    settings[t.dataset.key] = t.checked ? 'true' : 'false';
                });

                try {
                    const res = await fetch('/api/settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(settings)
                    });

                    if (res.ok) {
                        msgEl.textContent = '✅ Configurações salvas!';
                        msgEl.style.color = '#2AD07A';
                        msgEl.style.display = 'block';
                        setTimeout(() => msgEl.style.display = 'none', 5000);
                    } else {
                        throw new Error('API error');
                    }
                } catch(e) {
                    msgEl.textContent = '❌ Erro ao salvar. Tente novamente.';
                    msgEl.style.color = '#ff4d4d';
                    msgEl.style.display = 'block';
                }
            });
        }
    }

    // =========================================================================
    // GALERIA
    // =========================================================================
    async function initGaleria() {
        const formGal   = document.getElementById('form-galeria');
        const urlInput  = document.getElementById('gal-url');
        const preview   = document.getElementById('gal-preview');
        const prevImg   = document.getElementById('gal-preview-img');

        if (urlInput) {
            urlInput.addEventListener('input', () => {
                const url = urlInput.value.trim();
                if (url && (url.startsWith('http') || url.startsWith('//'))) {
                    prevImg.src = url;
                    preview.style.display = 'block';
                } else {
                    preview.style.display = 'none';
                }
            });
        }

        await renderGaleriaAdmin();

        if (formGal) {
            formGal.addEventListener('submit', async (e) => {
                e.preventDefault();
                const url    = document.getElementById('gal-url').value.trim();
                const titulo = document.getElementById('gal-titulo').value.trim();
                const ordem  = parseInt(document.getElementById('gal-ordem').value) || 0;

                const res = await fetch('/api/galeria', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, titulo, ordem })
                });

                if (res.ok) {
                    formGal.reset();
                    if (preview) preview.style.display = 'none';
                    await renderGaleriaAdmin();
                } else {
                    alert('❌ Erro ao adicionar foto. Verifique os dados.');
                }
            });
        }
    }

    async function renderGaleriaAdmin() {
        const grid = document.getElementById('galeria-admin-grid');
        if (!grid) return;

        grid.innerHTML = '<p style="color:#888;grid-column:1/-1;padding:20px;text-align:center;">Carregando...</p>';

        try {
            const res   = await fetch('/api/galeria');
            const items = await res.json();

            if (!items.length) {
                grid.innerHTML = '<p style="color:#555;grid-column:1/-1;padding:30px;text-align:center;"><i class="fa-solid fa-image" style="font-size:2rem;display:block;margin-bottom:10px;"></i>Nenhuma foto cadastrada. Adicione a primeira!</p>';
                return;
            }

            grid.innerHTML = items.map(item => `
                <div class="gal-admin-item" title="${item.titulo}">
                    <img src="${item.url}" alt="${item.titulo}" loading="lazy"
                         onerror="this.src='https://placehold.co/300x200/0a1911/2AD07A?text=Erro'">
                    <div class="gal-admin-overlay">
                        <p>${item.titulo}</p>
                        <button class="btn-delete btn-del-gal" data-id="${item.id}" style="width:auto;padding:6px 12px;margin-top:4px;">
                            <i class="fa-solid fa-trash"></i> Remover
                        </button>
                    </div>
                </div>
            `).join('');

            grid.querySelectorAll('.btn-del-gal').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm('Remover esta foto da galeria?')) return;
                    await fetch(`/api/galeria/${btn.dataset.id}`, { method: 'DELETE' });
                    await renderGaleriaAdmin();
                });
            });
        } catch(e) {
            grid.innerHTML = '<p style="color:#f55;grid-column:1/-1;padding:20px;">Erro ao carregar galeria.</p>';
        }
    }

    // =========================================================================
    // MATERIAIS
    // =========================================================================
    function initMateriais() {
        const form             = document.getElementById('form-material');
        const listContainer    = document.getElementById('materiais-list');
        const btnAddLocation   = document.getElementById('btn-add-location');
        const locationsWrapper = document.getElementById('locations-wrapper');

        async function renderMateriais() {
            if (!listContainer) return;
            listContainer.innerHTML = '<p style="color:#888;">Carregando...</p>';
            try {
                const res  = await fetch('/api/materiais');
                const mats = await res.json();
                listContainer.innerHTML = '';

                if (!mats.length) {
                    listContainer.innerHTML = '<p style="color:#666;grid-column:1/-1;">Nenhum material cadastrado ainda.</p>';
                    return;
                }

                mats.forEach(mat => {
                    const div      = document.createElement('div');
                    div.className  = 'mat-item';
                    const locsText = mat.locais && mat.locais.length ? `<p style="font-size:0.75rem;color:#555;margin-top:8px;">${mat.locais.length} locais de coleta.</p>` : '';
                    const imgHtml  = mat.imagem ? `<img src="${mat.imagem}" alt="${mat.nome}" style="width:100%;height:120px;object-fit:cover;">` : '';
                    div.innerHTML  = `
                        ${imgHtml}
                        <div class="mat-content">
                            <h4>${mat.nome}</h4>
                            <p>${mat.descricao}</p>
                            ${locsText}
                            <button class="btn-delete" data-id="${mat.id}" style="margin-top:12px;"><i class="fa-solid fa-trash"></i> Remover</button>
                        </div>`;
                    listContainer.appendChild(div);
                });

                listContainer.querySelectorAll('.btn-delete').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        if (!confirm('Remover este material?')) return;
                        await fetch(`/api/materiais/${btn.dataset.id}`, { method: 'DELETE' });
                        renderMateriais();
                    });
                });
            } catch(err) {
                listContainer.innerHTML = '<p style="color:#f55;">Erro ao carregar materiais.</p>';
            }
        }

        function createLocationField() {
            const div       = document.createElement('div');
            div.className   = 'location-item';
            div.innerHTML   = `
                <button type="button" class="btn-remove-loc"><i class="fa-solid fa-xmark"></i></button>
                <div class="form-group"><label>Título do Local</label><input type="text" class="loc-title" required placeholder="Ex: Indústria"></div>
                <div class="form-group" style="margin-bottom:0;"><label>Descrição</label><textarea class="loc-desc" rows="2" required placeholder="Descrição detalhada..."></textarea></div>`;
            div.querySelector('.btn-remove-loc').addEventListener('click', () => div.remove());
            if (locationsWrapper) locationsWrapper.appendChild(div);
        }

        if (btnAddLocation) {
            btnAddLocation.addEventListener('click', createLocationField);
            createLocationField();
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const nome     = document.getElementById('mat-name').value;
                const imagem   = document.getElementById('mat-image').value.trim();
                const descricao = document.getElementById('mat-desc').value;
                const locais   = [];
                document.querySelectorAll('.location-item').forEach(item => {
                    locais.push({ titulo: item.querySelector('.loc-title').value, desc: item.querySelector('.loc-desc').value });
                });

                const res = await fetch('/api/materiais', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome, imagem, descricao, locais })
                });

                if (res.ok) {
                    form.reset();
                    if (locationsWrapper) locationsWrapper.innerHTML = '';
                    createLocationField();
                    renderMateriais();
                    alert('✅ Material cadastrado com sucesso!');
                } else {
                    alert('❌ Erro ao salvar material.');
                }
            });
        }

        renderMateriais();
    }

    // =========================================================================
    // SOLUÇÕES
    // =========================================================================
    function initSolucoes() {
        const formSolucao      = document.getElementById('form-solucao');
        const solucoesAdminList = document.getElementById('solucoes-admin-list');
        const btnCancelSolucao  = document.getElementById('btn-cancel-solucao');
        const solIdInput        = document.getElementById('sol-id');
        const solTituloInput    = document.getElementById('sol-titulo');
        const solImgInput       = document.getElementById('sol-img');
        const solDescInput      = document.getElementById('sol-desc');

        async function renderSolucoesAdmin() {
            if (!solucoesAdminList) return;
            solucoesAdminList.innerHTML = '<p style="color:#888;">Carregando...</p>';
            try {
                const res   = await fetch('/api/solucoes');
                const items = await res.json();
                solucoesAdminList.innerHTML = '';

                if (!items.length) {
                    solucoesAdminList.innerHTML = '<p style="color:#666;padding:10px 0;">Nenhuma solução cadastrada.</p>';
                    return;
                }

                items.forEach(s => {
                    const div       = document.createElement('div');
                    div.className   = 'noticia-admin-item';
                    div.style.alignItems = 'center';
                    div.innerHTML   = `
                        <div style="margin-right:14px;flex-shrink:0;">
                            <img src="${s.img}" alt="${s.nome}" style="width:38px;height:38px;object-fit:contain;filter:drop-shadow(0 0 4px rgba(42,208,122,0.4));">
                        </div>
                        <div class="noticia-admin-info" style="flex:1;">
                            <strong>${s.nome}</strong>
                            <small style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;display:block;">${s.descricao}</small>
                        </div>
                        <div style="display:flex;gap:6px;flex-shrink:0;">
                            <button class="btn-primary btn-edit-solucao" data-id="${s.id}" style="padding:6px 10px;width:auto;"><i class="fa-solid fa-edit"></i></button>
                            <button class="btn-delete btn-delete-solucao" data-id="${s.id}" style="padding:6px 10px;margin-top:0;"><i class="fa-solid fa-trash"></i></button>
                        </div>`;
                    solucoesAdminList.appendChild(div);
                });

                solucoesAdminList.querySelectorAll('.btn-edit-solucao').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const res = await fetch('/api/solucoes');
                        const all = await res.json();
                        const sol = all.find(x => x.id == btn.dataset.id);
                        if (sol) {
                            solIdInput.value     = sol.id;
                            solTituloInput.value = sol.nome;
                            solImgInput.value    = sol.img;
                            solDescInput.value   = sol.descricao;
                            if (btnCancelSolucao) btnCancelSolucao.style.display = 'inline-flex';
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                    });
                });

                solucoesAdminList.querySelectorAll('.btn-delete-solucao').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        if (!confirm('Remover esta solução?')) return;
                        await fetch(`/api/solucoes/${btn.dataset.id}`, { method: 'DELETE' });
                        renderSolucoesAdmin();
                    });
                });
            } catch(err) {
                solucoesAdminList.innerHTML = '<p style="color:#f55;">Erro ao carregar soluções.</p>';
            }
        }

        if (formSolucao) {
            formSolucao.addEventListener('submit', async (e) => {
                e.preventDefault();
                const id       = solIdInput.value;
                const nome     = solTituloInput.value.trim();
                const img      = solImgInput.value.trim();
                const descricao = solDescInput.value.trim();
                const method   = id ? 'PUT' : 'POST';
                const url      = id ? `/api/solucoes/${id}` : '/api/solucoes';

                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome, img, descricao })
                });

                if (res.ok) {
                    formSolucao.reset();
                    solIdInput.value = '';
                    if (btnCancelSolucao) btnCancelSolucao.style.display = 'none';
                    renderSolucoesAdmin();
                    alert('✅ Solução salva com sucesso!');
                } else {
                    alert('❌ Erro ao salvar a solução.');
                }
            });
        }

        if (btnCancelSolucao) {
            btnCancelSolucao.addEventListener('click', () => {
                formSolucao.reset();
                solIdInput.value = '';
                btnCancelSolucao.style.display = 'none';
            });
        }

        renderSolucoesAdmin();
    }

    // =========================================================================
    // NOTÍCIAS
    // =========================================================================
    function initNoticias() {
        const formNoticia       = document.getElementById('form-noticia');
        const noticiasAdminList = document.getElementById('noticias-admin-list');

        async function renderNoticiasAdmin() {
            if (!noticiasAdminList) return;
            noticiasAdminList.innerHTML = '<p style="color:#888;">Carregando...</p>';
            try {
                const res   = await fetch('/api/noticias');
                const items = await res.json();
                noticiasAdminList.innerHTML = '';

                if (!items.length) {
                    noticiasAdminList.innerHTML = '<p style="color:#666;padding:10px 0;">Nenhuma notícia publicada ainda.</p>';
                    return;
                }

                items.forEach(n => {
                    const div   = document.createElement('div');
                    div.className = 'noticia-admin-item';
                    const dataF = n.data_pub ? new Date(n.data_pub + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
                    div.innerHTML = `
                        <div class="noticia-admin-info">
                            ${n.categoria ? `<span class="noticia-admin-cat">${n.categoria}</span>` : ''}
                            <strong>${n.titulo}</strong>
                            <small>${dataF}</small>
                            ${n.url ? `<a href="${n.url}" target="_blank" class="noticia-admin-link"><i class="fa-solid fa-external-link-alt"></i> Ver fonte</a>` : ''}
                        </div>
                        <button class="btn-delete btn-delete-noticia" data-id="${n.id}"><i class="fa-solid fa-trash"></i></button>`;
                    noticiasAdminList.appendChild(div);
                });

                noticiasAdminList.querySelectorAll('.btn-delete-noticia').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        if (!confirm('Remover esta notícia?')) return;
                        await fetch(`/api/noticias/${btn.dataset.id}`, { method: 'DELETE' });
                        renderNoticiasAdmin();
                    });
                });
            } catch(err) {
                noticiasAdminList.innerHTML = '<p style="color:#f55;">Erro ao carregar notícias.</p>';
            }
        }

        if (formNoticia) {
            const inputData = document.getElementById('not-data');
            if (inputData && !inputData.value) inputData.value = new Date().toISOString().split('T')[0];

            formNoticia.addEventListener('submit', async (e) => {
                e.preventDefault();
                const titulo    = document.getElementById('not-titulo').value.trim();
                const url       = document.getElementById('not-url').value.trim();
                const resumo    = document.getElementById('not-resumo').value.trim();
                const data      = document.getElementById('not-data').value;
                const categoria = document.getElementById('not-categoria').value;

                const res = await fetch('/api/noticias', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ titulo, url, resumo, data, categoria })
                });

                if (res.ok) {
                    formNoticia.reset();
                    const dEl = document.getElementById('not-data');
                    if (dEl) dEl.value = new Date().toISOString().split('T')[0];
                    renderNoticiasAdmin();
                    alert('✅ Notícia publicada! Atualize a página inicial para ver.');
                } else {
                    alert('❌ Erro ao publicar notícia.');
                }
            });
        }

        renderNoticiasAdmin();
    }

    // =========================================================================
    // CONFIGURAÇÃO DE E-MAIL LME
    // =========================================================================
    async function initLMEEmailConfig() {
        const schedAtivo    = document.getElementById('sched-ativo');
        const schedHorario  = document.getElementById('sched-horario');
        const formScheduler = document.getElementById('form-scheduler-config');

        const resendApiKey  = document.getElementById('resend-api-key');
        const resendFrom    = document.getElementById('resend-from');
        const formResend    = document.getElementById('form-resend-config');
        const btnToggleKey  = document.getElementById('btn-toggle-resend-key');
        
        if (btnToggleKey && resendApiKey) {
            btnToggleKey.addEventListener('click', () => {
                if (resendApiKey.type === 'password') {
                    resendApiKey.type = 'text';
                    btnToggleKey.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
                } else {
                    resendApiKey.type = 'password';
                    btnToggleKey.innerHTML = '<i class="fa-solid fa-eye"></i>';
                }
            });
        }
 
        const btnEnviarTest = document.getElementById('btn-enviar-teste-lme');
        const testEmailMsg  = document.getElementById('test-email-msg');
 
        const formDest      = document.getElementById('form-destinatario');
        const destId        = document.getElementById('dest-id');
        const destNome      = document.getElementById('dest-nome');
        const destEmail     = document.getElementById('dest-email');
        const destFormTitle = document.getElementById('destinatario-form-title');
        const btnCancelDest = document.getElementById('btn-cancel-destinatario');
        const listDest      = document.getElementById('lme-destinatarios-list');
 
        if (!schedAtivo) return;
 
        // 1. Carrega configurações do servidor
        async function loadConfig() {
            try {
                const res = await fetch('/api/settings');
                const settings = await res.json();
 
                schedAtivo.checked  = settings.lme_envio_ativo === 'true';
                schedHorario.value  = settings.lme_envio_horario || '14:00';
 
                const diasStr = settings.lme_envio_dias !== undefined ? settings.lme_envio_dias : '1,2,3,4,5';
                const diasArr = diasStr.split(',');
                document.querySelectorAll('.sched-dia').forEach(chk => {
                    chk.checked = diasArr.includes(chk.value);
                });

                resendApiKey.value  = settings.lme_resend_api_key || '';
                resendFrom.value    = settings.lme_resend_from || '';
            } catch (err) {
                console.error('Erro ao carregar configurações de e-mail:', err);
            }
        }
 
        // 2. Salva agendamento
        if (formScheduler) {
            formScheduler.addEventListener('submit', async (e) => {
                e.preventDefault();
                const selectedDias = Array.from(document.querySelectorAll('.sched-dia:checked')).map(chk => chk.value).join(',');
                const data = {
                    lme_envio_ativo: schedAtivo.checked ? 'true' : 'false',
                    lme_envio_horario: schedHorario.value,
                    lme_envio_dias: selectedDias
                };
 
                try {
                    const res = await fetch('/api/settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    if (res.ok) {
                        alert('✅ Configuração de agendamento salva com sucesso!');
                    } else {
                        alert('❌ Erro ao salvar agendamento.');
                    }
                } catch (err) {
                    console.error(err);
                    alert('❌ Erro de rede ao salvar agendamento.');
                }
            });
        }

        // 3. Salva Resend
        if (formResend) {
            formResend.addEventListener('submit', async (e) => {
                e.preventDefault();
                const data = {
                    lme_resend_api_key: resendApiKey.value.trim(),
                    lme_resend_from:    resendFrom.value.trim()
                };

                try {
                    const res = await fetch('/api/settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    if (res.ok) {
                        alert('✅ Configurações do Resend salvas com sucesso!');
                    } else {
                        alert('❌ Erro ao salvar configurações do Resend.');
                    }
                } catch (err) {
                    console.error(err);
                    alert('❌ Erro de rede ao salvar configurações do Resend.');
                }
            });
        }

        // 4. Envio de Teste Manual
        if (btnEnviarTest) {
            btnEnviarTest.addEventListener('click', async () => {
                testEmailMsg.style.display = 'block';
                testEmailMsg.style.color = '#fff';
                testEmailMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando e-mail...';
                btnEnviarTest.disabled = true;

                try {
                    const res = await fetch('/api/lme/enviar-email-manual', { method: 'POST' });
                    const result = await res.json();
                    if (res.ok) {
                        testEmailMsg.style.color = '#2AD07A';
                        testEmailMsg.innerHTML = '<i class="fa-solid fa-circle-check"></i> ' + (result.message || 'Relatório enviado com sucesso!');
                    } else {
                        testEmailMsg.style.color = '#ff4d4d';
                        testEmailMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> ' + (result.error || 'Erro desconhecido.');
                    }
                } catch (err) {
                    testEmailMsg.style.color = '#ff4d4d';
                    testEmailMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Erro ao conectar ao servidor.';
                } finally {
                    btnEnviarTest.disabled = false;
                }
            });
        }

        // 5. CRUD Destinatários
        async function loadDestinatarios() {
            if (!listDest) return;
            listDest.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:15px; color:#888;">Carregando destinatários...</td></tr>';

            try {
                const res = await fetch('/api/lme/destinatarios');
                const items = await res.json();
                listDest.innerHTML = '';

                if (!items.length) {
                    listDest.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:15px; color:#aaa;">Nenhum destinatário cadastrado.</td></tr>';
                    return;
                }

                items.forEach(d => {
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid #444';
                    tr.innerHTML = `
                        <td style="padding: 10px;">${d.nome}</td>
                        <td style="padding: 10px; color:#bbb;">${d.email}</td>
                        <td style="padding: 10px; text-align: center;">
                            <button class="btn-edit-dest" data-id="${d.id}" data-nome="${d.nome}" data-email="${d.email}" style="background: none; border: none; color: #3498db; cursor: pointer; margin-right: 10px; font-size:1.1rem;" title="Editar"><i class="fa-solid fa-edit"></i></button>
                            <button class="btn-delete-dest" data-id="${d.id}" style="background: none; border: none; color: #e74c3c; cursor: pointer; font-size:1.1rem;" title="Remover"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    `;
                    listDest.appendChild(tr);
                });

                // Eventos de deletar
                listDest.querySelectorAll('.btn-delete-dest').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const id = btn.dataset.id;
                        if (!confirm('Deseja realmente remover este destinatário?')) return;
                        try {
                            const res = await fetch(`/api/lme/destinatarios/${id}`, { method: 'DELETE' });
                            if (res.ok) {
                                loadDestinatarios();
                            } else {
                                alert('Erro ao deletar destinatário.');
                            }
                        } catch (err) {
                            console.error(err);
                        }
                    });
                });

                // Eventos de editar
                listDest.querySelectorAll('.btn-edit-dest').forEach(btn => {
                    btn.addEventListener('click', () => {
                        destId.value = btn.dataset.id;
                        destNome.value = btn.dataset.nome;
                        destEmail.value = btn.dataset.email;
                        destFormTitle.innerHTML = '<i class="fa-solid fa-user-pen"></i> Editar Destinatário';
                        btnCancelDest.style.display = 'inline-block';
                        destNome.focus();
                    });
                });

            } catch (err) {
                listDest.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:15px; color:#ff4d4d;">Erro ao carregar lista.</td></tr>';
            }
        }

        // Submit destinatário
        if (formDest) {
            formDest.addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = destId.value;
                const nome = destNome.value.trim();
                const email = destEmail.value.trim();

                const url = id ? `/api/lme/destinatarios/${id}` : '/api/lme/destinatarios';
                const method = id ? 'PUT' : 'POST';

                try {
                    const res = await fetch(url, {
                        method,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ nome, email })
                    });
                    const result = await res.json();
                    if (res.ok) {
                        resetDestForm();
                        loadDestinatarios();
                    } else {
                        alert(result.error || 'Erro ao salvar destinatário.');
                    }
                } catch (err) {
                    console.error(err);
                    alert('Erro de rede ao salvar destinatário.');
                }
            });
        }

        if (btnCancelDest) {
            btnCancelDest.addEventListener('click', resetDestForm);
        }

        function resetDestForm() {
            formDest.reset();
            destId.value = '';
            destFormTitle.innerHTML = '<i class="fa-solid fa-user-plus"></i> Novo Destinatário';
            btnCancelDest.style.display = 'none';
        }

        // Executa inicialização da aba
        await loadConfig();
        await loadDestinatarios();
    }

    // =========================================================================
    // RELATÓRIO DIÁRIO LME (WHATSAPP/EMAIL)
    // =========================================================================
    async function initRelatorioDiario() {
        const btnGerar = document.getElementById('btn-gerar-imagem-wpp');
        const btnCopiar = document.getElementById('btn-copiar-texto');
        if (!btnGerar) return;

        let weeksData = [];

        try {
            const resMeses = await fetch('/api/lme/meses');
            const mesesDisponiveis = await resMeses.json();
            if (mesesDisponiveis.length === 0) return;
            const mesToFetch = mesesDisponiveis[0].valor;

            const res = await fetch(`/api/lme/relatorio-semanal?mes=` + mesToFetch);
            if (!res.ok) return;
            const data = await res.json();
            const weeks = data.semanas || [];
            if (weeks.length === 0) return;

            weeksData = weeks;
            const week = weeks[0];
            renderRelatorioDiario(week);
        } catch(e) {
            console.error('Erro ao carregar dados do relatorio diario', e);
        }

        btnGerar.addEventListener('click', async () => {
            const captureArea = document.getElementById('capture-area');
            // Mostrar rodapé com timestamp
            const now = new Date();
            const ts = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                + ' às '
                + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const rodape = document.getElementById('rel-rodape');
            if (rodape) {
                rodape.textContent = `Relatório gerado em: ${ts} — Apex Tech Metais`;
                rodape.style.display = 'block';
            }

            // Backup styling to prevent mobile layout distortion
            const originalWidth = captureArea.style.width;
            const originalMaxWidth = captureArea.style.maxWidth;
            captureArea.style.width = '800px';
            captureArea.style.maxWidth = 'none';

            // Delay to allow DOM layout to update
            await new Promise(r => setTimeout(r, 100));

            try {
                const canvas = await html2canvas(captureArea, { 
                    scale: 2, 
                    useCORS: true, 
                    allowTaint: false, 
                    scrollY: 0, 
                    windowHeight: captureArea.scrollHeight,
                    width: 800
                });
                const imgData = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = 'Relatorio_LME_ApexTech.png';
                link.href = imgData;
                link.click();
            } finally {
                // Restore styling
                captureArea.style.width = originalWidth;
                captureArea.style.maxWidth = originalMaxWidth;
                // Ocultar rodapé após download
                if (rodape) rodape.style.display = 'none';
            }
        });

        btnCopiar.addEventListener('click', () => {
            if (!weeksData || weeksData.length === 0) return;
            const week = weeksData[0];
            const comp = week.computed || {};
            const d = week.days || [];
            const lastDate = d[d.length - 1]?.data || '';
            let txt = `*COTAÇÃO LME - APEXTECH METAIS*\n`;
            txt += `Semana de ${d[0]?.data} a ${lastDate}\n\n`;
            txt += `*Variação Diária (Grupo 6):*\n`;
            
            const metals = ['cobre', 'zinco', 'aluminio', 'chumbo', 'estanho', 'niquel'];
            metals.forEach(m => {
                const osc = comp['OSCILAÇÃO R$']?.[m] ?? 0;
                const setinha = osc >= 0 ? '⬆' : '⬇';
                const money = 'R$ ' + Math.abs(osc).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                txt += `- ${m.toUpperCase()}: ${setinha} ${money}\n`;
            });

            const dolarOsc = comp['OSCILAÇÃO R$']?.['dolar'] ?? 0;
            const dSetinha = dolarOsc >= 0 ? '⬆' : '⬇';
            const dMoney = '$ ' + Math.abs(dolarOsc).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
            txt += `- DÓLAR: ${dSetinha} ${dMoney}\n`;

            navigator.clipboard.writeText(txt).then(() => {
                alert('Resumo copiado para a área de transferência!');
            }).catch(err => {
                alert('Erro ao copiar texto.');
                console.error(err);
            });
        });

        const btnPdf = document.getElementById('btn-relatorio-pdf');
        const btnExcel = document.getElementById('btn-relatorio-excel');
        
        if (btnPdf) {
            btnPdf.addEventListener('click', async () => {
                const captureArea = document.getElementById('capture-area');

                // Mostrar rodapé com timestamp
                const nowTs = new Date();
                const tsStr = nowTs.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    + ' às '
                    + nowTs.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const rodape = document.getElementById('rel-rodape');
                if (rodape) {
                    rodape.textContent = `Relatório gerado em: ${tsStr}`;
                    rodape.style.display = 'block';
                }

                // Correção do Bug do SVG Preto:
                // O html2canvas não renderiza SVGs complexos corretamente e eles viram blocos pretos.
                // Solução: Converter a logo para Base64 PNG nativamente via Canvas antes de gerar o PDF.
                const logoImg = captureArea.querySelector('.rel-logo img');
                let originalSrc = '';
                if (logoImg && logoImg.src.endsWith('.svg')) {
                    try {
                        originalSrc = logoImg.src;
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = logoImg.naturalWidth || 400;
                        tempCanvas.height = logoImg.naturalHeight || 133;
                        const tCtx = tempCanvas.getContext('2d');
                        tCtx.fillStyle = '#ffffff'; // Fundo branco p/ segurança
                        tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                        tCtx.drawImage(logoImg, 0, 0, tempCanvas.width, tempCanvas.height);
                        logoImg.src = tempCanvas.toDataURL('image/png');
                    } catch (svgErr) {
                        console.warn('Erro ao converter logo SVG para PNG (CORS/Taint fallback):', svgErr);
                        if (originalSrc) {
                            logoImg.src = originalSrc;
                            originalSrc = '';
                        }
                    }
                }

                // Backup styling to prevent mobile layout distortion
                const originalWidth = captureArea.style.width;
                const originalMaxWidth = captureArea.style.maxWidth;
                captureArea.style.width = '800px';
                captureArea.style.maxWidth = 'none';

                // Delay to allow DOM layout to update
                await new Promise(r => setTimeout(r, 100));

                try {
                    // Captura a altura TOTAL do conteúdo
                    const canvas = await html2canvas(captureArea, {
                        scale: 2,
                        backgroundColor: '#ffffff',
                        useCORS: true,
                        allowTaint: false,
                        scrollY: 0,
                        windowHeight: captureArea.scrollHeight,
                        height: captureArea.scrollHeight,
                        width: 800
                    });
                    const imgData = canvas.toDataURL('image/jpeg', 0.95);
                    const { jsPDF } = window.jspdf;

                    // Calcular dimensões: usar largura A4, mas altura proporcional ao conteúdo total para não quebrar a página
                    const pdfWidthMm = 210; // A4 largura em mm
                    const pdfHeightMm = (canvas.height * pdfWidthMm) / canvas.width;

                    // Criar PDF vertical de página única sem cortes
                    const pdf = new jsPDF({
                        orientation: 'portrait',
                        unit: 'mm',
                        format: [pdfWidthMm, pdfHeightMm]
                    });
                    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidthMm, pdfHeightMm);

                    // Nome de arquivo dinâmico (ex: relatorio-lme-DD-MM-AAAA.pdf)
                    let dateStr = '';
                    if (weeksData && weeksData.length > 0) {
                        const week = weeksData[0];
                        const d = week.days || [];
                        if (d.length > 0 && d[0].data) {
                            const parts = d[0].data.split('/');
                            if (parts.length >= 2) {
                                const day = parts[0].padStart(2, '0');
                                const month = parts[1].padStart(2, '0');
                                let year = parts[2] || '';
                                if (!year) {
                                    const filterMes = document.getElementById('lme-filter-mes');
                                    year = new Date().getFullYear();
                                    if (filterMes && filterMes.value && filterMes.value.includes('-')) {
                                        year = filterMes.value.split('-')[1];
                                    }
                                }
                                dateStr = `${day}-${month}-${year}`;
                            }
                        }
                    }
                    if (!dateStr) {
                        const now = new Date();
                        const day = String(now.getDate()).padStart(2, '0');
                        const month = String(now.getMonth() + 1).padStart(2, '0');
                        const year = now.getFullYear();
                        dateStr = `${day}-${month}-${year}`;
                    }
                    const filename = `Relatorio_LME.pdf`;
                    pdf.save(filename);
                } finally {
                    // Restaura o SVG original após gerar o PDF
                    if (originalSrc) {
                        logoImg.src = originalSrc;
                    }
                    // Restore styling
                    captureArea.style.width = originalWidth;
                    captureArea.style.maxWidth = originalMaxWidth;
                    // Ocultar rodapé após exportação
                    if (rodape) rodape.style.display = 'none';
                }
            });
        }

        if (btnExcel) {
            btnExcel.addEventListener('click', async () => {
                if (!weeksData || weeksData.length === 0) return;
                const block = weeksData[0];
                btnExcel.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...';
                try {
                    const res = await fetch('/api/lme/gerar-excel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            semana: block,
                            mesLabel: 'Relatório Diário LME'
                        })
                    });

                    if (res.ok) {
                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'Relatorio_LME_ApexTech.xlsx';
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(url);
                    } else {
                        alert('Erro ao gerar Excel.');
                    }
                } catch (err) {
                    console.error(err);
                    alert('Erro na conexão com o servidor.');
                } finally {
                    btnExcel.innerHTML = '<i class="fa-solid fa-file-excel"></i> Excel';
                }
            });
        }
    }

    function renderRelatorioDiario(week) {
        const d = week.days || [];
        const comp = week.computed || {};
        
        const firstDate = d[0]?.data || '';
        const lastDate = d[d.length - 1]?.data || '';
        
        // Helper to get ISO week
        function getISOWeek(date) {
            const dObj = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            const dayNum = dObj.getUTCDay() || 7;
            dObj.setUTCDate(dObj.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(dObj.getUTCFullYear(), 0, 1));
            return Math.ceil((((dObj - yearStart) / 86400000) + 1) / 7);
        }

        const today = new Date();
        const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
        const dataTexto = `${today.getDate()} de ${monthNames[today.getMonth()]}`;
        const weekNum = getISOWeek(today);
        
        document.getElementById('rel-date-range').textContent = dataTexto;
        document.getElementById('rel-week-number').textContent = weekNum;

        const tbody = document.getElementById('rel-tbody');
        tbody.innerHTML = '';
        
        const metals = ['cobre', 'zinco', 'aluminio', 'chumbo', 'estanho', 'niquel', 'dolar'];
        
        const formatUsd = (val) => {
            if (val === null || val === undefined || val === 'feriado' || isNaN(val)) return '-';
            return '$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
        };
        const formatBrl = (val, dec = 3) => {
            if (val === null || val === undefined || val === 'feriado' || isNaN(val)) return '-';
            return 'R$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        };
        const formatPct = (val) => {
            if (val === null || val === undefined || isNaN(val)) return '-';
            return (val * 100).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + '%';
        };

        // Função reutilizável para formatar indicadores de variação
        function formatVariacaoCell(element, value, type, decimals = 3) {
            if (!element) return;
            if (value === null || value === undefined || isNaN(value)) {
                element.textContent = '-';
                element.style.setProperty('color', '#000000', 'important');
                return;
            }
            
            const numVal = Number(value);
            let formattedText = '';
            
            if (type === 'percent') {
                formattedText = (numVal * 100).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + '%';
            } else if (type === 'currency') {
                formattedText = 'R$ ' + Math.abs(numVal).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
            } else {
                formattedText = numVal.toLocaleString('pt-BR');
            }

            let arrow = '';
            if (numVal > 0) {
                arrow = `<span style="color: #2E7D32 !important; margin-right: 4px; font-weight: bold;">▲</span>`;
            } else if (numVal < 0) {
                arrow = `<span style="color: #D32F2F !important; margin-right: 4px; font-weight: bold;">▼</span>`;
            }
            
            element.innerHTML = `${arrow}${formattedText}`;
            element.style.setProperty('color', '#000000', 'important'); // Texto sempre em preto
        }

        // Fix 1: Indicar feriado na label da média semanal se semana teve < 5 dias úteis
        const mediaLabelEl = document.querySelector('.rel-summary-body .rel-label-col');
        if (mediaLabelEl) {
            if (week.numDias !== undefined && week.numDias < 5) {
                mediaLabelEl.innerHTML = `MÉDIA SEMANAL <span style="font-size:0.65em;font-weight:normal;opacity:0.7;font-style:italic">(${week.numDias} dias úteis)</span>`;
            } else {
                mediaLabelEl.textContent = 'MÉDIA SEMANAL';
            }
        }

        d.forEach(day => {
            if (!day.data) return;
            const tr = document.createElement('tr');
            let colsHtml = `<td class="font-bold rel-label-col">${day.data}</td>`;
            metals.forEach(m => {
                const val = day[m];
                const colClass = `rel-col-${m}`;
                if (m === 'dolar') {
                    colsHtml += `<td class="${colClass}">${formatBrl(val, 4)}</td>`;
                } else {
                    colsHtml += `<td class="${colClass}">${formatUsd(val)}</td>`;
                }
            });
            tr.innerHTML = colsHtml;
            tbody.appendChild(tr);
        });

        metals.forEach(m => {
            const isDolar = (m === 'dolar');
            const elMedia = document.getElementById('rel-media-' + m);
            if (elMedia) {
                if (isDolar) {
                    elMedia.textContent = formatBrl(comp['MEDIA SEMANAL']?.[m], 4);
                } else {
                    elMedia.textContent = formatUsd(comp['MEDIA SEMANAL']?.[m]);
                }
            }
            if (m !== 'dolar') {
                const elLme = document.getElementById('rel-lme-' + m);
                if (elLme) elLme.textContent = formatBrl(comp['100% LME']?.[m], 3);
            }
            const elAnt = document.getElementById('rel-ant-' + m);
            if (elAnt) {
                if (isDolar) {
                    elAnt.textContent = formatBrl(comp['SEMANA ANTERIOR']?.[m], 4);
                } else {
                    elAnt.textContent = formatBrl(comp['SEMANA ANTERIOR']?.[m], 3);
                }
            }
            const elFech = document.getElementById('rel-fech-' + m);
            formatVariacaoCell(elFech, comp['FECHAMENTO % ( SEMANA ANTERIOR )']?.[m], 'percent');
            const elOscPct = document.getElementById('rel-osc-pct-' + m);
            formatVariacaoCell(elOscPct, comp['OSCILAÇÃO %']?.[m], 'percent');

            const oscRs = comp['OSCILAÇÃO R$']?.[m] ?? 0;
            const elOscRs = document.getElementById('rel-osc-rs-' + m);
            formatVariacaoCell(elOscRs, oscRs, 'currency', isDolar ? 4 : 3);

            const elMensal = document.getElementById('rel-mensal-' + m);
            if (elMensal) {
                if (isDolar) {
                    elMensal.textContent = formatBrl(comp['MEDIA MENSAL']?.[m], 4);
                } else {
                    elMensal.textContent = formatBrl(comp['MEDIA MENSAL']?.[m], 3);
                }
            }

            const elCompAnt = document.getElementById('rel-comp-ant-' + m);
            if (elCompAnt) {
                if (isDolar) {
                    elCompAnt.textContent = formatBrl(comp['SEMANA ANTERIOR']?.[m], 4);
                } else {
                    elCompAnt.textContent = formatBrl(comp['SEMANA ANTERIOR']?.[m], 3);
                }
            }
            
            // CORREÇÃO CRÍTICA: LME ATUAL é o valor de '100% LME' (R$/kg) da semana em curso, não a média semanal bruta em US$/t!
            const elCompAtu = document.getElementById('rel-comp-atu-' + m);
            if (elCompAtu) {
                if (isDolar) {
                    elCompAtu.textContent = formatBrl(comp['MEDIA SEMANAL']?.[m], 4);
                } else {
                    elCompAtu.textContent = formatBrl(comp['100% LME']?.[m], 3);
                }
            }
            const elCompOsc = document.getElementById('rel-comp-osc-' + m);
            formatVariacaoCell(elCompOsc, oscRs, 'currency', isDolar ? 4 : 3);
        });

        // Aplica overrides de cores nas linhas específicas por label
        const summaryRows = document.querySelectorAll('.rel-summary-body tr');
        summaryRows.forEach(row => {
            const firstCell = row.cells[0];
            if (!firstCell) return;
            const text = firstCell.textContent.trim().toUpperCase();

            // Limpa classes anteriores para evitar duplicar/acumular em re-renders
            row.classList.remove('row-lme100', 'row-fechamento-anterior', 'row-oscilacao-rs', 'row-semana-anterior');

            if (text.includes("100% LME")) {
                row.classList.add('row-lme100');
            } else if (text.includes("FECHAMENTO %") && text.includes("SEMANA ANTERIOR")) {
                row.classList.add('row-fechamento-anterior');
            } else if (text.includes("OSCILAÇÃO R$")) {
                row.classList.add('row-oscilacao-rs');
            } else if (text === "SEMANA ANTERIOR") {
                row.classList.add('row-semana-anterior');
            }
        });

        renderRelatorioCharts(week);
        renderRelatorioBase(week);
    }

    function renderRelatorioCharts(week) {
        const comp = week.computed || {};

        // ── helpers ──────────────────────────────────────────────────────────
        const fmtR = v =>
            'R$ ' + Number(Math.abs(v)).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

        // Plugin inline de rótulos acima das barras
        const datalabelPlugin = {
            id: 'apexBarLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    if (meta.hidden) return;
                    meta.data.forEach((bar, idx) => {
                        const val = dataset.data[idx];
                        if (val === 0 || val == null) return;
                        
                        ctx.save();
                        ctx.font = 'bold 9px Arial';
                        ctx.fillStyle = '#111';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        
                        // Rotaciona para desenhar verticalmente
                        ctx.translate(bar.x, bar.y - 6);
                        ctx.rotate(-Math.PI / 2);
                        
                        const prefix = dataset.label === 'Semana Anterior' ? 'Ant: ' : 'Atu: ';
                        const label = prefix + 'R$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                        
                        ctx.fillText(label, 0, 0);
                        ctx.restore();
                    });
                });
            }
        };

        // ── Configuração comum dos dois gráficos ─────────────────────────────
        function buildBarChart(canvasId, labels, dataAnt, dataAtu) {
            const ctx = document.getElementById(canvasId);
            if (!ctx) return;
            // Destruir instância anterior se existir
            const key = '__apexChart_' + canvasId;
            if (window[key]) { window[key].destroy(); }

            const bgAnt = [];
            const borderAnt = [];
            const bgAtu = [];
            const borderAtu = [];

            for (let i = 0; i < labels.length; i++) {
                const valAtu = dataAtu[i] || 0;
                const valAnt = dataAnt[i] || 0;
                if (valAtu > valAnt) {
                    // Atual foi melhor (Verde), Anterior foi pior (Vermelho)
                    bgAtu.push('#27ae60');
                    borderAtu.push('#1e8449');
                    bgAnt.push('#e74c3c');
                    borderAnt.push('#c0392b');
                } else {
                    // Atual foi pior (Vermelho), Anterior foi melhor (Verde)
                    bgAtu.push('#e74c3c');
                    borderAtu.push('#c0392b');
                    bgAnt.push('#27ae60');
                    borderAnt.push('#1e8449');
                }
            }

            window[key] = new Chart(ctx, {
                type: 'bar',
                plugins: [datalabelPlugin],
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Semana Anterior',
                            data: dataAnt,
                            backgroundColor: bgAnt,
                            borderColor: borderAnt,
                            borderWidth: 1,
                            borderRadius: 3,
                            barPercentage: 0.75,
                            categoryPercentage: 0.8
                        },
                        {
                            label: 'Semana Atual',
                            data: dataAtu,
                            backgroundColor: bgAtu,
                            borderColor: borderAtu,
                            borderWidth: 1,
                            borderRadius: 3,
                            barPercentage: 0.75,
                            categoryPercentage: 0.8
                        }
                    ]
                },
                options: {
                    animation: false,
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 90, right: 8, left: 8 } },
                    plugins: {
                        legend: { display: false },          // legenda feita no HTML
                        tooltip: {
                            callbacks: {
                                label: ctx => fmtR(ctx.parsed.y)
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { color: '#222', font: { size: 10, weight: 'bold' } },
                            grid: { display: false }
                        },
                        y: {
                            ticks: {
                                color: '#444',
                                font: { size: 9 },
                                callback: v => 'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
                            },
                            grid: { color: '#e8e8e8' }
                        }
                    }
                }
            });
        }

        // ── Grupo 1: Cobre · Zinco · Alumínio · Chumbo ───────────────────────
        const group1 = [
            { key: 'cobre',    label: 'COBRE' },
            { key: 'zinco',    label: 'ZINCO' },
            { key: 'aluminio', label: 'ALUMÍNIO' },
            { key: 'chumbo',   label: 'CHUMBO' }
        ];
        buildBarChart(
            'relChartLines',
            group1.map(m => m.label),
            group1.map(m => comp['SEMANA ANTERIOR']?.[m.key] || 0),
            group1.map(m => comp['100% LME']?.[m.key]        || 0)
        );

        // ── Grupo 2: Estanho · Níquel ─────────────────────────────────────────
        const group2 = [
            { key: 'estanho', label: 'ESTANHO' },
            { key: 'niquel',  label: 'NÍQUEL' }
        ];
        buildBarChart(
            'relChartOsc',
            group2.map(m => m.label),
            group2.map(m => comp['SEMANA ANTERIOR']?.[m.key] || 0),
            group2.map(m => comp['100% LME']?.[m.key]        || 0)
        );

        // ── Cards de comparação ───────────────────────────────────────────────
        function buildCards(containerId, group) {
            const el = document.getElementById(containerId);
            if (!el) return;
            el.innerHTML = group.map(m => {
                const atual    = comp['100% LME']?.[m.key]        || 0;
                const anterior = comp['SEMANA ANTERIOR']?.[m.key] || 0;
                const diff     = atual - anterior;
                const isUp     = diff > 0;
                const isDown   = diff < 0;
                const arrow    = isUp ? '↑' : isDown ? '↓' : '–';
                const color    = isUp ? '#1a7f4b' : isDown ? '#c0392b' : '#555';
                const bg       = isUp ? '#e9f7f0' : isDown ? '#fdecea' : '#f5f5f5';
                const border   = isUp ? '#a8dfc4' : isDown ? '#f5b8b2' : '#ddd';
                return `
                <div class="rel-card-metal" style="border-color:${border}; background:${bg};">
                    <div class="rel-card-metal-name">${m.label}</div>
                    <div class="rel-card-metal-val" style="color:${color};">
                        ${arrow} ${fmtR(atual)}
                    </div>
                    <div class="rel-card-metal-prev">era ${fmtR(anterior)}</div>
                    <div class="rel-card-metal-diff" style="color:${color};">
                        ${isUp ? '+' : isDown ? '-' : ''}${fmtR(diff)}
                    </div>
                </div>`;
            }).join('');
        }

        buildCards('rel-cards-group1', group1);
        buildCards('rel-cards-group2', group2);
    }

    function renderRelatorioBase(week) {
        const comp = week.computed || {};
        const tbody = document.getElementById('rel-base-tbody');
        tbody.innerHTML = '';
        const metals = ['cobre', 'zinco', 'aluminio', 'chumbo', 'estanho', 'niquel'];

        for (let p = 90; p <= 110; p++) {
            const tr = document.createElement('tr');
            if (p < 100) tr.className = 'row-below';
            else if (p === 100) tr.className = 'row-100pct';
            else tr.className = 'row-above';

            const pLabel = p === 100 ? '<strong>100%</strong>' : p + '%';
            let colsHtml = `<td>${pLabel}</td>`;

            metals.forEach(m => {
                // Base SEMPRE = SEMANA ANTERIOR congelada; null na 1ª semana do mês — exibe '-'
                const lme = comp['SEMANA ANTERIOR']?.[m] ?? null;
                const colClass = `rel-col-${m}`;
                if (lme === null) {
                    colsHtml += `<td class="${colClass}">-</td>`;
                } else {
                    const baseVal = lme * (p / 100);
                    const fmt = 'R$ ' + baseVal.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                    colsHtml += `<td class="${colClass}">${fmt}</td>`;
                }
            });

            tr.innerHTML = colsHtml;
            tbody.appendChild(tr);
    }

    // =========================================================================
    // HISTÓRICO DO RELATÓRIO DIÁRIO LME (WHATSAPP/EMAIL)
    // =========================================================================
    async function initRelatorioDiarioHistorico() {
        const btnVerHistorico = document.getElementById('btn-ver-historico');
        const btnVoltar = document.getElementById('btn-historico-voltar');
        if (!btnVerHistorico) return;

        const sectionDiario = document.getElementById('relatorio-diario');
        const sectionHistorico = document.getElementById('relatorio-diario-historico');
        const selectMes = document.getElementById('rel-hist-filter-mes');
        const selectSemana = document.getElementById('rel-hist-week-selector');

        const btnGerar = document.getElementById('btn-hist-gerar-imagem-wpp');
        const btnCopiar = document.getElementById('btn-hist-copiar-texto');
        const btnPdf = document.getElementById('btn-hist-relatorio-pdf');
        const btnExcel = document.getElementById('btn-hist-relatorio-excel');

        let weeksData = [];
        let currentSelectedWeek = null;

        // Alternar seção para histórico
        btnVerHistorico.addEventListener('click', async () => {
            sectionDiario.classList.remove('active');
            sectionHistorico.classList.add('active');
            window.dispatchEvent(new Event('resize'));
            await loadHistoricoMeses();
        });

        // Alternar de volta
        btnVoltar.addEventListener('click', () => {
            sectionHistorico.classList.remove('active');
            sectionDiario.classList.add('active');
            window.dispatchEvent(new Event('resize'));
        });

        async function loadHistoricoMeses() {
            try {
                const resMeses = await fetch('/api/lme/meses');
                const mesesDisponiveis = await resMeses.json();
                if (mesesDisponiveis.length === 0) return;

                selectMes.innerHTML = mesesDisponiveis.map(m => 
                    `<option value="${m.valor}">${m.texto}</option>`
                ).join('');

                // Seleciona o mês atual por padrão
                const mesToFetch = mesesDisponiveis[0].valor;
                selectMes.value = mesToFetch;

                await loadHistoricoSemanas(mesToFetch);
            } catch (e) {
                console.error('Erro ao carregar meses do histórico', e);
            }
        }

        async function loadHistoricoSemanas(mes) {
            try {
                const res = await fetch(`/api/lme/relatorio-semanal?mes=` + mes);
                if (!res.ok) return;
                const data = await res.json();
                weeksData = data.semanas || [];
                if (weeksData.length === 0) {
                    selectSemana.innerHTML = '<option value="">Nenhuma semana disponível</option>';
                    return;
                }

                selectSemana.innerHTML = weeksData.map((wk, idx) => 
                    `<option value="${idx}">Semana de ${wk.label}</option>`
                ).join('');

                // Seleciona a primeira semana
                selectSemana.value = 0;
                currentSelectedWeek = weeksData[0];
                renderRelatorioDiarioHistorico(currentSelectedWeek);
            } catch (e) {
                console.error('Erro ao carregar semanas do histórico', e);
            }
        }

        selectMes.addEventListener('change', async (e) => {
            await loadHistoricoSemanas(e.target.value);
        });

        selectSemana.addEventListener('change', (e) => {
            const idx = parseInt(e.target.value, 10);
            if (!isNaN(idx) && weeksData[idx]) {
                currentSelectedWeek = weeksData[idx];
                renderRelatorioDiarioHistorico(currentSelectedWeek);
            }
        });

        // Ações de exportação do histórico (usando o capture-area-historico e currentSelectedWeek)
        if (btnGerar) {
            btnGerar.addEventListener('click', async () => {
                if (!currentSelectedWeek) return;
                const captureArea = document.getElementById('capture-area-historico');
                const now = new Date();
                const ts = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    + ' às '
                    + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const rodape = document.getElementById('rel-hist-rodape');
                if (rodape) {
                    rodape.textContent = `Relatório gerado em: ${ts} — Apex Tech Metais`;
                    rodape.style.display = 'block';
                }

                const originalWidth = captureArea.style.width;
                const originalMaxWidth = captureArea.style.maxWidth;
                captureArea.style.width = '800px';
                captureArea.style.maxWidth = 'none';

                await new Promise(r => setTimeout(r, 100));

                try {
                    const canvas = await html2canvas(captureArea, { 
                        scale: 2, 
                        useCORS: true, 
                        allowTaint: false, 
                        scrollY: 0, 
                        windowHeight: captureArea.scrollHeight,
                        width: 800
                    });
                    const imgData = canvas.toDataURL('image/png');
                    const link = document.createElement('a');
                    link.download = `Relatorio_LME_Historico_${currentSelectedWeek.label.replace(/[\/\s]/g, '_')}.png`;
                    link.href = imgData;
                    link.click();
                } finally {
                    captureArea.style.width = originalWidth;
                    captureArea.style.maxWidth = originalMaxWidth;
                    if (rodape) rodape.style.display = 'none';
                }
            });
        }

        if (btnCopiar) {
            btnCopiar.addEventListener('click', () => {
                if (!currentSelectedWeek) return;
                const comp = currentSelectedWeek.computed || {};
                const d = currentSelectedWeek.days || [];
                const lastDate = d[d.length - 1]?.data || '';
                let txt = `*COTAÇÃO LME HISTÓRICO - APEXTECH METAIS*\n`;
                txt += `Semana de ${d[0]?.data} a ${lastDate}\n\n`;
                txt += `*Variação Diária (Grupo 6):*\n`;
                
                const metals = ['cobre', 'zinco', 'aluminio', 'chumbo', 'estanho', 'niquel'];
                metals.forEach(m => {
                    const osc = comp['OSCILAÇÃO R$']?.[m] ?? 0;
                    const setinha = osc >= 0 ? '⬆' : '⬇';
                    const money = 'R$ ' + Math.abs(osc).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    txt += `- ${m.toUpperCase()}: ${setinha} ${money}\n`;
                });

                const dolarOsc = comp['OSCILAÇÃO R$']?.['dolar'] ?? 0;
                const dSetinha = dolarOsc >= 0 ? '⬆' : '⬇';
                const dMoney = '$ ' + Math.abs(dolarOsc).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
                txt += `- DÓLAR: ${dSetinha} ${dMoney}\n`;

                navigator.clipboard.writeText(txt).then(() => {
                    alert('Resumo histórico copiado!');
                }).catch(err => {
                    alert('Erro ao copiar texto.');
                    console.error(err);
                });
            });
        }

        if (btnPdf) {
            btnPdf.addEventListener('click', async () => {
                if (!currentSelectedWeek) return;
                const captureArea = document.getElementById('capture-area-historico');
                const nowTs = new Date();
                const tsStr = nowTs.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    + ' às '
                    + nowTs.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const rodape = document.getElementById('rel-hist-rodape');
                if (rodape) {
                    rodape.textContent = `Relatório gerado em: ${tsStr}`;
                    rodape.style.display = 'block';
                }

                const logoImg = captureArea.querySelector('.rel-logo img');
                let originalSrc = '';
                if (logoImg && logoImg.src.endsWith('.svg')) {
                    try {
                        originalSrc = logoImg.src;
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = logoImg.naturalWidth || 400;
                        tempCanvas.height = logoImg.naturalHeight || 133;
                        const tCtx = tempCanvas.getContext('2d');
                        tCtx.fillStyle = '#ffffff';
                        tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                        tCtx.drawImage(logoImg, 0, 0, tempCanvas.width, tempCanvas.height);
                        logoImg.src = tempCanvas.toDataURL('image/png');
                    } catch (svgErr) {
                        console.warn('Erro ao converter logo SVG', svgErr);
                        if (originalSrc) {
                            logoImg.src = originalSrc;
                            originalSrc = '';
                        }
                    }
                }

                const originalWidth = captureArea.style.width;
                const originalMaxWidth = captureArea.style.maxWidth;
                captureArea.style.width = '800px';
                captureArea.style.maxWidth = 'none';

                await new Promise(r => setTimeout(r, 100));

                try {
                    const canvas = await html2canvas(captureArea, {
                        scale: 2,
                        backgroundColor: '#ffffff',
                        useCORS: true,
                        allowTaint: false,
                        scrollY: 0,
                        windowHeight: captureArea.scrollHeight,
                        height: captureArea.scrollHeight,
                        width: 800
                    });
                    const imgData = canvas.toDataURL('image/jpeg', 0.95);
                    const { jsPDF } = window.jspdf;

                    const pdfWidthMm = 210;
                    const pdfHeightMm = (canvas.height * pdfWidthMm) / canvas.width;

                    const pdf = new jsPDF({
                        orientation: 'portrait',
                        unit: 'mm',
                        format: [pdfWidthMm, pdfHeightMm]
                    });
                    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidthMm, pdfHeightMm);
                    pdf.save(`Relatorio_LME_Historico_${currentSelectedWeek.label.replace(/[\/\s]/g, '_')}.pdf`);
                } finally {
                    if (originalSrc) {
                        logoImg.src = originalSrc;
                    }
                    captureArea.style.width = originalWidth;
                    captureArea.style.maxWidth = originalMaxWidth;
                    if (rodape) rodape.style.display = 'none';
                }
            });
        }

        if (btnExcel) {
            btnExcel.addEventListener('click', async () => {
                if (!currentSelectedWeek) return;
                btnExcel.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...';
                try {
                    const res = await fetch('/api/lme/gerar-excel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            semana: currentSelectedWeek,
                            mesLabel: 'Relatório Histórico LME'
                        })
                    });

                    if (res.ok) {
                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `Relatorio_LME_Historico_${currentSelectedWeek.label.replace(/[\/\s]/g, '_')}.xlsx`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(url);
                    } else {
                        alert('Erro ao gerar Excel do histórico.');
                    }
                } catch (err) {
                    console.error(err);
                    alert('Erro na conexão com o servidor.');
                } finally {
                    btnExcel.innerHTML = '<i class="fa-solid fa-file-excel"></i> Excel';
                }
            });
        }
    }

    function renderRelatorioDiarioHistorico(week) {
        const d = week.days || [];
        const comp = week.computed || {};
        
        const firstDate = d[0]?.data || '';
        const lastDate = d[d.length - 1]?.data || '';
        
        function getISOWeek(date) {
            const dObj = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            const dayNum = dObj.getUTCDay() || 7;
            dObj.setUTCDate(dObj.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(dObj.getUTCFullYear(), 0, 1));
            return Math.ceil((((dObj - yearStart) / 86400000) + 1) / 7);
        }

        // Tentar obter a data da semana a partir do primeiro dia útil dela
        let referenceDate = new Date();
        if (d.length > 0 && d[0].data && d[0].data !== '—') {
            const parts = d[0].data.split('/');
            if (parts.length >= 2) {
                const selectMes = document.getElementById('rel-hist-filter-mes');
                let yr = new Date().getFullYear();
                if (selectMes && selectMes.value && selectMes.value.includes('-')) {
                    yr = parseInt(selectMes.value.split('-')[1], 10);
                }
                referenceDate = new Date(yr, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
            }
        }
        
        const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
        const dataTexto = `${week.label}`;
        const weekNum = getISOWeek(referenceDate);
        
        document.getElementById('rel-hist-date-range').textContent = dataTexto;
        document.getElementById('rel-hist-week-number').textContent = weekNum;

        const tbody = document.getElementById('rel-hist-tbody');
        tbody.innerHTML = '';
        
        const metals = ['cobre', 'zinco', 'aluminio', 'chumbo', 'estanho', 'niquel', 'dolar'];
        
        const formatUsd = (val) => {
            if (val === null || val === undefined || val === 'feriado' || isNaN(val)) return '-';
            return '$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
        };
        const formatBrl = (val, dec = 3) => {
            if (val === null || val === undefined || val === 'feriado' || isNaN(val)) return '-';
            return 'R$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
        };
        const formatPct = (val) => {
            if (val === null || val === undefined || isNaN(val)) return '-';
            return (val * 100).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + '%';
        };

        function formatVariacaoCell(element, value, type, decimals = 3) {
            if (!element) return;
            if (value === null || value === undefined || isNaN(value)) {
                element.textContent = '-';
                element.style.setProperty('color', '#000000', 'important');
                return;
            }
            
            const numVal = Number(value);
            let formattedText = '';
            
            if (type === 'percent') {
                formattedText = (numVal * 100).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + '%';
            } else if (type === 'currency') {
                formattedText = 'R$ ' + Math.abs(numVal).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
            } else {
                formattedText = numVal.toLocaleString('pt-BR');
            }

            let arrow = '';
            if (numVal > 0) {
                arrow = `<span style="color: #2E7D32 !important; margin-right: 4px; font-weight: bold;">▲</span>`;
            } else if (numVal < 0) {
                arrow = `<span style="color: #D32F2F !important; margin-right: 4px; font-weight: bold;">▼</span>`;
            }
            
            element.innerHTML = `${arrow}${formattedText}`;
            element.style.setProperty('color', '#000000', 'important');
        }

        const mediaLabelEl = document.querySelector('#relatorio-diario-historico .rel-summary-body .rel-label-col');
        if (mediaLabelEl) {
            if (week.numDias !== undefined && week.numDias < 5) {
                mediaLabelEl.innerHTML = `MÉDIA SEMANAL <span style="font-size:0.65em;font-weight:normal;opacity:0.7;font-style:italic">(${week.numDias} dias úteis)</span>`;
            } else {
                mediaLabelEl.textContent = 'MÉDIA SEMANAL';
            }
        }

        d.forEach(day => {
            if (!day.data) return;
            const tr = document.createElement('tr');
            let colsHtml = `<td class="font-bold rel-label-col">${day.data}</td>`;
            metals.forEach(m => {
                const val = day[m];
                const colClass = `rel-col-${m}`;
                if (m === 'dolar') {
                    colsHtml += `<td class="${colClass}">${formatBrl(val, 4)}</td>`;
                } else {
                    colsHtml += `<td class="${colClass}">${formatUsd(val)}</td>`;
                }
            });
            tr.innerHTML = colsHtml;
            tbody.appendChild(tr);
        });

        metals.forEach(m => {
            const isDolar = (m === 'dolar');
            const elMedia = document.getElementById('rel-hist-media-' + m);
            if (elMedia) {
                if (isDolar) {
                    elMedia.textContent = formatBrl(comp['MEDIA SEMANAL']?.[m], 4);
                } else {
                    elMedia.textContent = formatUsd(comp['MEDIA SEMANAL']?.[m]);
                }
            }
            if (m !== 'dolar') {
                const elLme = document.getElementById('rel-hist-lme-' + m);
                if (elLme) elLme.textContent = formatBrl(comp['100% LME']?.[m], 3);
            }
            const elAnt = document.getElementById('rel-hist-ant-' + m);
            if (elAnt) {
                if (isDolar) {
                    elAnt.textContent = formatBrl(comp['SEMANA ANTERIOR']?.[m], 4);
                } else {
                    elAnt.textContent = formatBrl(comp['SEMANA ANTERIOR']?.[m], 3);
                }
            }
            const elFech = document.getElementById('rel-hist-fech-' + m);
            formatVariacaoCell(elFech, comp['FECHAMENTO % ( SEMANA ANTERIOR )']?.[m], 'percent');
            const elOscPct = document.getElementById('rel-hist-osc-pct-' + m);
            formatVariacaoCell(elOscPct, comp['OSCILAÇÃO %']?.[m], 'percent');

            const oscRs = comp['OSCILAÇÃO R$']?.[m] ?? 0;
            const elOscRs = document.getElementById('rel-hist-osc-rs-' + m);
            formatVariacaoCell(elOscRs, oscRs, 'currency', isDolar ? 4 : 3);

            const elMensal = document.getElementById('rel-hist-mensal-' + m);
            if (elMensal) {
                if (isDolar) {
                    elMensal.textContent = formatBrl(comp['MEDIA MENSAL']?.[m], 4);
                } else {
                    elMensal.textContent = formatBrl(comp['MEDIA MENSAL']?.[m], 3);
                }
            }

            const elCompAnt = document.getElementById('rel-hist-comp-ant-' + m);
            if (elCompAnt) {
                if (isDolar) {
                    elCompAnt.textContent = formatBrl(comp['SEMANA ANTERIOR']?.[m], 4);
                } else {
                    elCompAnt.textContent = formatBrl(comp['SEMANA ANTERIOR']?.[m], 3);
                }
            }
            
            const elCompAtu = document.getElementById('rel-hist-comp-atu-' + m);
            if (elCompAtu) {
                if (isDolar) {
                    elCompAtu.textContent = formatBrl(comp['MEDIA SEMANAL']?.[m], 4);
                } else {
                    elCompAtu.textContent = formatBrl(comp['100% LME']?.[m], 3);
                }
            }
            const elCompOsc = document.getElementById('rel-hist-comp-osc-' + m);
            formatVariacaoCell(elCompOsc, oscRs, 'currency', isDolar ? 4 : 3);
        });

        const summaryRows = document.querySelectorAll('#relatorio-diario-historico .rel-summary-body tr');
        summaryRows.forEach(row => {
            const firstCell = row.cells[0];
            if (!firstCell) return;
            const text = firstCell.textContent.trim().toUpperCase();

            row.classList.remove('row-lme100', 'row-fechamento-anterior', 'row-oscilacao-rs', 'row-semana-anterior');

            if (text.includes("100% LME")) {
                row.classList.add('row-lme100');
            } else if (text.includes("FECHAMENTO %") && text.includes("SEMANA ANTERIOR")) {
                row.classList.add('row-fechamento-anterior');
            } else if (text.includes("OSCILAÇÃO R$")) {
                row.classList.add('row-oscilacao-rs');
            } else if (text === "SEMANA ANTERIOR") {
                row.classList.add('row-semana-anterior');
            }
        });

        renderRelatorioDiarioHistoricoCharts(week);
        renderRelatorioDiarioHistoricoBase(week);
    }

    function renderRelatorioDiarioHistoricoCharts(week) {
        const comp = week.computed || {};

        const fmtR = v =>
            'R$ ' + Number(Math.abs(v)).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

        const datalabelPlugin = {
            id: 'apexBarLabelsHist',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    if (meta.hidden) return;
                    meta.data.forEach((bar, idx) => {
                        const val = dataset.data[idx];
                        if (val === 0 || val == null) return;
                        
                        ctx.save();
                        ctx.font = 'bold 9px Arial';
                        ctx.fillStyle = '#111';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        
                        ctx.translate(bar.x, bar.y - 6);
                        ctx.rotate(-Math.PI / 2);
                        
                        const prefix = dataset.label === 'Semana Anterior' ? 'Ant: ' : 'Atu: ';
                        const label = prefix + 'R$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                        
                        ctx.fillText(label, 0, 0);
                        ctx.restore();
                    });
                });
            }
        };

        function buildBarChart(canvasId, labels, dataAnt, dataAtu) {
            const ctx = document.getElementById(canvasId);
            if (!ctx) return;
            const key = '__apexChart_' + canvasId;
            if (window[key]) { window[key].destroy(); }

            const bgAnt = [];
            const borderAnt = [];
            const bgAtu = [];
            const borderAtu = [];

            for (let i = 0; i < labels.length; i++) {
                const valAtu = dataAtu[i] || 0;
                const valAnt = dataAnt[i] || 0;
                if (valAtu > valAnt) {
                    bgAtu.push('#27ae60');
                    borderAtu.push('#1e8449');
                    bgAnt.push('#e74c3c');
                    borderAnt.push('#c0392b');
                } else {
                    bgAtu.push('#e74c3c');
                    borderAtu.push('#c0392b');
                    bgAnt.push('#27ae60');
                    borderAnt.push('#1e8449');
                }
            }

            window[key] = new Chart(ctx, {
                type: 'bar',
                plugins: [datalabelPlugin],
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Semana Anterior',
                            data: dataAnt,
                            backgroundColor: bgAnt,
                            borderColor: borderAnt,
                            borderWidth: 1,
                            borderRadius: 3,
                            barPercentage: 0.75,
                            categoryPercentage: 0.8
                        },
                        {
                            label: 'Semana Atual',
                            data: dataAtu,
                            backgroundColor: bgAtu,
                            borderColor: borderAtu,
                            borderWidth: 1,
                            borderRadius: 3,
                            barPercentage: 0.75,
                            categoryPercentage: 0.8
                        }
                    ]
                },
                options: {
                    animation: false,
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 90, right: 8, left: 8 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => fmtR(ctx.parsed.y)
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { color: '#222', font: { size: 10, weight: 'bold' } },
                            grid: { display: false }
                        },
                        y: {
                            ticks: {
                                color: '#444',
                                font: { size: 9 },
                                callback: v => 'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
                            },
                            grid: { color: '#e8e8e8' }
                        }
                    }
                }
            });
        }

        const group1 = [
            { key: 'cobre',    label: 'COBRE' },
            { key: 'zinco',    label: 'ZINCO' },
            { key: 'aluminio', label: 'ALUMÍNIO' },
            { key: 'chumbo',   label: 'CHUMBO' }
        ];
        buildBarChart(
            'rel-hist-ChartLines',
            group1.map(m => m.label),
            group1.map(m => comp['SEMANA ANTERIOR']?.[m.key] || 0),
            group1.map(m => comp['100% LME']?.[m.key]        || 0)
        );

        const group2 = [
            { key: 'estanho', label: 'ESTANHO' },
            { key: 'niquel',  label: 'NÍQUEL' }
        ];
        buildBarChart(
            'rel-hist-ChartOsc',
            group2.map(m => m.label),
            group2.map(m => comp['SEMANA ANTERIOR']?.[m.key] || 0),
            group2.map(m => comp['100% LME']?.[m.key]        || 0)
        );

        function buildCards(containerId, group) {
            const el = document.getElementById(containerId);
            if (!el) return;
            el.innerHTML = group.map(m => {
                const atual    = comp['100% LME']?.[m.key]        || 0;
                const anterior = comp['SEMANA ANTERIOR']?.[m.key] || 0;
                const diff     = atual - anterior;
                const isUp     = diff > 0;
                const isDown   = diff < 0;
                const arrow    = isUp ? '↑' : isDown ? '↓' : '–';
                const color    = isUp ? '#1a7f4b' : isDown ? '#c0392b' : '#555';
                const bg       = isUp ? '#e9f7f0' : isDown ? '#fdecea' : '#f5f5f5';
                const border   = isUp ? '#a8dfc4' : isDown ? '#f5b8b2' : '#ddd';
                return `
                <div class="rel-card-metal" style="border-color:${border}; background:${bg};">
                    <div class="rel-card-metal-name">${m.label}</div>
                    <div class="rel-card-metal-val" style="color:${color};">
                        ${arrow} ${fmtR(atual)}
                    </div>
                    <div class="rel-card-metal-prev">era ${fmtR(anterior)}</div>
                    <div class="rel-card-metal-diff" style="color:${color};">
                        ${isUp ? '+' : isDown ? '-' : ''}${fmtR(diff)}
                    </div>
                </div>`;
            }).join('');
        }

        buildCards('rel-hist-cards-group1', group1);
        buildCards('rel-hist-cards-group2', group2);
    }

    function renderRelatorioDiarioHistoricoBase(week) {
        const comp = week.computed || {};
        const tbody = document.getElementById('rel-hist-base-tbody');
        tbody.innerHTML = '';
        const metals = ['cobre', 'zinco', 'aluminio', 'chumbo', 'estanho', 'niquel'];

        for (let p = 90; p <= 110; p++) {
            const tr = document.createElement('tr');
            if (p < 100) tr.className = 'row-below';
            else if (p === 100) tr.className = 'row-100pct';
            else tr.className = 'row-above';

            const pLabel = p === 100 ? '<strong>100%</strong>' : p + '%';
            let colsHtml = `<td>${pLabel}</td>`;

            metals.forEach(m => {
                const lme = comp['SEMANA ANTERIOR']?.[m] ?? null;
                const colClass = `rel-col-${m}`;
                if (lme === null) {
                    colsHtml += `<td class="${colClass}">-</td>`;
                } else {
                    const baseVal = lme * (p / 100);
                    const fmt = 'R$ ' + baseVal.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
                    colsHtml += `<td class="${colClass}">${fmt}</td>`;
                }
            });

            tr.innerHTML = colsHtml;
            tbody.appendChild(tr);
        }
    }

} // fechamento do bloco interno

}); // end DOMContentLoaded
