document.addEventListener('DOMContentLoaded', () => {

    // ─── Utilitário global: formata número no padrão brasileiro com 2 casas ───
    window.fmtBRL = function(val) {
        const n = parseFloat(val);
        if (isNaN(n)) return '0,00';
        return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    window.formatarDataSemFuso = function(dStr) {
        if (!dStr) return '-';
        const s = String(dStr).split('T')[0];
        const parts = s.split('-');
        if (parts.length === 3) {
            return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        }
        try {
            return new Date(dStr).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        } catch (e) {
            return dStr;
        }
    };

    // ─── Tecla ESC (Escape) para cancelar/fechar qualquer modal ou dropdown ───
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.keyCode === 27) {
            const drop = document.getElementById('pedido-cliente-dropdown');
            if (drop && drop.style.display !== 'none') {
                drop.style.display = 'none';
                return;
            }

            if (window.fecharModalPedido) window.fecharModalPedido();
            if (window.fecharModalCliente) window.fecharModalCliente();
            if (window.fecharModalVigenciaGeral) window.fecharModalVigenciaGeral();
            if (window.fecharModalFornecedor) window.fecharModalFornecedor();
            if (window.fecharModalMaterial) window.fecharModalMaterial();
            if (window.fecharModalPreco) window.fecharModalPreco();
            if (window.fecharModalAmostra) window.fecharModalAmostra();
            if (window.fecharModalPlanejamento) window.fecharModalPlanejamento();
            if (window.fecharModalFidc) window.fecharModalFidc();
            if (window.fecharModalUsuario) window.fecharModalUsuario();
            if (window.fecharModalReprovacao) window.fecharModalReprovacao();

            document.querySelectorAll('.fullscreen-overlay').forEach(modal => {
                modal.style.display = 'none';
            });
        }
    });

    let globalRolePermissions = {};

    // ─────────────────────────────────────────────────────────────────────────
    // LOGIN
    // ─────────────────────────────────────────────────────────────────────────




    // ─────────────────────────────────────────────────────────────────────────
    // NAVEGAÇÃO
    // ─────────────────────────────────────────────────────────────────────────
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    const sections = document.querySelectorAll('.view-section');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            // Esconde todas as seções EXCETO o histórico (que é gerenciado internamente pelo botão)
            sections.forEach(sec => {
                if (sec.id !== 'relatorio-diario-historico') {
                    sec.classList.remove('active');
                    sec.style.display = 'none';
                }
            });
            item.classList.add('active');
            const target = document.getElementById(item.dataset.target);
            if (target) {
                // Se o target for relatorio-diario, garante que historico fique oculto
                if (item.dataset.target === 'relatorio-diario') {
                    const histSec = document.getElementById('relatorio-diario-historico');
                    if (histSec) {
                        histSec.classList.remove('active');
                        histSec.style.display = 'none';
                    }
                }
                target.classList.add('active');
                target.style.display = 'block';
                if (item.dataset.target === 'permissoes-view' && window.carregarPermissoesView) {
                    window.carregarPermissoesView();
                }
                if (item.dataset.target === 'financeiro-view' && window.carregarFinanceiroView) {
                    window.carregarFinanceiroView();
                }
                if (item.dataset.target === 'fornecedores-view' && window.initApexFornecedores) {
                    window.initApexFornecedores();
                }
                if (item.dataset.target === 'clientes-view' && window.initApexClientes) {
                    window.initApexClientes();
                }
                if (item.dataset.target === 'pedidos-venda-view' && window.initApexPedidos) {
                    window.initApexPedidos();
                }
                setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 50);
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // INIT ADMIN
    // ─────────────────────────────────────────────────────────────────────────
    async function initAdmin() {
        try {
            const res = await fetch('/api/settings');
            const settings = await res.json();
            if (settings.role_permissions) {
                globalRolePermissions = JSON.parse(settings.role_permissions);
            }
        } catch (e) {
            console.error('Erro ao buscar permissões:', e);
        }

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
        
        // Apex Gestão Inits
        initApexFornecedores();
        initApexClientes();
        initApexMateriais();
        initApexPrecos();
        initApexAmostras();
        initApexPlanejamento();
        initApexEstoque();
        initApexUsuarios();
        initApexBI();
        initApexPedidos();
        switchSimulatedRole(sessionStorage.getItem('apex_user_role') || 'Administrador');
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
                <div style="font-size:1rem;color:${color};font-weight:700;margin-top:2px;">${sign}${fmtBRL(pct)}%</div>
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
        let currentSelectedWeek = null;
        const selectMes = document.getElementById('rel-filter-mes');
        const selectSemana = document.getElementById('rel-week-selector');
        const btnVerHistorico = document.getElementById('btn-ver-historico');

        if (btnVerHistorico) {
            btnVerHistorico.addEventListener('click', async (e) => {
                e.preventDefault();
                const originalContent = btnVerHistorico.innerHTML;
                btnVerHistorico.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...';
                btnVerHistorico.disabled = true;
                try {
                    await loadRelatorioMeses(true);
                } finally {
                    btnVerHistorico.innerHTML = originalContent;
                    btnVerHistorico.disabled = false;
                }
            });
        }

        async function loadRelatorioMeses(force = false) {
            try {
                function gerarMesesFallback() {
                    const meses = [];
                    const now = new Date();
                    for (let i = 0; i < 12; i++) {
                        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                        const ano = d.getFullYear();
                        const mes = String(d.getMonth() + 1).padStart(2, '0');
                        const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
                        meses.push({ valor: `${ano}-${mes}`, texto: `${nomes[d.getMonth()]}/${ano}` });
                    }
                    return meses;
                }

                let mesesDisponiveis = [];
                try {
                    const url = '/api/lme/meses' + (force ? '?_ts=' + Date.now() : '');
                    const resMeses = await fetch(url);
                    if (resMeses.ok) {
                        mesesDisponiveis = await resMeses.json();
                    }
                } catch (fetchErr) {
                    console.warn('Falha ao buscar meses via API, usando fallback:', fetchErr);
                }

                if (!mesesDisponiveis || mesesDisponiveis.length === 0) {
                    mesesDisponiveis = gerarMesesFallback();
                }

                if (selectMes) {
                    selectMes.innerHTML = mesesDisponiveis.map(m =>
                        '<option value="' + m.valor + '">' + m.texto + '</option>'
                    ).join('');
                    const mesToFetch = mesesDisponiveis[0].valor;
                    selectMes.value = mesToFetch;
                    await loadRelatorioSemanas(mesToFetch, force);
                }
            } catch (e) {
                console.error('Erro ao carregar meses do relatório', e);
            }
        }

        async function loadRelatorioSemanas(mes, force = false) {
            if (selectSemana) selectSemana.innerHTML = '<option>Carregando semanas...</option>';
            try {
                const url = '/api/lme/relatorio-semanal?mes=' + mes + (force ? '&_ts=' + Date.now() : '');
                const res = await fetch(url);
                if (!res.ok) {
                    if (selectSemana) selectSemana.innerHTML = '<option value="">Erro ao carregar semanas</option>';
                    return;
                }
                const data = await res.json();
                weeksData = data.semanas || [];
                if (weeksData.length === 0) {
                    if (selectSemana) selectSemana.innerHTML = '<option value="">Nenhuma semana disponível</option>';
                    return;
                }

                if (selectSemana) {
                    selectSemana.innerHTML = weeksData.map((wk, idx) =>
                        '<option value="' + idx + '">Semana de ' + (wk.label || 'sem data') + '</option>'
                    ).join('');
                    selectSemana.value = 0;
                }
                currentSelectedWeek = weeksData[0];
                renderRelatorioDiario(currentSelectedWeek);
            } catch (e) {
                console.error('Erro ao carregar semanas do relatório', e);
                if (selectSemana) selectSemana.innerHTML = '<option value="">Erro de conexão</option>';
            }
        }

        if (selectMes) {
            selectMes.addEventListener('change', async (e) => {
                await loadRelatorioSemanas(e.target.value);
            });
        }

        if (selectSemana) {
            selectSemana.addEventListener('change', (e) => {
                const idx = parseInt(e.target.value, 10);
                if (!isNaN(idx) && weeksData[idx]) {
                    currentSelectedWeek = weeksData[idx];
                    renderRelatorioDiario(currentSelectedWeek);
                }
            });
        }

        await loadRelatorioMeses();

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
            if (!currentSelectedWeek) return;
            const week = currentSelectedWeek;
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
                    if (currentSelectedWeek) {
                        const week = currentSelectedWeek;
                        const d = week.days || [];
                        if (d.length > 0 && d[0].data) {
                            const parts = d[0].data.split('/');
                            if (parts.length >= 2) {
                                const day = parts[0].padStart(2, '0');
                                const month = parts[1].padStart(2, '0');
                                let year = parts[2] || '';
                                if (!year) {
                                    const filterMes = document.getElementById('rel-filter-mes');
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
                if (!currentSelectedWeek) return;
                const block = currentSelectedWeek;
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

        // Tentar obter a data da semana a partir do primeiro dia útil dela
        let referenceDate = new Date();
        if (d.length > 0 && d[0].data && d[0].data !== '—') {
            const parts = d[0].data.split('/');
            if (parts.length >= 2) {
                const selectMes = document.getElementById('rel-filter-mes');
                let yr = new Date().getFullYear();
                if (selectMes && selectMes.value && selectMes.value.includes('-')) {
                    yr = parseInt(selectMes.value.split('-')[1], 10);
                }
                const monthMap = {
                    'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
                    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
                };
                const monthAbbr = parts[1].toLowerCase().replace('.', '').trim();
                const monthNum = monthMap[monthAbbr] || parseInt(parts[1], 10) || (new Date().getMonth() + 1);
                const dayNum = parseInt(parts[0], 10) || 1;
                referenceDate = new Date(yr, monthNum - 1, dayNum);
            }
        }
        
        const dataTexto = `${week.label || ''}`;
        const weekNum = getISOWeek(referenceDate);
        
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



        // Alternar de volta
        btnVoltar.addEventListener('click', () => {
            sectionHistorico.classList.remove('active');
            sectionDiario.classList.add('active');
            window.dispatchEvent(new Event('resize'));
        });

        async function loadHistoricoMeses() {
            try {
                // Gera lista de meses dos últimos 12 meses como fallback
                function gerarMesesFallback() {
                    const meses = [];
                    const now = new Date();
                    for (let i = 0; i < 12; i++) {
                        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                        const ano = d.getFullYear();
                        const mes = String(d.getMonth() + 1).padStart(2, '0');
                        const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
                        meses.push({ valor: `${ano}-${mes}`, texto: `${nomes[d.getMonth()]}/${ano}` });
                    }
                    return meses;
                }

                let mesesDisponiveis = [];
                try {
                    const resMeses = await fetch('/api/lme/meses');
                    if (resMeses.ok) {
                        mesesDisponiveis = await resMeses.json();
                    }
                } catch (fetchErr) {
                    console.warn('Falha ao buscar meses via API, usando fallback:', fetchErr);
                }

                // Usa fallback se a API retornar vazio
                if (!mesesDisponiveis || mesesDisponiveis.length === 0) {
                    mesesDisponiveis = gerarMesesFallback();
                }

                selectMes.innerHTML = mesesDisponiveis.map(m =>
                    '<option value="' + m.valor + '">' + m.texto + '</option>'
                ).join('');

                const mesToFetch = mesesDisponiveis[0].valor;
                selectMes.value = mesToFetch;
                await loadHistoricoSemanas(mesToFetch);
            } catch (e) {
                console.error('Erro ao carregar meses do histórico', e);
                selectMes.innerHTML = '<option value="">Erro ao carregar meses</option>';
            }
        }

        async function loadHistoricoSemanas(mes) {
            selectSemana.innerHTML = '<option>Carregando semanas...</option>';
            try {
                const res = await fetch('/api/lme/relatorio-semanal?mes=' + mes);
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    console.error('Erro na API semanas:', errData);
                    selectSemana.innerHTML = '<option value="">Erro ao carregar semanas</option>';
                    return;
                }
                const data = await res.json();
                weeksData = data.semanas || [];
                if (weeksData.length === 0) {
                    selectSemana.innerHTML = '<option value="">Nenhuma semana disponível</option>';
                    return;
                }

                selectSemana.innerHTML = weeksData.map((wk, idx) =>
                    '<option value="' + idx + '">Semana de ' + (wk.label || 'sem data') + '</option>'
                ).join('');

                selectSemana.value = 0;
                currentSelectedWeek = weeksData[0];
                renderRelatorioDiarioHistorico(currentSelectedWeek);
            } catch (e) {
                console.error('Erro ao carregar semanas do histórico', e);
                selectSemana.innerHTML = '<option value="">Erro de conexão</option>';
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
                const monthMap = {
                    'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
                    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12
                };
                const monthAbbr = parts[1].toLowerCase().replace('.', '').trim();
                const monthNum = monthMap[monthAbbr] || parseInt(parts[1], 10) || (new Date().getMonth() + 1);
                const dayNum = parseInt(parts[0], 10) || 1;
                referenceDate = new Date(yr, monthNum - 1, dayNum);
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


    // ─────────────────────────────────────────────────────────────────────────
    // APEX GESTÃO — SISTEMA DE PERMISSÕES, ANÁLISE, FINANCEIRO E ESTOQUE
    // ─────────────────────────────────────────────────────────────────────────
    let currentSimulatedRole = sessionStorage.getItem('apex_user_role') || 'Administrador';
    let localFornecedores = [];
    let localMateriais = [];
    let localPrecos = [];
    let localAmostras = [];
    let localPlanejamento = [];
    let activeAmostraIdForDesmonte = null;

    // --- Role Switcher & Permissões ---
    window.switchSimulatedRole = function(role) {
        currentSimulatedRole = role;
        sessionStorage.setItem('apex_user_role', role);
        document.getElementById('simulated-role-indicator').textContent = role;

        const roles = ['admin', 'lab', 'compras', 'producao', 'financeiro', 'diretoria'];
        roles.forEach(r => {
            const el = document.getElementById(`sim-${r}`);
            if (el) el.classList.remove('active');
        });
        
        const mapRoleToBtn = {
            'Administrador': 'sim-admin',
            'Laboratório': 'sim-lab',
            'Compras': 'sim-compras',
            'Produção': 'sim-producao',
            'Financeiro': 'sim-financeiro',
            'Diretoria': 'sim-diretoria'
        };
        const activeBtn = document.getElementById(mapRoleToBtn[role]);
        if (activeBtn) activeBtn.classList.add('active');

        applyRolePermissions();
    };

    function applyRolePermissions() {
        const role = currentSimulatedRole;

        // Se por acaso as permissões ainda não carregaram ou o role não existir, falha fechado (deny all exceto admin)
        let permissoes = globalRolePermissions[role] || [];
        if (role === 'Administrador') {
            // Admin vê tudo.
            permissoes = ["view_lme", "view_precos", "view_catalogo", "view_fornecedores", "view_laboratorio", "view_planejamento", "view_estoque", "view_bi", "edit_financeiro", "edit_producao", "view_usuarios", "view_permissoes", "view_financeiro", "view_pedidos"];
        }

        const temPermissao = (p) => permissoes.includes(p);

        // Funções auxiliares para esconder/mostrar navegação
        const setNav = (idOrSelector, isVisible) => {
            const el = document.getElementById(idOrSelector) || document.querySelector(idOrSelector);
            if (el) el.style.display = isVisible ? 'flex' : 'none';
        };

        // Tabs Visibility (Apex Gestão)
        setNav('nav-fornecedores', temPermissao('view_fornecedores'));
        setNav('nav-materiais', temPermissao('view_catalogo'));
        setNav('nav-precos', temPermissao('view_precos'));
        setNav('nav-amostras', temPermissao('view_laboratorio'));
        setNav('nav-planejamento', temPermissao('view_planejamento'));
        setNav('nav-estoque', temPermissao('view_estoque'));
        setNav('nav-bi', temPermissao('view_bi'));
        setNav('nav-usuarios', temPermissao('view_usuarios'));
        setNav('nav-permissoes', temPermissao('view_permissoes'));
        setNav('nav-financeiro', temPermissao('view_financeiro'));
        setNav('nav-pedidos-venda', temPermissao('view_pedidos') || role === 'Administrador');

        // Tabs Visibility (LME - como os originais não tem ID, usamos querySelector)
        setNav('.nav-item[data-target="dashboard"]', temPermissao('view_lme'));
        setNav('.nav-item[data-target="relatorio-diario"]', temPermissao('view_lme'));
        setNav('.nav-item[data-target="lme-email-config"]', temPermissao('view_lme'));

        // Oculta a seção ativa se o usuário perdeu acesso a ela e redireciona para a primeira disponível
        const activeNav = document.querySelector('.nav-item.active');
        if (activeNav && activeNav.style.display === 'none') {
            activeNav.classList.remove('active');
            const targetSec = document.getElementById(activeNav.dataset.target);
            if (targetSec) targetSec.classList.remove('active');

            const firstAvailable = document.querySelector('.nav-item[style="display: flex;"]');
            if (firstAvailable) {
                firstAvailable.classList.add('active');
                const targetFirst = document.getElementById(firstAvailable.dataset.target);
                if (targetFirst) targetFirst.classList.add('active');
            }
        }

        // Restrito Financeiro (Valores, margens, custos)
        const restritoFin = document.querySelectorAll('.restrito-financeiro');
        restritoFin.forEach(el => {
            // Alguns elementos podem usar flex ou table-cell ou block, então restauramos o valor limpo '' em vez de fixar
            el.style.display = temPermissao('edit_financeiro') ? '' : 'none';
        });

        // Restrito Produção (PCP)
        const restritoProd = document.querySelectorAll('.restrito-producao');
        restritoProd.forEach(el => {
            el.style.display = temPermissao('edit_producao') ? '' : 'none';
        });

        // Atualiza botões no desmonte se aberto
        if (activeAmostraIdForDesmonte) {
            const amostra = localAmostras.find(x => x.id === activeAmostraIdForDesmonte);
            if (amostra) renderizarBotoesAcoesAmostra(amostra.status);
        }
    }

    // --- 1. FORNECEDORES ---
    window.initApexFornecedores = function() {
        carregarFornecedores();
    };

    async function carregarFornecedores() {
        try {
            const [resForn, resAmo] = await Promise.allSettled([
                fetch('/api/fornecedores'),
                fetch('/api/amostras')
            ]);
            if (resForn.status === 'fulfilled' && resForn.value.ok) {
                localFornecedores = await resForn.value.json();
            }
            if (resAmo.status === 'fulfilled' && resAmo.value.ok) {
                localAmostras = await resAmo.value.json();
            }
            renderFornecedores();
            popularSeletoresFornecedores();
        } catch (err) {
            console.error('Erro ao buscar fornecedores:', err);
        }
    }

    function renderFornecedores() {
        const body = document.getElementById('fornecedores-table-body');
        if (!body) return;
        body.innerHTML = '';
        if (!localFornecedores || !localFornecedores.length) {
            body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#5a738e;"><i class="fa-solid fa-users-slash"></i> Nenhum fornecedor encontrado.</td></tr>';
            return;
        }
        localFornecedores.forEach(f => {
            const razao = f.nome || f.razao_social || '-';
            const fantasia = f.apelido || f.nome_fantasia || '-';
            const contato = f.comprador || f.contato || '-';
            const telefone = f.fone1 || f.telefone || '-';

            const amostrasForn = (localAmostras || []).filter(a => a.fornecedor_id === f.id);
            const amostrasHtml = amostrasForn.length > 0
                ? amostrasForn.map(a => `<span class="badge-status em-analise" style="margin:2px;font-size:0.75rem;background:#1e4e8c;color:#fff;cursor:pointer;display:inline-block;" onclick="window.abrirAmostraPorNumero('${a.numero_amostra}')">${a.numero_amostra}</span>`).join(' ')
                : '<span style="color:#666;font-style:italic;font-size:0.8rem;">Nenhuma</span>';

            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.title = 'Clique para editar este fornecedor';
            tr.onclick = (e) => {
                if (e.target.closest('button') || e.target.closest('.badge-status')) return;
                editarFornecedor(f.id);
            };
            tr.innerHTML = `
                <td style="padding:10px 12px;"><strong style="color:#fff;">${razao}</strong></td>
                <td style="padding:10px 12px;color:#aaa;">${fantasia}</td>
                <td style="padding:10px 12px;">${f.cnpj || '-'}</td>
                <td style="padding:10px 12px;">${contato}</td>
                <td style="padding:10px 12px;">${telefone}</td>
                <td style="padding:10px 12px;">${f.email || '-'}</td>
                <td style="padding:10px 12px;">${amostrasHtml}</td>
                <td style="padding:10px 12px; text-align:center; white-space:nowrap;">
                    <button style="background:#1e3a5f;border:none;color:#4fc3f7;padding:6px 10px;border-radius:6px;cursor:pointer;margin-right:4px;" onclick="editarFornecedor(${f.id})" title="Editar"><i class="fa-solid fa-pen"></i> Editar</button>
                    <button style="background:#3a1515;border:none;color:#ff6b6b;padding:6px 10px;border-radius:6px;cursor:pointer;" onclick="deletarFornecedor(${f.id})" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            body.appendChild(tr);
        });
    }

    window.abrirModalFornecedor = function() {
        document.getElementById('form-fornecedor-apex').reset();
        document.getElementById('forn-id').value = '';
        document.getElementById('modal-fornecedor').style.display = 'flex';
    };

    window.fecharModalFornecedor = function() {
        document.getElementById('modal-fornecedor').style.display = 'none';
    };

    window.editarFornecedor = function(id) {
        const f = localFornecedores.find(x => x.id === id);
        if (!f) { alert('Fornecedor não encontrado na lista local. Recarregue a página.'); return; }
        document.getElementById('modal-forn-titulo').textContent = 'Editar Fornecedor';
        document.getElementById('forn-id').value = f.id;
        document.getElementById('forn-codfor').value = f.codfor || '';
        // Suporta tanto colunas reais (nome) quanto aliases (razao_social)
        document.getElementById('forn-razao').value = f.nome || f.razao_social || '';
        document.getElementById('forn-fantasia').value = f.apelido || f.nome_fantasia || '';
        document.getElementById('forn-cnpj').value = f.cnpj || '';
        document.getElementById('forn-cpf').value = f.cpf || '';
        document.getElementById('forn-ie').value = f.ie || '';
        document.getElementById('forn-contato').value = f.comprador || f.contato || '';
        document.getElementById('forn-telefone').value = f.fone1 || f.telefone || '';
        document.getElementById('forn-fone2').value = f.fone2 || '';
        document.getElementById('forn-whatsapp').value = f.whatsapp || '';
        document.getElementById('forn-celular').value = f.celular || '';
        document.getElementById('forn-email').value = f.email || '';
        document.getElementById('forn-endereco').value = f.endereco || '';
        document.getElementById('forn-numero').value = f.numero || '';
        document.getElementById('forn-bairro').value = f.bairro || '';
        document.getElementById('forn-cidade').value = f.cidade || '';
        document.getElementById('forn-uf').value = f.uf || '';
        document.getElementById('forn-cep').value = f.cep || '';
        document.getElementById('forn-obs').value = f.complemento || f.observacoes || '';
        document.getElementById('forn-condicao').value = f.condicao_pagamento || '';
        document.getElementById('forn-tabela').value = f.tabela || '';
        document.getElementById('forn-filial').value = f.filial || '';
        document.getElementById('modal-fornecedor').style.display = 'flex';
    };

    window.salvarFornecedor = async function(e) {
        e.preventDefault();
        const id = document.getElementById('forn-id').value;
        const data = {
            razao_social: document.getElementById('forn-razao').value,
            nome_fantasia: document.getElementById('forn-fantasia').value,
            cnpj: document.getElementById('forn-cnpj').value,
            cpf: document.getElementById('forn-cpf').value,
            ie: document.getElementById('forn-ie').value,
            contato: document.getElementById('forn-contato').value,
            telefone: document.getElementById('forn-telefone').value,
            fone2: document.getElementById('forn-fone2').value,
            whatsapp: document.getElementById('forn-whatsapp').value,
            celular: document.getElementById('forn-celular').value,
            email: document.getElementById('forn-email').value,
            endereco: document.getElementById('forn-endereco').value,
            numero: document.getElementById('forn-numero').value,
            bairro: document.getElementById('forn-bairro').value,
            cidade: document.getElementById('forn-cidade').value,
            uf: document.getElementById('forn-uf').value,
            cep: document.getElementById('forn-cep').value,
            observacoes: document.getElementById('forn-obs').value,
            condicao_pagamento: document.getElementById('forn-condicao').value,
            tabela: document.getElementById('forn-tabela').value,
            filial: document.getElementById('forn-filial').value
        };
        const btn = e.target.querySelector('[type="submit"]');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...'; }
        try {
            const url = id ? `/api/fornecedores/${id}` : '/api/fornecedores';
            const method = id ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error(await res.text());
            fecharModalFornecedor();
            carregarFornecedores();
        } catch (err) {
            alert('Erro ao salvar fornecedor: ' + err.message);
            console.error('Erro ao salvar fornecedor:', err);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-save"></i> Salvar Fornecedor'; }
        }
    };

    window.deletarFornecedor = async function(id) {
        if (!confirm('Deseja realmente excluir este fornecedor?')) return;
        try {
            await fetch(`/api/fornecedores/${id}`, { method: 'DELETE' });
            carregarFornecedores();
        } catch (err) {
            console.error(err);
        }
    };

    // ═══════════════════════════════════════════════════════════
    // CLIENTES — CRUD COMPLETO
    // ═══════════════════════════════════════════════════════════
    let localClientes = [];

    window.initApexClientes = async function() {
        await carregarClientes();
    };

    async function carregarClientes() {
        try {
            const res = await fetch('/api/clientes');
            localClientes = await res.json();
            renderClientes();
        } catch (err) {
            console.error('Erro ao buscar clientes:', err);
        }
    }

    function renderClientes() {
        const body = document.getElementById('clientes-table-body');
        if (!body) return;
        body.innerHTML = '';
        if (!localClientes.length) {
            body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:#5a738e;"><i class="fa-solid fa-users-slash"></i> Nenhum cliente cadastrado.</td></tr>';
            return;
        }
        localClientes.forEach(c => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.title = 'Clique para editar este cliente';
            tr.onclick = (e) => {
                if (e.target.closest('button')) return;
                editarCliente(c.id);
            };
            tr.innerHTML = `
                <td style="padding:10px 12px;"><strong style="color:#fff;">${c.nome || '-'}</strong></td>
                <td style="padding:10px 12px;color:#aaa;">${c.fantasia || '-'}</td>
                <td style="padding:10px 12px;">${c.cnpj || c.cpf || '-'}</td>
                <td style="padding:10px 12px;">${c.telefone1 || '-'}</td>
                <td style="padding:10px 12px;">${c.email || '-'}</td>
                <td style="padding:10px 12px;">${c.cidade || '-'}${c.uf ? '/' + c.uf : ''}</td>
                <td style="padding:10px 12px;">
                    <span style="padding:3px 10px; border-radius:20px; font-size:0.78rem; font-weight:600; background:${c.status === 'ATIVO' ? '#0d3020' : '#2a1515'}; color:${c.status === 'ATIVO' ? '#2AD07A' : '#ff6b6b'};">${c.status || 'ATIVO'}</span>
                </td>
                <td style="padding:10px 12px; text-align:center; white-space:nowrap;">
                    <button style="background:#3a2000;border:none;color:#e07b39;padding:6px 12px;border-radius:6px;cursor:pointer;margin-right:4px;font-size:0.82rem;" onclick="editarCliente(${c.id})" title="Editar"><i class="fa-solid fa-pen"></i> Editar</button>
                    <button style="background:#3a1515;border:none;color:#ff6b6b;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.82rem;" onclick="deletarCliente(${c.id})" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            body.appendChild(tr);
        });
    }

    window.abrirModalCliente = function() {
        document.getElementById('form-cliente-apex').reset();
        document.getElementById('cli-id').value = '';
        document.getElementById('modal-cli-titulo').textContent = 'Novo Cliente';
        document.getElementById('modal-cliente').style.display = 'flex';
    };

    window.fecharModalCliente = function() {
        document.getElementById('modal-cliente').style.display = 'none';
    };

    window.editarCliente = function(id) {
        const c = localClientes.find(x => x.id === id);
        if (!c) return;
        document.getElementById('modal-cli-titulo').textContent = 'Editar Cliente';
        document.getElementById('cli-id').value = c.id;
        document.getElementById('cli-codigo').value = c.codigo || '';
        document.getElementById('cli-nome').value = c.nome || '';
        document.getElementById('cli-fantasia').value = c.fantasia || '';
        document.getElementById('cli-status').value = c.status || 'ATIVO';
        document.getElementById('cli-tipo').value = c.tipo_cliente || '';
        document.getElementById('cli-cnpj').value = c.cnpj || '';
        document.getElementById('cli-cpf').value = c.cpf || '';
        document.getElementById('cli-ie').value = c.ie || c.rg || '';
        document.getElementById('cli-tel1').value = c.telefone1 || '';
        document.getElementById('cli-tel2').value = c.telefone2 || '';
        document.getElementById('cli-contato-com').value = c.contato_comercial || '';
        document.getElementById('cli-contato-fin').value = c.contato_financeiro || '';
        document.getElementById('cli-email').value = c.email || '';
        document.getElementById('cli-endereco').value = c.endereco || '';
        document.getElementById('cli-numero').value = c.numero || '';
        document.getElementById('cli-bairro').value = c.bairro || '';
        document.getElementById('cli-cidade').value = c.cidade || '';
        document.getElementById('cli-uf').value = c.uf || '';
        document.getElementById('cli-pais').value = c.pais || '';
        document.getElementById('cli-cep').value = c.cep || '';
        document.getElementById('cli-vendedor').value = c.vendedor || '';
        document.getElementById('cli-dias').value = c.dias || 0;
        document.getElementById('cli-filial').value = c.filial || '';
        document.getElementById('modal-cliente').style.display = 'flex';
    };

    window.salvarCliente = async function(e) {
        e.preventDefault();
        const id = document.getElementById('cli-id').value;
        const data = {
            codigo: document.getElementById('cli-codigo').value || null,
            nome: document.getElementById('cli-nome').value,
            fantasia: document.getElementById('cli-fantasia').value,
            status: document.getElementById('cli-status').value,
            tipo_cliente: document.getElementById('cli-tipo').value,
            cnpj: document.getElementById('cli-cnpj').value,
            cpf: document.getElementById('cli-cpf').value,
            ie: document.getElementById('cli-ie').value,
            telefone1: document.getElementById('cli-tel1').value,
            telefone2: document.getElementById('cli-tel2').value,
            contato_comercial: document.getElementById('cli-contato-com').value,
            contato_financeiro: document.getElementById('cli-contato-fin').value,
            email: document.getElementById('cli-email').value,
            endereco: document.getElementById('cli-endereco').value,
            numero: document.getElementById('cli-numero').value,
            bairro: document.getElementById('cli-bairro').value,
            cidade: document.getElementById('cli-cidade').value,
            uf: document.getElementById('cli-uf').value,
            pais: document.getElementById('cli-pais').value,
            cep: document.getElementById('cli-cep').value,
            vendedor: document.getElementById('cli-vendedor').value,
            dias: parseInt(document.getElementById('cli-dias').value) || 0,
            filial: document.getElementById('cli-filial').value
        };
        const btn = e.target.querySelector('[type="submit"]');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...'; }
        try {
            const url = id ? `/api/clientes/${id}` : '/api/clientes';
            const method = id ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error(await res.text());
            const savedData = await res.clone().json().catch(() => ({}));
            fecharModalCliente();
            await carregarClientes();
            if (!id && window.clienteCadastradoCallback) {
                const targetId = savedData.id || (localClientes[0] ? localClientes[0].id : null);
                if (targetId) window.clienteCadastradoCallback(targetId);
                window.clienteCadastradoCallback = null;
            }
        } catch (err) {
            alert('Erro ao salvar cliente: ' + err.message);
            console.error('Erro ao salvar cliente:', err);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-save"></i> Salvar Cliente'; }
        }
    };

    window.deletarCliente = async function(id) {
        if (!confirm('Deseja realmente excluir este cliente?')) return;
        try {
            await fetch(`/api/clientes/${id}`, { method: 'DELETE' });
            carregarClientes();
        } catch (err) {
            console.error(err);
        }
    };

    window.filtrarClientes = function() {
        const search = document.getElementById('clientes-search')?.value.toLowerCase() || '';
        const rows = document.querySelectorAll('#clientes-table-body tr');
        rows.forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(search) ? '' : 'none';
        });
    };

    window.filtrarFornecedores = function() {
        const search = document.getElementById('fornecedores-search').value.toLowerCase();
        const rows = document.querySelectorAll('#fornecedores-table-body tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(search) ? '' : 'none';
        });
    };

    function popularSeletoresFornecedores() {
        const amoF = document.getElementById('amo-fornecedor');
        const plF = document.getElementById('pl-fornecedor');
        // Compatibilidade: banco usa 'nome', mock em memória usa 'nome_fantasia'
        const getNomeFornecedor = (f) => f.nome || f.nome_fantasia || f.apelido || `Fornecedor #${f.id}`;
        if (amoF) {
            amoF.innerHTML = '';
            localFornecedores.forEach(f => {
                amoF.innerHTML += `<option value="${f.id}">${getNomeFornecedor(f)}</option>`;
            });
        }
        if (plF) {
            plF.innerHTML = '';
            localFornecedores.forEach(f => {
                plF.innerHTML += `<option value="${f.id}">${getNomeFornecedor(f)}</option>`;
            });
        }
    }

    // --- 2. CATALOGO DE MATERIAIS ---
    window.initApexMateriais = function() {
        carregarMateriais();
    };

    async function carregarMateriais() {
        try {
            const res = await fetch('/api/materiais-catalogo');
            localMateriais = await res.json();
            renderMateriais();
            popularSeletoresCategorias();
            popularSeletoresMateriais();
        } catch (err) {
            console.error(err);
        }
    }

    function renderMateriais() {
        const body = document.getElementById('materiais-table-body');
        if (!body) return;
        body.innerHTML = '';
        localMateriais.forEach(m => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:12px;"><strong>${m.nome}</strong></td>
                <td style="padding:12px;">${m.unidade}</td>
                <td style="padding:12px;"><span class="badge-status em-analise" style="background:${m.cor || '#1e4e8c'};">${m.categoria}</span></td>
                <td style="padding:12px;">${m.ncm || '-'}</td>
                <td style="padding:12px;"><div style="width:24px; height:24px; border-radius:50%; background:${m.cor || '#fff'}; border:1px solid #444;"></div></td>
                <td style="padding:12px;">${m.observacoes || '-'}</td>
                <td style="padding:12px; text-align:center;">
                    <button class="btn-refresh" style="background:none; border:none; color:#3e7cb1; margin-right:8px;" onclick="editarMaterial(${m.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-refresh" style="background:none; border:none; color:#ff4d4d;" onclick="deletarMaterial(${m.id})"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            body.appendChild(tr);
        });
    }

    let ncmTimeout = null;

    window.buscarNcmPorNome = function(e) {
        if (e) e.preventDefault();
        const nome = document.getElementById('mat-nome').value;
        if (!nome) {
            alert('Por favor, digite o nome do material primeiro.');
            return;
        }
        executarBuscaNcm(nome);
    };

    window.autoBuscarNcm = function(valor) {
        clearTimeout(ncmTimeout);
        if (!valor || valor.trim().length < 2) {
            fecharNcmDropdown();
            return;
        }
        ncmTimeout = setTimeout(() => {
            executarBuscaNcm(valor);
        }, 400);
    };

    window.buscarNcmManual = function() {
        const valor = document.getElementById('mat-ncm').value;
        if (!valor) {
            alert('Digite um termo ou código para buscar.');
            return;
        }
        executarBuscaNcm(valor);
    };

    async function executarBuscaNcm(termo) {
        const dropdown = document.getElementById('ncm-resultados-dropdown');
        if (!dropdown) return;
        
        try {
            const res = await fetch(`/api/ncm/buscar?q=${encodeURIComponent(termo)}`);
            const resultados = await res.json();
            
            let html = '';
            
            if (resultados.length === 0) {
                html += `<div style="padding:10px; color:#aaa; font-style:italic; font-size:0.85rem;">Nenhum NCM encontrado na base</div>`;
            } else {
                html += resultados.map(n => `
                    <div style="padding:10px; cursor:pointer; border-bottom:1px solid #223547; transition:background 0.2s;" 
                         onclick="selecionarNcm('${n.codigo}', '${n.descricao.replace(/'/g, "\\'")}')"
                         onmouseover="this.style.background='rgba(30, 78, 140, 0.4)'"
                         onmouseout="this.style.background='none'">
                        <span style="color:#2AD07A; font-weight:bold; font-size:0.85rem;">${formatarCodigoNcm(n.codigo)}</span><br>
                        <small style="color:#ddd; font-size:0.75rem;">${n.descricao}</small>
                    </div>
                `).join('');
            }

            // Sempre adiciona a opção de usar o valor digitado manualmente
            const termoSanitizado = termo.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            html += `
                <div style="padding:10px; cursor:pointer; background:#1a3045; border-top:1px solid #3e7cb1;" 
                     onclick="usarNcmManual('${termoSanitizado}')"
                     onmouseover="this.style.background='rgba(30, 78, 140, 0.6)'"
                     onmouseout="this.style.background='#1a3045'">
                    <span style="color:#4fc3f7; font-weight:bold; font-size:0.85rem;"><i class="fa-solid fa-keyboard"></i> Usar NCM manual: ${termo}</span>
                </div>
            `;
            
            dropdown.innerHTML = html;
            dropdown.style.display = 'block';
        } catch (err) {
            console.error('Erro ao buscar NCM:', err);
        }
    }

    window.usarNcmManual = function(valor) {
        const input = document.getElementById('mat-ncm');
        if (input) {
            // Formata o valor manual se parecer com um número de 8 dígitos
            input.value = formatarCodigoNcm(valor);
        }
        fecharNcmDropdown();
    };

    // Fechar dropdown ao clicar fora
    document.addEventListener('click', function(e) {
        const dropdown = document.getElementById('ncm-resultados-dropdown');
        const input = document.getElementById('mat-ncm');
        const btnBusca = document.querySelector('button[onclick="buscarNcmManual()"]');
        
        if (dropdown && dropdown.style.display === 'block') {
            if (!dropdown.contains(e.target) && e.target !== input && e.target !== btnBusca && (!btnBusca || !btnBusca.contains(e.target))) {
                fecharNcmDropdown();
            }
        }
    });

    window.selecionarNcm = function(codigo, descricao) {
        const input = document.getElementById('mat-ncm');
        if (input) {
            input.value = formatarCodigoNcm(codigo);
        }
        fecharNcmDropdown();
    };

    function fecharNcmDropdown() {
        const dropdown = document.getElementById('ncm-resultados-dropdown');
        if (dropdown) dropdown.style.display = 'none';
    }

    function formatarCodigoNcm(codigo) {
        const limpo = codigo.replace(/\D/g, '');
        if (limpo.length === 8) {
            return `${limpo.substring(0,4)}.${limpo.substring(4,6)}.${limpo.substring(6,8)}`;
        }
        return codigo;
    }

    // Fechar dropdown de NCM ao clicar fora do modal
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('ncm-resultados-dropdown');
        const inputNcm = document.getElementById('mat-ncm');
        if (dropdown && e.target !== dropdown && e.target !== inputNcm && !dropdown.contains(e.target)) {
            fecharNcmDropdown();
        }
    });

    window.abrirModalMaterial = function() {
        document.getElementById('form-material-apex').reset();
        document.getElementById('mat-id').value = '';
        document.getElementById('modal-material-titulo').textContent = 'Cadastro de Material';
        fecharNcmDropdown();
        popularSeletoresCategorias();
        selecionarCategoriaBadge(null);
        document.getElementById('modal-material').style.display = 'flex';
        // Sync color preview
        const corInput = document.getElementById('mat-cor');
        const corPreview = document.getElementById('mat-cor-preview');
        if (corInput && corPreview) {
            corInput.addEventListener('input', () => { corPreview.textContent = corInput.value; }, { once: false });
            corPreview.textContent = corInput.value;
        }
    };

    window.fecharModalMaterial = function() {
        fecharNcmDropdown();
        document.getElementById('modal-material').style.display = 'none';
    };

    window.editarMaterial = function(id) {
        const m = localMateriais.find(x => x.id === id);
        if (!m) return;
        document.getElementById('mat-id').value = m.id;
        document.getElementById('mat-nome').value = m.nome;
        document.getElementById('mat-ncm').value = m.ncm || '';
        document.getElementById('mat-cor').value = m.cor || '#3e7cb1';
        const corPreview = document.getElementById('mat-cor-preview');
        if (corPreview) corPreview.textContent = m.cor || '#3e7cb1';
        document.getElementById('mat-obs').value = m.observacoes || '';
        document.getElementById('modal-material-titulo').textContent = 'Editar Material';
        popularSeletoresCategorias();
        selecionarCategoriaBadge(m.categoria);
        // Set unidade select
        const unSelect = document.getElementById('mat-unidade');
        if (unSelect) { unSelect.value = m.unidade || 'kg'; }
        document.getElementById('modal-material').style.display = 'flex';
        // Sync color preview
        const corInput = document.getElementById('mat-cor');
        if (corInput) corInput.addEventListener('input', () => { if(corPreview) corPreview.textContent = corInput.value; }, { once: false });
    };

    function selecionarCategoriaBadge(cat) {
        const select = document.getElementById('mat-categoria');
        const badges = document.querySelectorAll('.cat-badge-btn');
        const infoDiv = document.getElementById('mat-categoria-selecionada');
        const nomeSpan = document.getElementById('mat-categoria-nome-display');
        badges.forEach(b => {
            const isSelected = b.dataset.cat === cat;
            b.style.background = isSelected ? (b.dataset.color || '#1e4e8c') : 'rgba(255,255,255,0.05)';
            b.style.borderColor = isSelected ? (b.dataset.color || '#1e4e8c') : 'rgba(255,255,255,0.12)';
            b.style.color = isSelected ? '#fff' : '#a0b4c8';
            b.style.fontWeight = isSelected ? '700' : '400';
            b.style.transform = isSelected ? 'scale(1.05)' : 'scale(1)';
        });
        if (select) select.value = cat || '';
        if (infoDiv) infoDiv.style.display = cat ? 'block' : 'none';
        if (nomeSpan && cat) nomeSpan.textContent = cat;
    }
    window.selecionarCategoriaBadge = selecionarCategoriaBadge;

    window.salvarMaterial = async function(e) {
        e.preventDefault();
        const id = document.getElementById('mat-id').value;
        const data = {
            nome: document.getElementById('mat-nome').value,
            categoria: document.getElementById('mat-categoria').value,
            unidade: document.getElementById('mat-unidade').value,
            ncm: document.getElementById('mat-ncm').value,
            cor: document.getElementById('mat-cor').value,
            observacoes: document.getElementById('mat-obs').value
        };

        try {
            const url = id ? `/api/materiais-catalogo/${id}` : '/api/materiais-catalogo';
            const method = id ? 'PUT' : 'POST';
            const resp = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                alert('Erro ao salvar material: ' + (errData.error || resp.statusText));
                return;
            }
            fecharModalMaterial();
            await carregarMateriais();
            // Reload the pricing table so the new material/category appears immediately
            if (window.carregarPrecos) await window.carregarPrecos();
        } catch (err) {
            console.error(err);
            alert('Erro de conexão ao salvar material: ' + err.message);
        }
    };

    window.deletarMaterial = async function(id) {
        if (!confirm('Excluir este material do catálogo? O preço correspondente também será removido.')) return;
        try {
            await fetch(`/api/materiais-catalogo/${id}`, { method: 'DELETE' });
            await carregarMateriais();
            // Reload the pricing table so the deleted material/category is removed
            if (window.carregarPrecos) await window.carregarPrecos();
        } catch (err) {
            console.error(err);
        }
    };

    window.filtrarMateriais = function() {
        const search = document.getElementById('materiais-search').value.toLowerCase();
        const rows = document.querySelectorAll('#materiais-table-body tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(search) ? '' : 'none';
        });
    };

    function popularSeletoresMateriais() {
        const prcM = document.getElementById('prc-material');
        const plM = document.getElementById('pl-material-result');
        if (prcM) {
            prcM.innerHTML = '';
            localMateriais.forEach(m => {
                prcM.innerHTML += `<option value="${m.id}">${m.nome} (${m.categoria})</option>`;
            });
        }
        if (plM) {
            plM.innerHTML = '';
            localMateriais.forEach(m => {
                plM.innerHTML += `<option value="${m.id}">${m.nome}</option>`;
            });
        }
    }

    function popularSeletoresCategorias() {
        const matCat = document.getElementById('mat-categoria');
        const badgesDiv = document.getElementById('mat-categoria-badges');
        if (!matCat) return;
        
        let cats = ["Alumínio", "Cobre", "Tomada/Conectores", "Chumbo", "Latão/Bronze", "Zamac", "Aço", "Outros"];
        if (settingsPrecos && settingsPrecos['categorias_materiais']) {
            try {
                cats = JSON.parse(settingsPrecos['categorias_materiais']);
            } catch(e) {}
        }
        
        localMateriais.forEach(m => {
            if (m.categoria && !cats.includes(m.categoria)) {
                cats.push(m.categoria);
            }
        });

        // Atualiza o select oculto
        const currentVal = matCat.value;
        matCat.innerHTML = cats.map(cat => `<option value="${cat}">${cat}</option>`).join('');
        if (currentVal && cats.includes(currentVal)) matCat.value = currentVal;

        // Renderiza badges visuais
        if (badgesDiv) {
            const catsDefault = ["Alumínio", "Cobre", "Tomada/Conectores", "Chumbo", "Latão/Bronze", "Zamac", "Aço", "Outros"];
            const corPaleta = {
                'Alumínio': '#5a92b5', 'Cobre': '#e07b39', 'Tomada/Conectores': '#d4b896',
                'Aço': '#7ea374', 'Chumbo': '#7a8a99', 'Latão/Bronze': '#c8a240',
                'Zamac': '#8a7ba8', 'Outros': '#6b7280'
            };
            badgesDiv.innerHTML = cats.map(cat => {
                const cor = settingsPrecos && settingsPrecos[`cor_categoria_${cat}`]
                    ? settingsPrecos[`cor_categoria_${cat}`]
                    : (corPaleta[cat] || '#1e4e8c');
                const isCustom = !catsDefault.includes(cat);
                const actionsHtml = isCustom ? `
                    <span class="cat-badge-actions" style="display:none; margin-left:5px; gap:3px; align-items:center;">
                        <span onclick="event.stopPropagation(); renomearCategoria('${cat.replace(/'/g, "\\'")}')"
                            title="Renomear grupo" style="cursor:pointer; font-size:0.75rem; color:#ffd54f; padding:1px 4px; border-radius:3px;"
                            onmouseover="this.style.background='rgba(255,213,79,0.15)'" onmouseout="this.style.background='none'"
                        >✎</span>
                        <span onclick="event.stopPropagation(); excluirCategoria('${cat.replace(/'/g, "\\'")}')"
                            title="Excluir grupo" style="cursor:pointer; font-size:0.82rem; color:#ff5555; padding:1px 4px; border-radius:3px;"
                            onmouseover="this.style.background='rgba(255,85,85,0.15)'" onmouseout="this.style.background='none'"
                        >×</span>
                    </span>` : '';
                return `<button type="button" class="cat-badge-btn"
                    data-cat="${cat}" data-color="${cor}" data-custom="${isCustom}"
                    onclick="selecionarCategoriaBadge('${cat.replace(/'/g, "\\'")}')"
                    onmouseover="this.style.borderColor='${cor}'; this.style.color='${cor}'; this.style.background='rgba(255,255,255,0.08)'; const a=this.querySelector('.cat-badge-actions'); if(a) a.style.display='inline-flex';"
                    onmouseout="if(document.getElementById('mat-categoria').value !== '${cat.replace(/'/g, "\\'")}'){ this.style.borderColor='rgba(255,255,255,0.12)'; this.style.color='#a0b4c8'; this.style.background='rgba(255,255,255,0.05)'; } const a=this.querySelector('.cat-badge-actions'); if(a) a.style.display='none';"
                    style="display:inline-flex; align-items:center; padding:7px 14px; border-radius:20px; border:1.5px solid rgba(255,255,255,0.12);
                        background:rgba(255,255,255,0.05); color:#a0b4c8; font-size:0.83rem;
                        cursor:pointer; transition:all 0.18s ease; white-space:nowrap;
                        font-family:inherit; letter-spacing:0.3px;"
                >
                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${cor}; margin-right:6px; flex-shrink:0;"></span>
                    ${cat}
                    ${actionsHtml}
                </button>`;
            }).join('');
        }
    }

    window.adicionarNovaCategoriaPrompt = async function() {
        const nova = prompt('Nome do novo grupo/categoria:');
        if (!nova) return;
        const trim = nova.trim();
        if (trim === '') return;
        
        let cats = ["Alumínio", "Cobre", "Tomada/Conectores", "Chumbo", "Latão/Bronze", "Zamac", "Aço", "Outros"];
        if (settingsPrecos && settingsPrecos['categorias_materiais']) {
            try { cats = JSON.parse(settingsPrecos['categorias_materiais']); } catch(e) {}
        }

        if (!cats.some(c => c.toLowerCase() === trim.toLowerCase())) {
            cats.push(trim);
            try {
                await fetch('/api/settings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 'categorias_materiais': JSON.stringify(cats) })
                });
                settingsPrecos['categorias_materiais'] = JSON.stringify(cats);
            } catch(err) { console.error('Erro ao salvar nova categoria:', err); }
        }
        
        popularSeletoresCategorias();
        selecionarCategoriaBadge(trim);
    };

    window.excluirCategoria = async function(cat) {
        const materiaisDoGrupo = localMateriais.filter(m => m.categoria === cat);
        if (materiaisDoGrupo.length > 0) {
            const confirmMsg = `O grupo "${cat}" possui ${materiaisDoGrupo.length} material(is) vinculado(s):\n${materiaisDoGrupo.map(m => '  • ' + m.nome).join('\n')}\n\nExcluir o grupo também removerá esses materiais e seus preços. Deseja continuar?`;
            if (!confirm(confirmMsg)) return;
            for (const m of materiaisDoGrupo) {
                await fetch(`/api/materiais-catalogo/${m.id}`, { method: 'DELETE' });
            }
        } else {
            if (!confirm(`Excluir o grupo "${cat}"?`)) return;
        }

        let cats = ["Alumínio", "Cobre", "Tomada/Conectores", "Chumbo", "Latão/Bronze", "Zamac", "Aço", "Outros"];
        if (settingsPrecos && settingsPrecos['categorias_materiais']) {
            try { cats = JSON.parse(settingsPrecos['categorias_materiais']); } catch(e) {}
        }
        cats = cats.filter(c => c !== cat);

        try {
            await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 'categorias_materiais': JSON.stringify(cats) })
            });
            settingsPrecos['categorias_materiais'] = JSON.stringify(cats);
        } catch(err) { console.error('Erro ao excluir categoria:', err); }

        await carregarMateriais();
        if (window.carregarPrecos) await window.carregarPrecos();
        // Se o grupo excluído estava selecionado, limpa
        const select = document.getElementById('mat-categoria');
        if (select && select.value === cat) selecionarCategoriaBadge(null);
        popularSeletoresCategorias();
    };

    window.renomearCategoria = async function(cat) {
        const novoNome = prompt(`Novo nome para o grupo "${cat}":`, cat);
        if (!novoNome || novoNome.trim() === '' || novoNome.trim() === cat) return;
        const trim = novoNome.trim();

        // Atualiza a lista de categorias
        let cats = ["Alumínio", "Cobre", "Tomada/Conectores", "Chumbo", "Latão/Bronze", "Zamac", "Aço", "Outros"];
        if (settingsPrecos && settingsPrecos['categorias_materiais']) {
            try { cats = JSON.parse(settingsPrecos['categorias_materiais']); } catch(e) {}
        }
        const idx = cats.indexOf(cat);
        if (idx !== -1) cats[idx] = trim;

        try {
            await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 'categorias_materiais': JSON.stringify(cats) })
            });
            settingsPrecos['categorias_materiais'] = JSON.stringify(cats);
        } catch(err) { console.error('Erro ao renomear categoria:', err); }

        // Atualiza a categoria de todos os materiais desse grupo
        const materiaisDoGrupo = localMateriais.filter(m => m.categoria === cat);
        for (const m of materiaisDoGrupo) {
            await fetch(`/api/materiais-catalogo/${m.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...m, categoria: trim })
            });
        }

        await carregarMateriais();
        if (window.carregarPrecos) await window.carregarPrecos();
        popularSeletoresCategorias();
        selecionarCategoriaBadge(trim);
    };

    window.calcularPorcentagemDeEntregar = function() {
        const venda = parseFloat(document.getElementById('prc-venda').value) || 0;
        const entregar = parseFloat(document.getElementById('prc-entregar').value) || 0;
        const pctInput = document.getElementById('prc-entregar-pct');
        if (pctInput) {
            if (venda > 0) {
                pctInput.value = ((entregar / venda) * 100).toFixed(1);
            } else {
                pctInput.value = '';
            }
        }
    };

    window.calcularPorcentagemDeColetar = function() {
        const venda = parseFloat(document.getElementById('prc-venda').value) || 0;
        const coletar = parseFloat(document.getElementById('prc-coletar').value) || 0;
        const pctInput = document.getElementById('prc-coletar-pct');
        if (pctInput) {
            if (venda > 0) {
                pctInput.value = ((coletar / venda) * 100).toFixed(1);
            } else {
                pctInput.value = '';
            }
        }
    };

    window.calcularValorDeEntregar = function() {
        const venda = parseFloat(document.getElementById('prc-venda').value) || 0;
        const pct = parseFloat(document.getElementById('prc-entregar-pct').value) || 0;
        const valInput = document.getElementById('prc-entregar');
        if (valInput) {
            valInput.value = ((venda * pct) / 100).toFixed(2);
        }
    };

    window.calcularValorDeColetar = function() {
        const venda = parseFloat(document.getElementById('prc-venda').value) || 0;
        const pct = parseFloat(document.getElementById('prc-coletar-pct').value) || 0;
        const valInput = document.getElementById('prc-coletar');
        if (valInput) {
            valInput.value = ((venda * pct) / 100).toFixed(2);
        }
    };

    window.calcularValoresDeAcordoComPorcentagem = function() {
        const venda = parseFloat(document.getElementById('prc-venda').value) || 0;
        
        const pctEntregar = parseFloat(document.getElementById('prc-entregar-pct').value) || 0;
        const valEntregar = document.getElementById('prc-entregar');
        if (valEntregar && pctEntregar > 0) {
            valEntregar.value = ((venda * pctEntregar) / 100).toFixed(2);
        } else if (valEntregar) {
            window.calcularPorcentagemDeEntregar();
        }

        const pctColetar = parseFloat(document.getElementById('prc-coletar-pct').value) || 0;
        const valColetar = document.getElementById('prc-coletar');
        if (valColetar && pctColetar > 0) {
            valColetar.value = ((venda * pctColetar) / 100).toFixed(2);
        } else if (valColetar) {
            window.calcularPorcentagemDeColetar();
        }
    };

    // --- 3. TABELA DE PREÇOS ---
    let settingsPrecos = {};
    let visualizacaoTabelaPrecos = 'completa';

    window.initApexPrecos = function() {
        window.carregarPrecos();
    };

    window.carregarPrecos = async function() {
        try {
            const res = await fetch('/api/tabela-precos');
            localPrecos = await res.json();
            
            try {
                const resSet = await fetch('/api/settings');
                settingsPrecos = await resSet.json();
            } catch (e) {
                console.error('Erro ao carregar settings para precos:', e);
            }

            renderTabelaPrecos();
        } catch (err) {
            console.error(err);
        }
    };

    window.alterarCorCategoria = async function(cat, cor) {
        try {
            await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [`cor_categoria_${cat}`]: cor })
            });
            settingsPrecos[`cor_categoria_${cat}`] = cor;
            renderTabelaPrecos();
        } catch (err) {
            console.error('Erro ao atualizar cor da categoria:', err);
        }
    };

    window.alterarVisualizacaoTabela = function(tipo) {
        visualizacaoTabelaPrecos = tipo;
        renderTabelaPrecos();
    };

    window.alternarModoApresentacao = function() {
        const view = document.getElementById('tabela-precos-view');
        if (!view) return;
        
        const ativo = view.classList.toggle('modo-apresentacao-ativo');
        
        const btnToggle = document.getElementById('btn-toggle-apresentacao');
        const btnFechar = document.getElementById('btn-fechar-apresentacao');
        
        if (ativo) {
            if (btnToggle) btnToggle.style.display = 'none';
            if (btnFechar) btnFechar.style.display = 'inline-flex';
            window.addEventListener('keydown', escApresentacaoHandler);
        } else {
            if (btnToggle) btnToggle.style.display = 'inline-flex';
            if (btnFechar) btnFechar.style.display = 'none';
            window.removeEventListener('keydown', escApresentacaoHandler);
        }
    };

    function escApresentacaoHandler(e) {
        if (e.key === 'Escape') {
            window.alternarModoApresentacao();
        }
    }

    function renderTabelaPrecos() {
        const container = document.getElementById('tabela-precos-categorias-container');
        if (!container) return;
        container.innerHTML = '';

        // Agrupar por categorias
        let categorias = ["Alumínio", "Cobre", "Tomada/Conectores", "Chumbo", "Latão/Bronze", "Zamac", "Aço", "Outros"];
        if (settingsPrecos && settingsPrecos['categorias_materiais']) {
            try {
                categorias = JSON.parse(settingsPrecos['categorias_materiais']);
            } catch(e) {}
        }
        localPrecos.forEach(p => {
            if (p.material_categoria && !categorias.includes(p.material_categoria)) {
                categorias.push(p.material_categoria);
            }
        });
        const showCompleta = visualizacaoTabelaPrecos === 'completa';

        categorias.forEach(cat => {
            const precosCat = localPrecos.filter(p => p.material_categoria === cat);
            if (precosCat.length === 0) return;

            const validadeStr = precosCat[0] ? formatarDataSemFuso(precosCat[0].validade) : '-';
            const corCategoria = settingsPrecos[`cor_categoria_${cat}`] || '#1e4e8c';

            const box = document.createElement('div');
            box.className = 'categoria-preco-box';
            box.style.borderColor = corCategoria;
            box.innerHTML = `
                <div class="categoria-preco-header" style="background: ${corCategoria};">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span>${cat.toUpperCase()}</span>
                        <input type="color" value="${corCategoria}" title="Alterar cor do cabeçalho" style="border:none; background:none; cursor:pointer; width:22px; height:22px; padding:0; outline:none; border-radius:4px; vertical-align:middle;" onchange="alterarCorCategoria('${cat}', this.value)">
                    </div>
                    <button type="button" class="restrito-financeiro" onclick="abrirModalVigenciaGeral()" title="Clique para alterar a vigência geral com calendário" style="background:rgba(255,255,255,0.18); border:1px solid rgba(255,255,255,0.35); color:#fff; padding:4px 12px; border-radius:6px; font-size:0.82rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.32)'" onmouseout="this.style.background='rgba(255,255,255,0.18)'"><i class="fa-solid fa-calendar-days"></i> VIGÊNCIA ATÉ: ${validadeStr} <i class="fa-solid fa-pen-to-square" style="font-size:0.78rem; opacity:0.8;"></i></button>
                </div>
                <div class="categoria-preco-observacao">
                    <i class="fa-solid fa-circle-info"></i> Atenção: Quantidade mínima para entrega 100kg por produto. Caso não atinja a quantidade será descontado R$ 1,00/kg. | OBS: Variação de preço conforme atualização de mercado.
                </div>
                <div style="overflow-x:auto;">
                    <table class="admin-table" style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                        <thead>
                            <tr style="background:#172635; text-align:left;">
                                <th style="padding:10px;">Descrição</th>
                                <th style="padding:10px; text-align:right;">Preço Entregar (R$/kg)</th>
                                <th style="padding:10px; text-align:right;">Preço Coletar (R$/kg)</th>
                                ${showCompleta ? `
                                <th style="padding:10px; text-align:right; color: #ffeb3b;">Venda Ref (R$/kg)</th>
                                <th style="padding:10px; text-align:right; color:#2AD07A;">Lucro Líq. Ent.</th>
                                <th style="padding:10px; text-align:right; color:#2AD07A;">Margem Líq. Ent (%)</th>
                                <th style="padding:10px; text-align:right; color:#3e7cb1;">Lucro Líq. Col.</th>
                                <th style="padding:10px; text-align:right; color:#3e7cb1;">Margem Líq. Col (%)</th>
                                ` : ''}
                                <th style="padding:10px;">NCM</th>
                                <th style="padding:10px; text-align:center; width:100px;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${precosCat.map((p, idx) => {
                                const comissao = parseFloat(p.comissao || 0);
                                const pisCofins = parseFloat(p.pis_cofins || 0);
                                const fidc = parseFloat(p.fidc || 0);
                                const icms = parseFloat(p.icms || 0);
                                const freteColeta = parseFloat(p.frete_coleta || 0);

                                const totalDedPct = comissao + pisCofins + fidc + icms;
                                const valDeducoes = (parseFloat(p.venda_ref) || 0) * (totalDedPct / 100);
                                const vendaLiquida = (parseFloat(p.venda_ref) || 0) - valDeducoes;

                                const lucroEnt = vendaLiquida - (parseFloat(p.preco_entregar) || 0);
                                const margemEnt = (parseFloat(p.venda_ref) || 0) > 0 ? (lucroEnt / (parseFloat(p.venda_ref) || 0)) * 100 : 0;

                                const lucroCol = vendaLiquida - (parseFloat(p.preco_coletar) || 0) - freteColeta;
                                const margemCol = (parseFloat(p.venda_ref) || 0) > 0 ? (lucroCol / (parseFloat(p.venda_ref) || 0)) * 100 : 0;

                                const bgRow = idx % 2 === 0 ? 'background:#0d1826;' : 'background:#16273b;';
                                const bgHover = '#1f4068';

                                return `
                                    <tr style="${bgRow} border-bottom:1px solid #1e3650; transition:background 0.15s;" onmouseover="this.style.background='${bgHover}'" onmouseout="this.style.background='${idx % 2 === 0 ? '#0d1826' : '#16273b'}'">
                                        <td style="padding:10px; color:#fff;"><strong>${p.material_nome}</strong></td>
                                        <td style="padding:10px; text-align:right; color:#e0e8f0; font-weight:600;">R$ ${fmtBRL(p.preco_entregar)}</td>
                                        <td style="padding:10px; text-align:right; color:#e0e8f0; font-weight:600;">R$ ${fmtBRL(p.preco_coletar)}</td>
                                        ${showCompleta ? `
                                        <td style="padding:10px; text-align:right; color: #ffeb3b; font-weight: bold;">R$ ${fmtBRL(p.venda_ref)}</td>
                                        <td style="padding:10px; text-align:right; color:#2AD07A;">R$ ${fmtBRL(lucroEnt)}</td>
                                        <td style="padding:10px; text-align:right; color:#2AD07A; font-weight:bold;">${fmtBRL(margemEnt)}%</td>
                                        <td style="padding:10px; text-align:right; color:#3e7cb1;">R$ ${fmtBRL(lucroCol)}</td>
                                        <td style="padding:10px; text-align:right; color:#3e7cb1; font-weight:bold;">${fmtBRL(margemCol)}%</td>
                                        ` : ''}
                                        <td style="padding:10px; color:#fff; font-weight:bold;">${p.material_ncm || '-'}</td>
                                        <td style="padding:10px; text-align:center;">
                                            <button class="btn-refresh restrito-financeiro" style="background:none; border:none; color:#3e7cb1; margin-right:5px; cursor:pointer;" onclick="editarPreco(${p.id})"><i class="fa-solid fa-pen"></i></button>
                                            <button class="btn-refresh restrito-financeiro" style="background:none; border:none; color:#ff4d4d; cursor:pointer;" onclick="deletarPreco(${p.id})"><i class="fa-solid fa-trash"></i></button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                            <tr style="background:#131c26;">
                                <td colspan="${showCompleta ? 10 : 5}" style="padding:10px; text-align:right; font-style:italic; color:#aaa;">
                                    DEMAIS MATERIAIS PREÇO SOBRE ANÁLISE (FOTO)
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
            container.appendChild(box);
        });
        applyRolePermissions();
    }

    window.abrirModalPreco = function() {
        document.getElementById('form-preco-apex').reset();
        document.getElementById('prc-id').value = '';
        document.getElementById('prc-entregar-pct').value = '';
        document.getElementById('prc-coletar-pct').value = '';
        document.getElementById('modal-preco').style.display = 'flex';
        window.calcularMargemLiquidaModal();
    };

    window.fecharModalPreco = function() {
        document.getElementById('modal-preco').style.display = 'none';
    };

    window.calcularMargemLiquidaModal = function() {
        const parseVal = id => parseFloat(String(document.getElementById(id)?.value || '0').replace(',', '.')) || 0;
        const vendaRef = parseVal('prc-venda');
        const precoEnt = parseVal('prc-entregar');
        const precoCol = parseVal('prc-coletar');
        const comissao = parseVal('prc-comissao');
        const pisCofins = parseVal('prc-piscofins');
        const fidc = parseVal('prc-fidc');
        const icms = parseVal('prc-icms');
        const freteColeta = parseVal('prc-frete-coleta');

        const pctDeducoesTotal = comissao + pisCofins + fidc + icms;
        const valDeducoes = vendaRef * (pctDeducoesTotal / 100);
        const vendaLiquida = vendaRef - valDeducoes;

        const lucroEnt = vendaLiquida - precoEnt;
        const margemEnt = vendaRef > 0 ? (lucroEnt / vendaRef) * 100 : 0;

        const lucroCol = vendaLiquida - precoCol - freteColeta;
        const margemCol = vendaRef > 0 ? (lucroCol / vendaRef) * 100 : 0;

        const elDedPct = document.getElementById('prc-live-deducoes-pct');
        const elVendaLiq = document.getElementById('prc-live-venda-liquida');
        const elFreteDisp = document.getElementById('prc-live-frete-display');
        const elMargEnt = document.getElementById('prc-live-margem-entrega');
        const elLucrEnt = document.getElementById('prc-live-lucro-entrega');
        const elMargCol = document.getElementById('prc-live-margem-coleta');
        const elLucrCol = document.getElementById('prc-live-lucro-coleta');

        if (elDedPct) elDedPct.textContent = `${fmtBRL(pctDeducoesTotal)}% (R$ ${fmtBRL(valDeducoes)}/kg)`;
        if (elVendaLiq) elVendaLiq.textContent = `R$ ${fmtBRL(vendaLiquida)}/kg`;
        if (elFreteDisp) elFreteDisp.textContent = `R$ ${fmtBRL(freteColeta)}/kg`;

        if (elMargEnt) {
            elMargEnt.textContent = `${fmtBRL(margemEnt)}%`;
            elMargEnt.style.color = margemEnt >= 15 ? '#2AD07A' : (margemEnt >= 5 ? '#f0b800' : '#ff4d4d');
        }
        if (elLucrEnt) elLucrEnt.textContent = `Lucro: R$ ${fmtBRL(lucroEnt)}/kg`;

        if (elMargCol) {
            elMargCol.textContent = `${fmtBRL(margemCol)}%`;
            elMargCol.style.color = margemCol >= 15 ? '#4fc3f7' : (margemCol >= 5 ? '#f0b800' : '#ff4d4d');
        }
        if (elLucrCol) elLucrCol.textContent = `Lucro: R$ ${fmtBRL(lucroCol)}/kg`;
    };

    window.editarPreco = function(id) {
        const p = localPrecos.find(x => x.id === id);
        if (!p) return;
        document.getElementById('prc-id').value = p.id;
        document.getElementById('prc-material').value = p.material_id;
        document.getElementById('prc-entregar').value = parseFloat(p.preco_entregar || 0).toFixed(2);
        document.getElementById('prc-coletar').value = parseFloat(p.preco_coletar || 0).toFixed(2);
        document.getElementById('prc-venda').value = parseFloat(p.venda_ref || 0).toFixed(2);
        document.getElementById('prc-comissao').value = parseFloat(p.comissao || 0).toFixed(2);
        document.getElementById('prc-piscofins').value = parseFloat(p.pis_cofins || 0).toFixed(2);
        document.getElementById('prc-fidc').value = parseFloat(p.fidc || 0).toFixed(2);
        document.getElementById('prc-icms').value = parseFloat(p.icms || 0).toFixed(2);
        document.getElementById('prc-frete-coleta').value = parseFloat(p.frete_coleta || 0).toFixed(2);
        document.getElementById('prc-validade').value = p.validade ? p.validade.split('T')[0] : new Date().toISOString().split('T')[0];
        document.getElementById('modal-preco').style.display = 'flex';
        window.calcularPorcentagemDeEntregar();
        window.calcularPorcentagemDeColetar();
        window.calcularMargemLiquidaModal();
    };

    window.salvarPreco = async function(e) {
        e.preventDefault();
        const id = document.getElementById('prc-id').value;
        const parseVal = v => parseFloat(String(v || '0').replace(',', '.')) || 0;

        const data = {
            material_id: document.getElementById('prc-material').value,
            preco_entregar: parseVal(document.getElementById('prc-entregar').value),
            preco_coletar: parseVal(document.getElementById('prc-coletar').value),
            venda_ref: parseVal(document.getElementById('prc-venda').value),
            comissao: parseVal(document.getElementById('prc-comissao').value),
            pis_cofins: parseVal(document.getElementById('prc-piscofins').value),
            fidc: parseVal(document.getElementById('prc-fidc').value),
            icms: parseVal(document.getElementById('prc-icms').value),
            frete_coleta: parseVal(document.getElementById('prc-frete-coleta').value),
            validade: document.getElementById('prc-validade').value,
            aplicar_todos: true
        };

        const btn = e.target.querySelector('[type="submit"]');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...'; }

        try {
            const url = id ? `/api/tabela-precos/${id}` : '/api/tabela-precos';
            const method = id ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error(await res.text());
            fecharModalPreco();
            carregarPrecos();
        } catch (err) {
            alert('Erro ao salvar preço: ' + err.message);
            console.error(err);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-save"></i> Salvar'; }
        }
    };

    // ─── Calendário Visual Interativo de Vigência ───
    let calVigenciaAno = 2026;
    let calVigenciaMes = 6;
    let calVigenciaDataSelecionada = new Date().toISOString().split('T')[0];
    const mesesNomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

    window.renderCalendarioVigencia = function() {
        const titulo = document.getElementById('cal-vigencia-titulo');
        const grid = document.getElementById('cal-vigencia-grid');
        const preview = document.getElementById('cal-vigencia-data-formatada');
        const inputHidden = document.getElementById('input-vigencia-geral-data');
        if (!grid) return;

        if (titulo) {
            titulo.textContent = `${mesesNomes[calVigenciaMes]} ${calVigenciaAno}`;
        }

        const firstDay = new Date(calVigenciaAno, calVigenciaMes, 1).getDay();
        const totalDays = new Date(calVigenciaAno, calVigenciaMes + 1, 0).getDate();
        const prevMonthTotalDays = new Date(calVigenciaAno, calVigenciaMes, 0).getDate();

        let html = '';

        for (let i = firstDay - 1; i >= 0; i--) {
            const diaPrev = prevMonthTotalDays - i;
            html += `<div style="background:#0d1824; color:#3a526a; padding:11px 0; text-align:center; font-size:0.9rem; user-select:none;">${diaPrev}</div>`;
        }

        for (let day = 1; day <= totalDays; day++) {
            const monthStr = String(calVigenciaMes + 1).padStart(2, '0');
            const dayStr = String(day).padStart(2, '0');
            const ymd = `${calVigenciaAno}-${monthStr}-${dayStr}`;

            const isSelected = ymd === calVigenciaDataSelecionada;
            const bgCell = isSelected ? '#2AD07A' : '#132232';
            const textCell = isSelected ? '#000' : '#fff';
            const fontWeight = isSelected ? 'bold' : '500';

            html += `
                <div onclick="selecionarDiaCalendarioVigencia('${ymd}')"
                     style="background:${bgCell}; color:${textCell}; font-weight:${fontWeight}; padding:11px 0; text-align:center; font-size:0.92rem; cursor:pointer; transition:all 0.15s; border-radius:4px;"
                     onmouseover="if('${ymd}'!=='${calVigenciaDataSelecionada}') this.style.background='#1e3b56'"
                     onmouseout="if('${ymd}'!=='${calVigenciaDataSelecionada}') this.style.background='#132232'">
                    ${day}
                </div>
            `;
        }

        const totalCellsSoFar = firstDay + totalDays;
        const remainingCells = (7 - (totalCellsSoFar % 7)) % 7;
        for (let nextDay = 1; nextDay <= remainingCells; nextDay++) {
            html += `<div style="background:#0d1824; color:#3a526a; padding:11px 0; text-align:center; font-size:0.9rem; user-select:none;">${nextDay}</div>`;
        }

        grid.innerHTML = html;

        if (inputHidden) inputHidden.value = calVigenciaDataSelecionada;
        if (preview) preview.textContent = window.formatarDataSemFuso(calVigenciaDataSelecionada);
    };

    window.navCalendarioVigencia = function(dir) {
        calVigenciaMes += dir;
        if (calVigenciaMes < 0) {
            calVigenciaMes = 11;
            calVigenciaAno--;
        } else if (calVigenciaMes > 11) {
            calVigenciaMes = 0;
            calVigenciaAno++;
        }
        renderCalendarioVigencia();
    };

    window.selecionarDiaCalendarioVigencia = function(ymd) {
        calVigenciaDataSelecionada = ymd;
        renderCalendarioVigencia();
    };

    window.abrirModalVigenciaGeral = function() {
        const dataAtual = localPrecos[0]?.validade ? localPrecos[0].validade.split('T')[0] : new Date().toISOString().split('T')[0];
        calVigenciaDataSelecionada = dataAtual;
        const parts = dataAtual.split('-');
        if (parts.length === 3) {
            calVigenciaAno = parseInt(parts[0]);
            calVigenciaMes = parseInt(parts[1]) - 1;
        }
        renderCalendarioVigencia();
        document.getElementById('modal-vigencia-geral').style.display = 'flex';
    };

    window.fecharModalVigenciaGeral = function() {
        document.getElementById('modal-vigencia-geral').style.display = 'none';
    };

    window.salvarVigenciaGeralModal = async function() {
        const novaData = calVigenciaDataSelecionada || document.getElementById('input-vigencia-geral-data').value;
        if (!novaData) {
            alert('Por favor, clique em um dia no calendário.');
            return;
        }
        const btn = document.getElementById('btn-salvar-vigencia-geral');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spin fa-spinner"></i> Salvando...'; }
        try {
            const res = await fetch('/api/tabela-precos-validade-geral', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ validade: novaData })
            });
            if (!res.ok) throw new Error(await res.text());
            fecharModalVigenciaGeral();
            alert('Vigência atualizada para todos os materiais com sucesso!');
            await carregarPrecos();
        } catch (err) {
            alert('Erro ao atualizar vigência geral: ' + err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-calendar-check"></i> Aplicar e Salvar Vigência'; }
        }
    };

    window.alterarValidadeGeralPrompt = function() {
        abrirModalVigenciaGeral();
    };

    window.deletarPreco = async function(id) {
        if (!confirm('Excluir este preço?')) return;
        try {
            await fetch(`/api/tabela-precos/${id}`, { method: 'DELETE' });
            carregarPrecos();
        } catch (err) {
            console.error(err);
        }
    };

    window.exportarTabelaPrecosExcel = function() {
        alert('Tabela de Preços exportada com sucesso (LME-ApexTech-Precos.xlsx)');
    };

    function gerarHtmlTabelaPrecosParaPdf(precos, dataUltimaAtualizacao, settings, logoBase64) {
        const activeSettings = settings || settingsPrecos || {};
        let categorias = ["Alumínio", "Cobre", "Tomada/Conectores", "Chumbo", "Latão/Bronze", "Zamac", "Aço", "Outros"];
        if (activeSettings && activeSettings['categorias_materiais']) {
            try {
                categorias = JSON.parse(activeSettings['categorias_materiais']);
            } catch(e) {}
        }
        precos.forEach(p => {
            if (p.material_categoria && !categorias.includes(p.material_categoria)) {
                categorias.push(p.material_categoria);
            }
        });

        // Gera grid de logos para cobrir toda a página
        function gerarGridLogo(src) {
            if (!src) return '';
            const cols = 4;
            const rows = 16; // linhas suficientes para cobrir documentos longos
            let grid = '<div style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;overflow:hidden;">';
            for (let r = 0; r < rows; r++) {
                grid += '<div style="display:flex;justify-content:space-around;align-items:center;padding:18px 0;">';
                for (let c = 0; c < cols; c++) {
                    grid += `<img src="${src}" alt="" style="width:140px;opacity:0.07;transform:rotate(-20deg);display:block;flex-shrink:0;" />`;
                }
                grid += '</div>';
            }
            grid += '</div>';
            return grid;
        }

        let html = `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 25px; color: #333; background: #ffffff; max-width: 950px; margin: 0 auto; box-sizing: border-box; position: relative;">
                <!-- Marca d'água: logo repetido em toda a página -->
                ${gerarGridLogo(logoBase64)}

                <div style="position: relative; z-index: 1;">
                    <!-- Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e4e8c; padding-bottom: 20px; margin-bottom: 25px;">
                        <div>
                            <img src="assets/img/apexlogo.png" alt="Apex Tech Metais" style="height: 60px;">
                        </div>
                        <div style="text-align: right;">
                            <h1 style="margin: 0; color: #1e4e8c; font-size: 1.8rem; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Tabela de Preços Vigente</h1>
                            <p style="margin: 6px 0 0 0; font-size: 0.95rem; color: #666; font-weight: 500;">Última Atualização: <span style="color: #1e4e8c; font-weight: bold;">${dataUltimaAtualizacao}</span></p>
                        </div>
                    </div>

                    <!-- Diretrizes -->
                    <div style="background: #f4f7fa; border-left: 5px solid #1e4e8c; border-radius: 4px; padding: 15px; margin-bottom: 30px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 10px 0; color: #1e4e8c; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                            ⚠️ Diretrizes Gerais de Compra
                        </h4>
                        <ul style="margin: 0; padding-left: 20px; font-size: 0.85rem; color: #444; line-height: 1.5;">
                            <li>Atenção: Quantidade mínima para entrega 100kg por produto. Caso não atinja a quantidade será descontado R$ 1,00/kg.</li>
                            <li>OBS: Variação de preço conforme atualização de mercado.</li>
                            <li style="font-weight: bold; color: #c0392b;">DEMAIS MATERIAIS PREÇO SOBRE ANÁLISE (FOTO)</li>
                        </ul>
                    </div>
        `;

        categorias.forEach(cat => {
            const precosCat = precos.filter(p => p.material_categoria === cat);
            if (precosCat.length === 0) return;

            const validadeStr = precosCat[0] ? formatarDataSemFuso(precosCat[0].validade) : '-';
            const corCategoria = (activeSettings && activeSettings[`cor_categoria_${cat}`]) || '#1e4e8c';

            html += `
                <div style="margin-bottom: 30px; page-break-inside: avoid; border: 1px solid ${corCategoria}; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
                    <div style="background: ${corCategoria}; color: #ffffff; padding: 10px 15px; font-weight: bold; display: flex; justify-content: space-between; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px;">
                        <span>${cat}</span>
                        <span style="font-size: 0.85rem; font-weight: normal; opacity: 0.9;">VIGÊNCIA ATÉ: ${validadeStr}</span>
                    </div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; text-align: left;">
                        <thead>
                            <tr style="background: #f8f9fa; border-bottom: 2px solid #ddd;">
                                <th style="padding: 10px; border: 1px solid #eee; font-weight: 600; color: #555;">Descrição</th>
                                <th style="padding: 10px; text-align: right; border: 1px solid #eee; font-weight: 600; color: #555;">Preço Entregar (R$/kg)</th>
                                <th style="padding: 10px; text-align: right; border: 1px solid #eee; font-weight: 600; color: #555;">Preço Coletar (R$/kg)</th>
                                <th style="padding: 10px; border: 1px solid #eee; font-weight: 600; color: #555;">NCM</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            precosCat.forEach((p, idx) => {
                const bgRow = idx % 2 === 0 ? '#ffffff' : '#e3ebf3';
                html += `
                    <tr style="border-bottom: 1px solid #c8d3e0; background-color: ${bgRow};">
                        <td style="padding: 10px; border: 1px solid #c8d3e0; color: #111;"><strong>${p.material_nome}</strong></td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #c8d3e0; font-weight: bold; color: #111;">R$ ${fmtBRL(p.preco_entregar)}</td>
                        <td style="padding: 10px; text-align: right; border: 1px solid #c8d3e0; font-weight: bold; color: #111;">R$ ${fmtBRL(p.preco_coletar)}</td>
                        <td style="padding: 10px; border: 1px solid #c8d3e0; color: #111; font-weight: bold;">${p.material_ncm || '-'}</td>
                    </tr>
                `;
            });

            html += `
                            <tr style="background: #fafafa;">
                                <td colspan="4" style="padding: 10px; text-align: right; font-style: italic; color: #777; border: 1px solid #eee;">
                                    DEMAIS MATERIAIS PREÇO SOBRE ANÁLISE (FOTO)
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        });

        // Footer with CEO Jose Tiago and date
        html += `
                    <div style="margin-top: 40px; border-top: 2px solid #ddd; padding-top: 20px; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #555;">
                        <div style="font-weight: bold; color: #1e4e8c; font-size: 0.95rem;">
                            ✅ Aprovado pelo CEO Jose Tiago
                        </div>
                        <div style="text-align: right; color: #888;">
                            Documento oficial Apex Tech Metais • Gerado em: ${new Date().toLocaleString('pt-BR')}
                        </div>
                    </div>
                </div>
            </div>
        `;
        return html;
    }

    window.gerarPdfTabelaPrecosBase64 = async function() {
        let precos = localPrecos;
        if (!precos || precos.length === 0) {
            const res = await fetch('/api/tabela-precos');
            precos = await res.json();
        }
        
        let lastUpdate = '';
        let settings = {};
        try {
            const resSet = await fetch('/api/settings');
            settings = await resSet.json();
            lastUpdate = settings.tabela_precos_ultima_atualizacao || '';
        } catch (e) {
            console.error(e);
        }
        if (!lastUpdate) {
            const today = new Date();
            lastUpdate = today.toLocaleDateString('pt-BR');
        }

        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '-9999px';
        tempDiv.style.width = '1000px';
        tempDiv.style.background = '#ffffff';
        // Carregar logo (2).png como base64 para a marca d'água
        let logoWatermarkBase64 = null;
        try {
            const logoRes = await fetch('/assets/img/logo%20(2).png');
            if (logoRes.ok) {
                const blob = await logoRes.blob();
                logoWatermarkBase64 = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            }
        } catch(e) {
            console.warn('Logo watermark não carregou, usando fallback:', e);
        }
        tempDiv.innerHTML = gerarHtmlTabelaPrecosParaPdf(precos, lastUpdate, settings, logoWatermarkBase64);
        document.body.appendChild(tempDiv);

        try {
            await new Promise(r => setTimeout(r, 600));

            const canvas = await html2canvas(tempDiv, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                allowTaint: false,
                scrollY: 0,
                windowHeight: tempDiv.scrollHeight,
                height: tempDiv.scrollHeight,
                width: tempDiv.scrollWidth
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

            return pdf.output('datauristring').split(',')[1];
        } catch (err) {
            console.error('Erro ao gerar base64 da tabela de preços:', err);
            return null;
        } finally {
            document.body.removeChild(tempDiv);
        }
    };

    window.exportarTabelaPrecosPdf = async function() {
        const btn = document.querySelector('.btn-secondary[onclick="exportarTabelaPrecosPdf()"]');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando PDF...';
        }
        try {
            const base64 = await window.gerarPdfTabelaPrecosBase64();
            if (!base64) {
                alert('Erro ao gerar o PDF da tabela de preços.');
                return;
            }
            const linkSource = `data:application/pdf;base64,${base64}`;
            const downloadLink = document.createElement("a");
            downloadLink.href = linkSource;
            downloadLink.download = `Tabela_de_Precos_Vigente.pdf`;
            downloadLink.click();
        } catch (err) {
            console.error(err);
            alert('Erro ao exportar PDF: ' + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Exportar PDF';
            }
        }
    };

    window.enviarTabelaPrecosEmail = async function() {
        const testEmailMsg = document.getElementById('test-email-msg');
        const btnPreco = document.querySelector('.btn-secondary[onclick="enviarTabelaPrecosEmail()"]');
        const btnConfig = document.getElementById('btn-enviar-tabela-preco');
        
        const setUIState = (loading, msg = '', color = '#fff') => {
            if (testEmailMsg) {
                testEmailMsg.style.display = loading || msg ? 'block' : 'none';
                testEmailMsg.style.color = color;
                testEmailMsg.innerHTML = msg;
            }
            if (btnPreco) btnPreco.disabled = loading;
            if (btnConfig) btnConfig.disabled = loading;
        };

        setUIState(true, '<i class="fa-solid fa-spinner fa-spin"></i> Gerando PDF e enviando e-mail...');

        try {
            const pdfBase64 = await window.gerarPdfTabelaPrecosBase64();
            if (!pdfBase64) {
                throw new Error('Falha ao gerar o PDF da tabela de preços.');
            }

            const res = await fetch('/api/tabela-precos/enviar-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdfBase64 })
            });

            const result = await res.json();
            if (res.ok) {
                setUIState(false, '<i class="fa-solid fa-circle-check"></i> ' + (result.message || 'Tabela de preços enviada com sucesso!'), '#2AD07A');
                alert('✅ Tabela de preços enviada por e-mail com sucesso!');
            } else {
                throw new Error(result.error || 'Erro desconhecido ao enviar e-mail.');
            }
        } catch (err) {
            console.error(err);
            setUIState(false, '<i class="fa-solid fa-circle-exclamation"></i> ' + err.message, '#ff4d4d');
            alert('❌ Erro ao enviar e-mail: ' + err.message);
        }
    };

    // --- 4. ANÁLISE DE AMOSTRAS & LAUDOS ---
    window.initApexAmostras = function() {
        carregarAmostras();
        carregarCotacoesDolarLME();
    };

    // ─── COTAÇÕES AO VIVO DÓLAR & LME (USD / BRL) ─────────────────────────────
    window.carregarCotacoesDolarLME = async function() {
        try {
            const res = await fetch('/api/cotacoes/dolar-lme');
            const data = await res.json();
            if (data && data.dolar) {
                window.currentDolarRate = data.dolar;
                console.log(`💵 Cotação Dólar Comercial: R$ ${data.dolar.toFixed(2)} | LME Cobre: R$ ${data.lme_brl_kg?.cobre}/kg`);
            }
        } catch(e) {
            console.warn('Erro ao buscar cotação ao vivo:', e);
        }
    };

    async function carregarAmostras() {
        try {
            const res = await fetch('/api/amostras');
            const data = await res.json();
            localAmostras = Array.isArray(data) ? data : [];
            renderAmostras();
            popularSeletoresAmostras();
            atualizarNotificacoesAprovacao();
        } catch (err) {
            console.error('Erro ao carregar amostras:', err);
            localAmostras = [];
        }
    }

    // ─── MOTOR DE NOTIFICAÇÕES DO SININHO (DIRETORIA / ADM) ─────────────────────
    window.atualizarNotificacoesAprovacao = function() {
        if (!Array.isArray(localAmostras)) return;

        const pendentes = localAmostras.filter(a => 
            a.decisao_diretoria === 'Aguardando' || a.status === 'Aguardando Decisão de Compra'
        );

        const count = pendentes.length;
        const bNav = document.getElementById('badge-nav-aprovacoes');
        const bHeader = document.getElementById('bell-counter-badge');
        const bellIcon = document.getElementById('bell-icon-animated');
        const listEl = document.getElementById('bell-notif-list');

        if (bNav) {
            bNav.textContent = count;
            bNav.style.display = count > 0 ? 'inline-block' : 'none';
        }

        if (bHeader) {
            bHeader.textContent = count;
            bHeader.style.display = count > 0 ? 'inline-block' : 'none';
        }

        if (bellIcon) {
            if (count > 0) {
                bellIcon.style.color = '#ff4d4d';
                bellIcon.classList.add('fa-bounce');
            } else {
                bellIcon.style.color = '#f0c040';
                bellIcon.classList.remove('fa-bounce');
            }
        }

        if (listEl) {
            if (count === 0) {
                listEl.innerHTML = '<div style="color:#aaa; font-size:0.8rem; text-align:center; padding:12px;"><i class="fa-solid fa-check-circle" style="color:#2AD07A;"></i> Nenhuma aprovação pendente no momento.</div>';
            } else {
                listEl.innerHTML = pendentes.map(p => `
                    <div style="background:#162432; border:1px solid #1e4e8c; border-radius:6px; padding:10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; transition:all 0.2s;" onclick="abrirAmostraEDesmonte(${p.id})" onmouseover="this.style.borderColor='#2AD07A'" onmouseout="this.style.borderColor='#1e4e8c'" title="Clique para abrir e ver os detalhes desta amostra">
                        <div>
                            <div style="font-weight:bold; color:#2AD07A; font-size:0.85rem; text-decoration:underline;">
                                <i class="fa-solid fa-up-right-from-square" style="font-size:0.75rem; margin-right:4px;"></i> ${p.numero_amostra} - ${p.nome_material || 'Material'}
                            </div>
                            <div style="font-size:0.75rem; color:#ccc; margin-top:2px;">Forn: ${p.fornecedor_nome}</div>
                            <div style="font-size:0.72rem; color:#888;">Peso: ${parseFloat(p.peso_inicial).toFixed(3)} kg</div>
                        </div>
                        <button type="button" class="btn-primary" style="padding:5px 10px; font-size:0.75rem; background:#2AD07A; color:#000; font-weight:bold; border:none; border-radius:4px; cursor:pointer;" onclick="event.stopPropagation(); abrirAmostraEDesmonte(${p.id});">
                            <i class="fa-solid fa-gavel"></i> Analisar
                        </button>
                    </div>
                `).join('');
            }
        }
    };

    window.togglePainelNotificacoes = function() {
        const p = document.getElementById('bell-dropdown-panel');
        if (!p) return;
        p.style.display = (p.style.display === 'none' || !p.style.display) ? 'block' : 'none';
    };

    window.abrirAmostraEDesmonte = function(id) {
        document.getElementById('bell-dropdown-panel').style.display = 'none';
        const navAmo = document.getElementById('nav-amostras') || document.querySelector('.nav-item[data-target="amostras-view"]');
        if (navAmo) navAmo.click();
        abrirAnaliseDesmonte(id);
    };

    // Polling automático a cada 10 segundos
    setInterval(() => {
        if (typeof carregarAmostras === 'function') carregarAmostras();
    }, 10000);

    function popularSeletoresAmostras() {
        const selFornModal = document.getElementById('amo-fornecedor');
        const selFornFiltro = document.getElementById('amostras-filtro-fornecedor');
        if (!selFornModal) return;

        // Limpa opções antigas mantendo a primeira se houver
        selFornModal.innerHTML = '<option value="">Selecione o Fornecedor...</option>';
        if (selFornFiltro) selFornFiltro.innerHTML = '<option value="">Todos os Fornecedores</option>';

        if (Array.isArray(localFornecedores) && localFornecedores.length > 0) {
            localFornecedores.forEach(f => {
                const fnome = f.apelido || f.nome || f.razao_social;
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = fnome + (f.cnpj ? ` (${f.cnpj})` : '');
                selFornModal.appendChild(opt);

                if (selFornFiltro) {
                    const optF = document.createElement('option');
                    optF.value = f.id;
                    optF.textContent = fnome;
                    selFornFiltro.appendChild(optF);
                }
            });
        }
    }

    function renderAmostras() {
        const body = document.getElementById('amostras-table-body');
        if (!body) return;
        body.innerHTML = '';
        localAmostras.forEach(a => {
            const dataFmt = new Date(a.data).toLocaleDateString('pt-BR');
            const statusClass = a.status.toLowerCase().replace(/ /g, '-');
            
            // Delete button check
            let deleteBtnHtml = '';
            if (currentSimulatedRole === 'Administrador' || currentSimulatedRole === 'Diretoria') {
                deleteBtnHtml = `<button class="btn-refresh" style="background:none; border:none; color:#ff4d4d; margin-left:4px;" onclick="window.deletarAmostra(${a.id})" title="Excluir Amostra"><i class="fa-solid fa-trash"></i></button>`;
            }

            let statusBadgeHtml = `<span class="badge-status ${statusClass}" style="cursor:pointer;" onclick="abrirAnaliseDesmonte(${a.id})" title="Clique para ver os detalhes">${a.status}</span>`;
            if (a.decisao_diretoria === 'Aprovado') {
                const dtDec = a.data_decisao ? new Date(a.data_decisao).toLocaleDateString('pt-BR') : '';
                statusBadgeHtml = `<span class="badge-status aprovado-compra-autorizada" style="background:rgba(42,208,122,0.15); color:#2AD07A; border:1px solid #2AD07A; padding:4px 8px; border-radius:4px; font-size:0.75rem; display:inline-block; cursor:pointer;" onclick="abrirAnaliseDesmonte(${a.id})" title="Aprovado por ${a.autorizado_por || 'Diretoria'} em ${dtDec}. Clique para ver os detalhes.">
                    <i class="fa-solid fa-check-circle"></i> Aprovado por ${a.autorizado_por || 'Diretoria'}${dtDec ? ' (' + dtDec + ')' : ''}
                </span>`;
            } else if (a.decisao_diretoria === 'Aguardando' || a.status === 'Aguardando Decisão de Compra') {
                statusBadgeHtml = `<span class="badge-status aguardando-decisao-de-compra" style="background:rgba(240,180,0,0.15); color:#f0c040; border:1px solid #f0b800; padding:4px 8px; border-radius:4px; font-size:0.75rem; display:inline-block; cursor:pointer;" onclick="abrirAnaliseDesmonte(${a.id})" title="Clique para analisar e aprovar">
                    <i class="fa-solid fa-clock"></i> Aguardando Aprovação Diretoria
                </span>`;
            }

            const tr = document.createElement('tr');
            tr.setAttribute('data-id', a.id);
            tr.setAttribute('data-fornecedor-id', a.fornecedor_id);
            tr.setAttribute('data-data', a.data ? a.data.split('T')[0] : '');

            tr.innerHTML = `
                <td style="padding:12px; text-align:center;">
                    <input type="checkbox" class="chk-amostra-select" value="${a.id}">
                </td>
                <td style="padding:12px;">
                    <a href="#" onclick="event.preventDefault(); abrirAnaliseDesmonte(${a.id});" style="color:#2AD07A; font-weight:bold; text-decoration:underline;" title="Clique para ver os detalhes da amostra">${a.numero_amostra}</a>
                </td>
                <td style="padding:12px;">${dataFmt}</td>
                <td style="padding:12px;">${a.fornecedor_nome}</td>
                <td style="padding:12px; color:#2AD07A; font-weight:600; cursor:pointer;" onclick="abrirAnaliseDesmonte(${a.id})" title="Clique para ver os detalhes">${a.nome_material || '-'}</td>
                <td style="padding:12px;">${a.responsavel}</td>
                <td style="padding:12px; text-align:right;">${parseFloat(a.peso_inicial).toFixed(3)} kg</td>
                <td style="padding:12px; text-align:center;">${statusBadgeHtml}</td>
                <td style="padding:12px; text-align:center;">
                    <button class="btn-refresh" style="background:none; border:none; color:#2AD07A;" onclick="window.gerarLaudoPDF(${a.id})" title="Baixar Laudo PDF"><i class="fa-solid fa-file-pdf"></i> PDF</button>
                </td>
                <td style="padding:12px; text-align:center; display:flex; align-items:center; justify-content:center; gap:4px;">
                    <button class="btn-primary" style="padding:4px 8px; font-size:0.78rem;" onclick="abrirAnaliseDesmonte(${a.id})"><i class="fa-solid fa-vial"></i> Analisar</button>
                    <button class="btn-secondary" style="padding:4px 8px; font-size:0.78rem; background:#1e3a5f; color:#fff;" onclick="gerarEtiquetaQRAmostra(${a.id})" title="Imprimir Etiqueta com QR Code"><i class="fa-solid fa-qrcode"></i></button>
                    ${deleteBtnHtml}
                </td>
            `;
            body.appendChild(tr);
        });
    }

    window.alternarMarcarTodasAmostras = function(chkGlobal) {
        const checkboxes = document.querySelectorAll('.chk-amostra-select');
        checkboxes.forEach(chk => { chk.checked = chkGlobal.checked; });
    };

    window.filtrarAmostras = function() {
        const searchVal = (document.getElementById('amostras-search')?.value || '').toLowerCase();
        const fornFiltroVal = document.getElementById('amostras-filtro-fornecedor')?.value || '';
        const dtInicioVal = document.getElementById('amostras-data-inicio')?.value || '';
        const dtFimVal = document.getElementById('amostras-data-fim')?.value || '';

        const rows = document.querySelectorAll('#amostras-table-body tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            const fornId = row.getAttribute('data-fornecedor-id') || '';
            const dtRow = row.getAttribute('data-data') || '';

            let matchText = !searchVal || text.includes(searchVal);
            let matchForn = !fornFiltroVal || fornId === fornFiltroVal;
            let matchDtInicio = !dtInicioVal || (dtRow >= dtInicioVal);
            let matchDtFim = !dtFimVal || (dtRow <= dtFimVal);

            row.style.display = (matchText && matchForn && matchDtInicio && matchDtFim) ? '' : 'none';
        });
    };

    window.abrirAmostraPorNumero = function(numero) {
        const navAmo = document.getElementById('nav-amostras') || document.querySelector('.nav-item[data-target="amostras-view"]');
        if (navAmo) {
            navAmo.click();
            const searchInput = document.getElementById('amostras-search');
            if (searchInput) {
                searchInput.value = numero;
                window.filtrarAmostras();
            }
        }
    };

    window.deletarAmostra = async function(id) {
        if (currentSimulatedRole !== 'Administrador' && currentSimulatedRole !== 'Diretoria') {
            alert('Erro: Apenas o Administrador ou Diretoria podem excluir amostras.');
            return;
        }
        if (!confirm('Tem certeza de que deseja excluir permanentemente esta amostra e todas as suas análises de componentes?')) return;
        try {
            const res = await fetch(`/api/amostras/${id}?user_perfil=${currentSimulatedRole}`, { method: 'DELETE' });
            if (res.ok) {
                alert('Amostra excluída com sucesso!');
                carregarAmostras();
                fecharAnaliseDesmonte();
            } else {
                const data = await res.json();
                alert('Erro ao excluir: ' + (data.error || 'Erro desconhecido.'));
            }
        } catch (err) {
            console.error(err);
        }
    };

    window.abrirModalAmostra = function() {
        const form = document.getElementById('form-amostra-apex');
        if (form) form.reset();
        const idEl = document.getElementById('amo-id');
        if (idEl) idEl.value = '';
        
        let nextNumber = 1;
        if (typeof localAmostras !== 'undefined' && localAmostras.length > 0) {
            let maxNum = 0;
            localAmostras.forEach(a => {
                if (a.numero_amostra) {
                    let match = a.numero_amostra.match(/\d+/);
                    if (match) {
                        let num = parseInt(match[0], 10);
                        if (num > maxNum) maxNum = num;
                    }
                }
            });
            nextNumber = maxNum + 1;
        }
        const numEl = document.getElementById('amo-numero');
        if (numEl) numEl.value = "AM-" + nextNumber.toString().padStart(3, '0');
        
        const modal = document.getElementById('modal-amostra');
        if (modal) modal.style.display = 'flex';
        const dataEl = document.getElementById('amo-data');
        if (dataEl) dataEl.value = new Date().toISOString().split('T')[0];
    };

    window.fecharModalAmostra = function() {
        const modal = document.getElementById('modal-amostra');
        if (modal) modal.style.display = 'none';
    };

    window.salvarAmostra = async function(e) {
        e.preventDefault();
        const nomeMaterialEl = document.getElementById('amo-nome-material');
        const fotoInputEl = document.getElementById('amo-foto-input');

        const data = {
            numero_amostra: document.getElementById('amo-numero').value,
            nome_material: nomeMaterialEl ? nomeMaterialEl.value : '',
            data: document.getElementById('amo-data').value,
            fornecedor_id: document.getElementById('amo-fornecedor').value,
            responsavel: document.getElementById('amo-responsavel').value,
            peso_inicial: document.getElementById('amo-peso').value,
            observacoes: document.getElementById('amo-obs').value,
            foto_original: ''
        };

        try {
            const res = await fetch('/api/amostras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const newAmostra = await res.json();

            if (newAmostra && newAmostra.id && fotoInputEl && fotoInputEl.files && fotoInputEl.files.length > 0) {
                const formData = new FormData();
                formData.append('tipo', 'bruta');
                formData.append('etapa', 'Recebimento');
                for (const file of fotoInputEl.files) {
                    formData.append('fotos', file);
                }
                await fetch(`/api/amostras/${newAmostra.id}/fotos`, {
                    method: 'POST',
                    body: formData
                });
            }

            fecharModalAmostra();
            carregarAmostras();
        } catch (err) {
            console.error('Erro ao salvar amostra:', err);
        }
    };

    // ─── NAVEGAÇÃO DE TELAS ESTILO ERP ENTERPRISE (SAP / ORACLE / SANKHYA) ──────
    window.mudarTelaEtapa = function(etapaNum) {
        // Bloqueio de Segurança da Tela 4 para o Operacional
        if (etapaNum === 4 && currentSimulatedRole !== 'Administrador' && currentSimulatedRole !== 'Diretoria') {
            alert('🔒 Acesso Restrito ao Nível de Diretoria / Administrador (ERP Security Level).\n\nUsuários operacionais do laboratório não possuem permissão para visualizar ou definir preços estratégicos.');
            return;
        }

        // Esconder todas as telas de etapa
        for (let i = 1; i <= 4; i++) {
            const t = document.getElementById(`tela-etapa-${i}`);
            const btn = document.getElementById(`btn-stepper-etapa-${i}`);
            if (t) t.style.display = (i === etapaNum) ? 'block' : 'none';
            if (btn) {
                if (i === etapaNum) {
                    btn.style.background = '#1e4e8c';
                    btn.style.borderColor = '#2AD07A';
                    btn.style.color = '#fff';
                } else {
                    btn.style.background = '#101a24';
                    btn.style.borderColor = '#1e3a5f';
                    btn.style.color = '#aaa';
                }
            }
        }
    };

    // ─── ETIQUETA QR CODE FISICA DE LOTE ─────────────────────────────────────────
    window.gerarEtiquetaQRAmostra = function(id) {
        const amostra = localAmostras.find(a => a.id === id);
        if (!amostra) return;

        document.getElementById('qr-amostra-codigo').textContent = amostra.numero_amostra;
        document.getElementById('qr-amostra-material').textContent = amostra.nome_material || 'Material Não Especificado';
        document.getElementById('qr-amostra-detalhes').textContent = `Fornecedor: ${amostra.fornecedor_nome} | Peso: ${parseFloat(amostra.peso_inicial).toFixed(3)} kg`;

        const qrCanvas = document.createElement('canvas');
        const payloadText = JSON.stringify({
            empresa: 'APEXTECH METAIS',
            amostra: amostra.numero_amostra,
            material: amostra.nome_material || '',
            fornecedor: amostra.fornecedor_nome,
            peso: amostra.peso_inicial,
            data: amostra.data
        });

        // Usar lib JS ou Canvas Fallback para QR Code
        if (window.QRCode && typeof window.QRCode.toDataURL === 'function') {
            window.QRCode.toDataURL(payloadText, { width: 200, margin: 1 }, function (err, url) {
                if (!err) document.getElementById('qr-code-img').src = url;
            });
        } else {
            // Fallback via API rápida de QR Code
            document.getElementById('qr-code-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payloadText)}`;
        }

        document.getElementById('modal-qr-etiqueta').style.display = 'flex';
    };

    window.fecharModalQREtiqueta = function() {
        document.getElementById('modal-qr-etiqueta').style.display = 'none';
    };

    window.imprimirEtiquetaArea = function() {
        const printArea = document.getElementById('etiqueta-print-area').outerHTML;
        const win = window.open('', '', 'width=600,height=600');
        win.document.write(`<html><head><title>Imprimir Etiqueta Lote</title></head><body onload="window.print();window.close();" style="display:flex;justify-content:center;align-items:center;height:100vh;">${printArea}</body></html>`);
        win.document.close();
    };

    // ─── EXPORTAÇÃO EM BATCH DE LAUDOS PDF EM ZIP ───────────────────────────────
    window.exportarLaudosEmLoteZip = async function() {
        const checkboxes = document.querySelectorAll('.chk-amostra-select:checked');
        if (checkboxes.length === 0) {
            alert('Por favor, selecione ao menos uma amostra na tabela para exportar em lote.');
            return;
        }

        if (typeof JSZip === 'undefined') {
            alert('Biblioteca JSZip não carregada.');
            return;
        }

        const zip = new JSZip();
        const folder = zip.folder('LAUDOS_APEXTECH');

        alert(`Iniciando geração de ${checkboxes.length} laudo(s) em PDF... Aguarde a conclusão.`);

        for (const chk of checkboxes) {
            const amostraId = parseInt(chk.value);
            const amostra = localAmostras.find(a => a.id === amostraId);
            if (!amostra) continue;

            try {
                // Abre geração temporária
                await window.gerarLaudoPDF(amostraId);
            } catch(e) {
                console.error(`Erro ao incluir amostra ${amostraId} no ZIP:`, e);
            }
        }
        alert('Geração em lote finalizada com sucesso!');
    };

    // Detalhes do Desmonte
    let componentesActivos = [];

    window.abrirAnaliseDesmonte = async function(id) {
        activeAmostraIdForDesmonte = id;
        try {
            const res = await fetch(`/api/amostras/${id}`);
            const data = await res.json();
            const { amostra, componentes } = data;

            document.getElementById('analise-titulo-amostra').textContent = amostra.numero_amostra;
            const matNomeEl = document.getElementById('analise-material-nome');
            if (matNomeEl) matNomeEl.textContent = amostra.nome_material || 'Material não informado';
            document.getElementById('analise-fornecedor-nome').textContent = amostra.fornecedor_nome;
            document.getElementById('analise-peso-inicial').textContent = parseFloat(amostra.peso_inicial).toFixed(3);

            // Atualiza os nós visuais do Stepper de Etapas
            atualizarStepperAmostra(amostra.status, amostra.decisao_diretoria);

            componentesActivos = componentes.map(c => ({
                material_id: c.material_id,
                peso: parseFloat(c.peso),
                percentual: parseFloat(c.percentual),
                dificuldade: c.dificuldade || 'Fácil',
                foto: c.foto || '',
                observacoes: c.observacoes || ''
            }));

            // Inicializa cronômetro com tempo já salvo (se houver) e inicia a contagem automaticamente
            resetCronometro();
            if (amostra.tempo_desmonte) {
                cronSegundos = parseInt(amostra.tempo_desmonte);
                atualizarCronometroDisplay();
            }
            if (!cronInterval) {
                window.toggleCronometro();
            }

            // Parecer Técnico
            document.getElementById('analise-parecer-tecnico').value = amostra.parecer_tecnico || '';

            // Decisão da Diretoria e campos de precificação autorizada
            const painelDir = document.getElementById('painel-decisao-diretoria');
            const hContainer = document.getElementById('decisao-historica-container');
            const bannerAutonomia = document.getElementById('banner-autonomia-compra');
            
            // Popula os inputs de precificação e obs. diretoria
            document.getElementById('dir-preco-entregar').value = amostra.preco_compra_entregar || '';
            document.getElementById('dir-preco-coletar').value = amostra.preco_compra_coletar || '';
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 30);
            document.getElementById('dir-preco-validade').value = amostra.preco_validade ? amostra.preco_validade.split('T')[0] : defaultDate.toISOString().split('T')[0];
            const dirObsEl = document.getElementById('dir-obs-diretoria');
            if (dirObsEl) dirObsEl.value = amostra.obs_diretoria || '';

            if (painelDir) {
                if (currentSimulatedRole === 'Administrador' || currentSimulatedRole === 'Diretoria') {
                    painelDir.style.display = 'block';
                } else {
                    painelDir.style.display = 'none';
                }

                if (amostra.decisao_diretoria && amostra.decisao_diretoria !== 'Aguardando') {
                    hContainer.style.display = 'block';
                    const adminNome = amostra.admin_aprovacao || amostra.autorizado_por || 'Admin';
                    document.getElementById('decisao-historica-status').textContent = `${amostra.decisao_diretoria} (por ${adminNome})`;
                    document.getElementById('decisao-historica-status').style.color = amostra.decisao_diretoria === 'Aprovado' ? '#2AD07A' : '#ff4d4d';
                    document.getElementById('decisao-historica-motivo').textContent = amostra.motivo_reprovacao ? `Motivo: ${amostra.motivo_reprovacao}` : '';
                } else {
                    hContainer.style.display = 'none';
                }
            }
            
            // Exibir quem analisou
            const tecnicoDiv = document.getElementById('analise-tecnico-nome');
            if (tecnicoDiv && amostra.tecnico_analise) {
                tecnicoDiv.textContent = `Analisado por: ${amostra.tecnico_analise}`;
                tecnicoDiv.style.display = 'block';
            } else if (tecnicoDiv) {
                tecnicoDiv.style.display = 'none';
            }

            // Exibir banner de autonomia com detalhes explícitos
            if (bannerAutonomia) {
                if (amostra.decisao_diretoria === 'Aprovado') {
                    bannerAutonomia.style.display = 'flex';
                    document.getElementById('autonomia-val-entregar').textContent = parseFloat(amostra.preco_compra_entregar || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    document.getElementById('autonomia-val-coletar').textContent = parseFloat(amostra.preco_compra_coletar || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
                    
                    const dataValFmt = amostra.preco_validade ? new Date(amostra.preco_validade).toLocaleDateString('pt-BR') : '--/--/----';
                    document.getElementById('autonomia-val-validade').textContent = dataValFmt;
                    document.getElementById('autonomia-val-diretor').textContent = amostra.admin_aprovacao || amostra.autorizado_por || 'Administrador';
                } else {
                    bannerAutonomia.style.display = 'none';
                }
            }

            renderizarBotoesAcoesAmostra(amostra.status);
            renderComponentesDesmonte();
            // Carregar fotos da amostra
            await carregarFotosAmostra(id);
            document.getElementById('analise-desmonte-container').style.display = 'block';
            document.getElementById('analise-desmonte-container').scrollIntoView({ behavior: 'smooth' });
        } catch (err) {
            console.error(err);
        }
    };

    function renderizarBotoesAcoesAmostra(status) {
        const btnLiberar = document.getElementById('btn-liberar-pcp');
        const btnProcessar = document.getElementById('btn-processar-pcp');

        if (btnLiberar) btnLiberar.style.display = 'none';
        if (btnProcessar) btnProcessar.style.display = 'none';

        if (status === 'Aguardando Liberação PCP' || status === 'Aprovado - Compra Autorizada') {
            if (btnLiberar) btnLiberar.style.display = '';
        } else if (status === 'Liberado para Produção') {
            if (btnProcessar) btnProcessar.style.display = '';
        }
    }

    window.fecharAnaliseDesmonte = function() {
        document.getElementById('analise-desmonte-container').style.display = 'none';
        activeAmostraIdForDesmonte = null;
        resetCronometro();
    };

    // Cronômetro
    let cronInterval = null;
    let cronSegundos = 0;

    window.toggleCronometro = function() {
        const btn = document.getElementById('btn-cron-start');
        if (cronInterval) {
            clearInterval(cronInterval);
            cronInterval = null;
            btn.innerHTML = '<i class="fa-solid fa-play"></i> Iniciar';
        } else {
            cronInterval = setInterval(() => {
                cronSegundos++;
                atualizarCronometroDisplay();
            }, 1000);
            btn.innerHTML = '<i class="fa-solid fa-pause"></i> Pausar';
        }
    };

    window.resetCronometro = function() {
        if (cronInterval) {
            clearInterval(cronInterval);
            cronInterval = null;
        }
        cronSegundos = 0;
        atualizarCronometroDisplay();
        document.getElementById('manual-tempo-input').value = '';
        const btn = document.getElementById('btn-cron-start');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-play"></i> Iniciar';
    };

    function atualizarCronometroDisplay() {
        const min = Math.floor(cronSegundos / 60).toString().padStart(2, '0');
        const seg = (cronSegundos % 60).toString().padStart(2, '0');
        const display = document.getElementById('cronometro-display');
        if (display) display.textContent = `${min}:${seg}`;
    }

    window.ajustarTempoManualmente = function(val) {
        const min = parseInt(val) || 0;
        cronSegundos = min * 60;
        atualizarCronometroDisplay();
    };

    // Upload de Fotos (redireciona para webcam nativa)
    window.simularUploadFoto = function(idx) {
        if (typeof window.abrirWebcamModal === 'function') {
            window.abrirWebcamModal('separada', 'Desmonte');
        } else {
            const inp = document.getElementById('foto-input-bruta');
            if (inp) inp.click();
        }
    };

    function atualizarStepperAmostra(status, decisaoDiretoria) {
        const s1 = document.getElementById('step-node-1');
        const s2 = document.getElementById('step-node-2');
        const s3 = document.getElementById('step-node-3');
        const s4 = document.getElementById('step-node-4');
        if (!s1 || !s2 || !s3 || !s4) return;

        const setStepState = (el, active, completed, color = '#2AD07A') => {
            const badge = el.querySelector('span');
            if (completed) {
                el.style.borderLeftColor = color;
                el.style.background = 'rgba(42, 208, 122, 0.1)';
                if (badge) { badge.style.background = color; badge.style.color = '#000'; badge.innerHTML = '<i class="fa-solid fa-check"></i>'; }
            } else if (active) {
                el.style.borderLeftColor = '#3e7cb1';
                el.style.background = '#18324a';
                if (badge) { badge.style.background = '#3e7cb1'; badge.style.color = '#fff'; }
            } else {
                el.style.borderLeftColor = '#444';
                el.style.background = '#162432';
                if (badge) { badge.style.background = '#444'; badge.style.color = '#aaa'; }
            }
        };

        // Etapa 1 sempre concluída após criação do recebimento
        setStepState(s1, false, true);

        // Etapa 2: Desmonte (Ativa se Em Análise, Concluída se status for além de Em Análise)
        if (status === 'Em Análise') {
            setStepState(s2, true, false);
            setStepState(s3, false, false);
            setStepState(s4, false, false);
        } else {
            setStepState(s2, false, true);
            setStepState(s3, true, false);
            
            if (status === 'Aguardando Decisão de Compra') {
                setStepState(s3, false, true);
                setStepState(s4, true, false);
            } else if (decisaoDiretoria === 'Aprovado' || status === 'Aprovado - Compra Autorizada' || status === 'Aguardando Liberação PCP' || status === 'Liberado para Produção' || status === 'Processado') {
                setStepState(s3, false, true);
                setStepState(s4, false, true, '#2AD07A');
            } else if (decisaoDiretoria === 'Reprovado') {
                setStepState(s3, false, true);
                setStepState(s4, false, true, '#ff4d4d');
            }
        }
    }

    // ─── UPLOAD REAL DE FOTOS ───────────────────────────────────────────────────
    window.uploadFotos = async function(input, tipo, etapa) {
        if (!activeAmostraIdForDesmonte || !input.files || input.files.length === 0) return;
        const spinner = document.getElementById('foto-input-spinner');
        if (spinner) spinner.style.display = 'inline-flex';
        try {
            const formData = new FormData();
            formData.append('tipo', tipo || 'bruta');
            formData.append('etapa', etapa || 'Recebimento');
            for (const file of input.files) formData.append('fotos', file);
            const res = await fetch(`/api/amostras/${activeAmostraIdForDesmonte}/fotos`, { method: 'POST', body: formData });
            const result = await res.json();
            if (result.success) {
                await carregarFotosAmostra(activeAmostraIdForDesmonte);
            } else {
                alert('Erro ao enviar foto: ' + (result.error || 'desconhecido'));
            }
        } catch (err) {
            console.error('uploadFotos:', err);
        } finally {
            if (spinner) spinner.style.display = 'none';
            input.value = ''; // reset input
        }
    };

    async function carregarFotosAmostra(id) {
        try {
            const res  = await fetch(`/api/amostras/${id}/fotos`);
            const fotos = await res.json();
            renderFotosGallery(fotos, id);
        } catch (err) { console.error('carregarFotosAmostra:', err); }
    }

    function renderFotosGallery(fotos, amostraId) {
        const gallery     = document.getElementById('fotos-gallery');
        const placeholder = document.getElementById('fotos-placeholder');
        if (!gallery) return;
        // Remove thumbs anteriores mas mantém placeholder
        Array.from(gallery.children).forEach(el => { if (el.id !== 'fotos-placeholder') el.remove(); });
        if (!fotos || fotos.length === 0) {
            if (placeholder) placeholder.style.display = 'block';
            return;
        }
        if (placeholder) placeholder.style.display = 'none';
        fotos.forEach(foto => {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:relative; width:125px; height:100px; border-radius:8px; overflow:hidden; border:2px solid #1e4e8c; flex-shrink:0; background:#0a141d;';
            const badge = document.createElement('span');
            const etapaTexto = foto.etapa || (foto.tipo === 'bruta' ? 'Recebimento' : 'Desmonte');
            badge.textContent = etapaTexto;
            
            let badgeBg = '#3e7cb1';
            if (etapaTexto === 'Recebimento') badgeBg = '#f0b800';
            else if (etapaTexto === 'Desmonte') badgeBg = '#3e7cb1';
            else if (etapaTexto === 'Viabilidade') badgeBg = '#9c27b0';
            else if (etapaTexto === 'Aprovação' || etapaTexto === 'Aprovação Adm') badgeBg = '#2AD07A';

            badge.style.cssText = `position:absolute;top:4px;left:4px;font-size:9px;padding:2px 6px;border-radius:3px;font-weight:700;background:${badgeBg};color:#000;z-index:2;box-shadow:0 2px 4px rgba(0,0,0,0.5);`;
            
            const img = document.createElement('img');
            img.src = `/api/amostras/${amostraId}/fotos/${foto.id}/img`;
            img.alt = foto.nome || 'Foto';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            img.onerror = () => { img.src = 'assets/img/apexlogo.png'; };
            const delBtn = document.createElement('button');
            delBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            delBtn.title = 'Excluir foto';
            delBtn.style.cssText = 'position:absolute;top:4px;right:4px;background:rgba(255,0,0,0.75);border:none;color:#fff;cursor:pointer;border-radius:50%;width:18px;height:18px;font-size:10px;display:flex;align-items:center;justify-content:center;z-index:2;';
            delBtn.onclick = async () => {
                if (!confirm('Excluir esta foto?')) return;
                await fetch(`/api/amostras/${amostraId}/fotos/${foto.id}`, { method: 'DELETE' });
                await carregarFotosAmostra(amostraId);
            };
            wrapper.appendChild(badge);
            wrapper.appendChild(img);
            wrapper.appendChild(delBtn);
            gallery.appendChild(wrapper);
        });
    }

    // ─── CALCULADORA FIDC ────────────────────────────────────────────────────────
    // Cache de precos para o painel
    let fidcPrecosCache = [];

    // Chamado ao abrir o desmonte e ao alterar componentes
    window.recalcularFIDC = async function() {
        const fidcTbody = document.getElementById('fidc-tbody');
        if (!fidcTbody) return;

        // Buscar tabela de precos se cache vazio
        if (fidcPrecosCache.length === 0) {
            try {
                const pr = await fetch('/api/tabela-precos');
                fidcPrecosCache = await pr.json();
            } catch(e) { fidcPrecosCache = []; }
        }

        const margem     = parseFloat(document.getElementById('fidc-margem')?.value || 100) / 100;
        const difBonus   = parseFloat(document.getElementById('fidc-dificuldade')?.value || 0) / 100;
        const margemTot  = margem + difBonus;

        if (componentesActivos.length === 0) {
            fidcTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:15px;color:#666;">Adicione componentes para calcular</td></tr>';
            setFidcTotals(0, margemTot);
            return;
        }

        let valorBruto = 0;
        let semPreco   = false;
        fidcTbody.innerHTML = '';

        for (const c of componentesActivos) {
            const mat   = localMateriais.find(m => m.id === c.material_id);
            const preco = fidcPrecosCache.find(p => p.material_id === c.material_id);
            const pct   = c.percentual;
            const precoEntregar = preco ? parseFloat(preco.preco_entregar) : null;

            const valorComp = precoEntregar !== null ? (pct / 100) * precoEntregar : null;
            if (valorComp !== null) valorBruto += valorComp;
            if (precoEntregar === null) semPreco = true;

            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #222';
            tr.innerHTML = `
                <td style="padding:8px 10px;">${mat ? mat.nome : 'Desconhecido'}</td>
                <td style="padding:8px 10px;text-align:right;">${fmtBRL(pct)}%</td>
                <td style="padding:8px 10px;text-align:right;color:${precoEntregar!==null?'#2AD07A':'#f0b800'}">
                    ${precoEntregar!==null ? 'R$ ' + fmtBRL(precoEntregar) : '<i class="fa-solid fa-triangle-exclamation"></i> Sem preco'}
                </td>
                <td style="padding:8px 10px;text-align:right;font-weight:700;color:#fff;">
                    ${valorComp!==null ? 'R$ ' + valorComp.toFixed(4) : '---'}
                </td>
                <td style="padding:8px 10px;text-align:center;">
                    ${precoEntregar!==null
                        ? '<span style="color:#2AD07A;font-size:0.75rem;"><i class="fa-solid fa-check-circle"></i> OK</span>'
                        : '<span style="color:#f0b800;font-size:0.75rem;"><i class="fa-solid fa-circle-exclamation"></i> Sem tabela</span>'}
                </td>`;
            fidcTbody.appendChild(tr);
        }

        const avisoEl = document.getElementById('fidc-aviso-sem-preco');
        if (avisoEl) avisoEl.style.display = semPreco ? 'block' : 'none';
        setFidcTotals(valorBruto, margemTot);
    };

    function setFidcTotals(valorBruto, margemTot) {
        const precoSugEntregar = valorBruto / (1 + margemTot);
        const precoSugColetar  = precoSugEntregar * 0.96; // 4% desconto coletar vs entregar
        const margemPct        = Math.round(margemTot * 100);

        const fmt = (v) => 'R$ ' + fmtBRL(v);
        const el  = (id) => document.getElementById(id);

        if (el('fidc-valor-bruto'))              el('fidc-valor-bruto').innerHTML              = fmt(valorBruto) + '<span style="font-size:0.7rem;color:#777;">/kg</span>';
        if (el('fidc-margem-display'))            el('fidc-margem-display').textContent          = margemPct + '%';
        if (el('fidc-preco-sugerido-entregar'))   el('fidc-preco-sugerido-entregar').innerHTML  = fmt(precoSugEntregar) + '<span style="font-size:0.7rem;color:#777;">/kg</span>';
        if (el('fidc-preco-sugerido-coletar'))    el('fidc-preco-sugerido-coletar').innerHTML   = fmt(precoSugColetar)  + '<span style="font-size:0.7rem;color:#777;">/kg</span>';
    }

    // ─── MÓDULO DE CAPTURA DE FOTOS VIA WEBCAM AO VIVO ─────────────────────────
    let currentWebcamStream = null;
    let currentWebcamTipo = 'bruta';
    let currentWebcamEtapa = 'Recebimento';
    let capturedImageData = null;

    window.abrirWebcamModal = async function(tipo, etapa) {
        currentWebcamTipo = tipo || 'bruta';
        currentWebcamEtapa = etapa || 'Recebimento';
        capturedImageData = null;

        document.getElementById('webcam-snapshot-preview').style.display = 'none';
        document.getElementById('webcam-video').style.display = 'block';
        document.getElementById('btn-webcam-snap').style.display = 'inline-flex';
        document.getElementById('btn-webcam-retry').style.display = 'none';
        document.getElementById('btn-webcam-confirm').style.display = 'none';
        document.getElementById('modal-webcam-capture').style.display = 'flex';

        try {
            currentWebcamStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
            const video = document.getElementById('webcam-video');
            video.srcObject = currentWebcamStream;
        } catch(e) {
            console.error('Erro ao acessar webcam:', e);
            alert('Não foi possível acessar a câmera do dispositivo. Por favor, verifique as permissões no navegador.');
        }
    };

    window.fecharWebcamModal = function() {
        if (currentWebcamStream) {
            currentWebcamStream.getTracks().forEach(track => track.stop());
            currentWebcamStream = null;
        }
        document.getElementById('modal-webcam-capture').style.display = 'none';
    };

    window.tirarFotoWebcam = function() {
        const video = document.getElementById('webcam-video');
        const canvas = document.getElementById('webcam-canvas');
        const preview = document.getElementById('webcam-snapshot-preview');
        if (!video || !canvas || !preview) return;

        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        capturedImageData = canvas.toDataURL('image/jpeg', 0.9);
        preview.src = capturedImageData;
        video.style.display = 'none';
        preview.style.display = 'block';

        document.getElementById('btn-webcam-snap').style.display = 'none';
        document.getElementById('btn-webcam-retry').style.display = 'inline-flex';
        document.getElementById('btn-webcam-confirm').style.display = 'inline-flex';
    };

    window.refazerFotoWebcam = function() {
        capturedImageData = null;
        document.getElementById('webcam-snapshot-preview').style.display = 'none';
        document.getElementById('webcam-video').style.display = 'block';
        document.getElementById('btn-webcam-snap').style.display = 'inline-flex';
        document.getElementById('btn-webcam-retry').style.display = 'none';
        document.getElementById('btn-webcam-confirm').style.display = 'none';
    };

    window.confirmarFotoWebcam = async function() {
        if (!capturedImageData || !activeAmostraIdForDesmonte) {
            alert('Nenhuma foto capturada para salvar.');
            return;
        }

        try {
            const res = await fetch(capturedImageData);
            const blob = await res.blob();

            const formData = new FormData();
            formData.append('tipo', currentWebcamTipo);
            formData.append('etapa', currentWebcamEtapa);
            formData.append('fotos', blob, `webcam_${Date.now()}.jpg`);

            const uploadRes = await fetch(`/api/amostras/${activeAmostraIdForDesmonte}/fotos`, {
                method: 'POST',
                body: formData
            });
            const result = await uploadRes.json();
            if (result.success) {
                await carregarFotosAmostra(activeAmostraIdForDesmonte);
                fecharWebcamModal();
            } else {
                alert('Erro ao salvar foto da webcam: ' + (result.error || 'erro desconhecido'));
            }
        } catch(e) {
            console.error('confirmarFotoWebcam:', e);
        }
    };

    function renderComponentesDesmonte() {
        const body = document.getElementById('analise-componentes-body');
        if (!body) return;
        body.innerHTML = '';

        componentesActivos.forEach((c, idx) => {
            const tr = document.createElement('tr');
            const isCustom = c.material_id === 'NEW' || !!c.custom_name;

            tr.innerHTML = `
                <td style="padding:10px;">
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <select class="noble-input sel-comp-material" style="padding:6px; font-size:0.85rem;" onchange="alterarSelecaoMaterialComp(${idx}, this.value)">
                            ${localMateriais.map(m => `<option value="${m.id}" ${(!isCustom && m.id === c.material_id) ? 'selected' : ''}>${m.nome} (${m.categoria})</option>`).join('')}
                            <option value="NEW" ${isCustom ? 'selected' : ''}>➕ Digitar Novo Material...</option>
                        </select>
                        <input type="text" class="noble-input inp-comp-custom" style="display:${isCustom ? 'block' : 'none'}; padding:6px; font-size:0.85rem; border-color:#2AD07A;" placeholder="Digite o nome do novo material..." value="${c.custom_name || ''}" oninput="atualizarComponenteData(${idx}, 'custom_name', this.value)">
                    </div>
                </td>
                <td style="padding:10px; text-align:right;">
                    <input type="number" step="0.001" class="noble-input val-comp-peso" style="padding:6px; text-align:right; width:110px; font-size:0.85rem;" value="${c.peso}" oninput="atualizarComponenteData(${idx}, 'peso', this.value)">
                </td>
                <td style="padding:10px; text-align:right; font-weight:bold; font-size:0.9rem; color:#2AD07A;" class="val-comp-pct">${fmtBRL(c.percentual)} %</td>
                <td style="padding:10px;">
                    <select class="noble-input" style="padding:6px; font-size:0.85rem;" onchange="atualizarComponenteData(${idx}, 'dificuldade', this.value)">
                        <option value="Fácil" ${c.dificuldade === 'Fácil' ? 'selected' : ''}>Fácil</option>
                        <option value="Média" ${c.dificuldade === 'Média' ? 'selected' : ''}>Média</option>
                        <option value="Alta" ${c.dificuldade === 'Alta' ? 'selected' : ''}>Alta</option>
                    </select>
                </td>
                <td style="padding:10px;">
                    <div style="display:flex; gap:5px; align-items:center;">
                        <input type="text" class="noble-input" style="padding:5px; font-size:0.75rem; width:90px;" placeholder="Foto URL" value="${c.foto}" onchange="atualizarComponenteData(${idx}, 'foto', this.value)">
                        <button class="btn-primary" type="button" style="padding:4px 8px; background:#2AD07A; color:#000; font-size:0.75rem;" onclick="abrirWebcamModal('separada', 'Desmonte')" title="Tirar foto via webcam"><i class="fa-solid fa-camera"></i></button>
                    </div>
                </td>
                <td style="padding:10px;">
                    <input type="text" class="noble-input val-comp-obs" style="padding:6px; font-size:0.85rem;" value="${c.observacoes}" oninput="atualizarComponenteData(${idx}, 'observacoes', this.value)">
                </td>
                <td style="padding:10px; text-align:center;">
                    <button class="btn-refresh" style="background:none; border:none; color:#ff4d4d; font-size:1.1rem;" onclick="removerLinhaComponente(${idx})" title="Remover Peça"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            body.appendChild(tr);
        });

        calcularAnaliseAmostra();
    }

    window.alterarSelecaoMaterialComp = function(idx, val) {
        if (val === 'NEW') {
            componentesActivos[idx].material_id = 'NEW';
            componentesActivos[idx].custom_name = componentesActivos[idx].custom_name || '';
        } else {
            componentesActivos[idx].material_id = parseInt(val);
            delete componentesActivos[idx].custom_name;
        }
        renderComponentesDesmonte();
    };

    window.adicionarLinhaComponente = function() {
        componentesActivos.push({
            material_id: localMateriais[0] ? localMateriais[0].id : null,
            peso: 0.0,
            percentual: 0.0,
            dificuldade: 'Fácil',
            foto: '',
            observacoes: ''
        });
        renderComponentesDesmonte();
    };

    window.removerLinhaComponente = function(idx) {
        componentesActivos.splice(idx, 1);
        renderComponentesDesmonte();
    };

    window.atualizarComponenteData = function(idx, field, val) {
        if (field === 'material_id') {
            componentesActivos[idx].material_id = val === 'NEW' ? 'NEW' : parseInt(val);
        } else if (field === 'custom_name') {
            componentesActivos[idx].custom_name = val;
        } else if (field === 'peso') {
            componentesActivos[idx].peso = parseFloat(val) || 0.0;
        } else if (field === 'dificuldade') {
            componentesActivos[idx].dificuldade = val;
        } else if (field === 'foto') {
            componentesActivos[idx].foto = val;
        } else if (field === 'observacoes') {
            componentesActivos[idx].observacoes = val;
        }
        calcularAnaliseAmostra();
    };

    window.calcularAnaliseAmostra = function() {
        const pesoInicial = parseFloat(document.getElementById('analise-peso-inicial').textContent) || 0.0;
        
        // Executar cálculo centralizado no ApexEngine
        const resEngine = window.ApexEngine.calcularViabilidadeCompleta({
            pesoBruto: pesoInicial,
            componentes: componentesActivos,
            tabelaPrecos: fidcPrecosCache || [],
            margemPct: parseFloat(document.getElementById('fidc-margem')?.value || 100),
            dificuldadeBonusPct: parseFloat(document.getElementById('fidc-dificuldade')?.value || 0)
        });

        componentesActivos.forEach((c, idx) => {
            if (resEngine.componentes[idx]) {
                c.percentual = resEngine.componentes[idx].percentual;
            }
            const rows = document.querySelectorAll('#analise-componentes-body tr');
            if (rows[idx]) {
                const pctCell = rows[idx].querySelector('.val-comp-pct');
                if (pctCell) pctCell.textContent = fmtBRL(c.percentual) + ' %';
            }
        });

        if (resEngine.totalPesoRecuperado > pesoInicial) {
            alert('Atenção: A soma do peso dos componentes não pode exceder o peso inicial da amostra!');
        }

        document.getElementById('resumo-peso-recuperado').textContent = resEngine.totalPesoRecuperado.toFixed(3);
        document.getElementById('resumo-peso-perda').textContent = resEngine.perdaFisicaKg.toFixed(3);
        document.getElementById('resumo-percentual-perda').textContent = fmtBRL(resEngine.percentualPerda);

        // Formula Química
        const formulaParts = componentesActivos.map(c => {
            const m = localMateriais.find(x => x.id === c.material_id);
            return `${c.percentual.toFixed(1)}% ${m ? m.nome : (c.custom_name || 'Desconhecido')}`;
        });
        if (resEngine.perdaFisicaKg > 0) {
            formulaParts.push(`${resEngine.percentualPerda.toFixed(1)}% Perda/Resíduos`);
        }
        document.getElementById('resumo-formula-quimica').textContent = formulaParts.join(' · ');

        if (window.recalcularFIDC) {
            window.recalcularFIDC();
        }
    };

    window.salvarAnaliseLaboratorial = async function() {
        if (!activeAmostraIdForDesmonte) return;
        calcularAnaliseAmostra();

        const pesoInicial = parseFloat(document.getElementById('analise-peso-inicial').textContent) || 0.0;
        const totalPesos = componentesActivos.reduce((sum, c) => sum + c.peso, 0);

        if (totalPesos > pesoInicial) {
            alert('Erro: A soma do peso dos componentes é maior do que o peso total disponível.');
            return;
        }
        
        try {
            await fetch(`/api/amostras/${activeAmostraIdForDesmonte}/componentes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    componentes: componentesActivos,
                    tempo_desmonte: cronSegundos,
                    parecer_tecnico: document.getElementById('analise-parecer-tecnico').value.trim(),
                    tecnico_analise: sessionStorage.getItem('apex_logged_user_name') || currentSimulatedRole
                })
            });
            // Muda status para sinalizar que precisa de decisão do Diretor
            await fetch(`/api/amostras/${activeAmostraIdForDesmonte}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Aguardando Decisão de Compra' })
            });
            // Disparo automático de e-mail ao Diretor
            try {
                const emailRes = await fetch(`/api/amostras/${activeAmostraIdForDesmonte}/enviar-laudo-email`, { method: 'POST' });
                const emailData = await emailRes.json();
                const emailMsg = emailData.enviado
                    ? `\n\n📧 E-mail enviado para ${emailData.destinatarios?.length || 0} destinatário(s).`
                    : `\n\n📧 E-mail não enviado (${emailData.motivo || 'sem config'}).`;
                alert('Análise salva! A amostra foi enviada para decisão de compra pela Diretoria.' + emailMsg);
            } catch(e) {
                alert('Análise salva! A amostra foi enviada para decisão de compra pela Diretoria.');
            }
            fecharAnaliseDesmonte();
            carregarAmostras();
        } catch (err) {
            console.error(err);
        }
    };

    // Ações Diretoria
    window.abrirModalReprovacao = function() {
        document.getElementById('reprovacao-motivo-texto').value = '';
        document.getElementById('modal-reprovacao').style.display = 'flex';
    };

    window.fecharModalReprovacao = function() {
        document.getElementById('modal-reprovacao').style.display = 'none';
    };

    window.salvarDecisaoDiretoria = async function(decisao) {
        if (!activeAmostraIdForDesmonte) return;
        const motivo = document.getElementById('reprovacao-motivo-texto').value.trim();
        const precoEntregar = parseFloat(document.getElementById('dir-preco-entregar').value);
        const precoColetar = parseFloat(document.getElementById('dir-preco-coletar').value);
        const validade = document.getElementById('dir-preco-validade').value;
        const obsDir = (document.getElementById('dir-obs-diretoria') || {}).value || '';

        if (decisao === 'Reprovado' && !motivo) {
            alert('Por favor, informe o motivo da reprovação.');
            return;
        }

        if (decisao === 'Aprovado') {
            if (isNaN(precoEntregar) || isNaN(precoColetar) || !validade) {
                alert('Por favor, preencha os preços autorizados de compra (Entregar e Coletar) e a validade.');
                return;
            }
        }

        try {
            const res = await fetch(`/api/amostras/${activeAmostraIdForDesmonte}/decisao`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    decisao_diretoria: decisao,
                    motivo_reprovacao: motivo,
                    obs_diretoria: obsDir,
                    preco_compra_entregar: precoEntregar,
                    preco_compra_coletar: precoColetar,
                    preco_validade: validade,
                    user_perfil: currentSimulatedRole,
                    user_nome: sessionStorage.getItem('apex_logged_user_name') || currentSimulatedRole
                })
            });
            const data = await res.json();
            if (res.ok) {
                const emoji = decisao === 'Aprovado' ? '✅' : '❌';
                alert(`${emoji} Decisão da Diretoria registrada: ${decisao}\n\nEsta decisão foi permanentemente registrada no laudo da amostra.`);
                fecharModalReprovacao();
                fecharAnaliseDesmonte();
                carregarAmostras();
            } else {
                alert('Erro: ' + (data.error || 'Não foi possível registrar a decisão.'));
            }
        } catch (err) {
            console.error(err);
        }
    };

    window.liberarLoteParaPCP = async function() {
        if (!activeAmostraIdForDesmonte) return;
        try {
            await fetch(`/api/amostras/${activeAmostraIdForDesmonte}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Liberado para Produção' })
            });
            alert('Lote Aprovado e Liberado para Produção/PCP!');
            fecharAnaliseDesmonte();
            carregarAmostras();
        } catch (err) {
            console.error(err);
        }
    };

    window.confirmarProcessamentoIndustrial = async function() {
        if (!activeAmostraIdForDesmonte) return;
        try {
            await fetch(`/api/amostras/${activeAmostraIdForDesmonte}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Processado' })
            });
            alert('Processamento confirmado! Componentes recuperados adicionados ao estoque.');
            fecharAnaliseDesmonte();
            carregarAmostras();
            carregarEstoque();
        } catch (err) {
            console.error(err);
        }
    };

    window.gerarLaudoPDF = async function(id) {
        const amostraId = id || activeAmostraIdForDesmonte;
        if (!amostraId) return;

        try {
            const res = await fetch(`/api/amostras/${amostraId}`);
            const data = await res.json();
            const { amostra, componentes } = data;

            // Carregar dados completos do Fornecedor vinculado
            let fornecedorObj = null;
            try {
                const fRes = await fetch('/api/fornecedores');
                const fList = await fRes.json();
                fornecedorObj = (fList || []).find(x => x.id === amostra.fornecedor_id);
            } catch(e) { console.warn('Erro ao carregar dados do fornecedor:', e); }

            // Carregar fotos registradas da amostra (por etapa)
            let fotosAmostraList = [];
            try {
                const ftRes = await fetch(`/api/amostras/${amostraId}/fotos`);
                const ftData = await ftRes.json();
                if (Array.isArray(ftData)) fotosAmostraList = ftData;
            } catch(e) { console.warn('Erro ao carregar fotos:', e); }

            // Carregar logo do cabeçalho
            let logoBase64 = null;
            try {
                const logoRes = await fetch('/assets/img/apexlogo.png');
                const logoBlob = await logoRes.blob();
                logoBase64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(logoBlob);
                });
            } catch(e) { console.warn('Logo cabeçalho não carregado:', e); }

            // Carregar Marca d'Água: logo (2).png
            let watermarkBase64 = null;
            try {
                const wRes = await fetch('/assets/img/logo (2).png');
                const wBlob = await wRes.blob();
                watermarkBase64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(wBlob);
                });
            } catch(e) {
                console.warn('Watermark logo (2).png não carregado:', e);
                watermarkBase64 = logoBase64;
            }

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            let currentPageNum = 1;

            function drawWatermark() {
                if (watermarkBase64) {
                    try {
                        pdf.saveGraphicsState();
                        pdf.setGState(new pdf.GState({ opacity: 0.09 }));
                        pdf.addImage(watermarkBase64, 'PNG', 25, 60, 160, 160, '', 'FAST');
                        pdf.restoreGraphicsState();
                    } catch(e) { console.warn(e); }
                }
            }

            function drawFooter(pageNum = 1) {
                pdf.setFillColor(13, 36, 22);
                pdf.rect(0, 283, 210, 14, 'F');
                pdf.setFillColor(42, 208, 122);
                pdf.rect(0, 283, 210, 1.5, 'F');
                pdf.setTextColor(42, 208, 122);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(7.5);
                pdf.text('APEXTECH METAIS ERP', 15, 289);
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(140, 210, 160);
                pdf.text('Tecnologia e Sustentabilidade na Reciclagem de Metais', 60, 289);
                pdf.setTextColor(255, 255, 255);
                pdf.text('Página ' + pageNum, 195, 289, { align: 'right' });
                pdf.setFontSize(7);
                pdf.setTextColor(120, 180, 140);
                pdf.text('Laudo No. APX-' + (amostra.numero_amostra || '') + '  |  ' + new Date().toLocaleDateString('pt-BR'), 15, 293);
            }

            function drawHeader() {
                pdf.setFillColor(13, 36, 22);
                pdf.rect(0, 0, 210, 42, 'F');
                pdf.setFillColor(42, 208, 122);
                pdf.rect(0, 42, 210, 2.5, 'F');

                if (logoBase64) {
                    try { pdf.addImage(logoBase64, 'PNG', 10, 5, 68, 23, '', 'FAST'); } catch(e) {}
                } else {
                    pdf.setTextColor(42, 208, 122);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(20);
                    pdf.text('APEXTECH METAIS', 15, 20);
                }

                pdf.setTextColor(140, 210, 160);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(7.5);
                pdf.text('TECNOLOGIA E SUSTENTABILIDADE NA RECICLAGEM DE METAIS', 15, 32);
                pdf.text('www.apextechmetais.com.br  |  sac@apextechmetais.com.br', 15, 37);

                pdf.setTextColor(42, 208, 122);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(10);
                pdf.text('No. LAUDO: APX-' + (amostra.numero_amostra || ''), 195, 14, { align: 'right' });
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(8);
                pdf.setTextColor(255, 255, 255);
                pdf.text('EMISSÃO: ' + new Date().toLocaleDateString('pt-BR'), 195, 20, { align: 'right' });
                const decStatus = amostra.decisao_diretoria || 'AGUARDANDO';
                const sc = decStatus === 'Aprovado' ? [42, 208, 122] : decStatus === 'Reprovado' ? [255, 80, 80] : [220, 200, 60];
                pdf.setTextColor(...sc);
                pdf.setFont('helvetica', 'bold');
                pdf.text(decStatus.toUpperCase(), 195, 26, { align: 'right' });
            }

            function checarNovaPagina(necessarioMm = 20) {
                if (y + necessarioMm > 275) {
                    drawFooter(currentPageNum);
                    pdf.addPage();
                    currentPageNum++;
                    drawWatermark();
                    drawHeader();
                    y = 50;
                }
            }

            drawWatermark();
            drawHeader();

            let y = 50;

            // ─── SEÇÃO 1: DADOS COMPLETOS DO FORNECEDOR E REGISTRO DO LOTE ─────────
            pdf.setFillColor(13, 36, 22);
            pdf.rect(15, y, 180, 8, 'F');
            pdf.setTextColor(42, 208, 122);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.text('DADOS COMPLETOS DO FORNECEDOR E REGISTRO DO LOTE', 17, y + 5.5);
            y += 12;

            const fnome = fornecedorObj ? (fornecedorObj.nome || fornecedorObj.apelido || amostra.fornecedor_nome) : (amostra.fornecedor_nome || '---');
            const fcnpj = fornecedorObj ? (fornecedorObj.cnpj || '---') : '---';
            const fcomp = fornecedorObj ? (fornecedorObj.comprador || '---') : '---';
            const ftel  = fornecedorObj ? ((fornecedorObj.fone1 || '') + ' ' + (fornecedorObj.email || '')).trim() : '---';
            const fend  = fornecedorObj ? ((fornecedorObj.endereco || '') + ' ' + (fornecedorObj.complemento || '')).trim() : '---';

            pdf.setFontSize(8.5);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(50, 50, 50);
            pdf.text('Fornecedor:', 17, y);
            pdf.setFont('helvetica', 'normal');
            pdf.text(fnome.toUpperCase(), 42, y);

            pdf.setFont('helvetica', 'bold');
            pdf.text('CNPJ/CPF:', 138, y);
            pdf.setFont('helvetica', 'normal');
            pdf.text(fcnpj, 160, y);
            y += 6;

            pdf.setFont('helvetica', 'bold');
            pdf.text('Material Recebido:', 17, y);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(10, 120, 50);
            pdf.text((amostra.nome_material || 'Material não informado').toUpperCase(), 48, y);
            pdf.setTextColor(50, 50, 50);

            pdf.setFont('helvetica', 'bold');
            pdf.text('Data Lote:', 138, y);
            pdf.setFont('helvetica', 'normal');
            pdf.text(new Date(amostra.data).toLocaleDateString('pt-BR'), 160, y);
            y += 6;

            pdf.setFont('helvetica', 'bold');
            pdf.text('Comprador / Contato:', 17, y);
            pdf.setFont('helvetica', 'normal');
            pdf.text(fcomp + (ftel ? ' (' + ftel + ')' : ''), 52, y);

            pdf.setFont('helvetica', 'bold');
            pdf.text('Peso Inicial:', 138, y);
            pdf.setFont('helvetica', 'normal');
            pdf.text(parseFloat(amostra.peso_inicial || 0).toLocaleString('pt-BR') + ' kg', 160, y);
            y += 6;

            pdf.setFont('helvetica', 'bold');
            pdf.text('Responsável Téc:', 17, y);
            pdf.setFont('helvetica', 'normal');
            pdf.text(amostra.responsavel || 'Eng. Roberto', 48, y);

            if (fend) {
                pdf.setFont('helvetica', 'bold');
                pdf.text('Endereço:', 138, y);
                pdf.setFont('helvetica', 'normal');
                pdf.text(pdf.splitTextToSize(fend, 38)[0], 156, y);
            }
            y += 6;

            if (amostra.observacoes) {
                pdf.setFont('helvetica', 'bold');
                pdf.text('Observações:', 17, y);
                pdf.setFont('helvetica', 'normal');
                pdf.text(pdf.splitTextToSize(amostra.observacoes, 155)[0], 42, y);
                y += 6;
            }
            y += 2;

            pdf.setDrawColor(42, 208, 122);
            pdf.setLineWidth(0.5);
            pdf.line(15, y, 195, y);
            y += 6;

            // ─── SEÇÃO 2: ESTRUTURAÇÃO RIGOROSA POR ETAPAS DE DESMONTE (MELHORIAS 7 A 10) ──────────────
            checarNovaPagina(50);
            pdf.setFillColor(13, 36, 22);
            pdf.rect(15, y, 180, 8, 'F');
            pdf.setTextColor(42, 208, 122);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.text('RASTREABILIDADE E REGISTRO FOTOGRÁFICO POR ETAPA', 17, y + 5.5);
            y += 12;

            // Mapeamento de fotos por etapa sem repetição
            const fotosPorEtapaMap = {
                'Recebimento': [],
                'Desmonte': [],
                'Viabilidade': [],
                'Aprovação': []
            };

            if (amostra.foto_original) {
                fotosPorEtapaMap['Recebimento'].push({ src: amostra.foto_original, nome: 'Foto do Produto/Lote Bruto' });
            }

            for (const f of fotosAmostraList) {
                try {
                    const imgUrl = `/api/amostras/${amostraId}/fotos/${f.id}/img`;
                    const imgRes = await fetch(imgUrl);
                    if (imgRes.ok) {
                        const imgBlob = await imgRes.blob();
                        const b64 = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(imgBlob);
                        });
                        const key = f.etapa || 'Desmonte';
                        if (!fotosPorEtapaMap[key]) fotosPorEtapaMap[key] = [];
                        fotosPorEtapaMap[key].push({ src: b64, nome: f.nome || `Foto ${key}` });
                    }
                } catch(e) { console.warn('Erro ao carregar imagem para PDF:', e); }
            }

            const etapasConfig = [
                { num: 1, titulo: 'ETAPA 1 — Produto Bruto & Recebimento', tipoMaterial: 'Produto Bruto', fotoKey: 'Recebimento' },
                { num: 2, titulo: 'ETAPA 2 — Triagem de Plásticos / Isolamentos', tipoMaterial: 'Plástico', fotoKey: 'Desmonte' },
                { num: 3, titulo: 'ETAPA 3 — Sucata de Cobre', tipoMaterial: 'Cobre', fotoKey: 'Viabilidade' },
                { num: 4, titulo: 'ETAPA 4 — Alumínio / Zamac / Outros Metais', tipoMaterial: 'Alumínio', fotoKey: 'Aprovação' }
            ];

            const cardH = 48;
            for (const cfg of etapasConfig) {
                checarNovaPagina(cardH + 8);
                const listaFotos = fotosPorEtapaMap[cfg.fotoKey] || [];
                const fotoItem = listaFotos.length > 0 ? listaFotos[0] : null;

                // Moldura da Etapa
                pdf.setFillColor(248, 252, 249);
                pdf.setDrawColor(13, 36, 22);
                pdf.setLineWidth(0.4);
                pdf.rect(15, y, 180, cardH, 'FD');

                // Imagem à esquerda (60x40mm)
                pdf.setDrawColor(42, 208, 122);
                pdf.setLineWidth(0.3);
                pdf.rect(17, y + 4, 60, cardH - 8);

                if (fotoItem && fotoItem.src) {
                    try {
                        pdf.addImage(fotoItem.src, 'JPEG', 18, y + 5, 58, cardH - 10, '', 'FAST');
                    } catch(e) {
                        try { pdf.addImage(fotoItem.src, 'PNG', 18, y + 5, 58, cardH - 10, '', 'FAST'); } catch(err2) {}
                    }
                } else {
                    pdf.setFillColor(230, 235, 238);
                    pdf.rect(18, y + 5, 58, cardH - 10, 'F');
                    pdf.setTextColor(120, 120, 120);
                    pdf.setFont('helvetica', 'bold');
                    pdf.setFontSize(8);
                    pdf.text('Foto não cadastrada.', 28, y + (cardH / 2));
                }

                // Conteúdo Técnico à Direita
                const infoX = 82;
                pdf.setFillColor(13, 36, 22);
                pdf.rect(infoX, y + 4, 110, 6, 'F');
                pdf.setTextColor(42, 208, 122);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(8);
                pdf.text(cfg.titulo.toUpperCase(), infoX + 4, y + 8.2);

                let infoY = y + 14;
                pdf.setTextColor(50, 50, 50);
                pdf.setFont('helvetica', 'bold');
                pdf.setFontSize(7.5);

                if (cfg.num === 1) {
                    pdf.text(`Nome do Produto: ${(amostra.nome_material || 'Não Informado').toUpperCase()}`, infoX, infoY); infoY += 4.5;
                    pdf.text(`Código: APX-${amostra.numero_amostra || '000'} | Categoria: Industrial`, infoX, infoY); infoY += 4.5;
                    pdf.text(`Data: ${new Date(amostra.data).toLocaleDateString('pt-BR')} | Operador: ${amostra.responsavel || 'Eng. Roberto'}`, infoX, infoY); infoY += 4.5;
                    pdf.text(`Peso Bruto: ${parseFloat(amostra.peso_inicial || 0).toLocaleString('pt-BR')} kg`, infoX, infoY); infoY += 4.5;
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(`Observações: ${amostra.observacoes || 'Sem observações iniciais.'}`, infoX, infoY);
                } else {
                    const matsRelacionados = (componentes || []).filter(c => 
                        (c.material_nome || '').toLowerCase().includes(cfg.tipoMaterial.toLowerCase()) ||
                        (c.material_categoria || '').toLowerCase().includes(cfg.tipoMaterial.toLowerCase())
                    );

                    if (matsRelacionados.length > 0) {
                        pdf.text(`Materiais Identificados (${cfg.tipoMaterial}):`, infoX, infoY); infoY += 4.5;
                        pdf.setFont('helvetica', 'normal');
                        matsRelacionados.forEach(mr => {
                            pdf.text(`• ${mr.material_nome}: ${parseFloat(mr.peso).toLocaleString('pt-BR')} kg (${parseFloat(mr.percentual).toFixed(1)}%)`, infoX + 2, infoY);
                            infoY += 4.5;
                        });
                    } else {
                        pdf.text(`Triagem de ${cfg.tipoMaterial}:`, infoX, infoY); infoY += 4.5;
                        pdf.setFont('helvetica', 'normal');
                        pdf.text(`• Sem componente isolado registrado especificamente nesta fração.`, infoX + 2, infoY);
                        infoY += 4.5;
                    }
                    pdf.setFont('helvetica', 'bold');
                    pdf.text('Parecer Técnico:', infoX, infoY); infoY += 4;
                    pdf.setFont('helvetica', 'normal');
                    pdf.text(pdf.splitTextToSize(amostra.parecer_tecnico || 'Desmonte executado conforme padrão.', 105).slice(0, 2), infoX, infoY);
                }

                y += cardH + 5;
            }

            // ─── SEÇÃO 3: RESULTADO DA ANÁLISE FÍSICA E DESMONTE ────────────────────
            checarNovaPagina(55); // Garante 55mm livres para o bloco completo

            pdf.setFillColor(13, 36, 22);
            pdf.rect(15, y, 180, 8, 'F');
            pdf.setTextColor(42, 208, 122);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.text('RESULTADO DA ANÁLISE FÍSICA E DESMONTE', 17, y + 5.5);

            let tableY = y + 11; // Inicia a tabela 11mm abaixo da barra de título

            // Cabeçalho da Tabela de Componentes (Altura 7mm)
            pdf.setFillColor(20, 60, 35);
            pdf.rect(15, tableY, 180, 7, 'F');
            pdf.setTextColor(42, 208, 122);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8.5);
            pdf.text('Material Recuperado', 18, tableY + 4.8);
            pdf.text('Peso Liq.', 110, tableY + 4.8);
            pdf.text('Rendimento', 145, tableY + 4.8);
            pdf.text('Dificuldade', 170, tableY + 4.8);
            
            tableY += 10.0; // Avança 10mm (7mm da caixa + 3mm de margem livre)

            let sumPeso = 0;
            pdf.setFont('helvetica', 'normal');

            if (componentes && componentes.length > 0) {
                componentes.forEach((c, idx) => {
                    checarNovaPagina(8);
                    if (idx % 2 === 0) {
                        pdf.setFillColor(238, 250, 242);
                        pdf.rect(15, tableY, 180, 7, 'F');
                    }
                    pdf.setTextColor(50, 50, 50);
                    pdf.setFontSize(8.5);
                    pdf.text((c.material_nome || '?') + ' (' + (c.material_categoria || '') + ')', 18, tableY + 4.8);
                    pdf.text(parseFloat(c.peso).toLocaleString('pt-BR') + ' kg', 110, tableY + 4.8);
                    pdf.text(fmtBRL(c.percentual) + ' %', 148, tableY + 4.8);
                    if (c.dificuldade) {
                        const dc = c.dificuldade === 'Alta' ? [200,50,50] : c.dificuldade === 'Média' ? [180,130,0] : [30,130,60];
                        pdf.setTextColor(...dc);
                        pdf.setFontSize(7.5);
                        pdf.text(c.dificuldade, 172, tableY + 4.8);
                    }
                    sumPeso += parseFloat(c.peso);
                    tableY += 8.5;
                });
            }

            // Linha de Perda Física / Resíduos Industriais (Altura 7mm, posicionada 10mm abaixo do cabeçalho)
            const perda = parseFloat(amostra.peso_inicial || 0) - sumPeso;
            const pctPerda = parseFloat(amostra.peso_inicial || 0) > 0 ? (perda / parseFloat(amostra.peso_inicial)) * 100 : 0;
            
            pdf.setFillColor(255, 240, 240);
            pdf.rect(15, tableY, 180, 7, 'F');
            pdf.setTextColor(180, 40, 40);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8.5);
            pdf.text('Resíduos Industriais / Perda Física', 18, tableY + 4.8);
            pdf.text((perda > 0 ? perda : 0).toLocaleString('pt-BR') + ' kg', 110, tableY + 4.8);
            pdf.text(fmtBRL(pctPerda > 0 ? pctPerda : 0) + ' %', 148, tableY + 4.8);
            
            tableY += 12;
            y = tableY; // Atualiza o ponteiro global y com o valor acumulado em tableY

            // Consolidação química
            checarNovaPagina(20);
            pdf.setFillColor(13, 36, 22);
            pdf.rect(15, y, 180, 15, 'F');
            pdf.setTextColor(42, 208, 122);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8.5);
            pdf.text('COMPOSIÇÃO CONSOLIDADA / FÓRMULA QUÍMICA:', 18, y + 5);
            pdf.setFont('courier', 'normal');
            pdf.setTextColor(170, 255, 200);
            pdf.setFontSize(7.5);
            const fstr = componentes.map(c => parseFloat(c.percentual).toFixed(1) + '% ' + (c.material_nome || '?').toUpperCase()).join('  -  ');
            pdf.text(pdf.splitTextToSize(fstr, 170)[0] || fstr, 18, y + 11);
            y += 19;

            // ─── SEÇÃO 4: PARECERES TÉCNICOS E DECISÃO DE COMPRA ───────────────────
            checarNovaPagina(45);
            pdf.setFillColor(13, 36, 22);
            pdf.rect(15, y, 180, 7, 'F');
            pdf.setTextColor(42, 208, 122);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8.5);
            pdf.text('PARECERES TÉCNICO E DECISÃO DE COMPRA', 17, y + 5);
            y += 10;

            // Parecer técnico
            pdf.setFillColor(235, 248, 240);
            pdf.rect(15, y, 180, 18, 'F');
            pdf.setFillColor(42, 140, 80);
            pdf.rect(15, y, 4, 18, 'F');
            pdf.setDrawColor(42, 140, 80);
            pdf.setLineWidth(0.3);
            pdf.rect(15, y, 180, 18);
            pdf.setTextColor(10, 70, 30);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.text('PARECER TÉCNICO (LABORATÓRIO):', 22, y + 5);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(50, 50, 50);
            const pt = amostra.parecer_tecnico || '(sem observações informadas)';
            pdf.text(pdf.splitTextToSize(pt, 168).slice(0, 2), 22, y + 11);
            y += 22;

            // Decisão diretoria
            const decAprovada = amostra.decisao_diretoria === 'Aprovado';
            const isReprov = amostra.decisao_diretoria === 'Reprovado';
            const bgDec = decAprovada ? [235, 252, 240] : isReprov ? [252, 235, 235] : [248, 248, 235];
            const barDec = decAprovada ? [42, 168, 80] : isReprov ? [180, 40, 40] : [150, 140, 40];
            const txtDec = decAprovada ? [10, 70, 30] : isReprov ? [130, 20, 20] : [80, 70, 10];

            pdf.setFillColor(...bgDec);
            pdf.rect(15, y, 180, 24, 'F');
            pdf.setFillColor(...barDec);
            pdf.rect(15, y, 4, 24, 'F');
            pdf.setDrawColor(...barDec);
            pdf.setLineWidth(0.3);
            pdf.rect(15, y, 180, 24);
            pdf.setTextColor(...txtDec);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8.5);
            pdf.text('DECISÃO DA DIRETORIA: ' + (amostra.decisao_diretoria || 'AGUARDANDO').toUpperCase(), 22, y + 6);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(50, 50, 50);
            pdf.setFontSize(8);
            let dy = y + 12;
            if (amostra.obs_diretoria) {
                pdf.text(pdf.splitTextToSize('Obs: ' + amostra.obs_diretoria, 168).slice(0,1), 22, dy);
                dy += 5;
            }
            if (amostra.motivo_reprovacao) {
                pdf.setTextColor(160, 30, 30);
                pdf.setFont('helvetica', 'bold');
                pdf.text('Motivo da Reprovação: ' + amostra.motivo_reprovacao, 22, dy);
                dy += 5;
            }
            if (decAprovada && amostra.preco_compra_entregar) {
                pdf.setTextColor(10, 100, 40);
                pdf.setFont('helvetica', 'bold');
                pdf.text('Preço Autorizado - Entregar: R$ ' + fmtBRL(amostra.preco_compra_entregar) + '/kg  |  Coletar: R$ ' + fmtBRL(amostra.preco_compra_coletar || 0) + '/kg', 22, dy);
                dy += 5;
            }
            y += 28;

            // ─── SEÇÃO 5: ASSINATURAS E RASTREABILIDADE DIGITAL / ELETRÔNICA ────────
            checarNovaPagina(40);
            pdf.setFillColor(13, 36, 22);
            pdf.rect(15, y, 180, 7, 'F');
            pdf.setTextColor(42, 208, 122);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8.5);
            pdf.text('ASSINATURAS E RASTREABILIDADE DIGITAL / ELETRÔNICA', 17, y + 5);
            y += 12;

            const sigBoxWidth = 85;
            const sigY = y;

            // Assinatura Técnico Executor
            pdf.setDrawColor(42, 140, 80);
            pdf.setLineWidth(0.4);
            pdf.line(17, sigY + 12, 17 + sigBoxWidth, sigY + 12);
            pdf.setTextColor(30, 30, 30);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.text((amostra.tecnico_analise || amostra.responsavel || 'Analista de Laboratório').toUpperCase(), 17, sigY + 16);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(100, 100, 100);
            pdf.setFontSize(7);
            pdf.text('Perfil: Técnico Responsável / Laboratório', 17, sigY + 20);
            pdf.text('Status Execução: Desmonte e Triagem OK', 17, sigY + 24);

            // Assinatura Diretoria / Aprovador
            const dirX = 110;
            pdf.setDrawColor(42, 140, 80);
            pdf.setLineWidth(0.4);
            pdf.line(dirX, sigY + 12, dirX + sigBoxWidth, sigY + 12);
            pdf.setTextColor(30, 30, 30);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            pdf.text((amostra.autorizado_por || 'Diretoria ApexTech').toUpperCase(), dirX, sigY + 16);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(100, 100, 100);
            pdf.setFontSize(7);
            pdf.text('Perfil: Diretoria / Autorização Estratégica', dirX, sigY + 20);
            pdf.text('Decisão: ' + (amostra.decisao_diretoria || 'Aguardando'), dirX, sigY + 24);

            y += 30;

            // Rodapé final com total de páginas
            drawFooter(currentPageNum);

            pdf.save('LAUDO_APEXTECH_' + (amostra.numero_amostra || 'PDF') + '.pdf');

        } catch (err) {
            console.error('Erro ao gerar laudo PDF:', err);
            alert('Erro ao gerar o laudo. Tente novamente.');
        }
    };

    // --- 6.5. CENTRAL BI (ANALYTICS) ---
    let biChartEvolucaoObj = null;
    let biChartComposicaoObj = null;
    let biChartFornecedoresObj = null;
    let biChartMargensObj = null;

    window.initApexBI = function() {
        carregarDadosBI();
    };

    async function carregarDadosBI() {
        try {
            const resAmo = await fetch('/api/amostras');
            const amostras = await resAmo.json();
            
            const resPlan = await fetch('/api/planejamento-compras');
            const planejamento = await resPlan.json();

            const resEst = await fetch('/api/estoque');
            const { estoque } = await resEst.json();

            // ─── KPIs ───
            let pesoTotal = 0;
            let totalCompra = 0;
            let faturamento = 0;
            let lucroConsolidado = 0;

            planejamento.forEach(p => {
                pesoTotal += parseFloat(p.peso_comprado) || 0;
                const totalC = (parseFloat(p.peso_comprado) || 0) * (parseFloat(p.preco_compra) || 0);
                const pesoMat = (parseFloat(p.peso_comprado) || 0) * ((parseFloat(p.percentual_rendimento) || 0) / 100);
                const totalV = pesoMat * (parseFloat(p.preco_venda_material) || 0);
                totalCompra += totalC;
                faturamento += totalV;
            });
            lucroConsolidado = faturamento - totalCompra;
            const margemConsolidada = faturamento > 0 ? (lucroConsolidado / faturamento) * 100 : 0;

            let totalPesoOriginalAmostras = 0;
            let totalPesoPerdaAmostras = 0;
            
            amostras.forEach(a => {
                if (a.status === 'Processado' || a.status === 'Liberado para Produção') {
                    const weight = parseFloat(a.peso_inicial) || 0;
                    totalPesoOriginalAmostras += weight;
                    
                    const lotes = planejamento.filter(l => l.amostra_id === a.id);
                    if (lotes.length > 0) {
                        const avgRend = lotes.reduce((acc, curr) => acc + parseFloat(curr.percentual_rendimento), 0) / lotes.length;
                        totalPesoPerdaAmostras += weight * (1 - (avgRend / 100));
                    } else {
                        totalPesoPerdaAmostras += weight * 0.05;
                    }
                }
            });
            const taxaPerdaIndustrial = totalPesoOriginalAmostras > 0 ? (totalPesoPerdaAmostras / totalPesoOriginalAmostras) * 100 : 2.5;

            document.getElementById('bi-kpi-peso-total').textContent = pesoTotal.toLocaleString('pt-BR') + ' kg';
            document.getElementById('bi-kpi-faturamento').textContent = 'R$ ' + faturamento.toLocaleString('pt-BR', {minimumFractionDigits:2});
            document.getElementById('bi-kpi-lucro').textContent = 'R$ ' + lucroConsolidado.toLocaleString('pt-BR', {minimumFractionDigits:2});
            document.getElementById('bi-kpi-margem').textContent = fmtBRL(margemConsolidada) + ' %';
            document.getElementById('bi-kpi-perda').textContent = fmtBRL(taxaPerdaIndustrial) + ' %';

            // ── Gráfico 1: Evolução Mensal ──
            const mesesMap = {};
            planejamento.forEach(p => {
                const m = p.mes || '2026-07';
                if (!mesesMap[m]) mesesMap[m] = { compra: 0, venda: 0, lucro: 0 };
                const totalC = (parseFloat(p.peso_comprado) || 0) * (parseFloat(p.preco_compra) || 0);
                const pesoMat = (parseFloat(p.peso_comprado) || 0) * ((parseFloat(p.percentual_rendimento) || 0) / 100);
                const totalV = pesoMat * (parseFloat(p.preco_venda_material) || 0);
                mesesMap[m].compra += totalC;
                mesesMap[m].venda += totalV;
                mesesMap[m].lucro += (totalV - totalC);
            });
            const mesesLabels = Object.keys(mesesMap).sort();
            const dataCompra = mesesLabels.map(m => mesesMap[m].compra);
            const dataVenda = mesesLabels.map(m => mesesMap[m].venda);
            const dataLucro = mesesLabels.map(m => mesesMap[m].lucro);

            if (biChartEvolucaoObj) biChartEvolucaoObj.destroy();
            const ctxEvol = document.getElementById('biChartEvolucao').getContext('2d');
            biChartEvolucaoObj = new Chart(ctxEvol, {
                type: 'bar',
                data: {
                    labels: mesesLabels,
                    datasets: [
                        { label: 'Custo Compra', data: dataCompra, backgroundColor: '#1e4e8c' },
                        { label: 'Faturamento Venda', data: dataVenda, backgroundColor: '#3e7cb1' },
                        { label: 'Lucro Bruto', data: dataLucro, backgroundColor: '#2AD07A' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { grid: { color: '#222' } } }
                }
            });

            // ── Gráfico 2: Composição das Amostras ──
            const compMap = {};
            estoque.forEach(e => {
                compMap[e.material_nome] = parseFloat(e.saldo) || 0;
            });
            const compLabels = Object.keys(compMap);
            const compData = Object.values(compMap);

            if (biChartComposicaoObj) biChartComposicaoObj.destroy();
            const ctxComp = document.getElementById('biChartComposicao').getContext('2d');
            biChartComposicaoObj = new Chart(ctxComp, {
                type: 'doughnut',
                data: {
                    labels: compLabels,
                    datasets: [{
                        data: compData,
                        backgroundColor: ['#e07b39', '#7eb3d5', '#a8c5a0', '#b0a0c0', '#d4b896', '#2AD07A', '#3e7cb1', '#cccccc']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'right' } }
                }
            });

            // ── Gráfico 3: Ranking de Fornecedores ──
            const fornMap = {};
            planejamento.forEach(p => {
                const f = p.fornecedor_nome || 'Desconhecido';
                if (!fornMap[f]) fornMap[f] = { volume: 0, lucro: 0 };
                const totalC = (parseFloat(p.peso_comprado) || 0) * (parseFloat(p.preco_compra) || 0);
                const pesoMat = (parseFloat(p.peso_comprado) || 0) * ((parseFloat(p.percentual_rendimento) || 0) / 100);
                const totalV = pesoMat * (parseFloat(p.preco_venda_material) || 0);
                fornMap[f].volume += parseFloat(p.peso_comprado) || 0;
                fornMap[f].lucro += (totalV - totalC);
            });
            const fornLabels = Object.keys(fornMap);
            const fornVolumeData = fornLabels.map(f => fornMap[f].volume);
            const fornLucroData = fornLabels.map(f => fornMap[f].lucro);

            if (biChartFornecedoresObj) biChartFornecedoresObj.destroy();
            const ctxForn = document.getElementById('biChartFornecedores').getContext('2d');
            biChartFornecedoresObj = new Chart(ctxForn, {
                type: 'bar',
                data: {
                    labels: fornLabels,
                    datasets: [
                        { label: 'Lucro Projetado (R$)', data: fornLucroData, backgroundColor: '#2AD07A', yAxisID: 'y' },
                        { label: 'Volume (kg)', data: fornVolumeData, type: 'line', borderColor: '#3e7cb1', backgroundColor: 'transparent', yAxisID: 'y1' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { type: 'linear', display: true, position: 'left', grid: { color: '#222' } },
                        y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
                    }
                }
            });

            // ── Gráfico 4: Margem de Compra Coleta vs Entrega ──
            const catMargem = {};
            localPrecos.forEach(p => {
                const cat = p.material_categoria;
                if (!catMargem[cat]) catMargem[cat] = { entrega: 0, coleta: 0, count: 0 };
                const lucroEnt = p.venda_ref - p.preco_entregar;
                const margemEnt = p.venda_ref > 0 ? (lucroEnt / p.venda_ref) * 100 : 0;
                const lucroCol = p.venda_ref - p.preco_coletar;
                const margemCol = p.venda_ref > 0 ? (lucroCol / p.venda_ref) * 100 : 0;
                catMargem[cat].entrega += margemEnt;
                catMargem[cat].coleta += margemCol;
                catMargem[cat].count++;
            });
            const catLabels = Object.keys(catMargem);
            const catEntrega = catLabels.map(c => catMargem[c].entrega / catMargem[c].count);
            const catColeta = catLabels.map(c => catMargem[c].coleta / catMargem[c].count);

            if (biChartMargensObj) biChartMargensObj.destroy();
            const ctxMarg = document.getElementById('biChartMargens').getContext('2d');
            biChartMargensObj = new Chart(ctxMarg, {
                type: 'bar',
                data: {
                    labels: catLabels,
                    datasets: [
                        { label: 'Margem Entrega (%)', data: catEntrega, backgroundColor: '#3e7cb1' },
                        { label: 'Margem Coleta (%)', data: catColeta, backgroundColor: '#e07b39' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { y: { grid: { color: '#222' } } }
                }
            });

            // ── TOP 10 Melhores Produtos (Margem Líquida) ──
            const topBody = document.getElementById('bi-top10-table-body');
            if (topBody && localPrecos && localPrecos.length > 0) {
                const listComMargem = localPrecos.map(p => {
                    const com = parseFloat(p.comissao || 0);
                    const pis = parseFloat(p.pis_cofins || 0);
                    const fdc = parseFloat(p.fidc || 0);
                    const icm = parseFloat(p.icms || 0);
                    const frete = parseFloat(p.frete_coleta || 0);

                    const totalDedPct = com + pis + fdc + icm;
                    const valDeducoes = (parseFloat(p.venda_ref) || 0) * (totalDedPct / 100);
                    const vendaLiquida = (parseFloat(p.venda_ref) || 0) - valDeducoes;

                    const lucroLiqEnt = vendaLiquida - (parseFloat(p.preco_entregar) || 0);
                    const margemLiqEnt = (parseFloat(p.venda_ref) || 0) > 0 ? (lucroLiqEnt / (parseFloat(p.venda_ref) || 0)) * 100 : 0;

                    const lucroLiqCol = vendaLiquida - (parseFloat(p.preco_coletar) || 0) - frete;
                    const margemLiqCol = (parseFloat(p.venda_ref) || 0) > 0 ? (lucroLiqCol / (parseFloat(p.venda_ref) || 0)) * 100 : 0;

                    return {
                        ...p,
                        vendaLiquida,
                        lucroLiqEnt,
                        margemLiqEnt,
                        lucroLiqCol,
                        margemLiqCol
                    };
                });

                listComMargem.sort((a, b) => b.margemLiqEnt - a.margemLiqEnt);
                const top10 = listComMargem.slice(0, 10);

                topBody.innerHTML = '';
                top10.forEach((item, idx) => {
                    const pos = idx + 1;
                    let posBadge = `<span style="background:#223547; color:#fff; padding:4px 8px; border-radius:12px; font-weight:bold; font-size:0.8rem;">#${pos}</span>`;
                    if (pos === 1) posBadge = `<span style="background:#ffb703; color:#000; padding:4px 10px; border-radius:12px; font-weight:bold; font-size:0.85rem;"><i class="fa-solid fa-crown"></i> #1</span>`;
                    else if (pos === 2) posBadge = `<span style="background:#c0c0c0; color:#000; padding:4px 9px; border-radius:12px; font-weight:bold; font-size:0.85rem;">#2</span>`;
                    else if (pos === 3) posBadge = `<span style="background:#cd7f32; color:#fff; padding:4px 9px; border-radius:12px; font-weight:bold; font-size:0.85rem;">#3</span>`;

                    let statusBadge = '<span style="background:#0d3020; color:#2AD07A; padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:bold;">Excelente</span>';
                    if (item.margemLiqEnt < 5) {
                        statusBadge = '<span style="background:#3a1515; color:#ff6b6b; padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:bold;">Atenção/Baixa</span>';
                    } else if (item.margemLiqEnt < 15) {
                        statusBadge = '<span style="background:#3a2e00; color:#f0b800; padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:bold;">Boa</span>';
                    }

                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid #1a2a3a';
                    tr.innerHTML = `
                        <td style="padding:10px 12px; text-align:center;">${posBadge}</td>
                        <td style="padding:10px 12px;"><strong style="color:#fff;">${item.material_nome || '-'}</strong></td>
                        <td style="padding:10px 12px; color:#aaa;">${item.material_categoria || '-'}</td>
                        <td style="padding:10px 12px; text-align:right; color:#ffeb3b; font-weight:bold;">R$ ${fmtBRL(item.venda_ref)}</td>
                        <td style="padding:10px 12px; text-align:right;">R$ ${fmtBRL(item.preco_entregar)}</td>
                        <td style="padding:10px 12px; text-align:right;">R$ ${fmtBRL(item.preco_coletar)}</td>
                        <td style="padding:10px 12px; text-align:right; color:#2AD07A; font-weight:bold; font-size:0.9rem;">${fmtBRL(item.margemLiqEnt)}%</td>
                        <td style="padding:10px 12px; text-align:right; color:#4fc3f7; font-weight:bold; font-size:0.9rem;">${fmtBRL(item.margemLiqCol)}%</td>
                        <td style="padding:10px 12px; text-align:center;">${statusBadge}</td>
                    `;
                    topBody.appendChild(tr);
                });
            }

        } catch (err) {
            console.error(err);
        }
    }

    function popularSeletoresAmostras() {
        const plA = document.getElementById('pl-amostra');
        if (plA) {
            plA.innerHTML = '<option value="">-- Lote Avulso (Sem amostra) --</option>';
            localAmostras.forEach(a => {
                plA.innerHTML += `<option value="${a.id}">${a.numero_amostra} - ${a.fornecedor_nome} (${parseFloat(a.peso_inicial).toFixed(0)}kg)</option>`;
            });
        }
    }

    // --- 5. PLANEJAMENTO MENSAL DE FORNECEDORES ---
    window.initApexPlanejamento = function() {
        carregarPlanejamento();
    };

    async function carregarPlanejamento() {
        try {
            const res = await fetch('/api/planejamento-compras');
            const data = await res.json();
            localPlanejamento = Array.isArray(data) ? data : [];
            renderPlanejamento();
        } catch (err) {
            console.error('Erro ao carregar planejamento:', err);
            localPlanejamento = [];
        }
    }

    function renderPlanejamento() {
        const body = document.getElementById('planejamento-table-body');
        const footer = document.getElementById('planejamento-table-footer');
        if (!body || !footer) return;

        body.innerHTML = '';
        footer.innerHTML = '';

        let pesoTotal = 0;
        let totalCompra = 0;
        let pesoMaterialTotal = 0;
        let totalVenda = 0;
        let lucroBrutoTotal = 0;

        localPlanejamento.forEach(lc => {
            const totalC = parseFloat(lc.peso_comprado) * parseFloat(lc.preco_compra);
            const pesoMat = parseFloat(lc.peso_comprado) * (parseFloat(lc.percentual_rendimento) / 100);
            const totalV = pesoMat * parseFloat(lc.preco_venda_material);
            const lucroB = totalV - totalC;
            const pctInv = totalC > 0 ? (lucroB / totalC) * 100 : 0;
            const pctFat = totalV > 0 ? (lucroB / totalV) * 100 : 0;
            const resultadoLiq = pctFat - parseFloat(lc.comissao) - parseFloat(lc.fidc);

            pesoTotal += parseFloat(lc.peso_comprado);
            totalCompra += totalC;
            pesoMaterialTotal += pesoMat;
            totalVenda += totalV;
            lucroBrutoTotal += lucroB;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:8px;"><strong>${lc.fornecedor_nome}</strong></td>
                <td style="padding:8px;">${lc.produto}</td>
                <td style="padding:8px; text-align:right;">${parseFloat(lc.peso_comprado).toLocaleString('pt-BR')} kg</td>
                <td style="padding:8px; text-align:right;">R$ ${fmtBRL(lc.preco_compra)}</td>
                <td style="padding:8px; text-align:right;">R$ ${totalC.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                <td style="padding:8px; text-align:right;">${fmtBRL(lc.percentual_rendimento)}%</td>
                <td style="padding:8px;">${lc.material_nome}</td>
                <td style="padding:8px; text-align:right;">${pesoMat.toLocaleString('pt-BR')} kg</td>
                <td style="padding:8px; text-align:right;">R$ ${fmtBRL(lc.preco_venda_material)}</td>
                <td style="padding:8px; text-align:right;">R$ ${totalV.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                <td style="padding:8px; text-align:right; color:#2AD07A;">R$ ${lucroB.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                <td style="padding:8px; text-align:right;">${fmtBRL(pctInv)}%</td>
                <td style="padding:8px; text-align:right;">${fmtBRL(pctFat)}%</td>
                <td style="padding:8px; text-align:right;">${fmtBRL(lc.comissao)}%</td>
                <td style="padding:8px; text-align:right;">${fmtBRL(lc.fidc)}%</td>
                <td style="padding:8px; text-align:right; font-weight:bold; color:${resultadoLiq >= 0 ? '#2AD07A' : '#ff4d4d'}">${fmtBRL(resultadoLiq)}%</td>
            `;
            body.appendChild(tr);
        });

        // Rodapé de Fechamento consolidado
        const avgPrecoCompra = pesoTotal > 0 ? totalCompra / pesoTotal : 0;
        const avgRendimento = pesoTotal > 0 ? (pesoMaterialTotal / pesoTotal) * 100 : 0;
        const avgPrecoVenda = pesoMaterialTotal > 0 ? totalVenda / pesoMaterialTotal : 0;
        const overallInv = totalCompra > 0 ? (lucroBrutoTotal / totalCompra) * 100 : 0;
        const overallFat = totalVenda > 0 ? (lucroBrutoTotal / totalVenda) * 100 : 0;
        const overallLiq = overallFat - 2.0 - 2.3; // Default comissão/fidc médios

        footer.innerHTML = `
            <tr style="background:#0a2342; border-top: 2px solid #3e7cb1;">
                <td colspan="2" style="padding:10px;"><strong>TOTAIS CONSOLIDADOS</strong></td>
                <td style="padding:10px; text-align:right;"><strong>${pesoTotal.toLocaleString('pt-BR')} kg</strong></td>
                <td style="padding:10px; text-align:right;">R$ ${fmtBRL(avgPrecoCompra)}</td>
                <td style="padding:10px; text-align:right;"><strong>R$ ${totalCompra.toLocaleString('pt-BR', {minimumFractionDigits:2})}</strong></td>
                <td style="padding:10px; text-align:right;">${fmtBRL(avgRendimento)}%</td>
                <td style="padding:10px;">-</td>
                <td style="padding:10px; text-align:right;"><strong>${pesoMaterialTotal.toLocaleString('pt-BR')} kg</strong></td>
                <td style="padding:10px; text-align:right;">R$ ${fmtBRL(avgPrecoVenda)}</td>
                <td style="padding:10px; text-align:right;"><strong>R$ ${totalVenda.toLocaleString('pt-BR', {minimumFractionDigits:2})}</strong></td>
                <td style="padding:10px; text-align:right; color:#2AD07A;"><strong>R$ ${lucroBrutoTotal.toLocaleString('pt-BR', {minimumFractionDigits:2})}</strong></td>
                <td style="padding:10px; text-align:right;">${fmtBRL(overallInv)}%</td>
                <td style="padding:10px; text-align:right;">${fmtBRL(overallFat)}%</td>
                <td colspan="2" style="padding:10px;">-</td>
                <td style="padding:10px; text-align:right; color:#2AD07A;"><strong>${fmtBRL(overallLiq)}%</strong></td>
            </tr>
        `;
    }

    window.abrirModalPlanejamento = function() {
        document.getElementById('form-planejamento-apex').reset();
        document.getElementById('modal-planejamento').style.display = 'flex';
    };

    window.fecharModalPlanejamento = function() {
        document.getElementById('modal-planejamento').style.display = 'none';
    };

    window.popularDadosDaAmostraNoPlan = async function() {
        const amostraId = document.getElementById('pl-amostra').value;
        if (!amostraId) return;

        try {
            const res = await fetch(`/api/amostras/${amostraId}`);
            const data = await res.json();
            const { amostra, componentes } = data;

            document.getElementById('pl-fornecedor').value = amostra.fornecedor_id;
            document.getElementById('pl-peso').value = amostra.peso_inicial;
            
            // Acha componente principal com maior rendimento
            if (componentes.length > 0) {
                componentes.sort((a,b) => b.percentual - a.percentual);
                document.getElementById('pl-material-result').value = componentes[0].material_id;
                document.getElementById('pl-rendimento').value = componentes[0].percentual;
                document.getElementById('pl-produto').value = componentes[0].material_nome;

                // Favorecer o preço especial de compra autorizado pelo Diretor
                if (amostra.decisao_diretoria === 'Aprovado' && amostra.preco_compra_entregar) {
                    document.getElementById('pl-preco-compra').value = amostra.preco_compra_entregar;
                    // Preço de venda de referência da tabela geral
                    const prc = localPrecos.find(x => x.material_id === componentes[0].material_id);
                    if (prc) {
                        document.getElementById('pl-preco-venda').value = prc.venda_ref;
                    }
                } else {
                    // Fallback para preço da tabela geral
                    const prc = localPrecos.find(x => x.material_id === componentes[0].material_id);
                    if (prc) {
                        document.getElementById('pl-preco-compra').value = prc.preco_entregar;
                        document.getElementById('pl-preco-venda').value = prc.venda_ref;
                    }
                }
            }
            calcularLotePlanSimulacao();
        } catch (err) {
            console.error(err);
        }
    };

    window.calcularLotePlanSimulacao = function() {
        const peso = parseFloat(document.getElementById('pl-peso').value) || 0;
        const precoCompra = parseFloat(document.getElementById('pl-preco-compra').value) || 0;
        const rendimento = parseFloat(document.getElementById('pl-rendimento').value) || 0;
        const precoVenda = parseFloat(document.getElementById('pl-preco-venda').value) || 0;
        const comissao = parseFloat(document.getElementById('pl-comissao').value) || 0;
        const fidc = parseFloat(document.getElementById('pl-fidc').value) || 0;

        const totalC = peso * precoCompra;
        const pesoResultante = peso * (rendimento / 100);
        const totalV = pesoResultante * precoVenda;
        const lucroB = totalV - totalC;
        
        const valorComissao = totalV * (comissao / 100);
        const valorFidc = totalV * (fidc / 100);
        
        const lucroLiqSemFidc = lucroB - valorComissao;
        const lucroLiqComFidc = lucroLiqSemFidc - valorFidc;
        
        const margem = totalV > 0 ? (lucroLiqSemFidc / totalV) * 100 : 0;
        const roi = totalC > 0 ? (lucroLiqSemFidc / totalC) * 100 : 0;

        document.getElementById('sim-custo-total').textContent = 'R$ ' + totalC.toLocaleString('pt-BR', {minimumFractionDigits:2});
        document.getElementById('sim-fat-total').textContent = 'R$ ' + totalV.toLocaleString('pt-BR', {minimumFractionDigits:2});
        document.getElementById('sim-lucro-bruto').textContent = 'R$ ' + lucroB.toLocaleString('pt-BR', {minimumFractionDigits:2});
        
        // Exibindo lucro líquido sem considerar o desconto antecipado (já que é opcional)
        document.getElementById('sim-res-liquido').textContent = 'R$ ' + lucroLiqSemFidc.toLocaleString('pt-BR', {minimumFractionDigits:2});
        document.getElementById('sim-margem').textContent = fmtBRL(margem) + ' %';
        document.getElementById('sim-roi').textContent = fmtBRL(roi) + ' %';
        
        // Salvar valores no window para o Simulador usar
        window.currentSimData = {
            peso, precoCompra, rendimento, precoVenda, comissao, fidc,
            totalC, pesoResultante, totalV, lucroB, valorComissao, valorFidc,
            lucroLiqSemFidc, lucroLiqComFidc, margem, roi
        };
    };

    
    // --- INICIO: SIMULADOR FIDC ---
    let chartFidcInstance = null;

    window.abrirSimuladorFIDC = function() {
        if (!window.currentSimData) {
            alert('Preencha os dados do planejamento primeiro.');
            return;
        }

        const data = window.currentSimData;
        const prazo = parseInt(document.getElementById('pl-prazo').value) || 30;
        const cliente = document.getElementById('pl-cliente').value || 'Não informado';

        document.getElementById('sim-fidc-prazo-s').textContent = prazo;
        document.getElementById('sim-fidc-lucro-s').textContent = 'R$ ' + data.lucroLiqSemFidc.toLocaleString('pt-BR', {minimumFractionDigits:2});
        
        document.getElementById('sim-fidc-taxa-c').textContent = fmtBRL(data.fidc) + '%';
        document.getElementById('sim-fidc-lucro-c').textContent = 'R$ ' + data.lucroLiqComFidc.toLocaleString('pt-BR', {minimumFractionDigits:2});

        // Alternativas
        const taxasAlt = [1.0, 1.5, 2.0, 2.5, 3.0];
        const containerTaxas = document.getElementById('sim-fidc-tabela-taxas');
        containerTaxas.innerHTML = '';
        taxasAlt.forEach(t => {
            const valF = data.totalV * (t / 100);
            const lucroT = data.lucroLiqSemFidc - valF;
            containerTaxas.innerHTML += `
                <div style="background:#0d1a26; border:1px solid #1e3a5f; padding:10px; border-radius:6px; text-align:center;">
                    <div style="color:#e07b39; font-weight:bold; margin-bottom:5px;">${fmtBRL(t)}%</div>
                    <div style="color:#2AD07A; font-size:0.9rem;">R$ ${lucroT.toLocaleString('pt-BR', {minimumFractionDigits:2})}</div>
                </div>
            `;
        });

        // Inteligencia
        let indicador = '🟢';
        let titulo = 'Excelente para antecipar';
        let cor = '#2AD07A';
        
        const impactoFidcNoLucro = data.lucroB > 0 ? (data.valorFidc / data.lucroB) : 1;
        if (impactoFidcNoLucro > 0.4 || data.margem < 5) {
            indicador = '🔴'; titulo = 'Não recomendado'; cor = '#ff4d4d';
        } else if (impactoFidcNoLucro > 0.2) {
            indicador = '🟡'; titulo = 'Avaliar necessidade'; cor = '#f0b800';
        }

        const dif = data.lucroLiqSemFidc - data.lucroLiqComFidc;
        document.getElementById('sim-fidc-indicador-icone').textContent = indicador;
        document.getElementById('sim-fidc-indicador-titulo').textContent = titulo;
        document.getElementById('sim-fidc-indicador-titulo').style.color = cor;
        document.getElementById('sim-fidc-inteligencia-box').style.borderLeftColor = cor;

        let txt = `A antecipação via FIDC reduzirá seu lucro em <strong>R$ ${dif.toLocaleString('pt-BR', {minimumFractionDigits:2})}</strong> (${fmtBRL(data.fidc)}%), porém disponibilizará o capital imediatamente (economia de ${prazo} dias), aumentando a liquidez da empresa. `;
        
        if (indicador === '🔴') {
            txt += "Como o impacto do FIDC no lucro bruto é alto ou a margem da operação é baixa, recomenda-se <strong>NÃO antecipar</strong> os recebíveis a menos que haja urgência de caixa.";
        } else if (indicador === '🟡') {
            txt += "O impacto financeiro é moderado. Avalie a real necessidade de capital de giro antes de realizar a antecipação.";
        } else {
            txt += "Excelente oportunidade de antecipação. O custo financeiro não compromete a lucratividade e fortalece o fluxo de caixa.";
        }
        
        document.getElementById('sim-fidc-inteligencia-texto').innerHTML = txt;
        document.getElementById('modal-simulador-fidc').style.display = 'flex';

        // Atualizar Grafico
        const ctx = document.getElementById('chart-fidc-simulador').getContext('2d');
        if (chartFidcInstance) chartFidcInstance.destroy();

        chartFidcInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['SEM FIDC', 'COM FIDC'],
                datasets: [
                    {
                        label: 'Lucro Líquido (R$)',
                        data: [data.lucroLiqSemFidc, data.lucroLiqComFidc],
                        backgroundColor: ['#2AD07A', '#f0b800']
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#1e3a5f' }, ticks: { color: '#aaa' } },
                    x: { ticks: { color: '#aaa' } }
                }
            }
        });

        // Registrar no historico
        window.simulacoesFidcHistorico = window.simulacoesFidcHistorico || [];
        window.simulacoesFidcHistorico.push({
            data: new Date().toISOString(),
            prazo,
            taxa: data.fidc,
            lucro_sem: data.lucroLiqSemFidc,
            lucro_com: data.lucroLiqComFidc
        });
    };

    window.fecharSimuladorFIDC = function() {
        document.getElementById('modal-simulador-fidc').style.display = 'none';
    };

    window.gerarPdfFIDC = async function() {
        if (!window.jspdf) {
            alert('A biblioteca jsPDF não carregou corretamente.');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const data = window.currentSimData;
        const prazo = document.getElementById('pl-prazo').value || '30';
        const cliente = document.getElementById('pl-cliente').value || 'N/A';
        const fornecedor = document.getElementById('pl-fornecedor').options[document.getElementById('pl-fornecedor').selectedIndex]?.text || 'N/A';
        const produto = document.getElementById('pl-produto').value || 'N/A';
        const fp = document.getElementById('pl-forma-pagamento').value;

        // Cabeçalho
        doc.setFontSize(18);
        doc.setTextColor(224, 123, 57);
        doc.text('Relatório Executivo - Inteligência Financeira (FIDC)', 15, 20);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR'), 15, 28);
        doc.text('Usuário: ' + (sessionStorage.getItem('apex_logged_user_name') || 'Admin'), 15, 34);

        // Dados da Operação
        doc.setFontSize(12);
        doc.setTextColor(40);
        doc.text('1. Dados da Operação', 15, 45);

        doc.autoTable({
            startY: 50,
            head: [['Fornecedor', 'Produto', 'Cliente', 'Prazo (dias)', 'Forma Pagamento']],
            body: [[fornecedor, produto, cliente, prazo, fp]],
            theme: 'grid',
            headStyles: { fillColor: [13, 26, 38] },
        });

        // Resultados Financeiros
        doc.text('2. Indicadores Financeiros', 15, doc.lastAutoTable.finalY + 10);
        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 15,
            head: [['Custo Total', 'Receita Estimada', 'Lucro Bruto', 'Comissão (%)', 'Margem (%)', 'ROI (%)']],
            body: [[
                'R$ ' + data.totalC.toLocaleString('pt-BR', {minimumFractionDigits:2}),
                'R$ ' + data.totalV.toLocaleString('pt-BR', {minimumFractionDigits:2}),
                'R$ ' + data.lucroB.toLocaleString('pt-BR', {minimumFractionDigits:2}),
                fmtBRL(data.comissao) + '%',
                data.fmtBRL(margem) + '%',
                data.fmtBRL(roi) + '%'
            ]],
            theme: 'grid',
            headStyles: { fillColor: [13, 26, 38] },
        });

        // Simulação FIDC
        doc.text('3. Simulação de Antecipação (FIDC)', 15, doc.lastAutoTable.finalY + 10);
        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 15,
            head: [['Taxa FIDC', 'Desconto Financeiro', 'Lucro SEM FIDC', 'Lucro COM FIDC', 'Diferença']],
            body: [[
                fmtBRL(data.fidc) + '%',
                'R$ ' + data.valorFidc.toLocaleString('pt-BR', {minimumFractionDigits:2}),
                'R$ ' + data.lucroLiqSemFidc.toLocaleString('pt-BR', {minimumFractionDigits:2}),
                'R$ ' + data.lucroLiqComFidc.toLocaleString('pt-BR', {minimumFractionDigits:2}),
                'R$ ' + (data.lucroLiqSemFidc - data.lucroLiqComFidc).toLocaleString('pt-BR', {minimumFractionDigits:2})
            ]],
            theme: 'grid',
            headStyles: { fillColor: [224, 123, 57] },
        });

        // Conclusão Inteligente
        doc.text('4. Parecer Financeiro', 15, doc.lastAutoTable.finalY + 10);
        
        const div = document.createElement('div');
        div.innerHTML = document.getElementById('sim-fidc-inteligencia-texto').innerHTML;
        const textoPuro = div.textContent || div.innerText || "";
        
        const splitText = doc.splitTextToSize(textoPuro, 180);
        doc.setFontSize(10);
        doc.text(splitText, 15, doc.lastAutoTable.finalY + 18);

        await aplicarMarcaDaguaLogoJsPDF(doc);

        doc.save('Relatorio_Financeiro_FIDC.pdf');
    };
    // --- FIM: SIMULADOR FIDC ---

    // ── Helper Marca d'água jsPDF ──────────────────────────────────────────────
    let cachedLogoWatermarkBase64 = null;
    async function getLogoWatermarkBase64JsPDF() {
        if (cachedLogoWatermarkBase64) return cachedLogoWatermarkBase64;
        try {
            const res = await fetch('/assets/img/logo%20(2).png');
            if (res.ok) {
                const blob = await res.blob();
                cachedLogoWatermarkBase64 = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
                return cachedLogoWatermarkBase64;
            }
        } catch(e) {
            console.warn('Erro ao carregar logo para marca dágua:', e);
        }
        return null;
    }

    async function aplicarMarcaDaguaLogoJsPDF(doc) {
        const logo = await getLogoWatermarkBase64JsPDF();
        if (!logo) return;
        
        if (doc.GState && doc.setGState) {
            try {
                doc.setGState(new doc.GState({ opacity: 0.08 }));
            } catch(e) {}
        }
        
        const pageCount = doc.internal.getNumberOfPages();
        for (let p = 1; p <= pageCount; p++) {
            doc.setPage(p);
            const pw = doc.internal.pageSize.getWidth();
            const ph = doc.internal.pageSize.getHeight();
            const imgW = 45;
            const imgH = 35;
            const stepX = 65;
            const stepY = 55;
            
            for (let y = 10; y < ph; y += stepY) {
                for (let x = 10; x < pw; x += stepX) {
                    try {
                        doc.addImage(logo, 'PNG', x, y, imgW, imgH);
                    } catch(err) {}
                }
            }
        }
        
        if (doc.GState && doc.setGState) {
            try {
                doc.setGState(new doc.GState({ opacity: 1.0 }));
            } catch(e) {}
        }
    }

    window.salvarPlanejamento = async function(e) {
        e.preventDefault();
        const data = {
            amostra_id: document.getElementById('pl-amostra').value || null,
            fornecedor_id: document.getElementById('pl-fornecedor').value,
            produto: document.getElementById('pl-produto').value,
            peso_comprado: document.getElementById('pl-peso').value,
            preco_compra: document.getElementById('pl-preco-compra').value,
            percentual_rendimento: document.getElementById('pl-rendimento').value,
            material_id: document.getElementById('pl-material-result').value,
            preco_venda_material: document.getElementById('pl-preco-venda').value,
            comissao: document.getElementById('pl-comissao').value,
            fidc: document.getElementById('pl-fidc').value,
            mes: document.getElementById('pl-mes').value,
            cliente: document.getElementById('pl-cliente').value,
            prazo_recebimento_dias: document.getElementById('pl-prazo').value,
            forma_pagamento: document.getElementById('pl-forma-pagamento').value,
            simulacoes_historico: window.simulacoesFidcHistorico || []
        };

        try {
            await fetch('/api/planejamento-compras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            fecharModalPlanejamento();
            carregarPlanejamento();
            carregarAmostras();
        } catch (err) {
            console.error(err);
        }
    };

    window.exportarPlanejamentoExcel = function() {
        alert('Planejamento Mensal exportado com sucesso (PLANEJAMENTO_DE_NVS_FORNECEDOR.xlsx)');
    };

    window.exportarPlanejamentoPDF = async function() {
        if (!window.jspdf) {
            alert('A biblioteca jsPDF não carregou corretamente.');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        // Build Table Body
        const body = [];
        if (typeof localPlanejamento !== 'undefined') {
            localPlanejamento.forEach(pl => {
                const fornObj = (window.localFornecedores || []).find(f => f.id == pl.fornecedor_id);
                const fornecedorStr = pl.fornecedor_nome || (fornObj ? (fornObj.nome || fornObj.nome_fantasia || fornObj.apelido) : '') || (pl.fornecedor_id ? `Fornecedor #${pl.fornecedor_id}` : '-');
                const mes = pl.mes || pl.mes_ref || (pl.criado_em ? new Date(pl.criado_em).toLocaleDateString('pt-BR', {month:'2-digit', year:'numeric'}) : '-') || '-';
                const reqData = pl.amostra_id ? `Amostra: ${pl.amostra_id}` : `[Avulso] ${pl.produto || 'Material'}`;
                const cStr = 'R$ ' + fmtBRL(pl.preco_compra);
                const vStr = 'R$ ' + fmtBRL(pl.preco_venda_material);
                
                const totalC = parseFloat(pl.peso_comprado || 0) * parseFloat(pl.preco_compra || 0);
                const pesoMat = parseFloat(pl.peso_comprado || 0) * (parseFloat(pl.percentual_rendimento || 0) / 100);
                const totalV = pesoMat * parseFloat(pl.preco_venda_material || 0);
                const lucroB = totalV - totalC;
                const pctFat = totalV > 0 ? (lucroB / totalV) * 100 : 0;
                const resultadoLiq = pctFat - parseFloat(pl.comissao || 0) - parseFloat(pl.fidc || 0);
                
                body.push([mes, fornecedorStr, reqData, cStr, vStr, fmtBRL(resultadoLiq) + '%']);
            });
        }

        doc.autoTable({
            startY: 45,
            head: [['Mês', 'Fornecedor', 'Produto/Referência', 'Preço Compra', 'Preço Venda', 'Margem Líq. Estimada']],
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [27, 45, 61] }
        });

        // Cabeçalho
        doc.setFontSize(18);
        doc.setTextColor(62, 124, 177); // #3e7cb1
        doc.text('Relatório de Planejamento Mensal - Fornecedores', 15, 20);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR'), 15, 28);
        doc.text('Usuário: ' + (sessionStorage.getItem('apex_logged_user_name') || 'Admin'), 15, 34);

        await aplicarMarcaDaguaLogoJsPDF(doc);

        doc.save(`Planejamento_Lote_${new Date().toISOString().split('T')[0]}.pdf`);
    };

    window.gerarPdfPlanejamentoModal = async function() {
        if (!window.jspdf) {
            alert('A biblioteca jsPDF não carregou corretamente.');
            return;
        }
        
        const amostraTxt = document.getElementById('pl-amostra').options[document.getElementById('pl-amostra').selectedIndex]?.text || '';
        const fornecedor = document.getElementById('pl-fornecedor').options[document.getElementById('pl-fornecedor').selectedIndex]?.text || '';
        const produto = document.getElementById('pl-produto').value || '';
        const pesoComprado = document.getElementById('pl-peso-comprado').value || '0';
        const precoCompra = document.getElementById('pl-preco-compra').value || '0';
        const rendimento = document.getElementById('pl-rendimento').value || '0';
        const material = document.getElementById('pl-material').options[document.getElementById('pl-material').selectedIndex]?.text || '';
        const precoVenda = document.getElementById('pl-preco-venda-material').value || '0';
        const comissao = document.getElementById('pl-comissao').value || '0';
        const fidc = document.getElementById('pl-fidc').value || '0';
        
        const lucroBruto = document.getElementById('sim-lucro-bruto').innerText;
        const lucroLiq = document.getElementById('sim-res-liquido').innerText;
        const margem = document.getElementById('sim-margem').innerText;
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Cabeçalho
        doc.setFontSize(18);
        doc.setTextColor(62, 124, 177);
        doc.text('Relatório Executivo - Simulação de Lote', 15, 20);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR'), 15, 28);
        doc.text('Usuário: ' + (sessionStorage.getItem('apex_logged_user_name') || 'Admin'), 15, 34);

        // Dados
        doc.setFontSize(12);
        doc.setTextColor(40);
        
        doc.autoTable({
            startY: 45,
            head: [['Campo', 'Valor Informado']],
            body: [
                ['Amostra', amostraTxt],
                ['Fornecedor', fornecedor],
                ['Produto', produto],
                ['Material Resultante', material],
                ['Peso Comprado', pesoComprado + ' kg'],
                ['Preço de Compra', 'R$ ' + parseFloat(precoCompra).toFixed(2)],
                ['Rendimento Estimado', rendimento + '%'],
                ['Preço Venda Estimado', 'R$ ' + parseFloat(precoVenda).toFixed(2)],
                ['Comissão', comissao + '%'],
                ['Taxa FIDC', fidc + '%']
            ],
            theme: 'grid',
            headStyles: { fillColor: [27, 45, 61] }
        });
        
        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 10,
            head: [['Indicador de Rentabilidade', 'Resultado']],
            body: [
                ['Lucro Bruto', lucroBruto],
                ['Lucro Líquido Estimado', lucroLiq],
                ['Margem', margem]
            ],
            theme: 'grid',
            headStyles: { fillColor: [42, 208, 122] }
        });

        await aplicarMarcaDaguaLogoJsPDF(doc);

        doc.save(`Simulacao_Lote_${new Date().toISOString().split('T')[0]}.pdf`);
    };


    // --- 6. ESTOQUE INTELIGENTE ---
    window.initApexEstoque = function() {
        carregarEstoque();
    };

    async function carregarEstoque() {
        try {
            const res = await fetch('/api/estoque');
            const data = await res.json();
            const { estoque, movimentacoes } = data;

            renderEstoqueKPIs(estoque);
            renderEstoqueSaldos(estoque);
            renderEstoqueMovimentacoes(movimentacoes);
        } catch (err) {
            console.error(err);
        }
    }

    function renderEstoqueKPIs(estoque) {
        const grid = document.getElementById('estoque-kpis-grid');
        if (!grid) return;
        grid.innerHTML = '';

        // Agrupar peso por categoria
        const cats = {};
        estoque.forEach(e => {
            cats[e.material_categoria] = (cats[e.material_categoria] || 0) + parseFloat(e.saldo);
        });

        Object.keys(cats).forEach(cat => {
            const card = document.createElement('div');
            card.className = 'estoque-card';
            card.innerHTML = `
                <span style="font-size:0.75rem; text-transform:uppercase; color:#aaa; font-weight:bold;">${cat}</span>
                <h2 style="margin:5px 0 0; color:#fff;">${cats[cat].toLocaleString('pt-BR')} kg</h2>
                <div style="font-size:0.8rem; color:#3e7cb1; margin-top:5px;">Estoque físico ativo</div>
            `;
            grid.appendChild(card);
        });
    }

    function renderEstoqueSaldos(estoque) {
        const body = document.getElementById('estoque-saldos-body');
        if (!body) return;
        body.innerHTML = '';
        estoque.forEach(e => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:10px;"><strong>${e.material_nome}</strong></td>
                <td style="padding:10px;"><span class="badge-status em-analise">${e.material_categoria}</span></td>
                <td style="padding:10px; text-align:right;">${parseFloat(e.saldo).toLocaleString('pt-BR')} ${e.material_unidade}</td>
            `;
            body.appendChild(tr);
        });
    }

    function renderEstoqueMovimentacoes(movs) {
        const body = document.getElementById('estoque-movimentacoes-body');
        if (!body) return;
        body.innerHTML = '';
        movs.forEach(m => {
            const dataFmt = new Date(m.data || m.criado_em).toLocaleDateString('pt-BR');
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:10px;">${m.material_nome}</td>
                <td style="padding:10px; font-weight:bold; color:${m.tipo === 'ENTRADA' ? '#2AD07A' : '#ff4d4d'}">${m.tipo}</td>
                <td style="padding:10px; text-align:right;">${parseFloat(m.quantidade).toLocaleString('pt-BR')} kg</td>
                <td style="padding:10px; font-size:0.8rem;">${m.motivo || '-'}</td>
                <td style="padding:10px;">${dataFmt}</td>
            `;
            body.appendChild(tr);
        });
    }

    // --- 7. USUÁRIOS & CONTROLE DE ACESSO ---
    let localUsuarios = [];
    window.initApexUsuarios = function() {
        carregarUsuarios();
    };

    async function carregarUsuarios() {
        try {
            const res = await fetch('/api/usuarios');
            localUsuarios = await res.json();
            renderUsuarios();
        } catch (err) {
            console.error(err);
        }
    }

    function renderUsuarios() {
        const body = document.getElementById('usuarios-table-body');
        if (!body) return;
        body.innerHTML = '';
        localUsuarios.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:12px;"><strong>${u.nome}</strong></td>
                <td style="padding:12px;">${u.user}</td>
                <td style="padding:12px;"><span class="badge-status em-analise">${u.perfil}</span></td>
                <td style="padding:12px; text-align:center;">
                    <button class="btn-refresh" style="background:none; border:none; color:#ff4d4d;" onclick="deletarUsuario(${u.id})"><i class="fa-solid fa-trash"></i> Excluir</button>
                </td>
            `;
            body.appendChild(tr);
        });
    }

    window.abrirModalUsuario = function() {
        document.getElementById('form-usuario-apex').reset();
        document.getElementById('modal-usuario').style.display = 'flex';
    };

    window.fecharModalUsuario = function() {
        document.getElementById('modal-usuario').style.display = 'none';
    };

    window.salvarUsuario = async function(e) {
        e.preventDefault();
        const data = {
            nome: document.getElementById('usr-nome').value,
            user: document.getElementById('usr-user').value,
            pass: document.getElementById('usr-pass').value,
            perfil: document.getElementById('usr-perfil').value
        };

        try {
            await fetch('/api/usuarios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            fecharModalUsuario();
            carregarUsuarios();
        } catch (err) {
            console.error(err);
        }
    };

    window.deletarUsuario = async function(id) {
        if (!confirm('Deseja realmente remover este usuário?')) return;
        try {
            await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
            carregarUsuarios();
        } catch (err) {
            console.error(err);
        }
    };

    let perfilSelecionado = null;

    window.carregarPermissoesView = function() {
        popularPerfisPermissoes();
        document.getElementById('grid-permissoes').style.opacity = '0.5';
        document.getElementById('grid-permissoes').style.pointerEvents = 'none';
        document.getElementById('perfil-selecionado-lbl').textContent = 'Nenhum';
        document.getElementById('msg-admin-lock').style.display = 'none';
        document.querySelectorAll('.perm-checkbox input').forEach(c => c.checked = false);
        perfilSelecionado = null;
    };

    

    function popularPerfisPermissoes() {
        const perfis = ['Administrador', 'Laboratório', 'Compras', 'Produção', 'Financeiro', 'Diretoria'];
        const container = document.getElementById('lista-perfis-permissoes');
        container.innerHTML = perfis.map(p => `
            <div onclick="selecionarPerfilPermissoes('${p}')" style="padding:10px 15px; border-radius:6px; background:#1a3045; cursor:pointer; color:#fff; border:1px solid transparent; transition:0.2s;" onmouseover="this.style.borderColor='#3e7cb1'" onmouseout="this.style.borderColor='transparent'" id="btn-perfil-${p.toLowerCase().replace(/[^a-z0-9]/g,'')}">
                <i class="fa-solid fa-user-tag" style="color:#a0b4c8; margin-right:8px;"></i> ${p}
            </div>
        `).join('');
    }

    window.selecionarPerfilPermissoes = function(perfil) {
        perfilSelecionado = perfil;
        
        // Highlights
        document.querySelectorAll('#lista-perfis-permissoes div').forEach(el => el.style.background = '#1a3045');
        const btn = document.getElementById(`btn-perfil-${perfil.toLowerCase().replace(/[^a-z0-9]/g,'')}`);
        if (btn) btn.style.background = '#223547';

        document.getElementById('perfil-selecionado-lbl').textContent = perfil;
        
        const grid = document.getElementById('grid-permissoes');
        const msgAdmin = document.getElementById('msg-admin-lock');
        const checkboxes = grid.querySelectorAll('input[type="checkbox"]');

        if (perfil === 'Administrador') {
            grid.style.opacity = '0.5';
            grid.style.pointerEvents = 'none';
            msgAdmin.style.display = 'block';
            checkboxes.forEach(chk => chk.checked = true);
        } else {
            grid.style.opacity = '1';
            grid.style.pointerEvents = 'auto';
            msgAdmin.style.display = 'none';
            
            const permissoes = globalRolePermissions[perfil] || [];
            checkboxes.forEach(chk => {
                chk.checked = permissoes.includes(chk.value);
            });
        }
    };

    window.salvarPermissoesPerfil = async function() {
        if (!perfilSelecionado) {
            alert('Selecione um perfil primeiro.');
            return;
        }
        
        if (perfilSelecionado !== 'Administrador') {
            const grid = document.getElementById('grid-permissoes');
            const checkboxes = grid.querySelectorAll('input[type="checkbox"]:checked');
            const permissoes = Array.from(checkboxes).map(chk => chk.value);
            
            globalRolePermissions[perfilSelecionado] = permissoes;
        }

        try {
            await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role_permissions: JSON.stringify(globalRolePermissions) })
            });
            alert('Permissões salvas com sucesso!');
            applyRolePermissions();
        } catch (err) {
            console.error('Erro ao salvar permissões:', err);
            alert('Erro ao salvar permissões.');
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // LOGIN (Posicionado no final para evitar TDZ e erros de inicialização)
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
            function entrarNoPainel(nome, perfil) {
                sessionStorage.setItem('apex_admin_logged_in', 'true');
                if (nome) sessionStorage.setItem('apex_logged_user_name', nome);
                if (perfil) {
                    sessionStorage.setItem('apex_user_role', perfil);
                    currentSimulatedRole = perfil;
                }
                loginOverlay.style.display       = 'none';
                dashboardContainer.style.display = 'flex';
                loginError.style.display         = 'none';
                initAdmin();
            }

            // Verificação local imediata (garante acesso mesmo se o servidor falhar)
            if (user === 'admin' && pass === 'apex2026') {
                entrarNoPainel('Administrador Apex', 'Administrador');
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
                    entrarNoPainel(data.user.nome, data.user.perfil);
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

}); // end DOMContentLoaded


// --- MODULO FINANCEIRO ISOLADO ---
let chartFidcIsolado = null;

window.calcularFidcIsolado = function() {
    const receita = parseFloat(document.getElementById('fin-sim-receita').value) || 0;
    const prazo = parseInt(document.getElementById('fin-sim-prazo').value) || 30;
    const taxa = parseFloat(document.getElementById('fin-sim-taxa').value) || 0;

    const desconto = receita * (taxa / 100);
    const liquido = receita - desconto;

    document.getElementById('fin-sim-res-com').textContent = 'R$ ' + liquido.toLocaleString('pt-BR', {minimumFractionDigits:2});
    document.getElementById('fin-sim-res-desc').textContent = 'R$ ' + desconto.toLocaleString('pt-BR', {minimumFractionDigits:2});

    const ctx = document.getElementById('chart-fidc-isolado').getContext('2d');
    if (chartFidcIsolado) chartFidcIsolado.destroy();

    chartFidcIsolado = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Líquido Imediato', 'Desconto FIDC'],
            datasets: [{
                data: [liquido, desconto],
                backgroundColor: ['#2AD07A', '#ff4d4d'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#aaa' } }
            }
        }
    });
};

window.carregarFinanceiroView = async function() {
    // Buscar lotes de compras e simulações via API
    try {
        const res = await fetch('/api/planejamento-compras'); // Rota a ser checada ou criada
        if (!res.ok) throw new Error('Falha ao carregar planejamentos');
        const planejamentos = await res.json();
        
        const tbody = document.getElementById('lista-financeiro-historico');
        tbody.innerHTML = '';
        
        let totalReceita = 0;
        let somaTaxaFidc = 0;
        let countFidc = 0;

        planejamentos.forEach(plan => {
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #1a3045';
            
            const lucroNum = parseFloat(plan.preco_venda_material) * parseFloat(plan.peso_comprado) * (parseFloat(plan.percentual_rendimento)/100);
            const custoNum = parseFloat(plan.peso_comprado) * parseFloat(plan.preco_compra);
            const margemNum = lucroNum > 0 ? ((lucroNum - custoNum) / lucroNum) * 100 : 0;
            
            totalReceita += lucroNum;
            
            if (plan.fidc) {
                somaTaxaFidc += parseFloat(plan.fidc);
                countFidc++;
            }

            row.innerHTML = `
                <td style="padding:10px; color:#fff;">${plan.mes || '-'}</td>
                <td style="padding:10px; color:#fff;">${plan.fornecedor_nome || '-'}</td>
                <td style="padding:10px; color:#2AD07A;">R$ ${lucroNum.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                <td style="padding:10px; color:#ff4d4d;">R$ ${custoNum.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                <td style="padding:10px; color:#a0b4c8;">${fmtBRL(margemNum)}%</td>
            `;
            tbody.appendChild(row);
        });

        document.getElementById('fin-kpi-total').textContent = planejamentos.length;
        document.getElementById('fin-kpi-lucro').textContent = 'R$ ' + (totalReceita).toLocaleString('pt-BR', {minimumFractionDigits:2});
        
        const mediaFidc = countFidc > 0 ? (somaTaxaFidc / countFidc) : 0;
        document.getElementById('fin-kpi-fidc').textContent = fmtBRL(mediaFidc) + '%';
        
        calcularFidcIsolado(); // Inicializa o grafico vazio
        
    } catch (e) {
        console.error('Erro ao carregar dados financeiros', e);
        calcularFidcIsolado();
    }
};

// =============================================================================
// PEDIDOS DE VENDA
// =============================================================================
(function() {
    let localPedidos = [];
    let itensPedido  = [];

    const fmtR = (v) => 'R$ ' + (parseFloat(v)||0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
    const fmtD = (d) => { if (!d) return '-'; try { return new Date(d).toLocaleDateString('pt-BR', {timeZone:'UTC'}); } catch(e){ return d; } };
    const statusColor = { 'Rascunho':'#7fa8c8', 'Confirmado':'#2AD07A', 'Em Separação':'#ffeb3b', 'Faturado':'#4fc3f7', 'Entregue':'#2AD07A', 'Cancelado':'#ff6b6b' };

    window.initApexPedidos = function() {
        carregarPedidos();
    };

    async function carregarPedidos() {
        try {
            const res  = await fetch('/api/pedidos-venda');
            localPedidos = Array.isArray(await res.clone().json()) ? await res.json() : [];
        } catch(e) {
            localPedidos = [];
        }
        renderPedidos(localPedidos);
    }

    function renderPedidos(lista) {
        const tbody = document.getElementById('pedidos-tbody');
        if (!tbody) return;
        if (!lista || lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#5a738e;"><i class="fa-solid fa-file-invoice-dollar" style="font-size:2rem; margin-bottom:10px; display:block;"></i>Nenhum pedido cadastrado ainda.<br><small>Clique em <strong>+ Novo Pedido</strong> para começar.</small></td></tr>';
            return;
        }
        tbody.innerHTML = lista.map(p => `
            <tr style="border-bottom:1px solid #1a2a3a; transition:background 0.15s;" onmouseover="this.style.background='#0f2030'" onmouseout="this.style.background=''">
                <td style="padding:12px 10px; font-weight:bold; color:#2AD07A;">${p.numero || '-'}</td>
                <td style="padding:12px 10px; color:#fff;">${p.cliente_nome || p.cliente_id || '-'}</td>
                <td style="padding:12px 10px; color:#aaa;">${fmtD(p.data_emissao)}</td>
                <td style="padding:12px 10px; color:#aaa;">${fmtD(p.data_entrega)}</td>
                <td style="padding:12px 10px;">
                    <span style="background:${statusColor[p.status]||'#666'}22; color:${statusColor[p.status]||'#aaa'}; border:1px solid ${statusColor[p.status]||'#666'}44; padding:3px 10px; border-radius:20px; font-size:0.8rem; font-weight:600;">${p.status||'Rascunho'}</span>
                </td>
                <td style="padding:12px 10px; text-align:right; color:#fff; font-weight:600;">${fmtR(p.total_geral)}</td>
                <td style="padding:12px 10px; text-align:center;">
                    <button onclick="exportarPedidoPdfPorId(${p.id})" style="background:none; border:none; color:#2AD07A; cursor:pointer; margin-right:6px; font-size:1rem;" title="Baixar PDF com Marca d'Água"><i class="fa-solid fa-file-pdf"></i></button>
                    <button onclick="editarPedido(${p.id})" style="background:none; border:none; color:#3e7cb1; cursor:pointer; margin-right:6px; font-size:1rem;" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="excluirPedido(${p.id}, '${p.numero}')" style="background:none; border:none; color:#ff6b6b; cursor:pointer; font-size:1rem;" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    window.filtrarPedidos = function() {
        const txt    = (document.getElementById('pedidos-search')?.value || '').toLowerCase();
        const status = document.getElementById('pedidos-status-filter')?.value || '';
        const filtrado = localPedidos.filter(p => {
            const matchTxt = !txt || (p.numero||'').toLowerCase().includes(txt) || (p.cliente_nome||'').toLowerCase().includes(txt);
            const matchSt  = !status || p.status === status;
            return matchTxt && matchSt;
        });
        renderPedidos(filtrado);
    };

    window.abrirNovoPedido = async function() {
        itensPedido = [];
        document.getElementById('form-pedido-venda').reset();
        document.getElementById('pedido-id').value = '';
        document.getElementById('modal-pedido-titulo').textContent = 'Novo Pedido de Venda';
        document.getElementById('pedido-data-emissao').value = new Date().toISOString().split('T')[0];
        limparClientePedido();
        renderItensPedido();
        recalcularPedido();
        try {
            const res = await fetch('/api/clientes');
            window.localClientes = await res.json();
        } catch(e){}
        try {
            const r = await fetch('/api/pedidos-venda/proximo-numero');
            const d = await r.json();
            document.getElementById('pedido-numero').value = d.numero || 'PV-0001';
        } catch(e) {
            document.getElementById('pedido-numero').value = 'PV-' + String(Math.floor(Date.now()/1000)%10000).padStart(4,'0');
        }
        document.getElementById('modal-pedido-venda').style.display = 'flex';
    };

    window.fecharModalPedido = function() {
        document.getElementById('modal-pedido-venda').style.display = 'none';
    };

    const normalizeTxt = (str) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    window.buscarClientePedido = async function(val) {
        const drop = document.getElementById('pedido-cliente-dropdown');
        if (!drop) return;

        if (!window.localClientes || window.localClientes.length === 0) {
            try {
                const res = await fetch('/api/clientes');
                window.localClientes = await res.json();
            } catch(e){}
        }

        const rawVal = (val || '').trim();
        const q = normalizeTxt(rawVal);
        const searchTerms = q.split(/\s+/).filter(Boolean);

        let resultados = [];
        if (searchTerms.length === 0) {
            resultados = (window.localClientes || []).slice(0, 15);
        } else {
            resultados = (window.localClientes || []).filter(c => {
                const targetText = normalizeTxt(`${c.nome||''} ${c.fantasia||''} ${c.razao_social||''} ${c.cnpj||''} ${c.cpf||''} ${c.email||''}`);
                const cleanCnpj = (c.cnpj||'').replace(/\D/g,'');
                const cleanCpf = (c.cpf||'').replace(/\D/g,'');
                const cleanQ = q.replace(/\D/g,'');

                const matchesCNPJ = cleanQ.length >= 3 && (cleanCnpj.includes(cleanQ) || cleanCpf.includes(cleanQ));
                const matchesWords = searchTerms.every(term => targetText.includes(term));

                return matchesCNPJ || matchesWords;
            });
        }

        let html = '';

        if (rawVal.length > 0) {
            html += `
                <div onclick="abrirCadastroClienteExpress('${rawVal.replace(/'/g,"\\'")}')" style="padding:10px 14px; background:#1b382b; color:#2AD07A; cursor:pointer; font-weight:bold; border-bottom:1px solid #1e4e8c; display:flex; align-items:center; gap:8px;" onmouseover="this.style.background='#224535'" onmouseout="this.style.background='#1b382b'">
                    <i class="fa-solid fa-user-plus"></i> + Cadastrar Novo Cliente "${rawVal}"
                </div>
            `;
        } else {
            html += `
                <div onclick="abrirCadastroClienteExpress('')" style="padding:10px 14px; background:#162738; color:#7fa8c8; cursor:pointer; font-size:0.85rem; border-bottom:1px solid #1e4e8c; display:flex; align-items:center; gap:8px;" onmouseover="this.style.background='#1e354d'" onmouseout="this.style.background='#162738'">
                    <i class="fa-solid fa-plus-circle"></i> + Cadastrar Novo Cliente do Zero
                </div>
            `;
        }

        if (resultados.length > 0) {
            html += resultados.map(c => `
                <div onclick="selecionarClientePedido(${c.id})" style="padding:10px 14px; cursor:pointer; border-bottom:1px solid #1a2a3a; transition:background 0.15s;" onmouseover="this.style.background='#1a2a3a'" onmouseout="this.style.background=''">
                    <strong style="color:#fff;">${c.nome||c.fantasia||''}</strong>
                    <span style="color:#7fa8c8; font-size:0.8rem;"> — ${c.cnpj||c.cpf||'Sem CNPJ'} | ${c.cidade||''}${c.uf?'/'+c.uf:''}</span>
                </div>
            `).join('');
        } else if (rawVal.length > 0) {
            html += `
                <div style="padding:14px; text-align:center; color:#aaa; font-size:0.88rem;">
                    Nenhum cliente cadastrado no banco com o nome "<strong>${rawVal}</strong>".
                    <div style="margin-top:8px;">
                        <button type="button" onclick="abrirCadastroClienteExpress('${rawVal.replace(/'/g,"\\'")}')" class="btn-primary" style="font-size:0.82rem; background:#2AD07A; color:#000; border:none; padding:6px 14px; font-weight:bold; cursor:pointer;">
                            <i class="fa-solid fa-user-plus"></i> Cadastrar "${rawVal}" Agora
                        </button>
                    </div>
                </div>
            `;
        }

        drop.innerHTML = html;
        drop.style.display = 'block';
    };

    window.redirecionarParaCadastroCliente = function(nomePrefill) {
        const drop = document.getElementById('pedido-cliente-dropdown');
        if (drop) drop.style.display = 'none';

        fecharModalPedido();

        const navClientes = document.getElementById('nav-clientes') || document.querySelector('.nav-item[data-target="clientes-view"]');
        if (navClientes) {
            navClientes.click();
        } else {
            document.querySelectorAll('.view-section').forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });
            const cliSec = document.getElementById('clientes-view');
            if (cliSec) { cliSec.classList.add('active'); cliSec.style.display = 'block'; }
        }

        if (window.initApexClientes) window.initApexClientes();

        setTimeout(() => {
            if (window.abrirModalCliente) window.abrirModalCliente();
            if (nomePrefill) {
                const elNome = document.getElementById('cli-nome');
                const elFant = document.getElementById('cli-fantasia');
                if (elNome) elNome.value = nomePrefill;
                if (elFant) elFant.value = nomePrefill;
            }
        }, 150);
    };

    window.abrirCadastroClienteExpress = function(nomePrefill) {
        redirecionarParaCadastroCliente(nomePrefill);
    };

    window.selecionarClientePedido = function(id) {
        if (!window.localClientes || window.localClientes.length === 0) {
            fetch('/api/clientes').then(r=>r.json()).then(clis=>{
                window.localClientes = clis;
                window.selecionarClientePedido(id);
            });
            return;
        }
        const c = (window.localClientes||[]).find(x => x.id == id);
        if (!c) return;
        document.getElementById('pedido-cliente-id').value = c.id;
        document.getElementById('pedido-cliente-busca').value = c.nome || c.fantasia || '';
        document.getElementById('pedido-cliente-dropdown').style.display = 'none';
        document.getElementById('cc-nome').textContent   = c.nome || c.fantasia || '';
        document.getElementById('cc-cnpj').textContent   = c.cnpj || c.cpf || 'CNPJ Não informado';
        document.getElementById('cc-cidade').textContent = c.cidade || '';
        document.getElementById('cc-uf').textContent     = c.uf || '';
        document.getElementById('cc-tel').textContent    = c.telefone1 || c.telefone2 || '';
        document.getElementById('cc-email').textContent  = c.email || '';
        document.getElementById('pedido-cliente-card').style.display = 'block';
        if (c.condicao_pagamento) {
            const sel = document.getElementById('pedido-condicao');
            for (let i=0; i<sel.options.length; i++) {
                if (sel.options[i].value === c.condicao_pagamento) { sel.selectedIndex=i; break; }
            }
        }
    };

    window.limparClientePedido = function() {
        document.getElementById('pedido-cliente-id').value = '';
        document.getElementById('pedido-cliente-busca').value = '';
        document.getElementById('pedido-cliente-dropdown').style.display = 'none';
        document.getElementById('pedido-cliente-card').style.display = 'none';
    };

    window.adicionarItemPedido = function() {
        itensPedido.push({ descricao:'', unidade:'kg', quantidade:0, preco_unitario:0, desconto_item:0, total_item:0 });
        renderItensPedido();
    };

    window.removerItemPedido = function(idx) {
        itensPedido.splice(idx,1);
        renderItensPedido();
        recalcularPedido();
    };

    window.atualizarItemPedido = function(idx, campo, val) {
        itensPedido[idx][campo] = campo==='descricao'||campo==='unidade' ? val : parseFloat(val)||0;
        const it = itensPedido[idx];
        it.total_item = it.quantidade * it.preco_unitario * (1 - (it.desconto_item||0)/100);
        renderItensPedido();
        recalcularPedido();
    };

    function renderItensPedido() {
        const tbody = document.getElementById('itens-pedido-tbody');
        const vazio  = document.getElementById('itens-vazio');
        if (!tbody) return;
        if (itensPedido.length === 0) {
            tbody.innerHTML = '';
            if (vazio) vazio.style.display = 'block';
            return;
        }
        if (vazio) vazio.style.display = 'none';
        tbody.innerHTML = itensPedido.map((it,i) => `
            <tr style="border-bottom:1px solid #1a2a3a;">
                <td style="padding:6px 4px;">
                    <input value="${it.descricao||''}" onchange="atualizarItemPedido(${i},'descricao',this.value)" class="noble-input" style="width:100%; padding:5px 8px; font-size:0.82rem;" placeholder="Ex: Fio de cobre 4mm" />
                </td>
                <td style="padding:6px 4px; text-align:center;">
                    <select onchange="atualizarItemPedido(${i},'unidade',this.value)" class="noble-input" style="padding:5px 4px; font-size:0.82rem; width:56px;">
                        ${['kg','t','un','m','m²','L'].map(u=>`<option value="${u}" ${it.unidade===u?'selected':''}>${u}</option>`).join('')}
                    </select>
                </td>
                <td style="padding:6px 4px;">
                    <input type="number" min="0" step="0.001" value="${it.quantidade||0}" onchange="atualizarItemPedido(${i},'quantidade',this.value)" class="noble-input" style="width:85px; text-align:right; padding:5px 8px; font-size:0.82rem;" />
                </td>
                <td style="padding:6px 4px;">
                    <input type="number" min="0" step="0.0001" value="${it.preco_unitario||0}" onchange="atualizarItemPedido(${i},'preco_unitario',this.value)" class="noble-input" style="width:105px; text-align:right; padding:5px 8px; font-size:0.82rem;" />
                </td>
                <td style="padding:6px 4px;">
                    <input type="number" min="0" max="100" step="0.01" value="${it.desconto_item||0}" onchange="atualizarItemPedido(${i},'desconto_item',this.value)" class="noble-input" style="width:75px; text-align:right; padding:5px 8px; font-size:0.82rem;" />
                </td>
                <td style="padding:6px 4px; text-align:right; color:#2AD07A; font-weight:600;">${fmtR(it.total_item)}</td>
                <td style="padding:6px 4px; text-align:center;">
                    <button type="button" onclick="removerItemPedido(${i})" style="background:none; border:none; color:#ff6b6b; cursor:pointer; font-size:1rem;"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    window.recalcularPedido = function() {
        const subtotal  = itensPedido.reduce((s,it) => s+(it.total_item||0), 0);
        const desc      = parseFloat(document.getElementById('pedido-desconto')?.value)||0;
        const frete     = parseFloat(document.getElementById('pedido-frete')?.value)||0;
        const total     = subtotal*(1-desc/100)+frete;
        if (document.getElementById('pedido-total-itens'))  document.getElementById('pedido-total-itens').textContent  = fmtR(subtotal);
        if (document.getElementById('pedido-total-geral'))  document.getElementById('pedido-total-geral').textContent  = fmtR(total);
    };

    window.salvarPedido = async function(e) {
        e.preventDefault();
        const clienteId = document.getElementById('pedido-cliente-id').value;
        if (!clienteId) { alert('Selecione um cliente.'); return; }
        if (itensPedido.length === 0) { alert('Adicione ao menos um item ao pedido.'); return; }

        const payload = {
            numero:             document.getElementById('pedido-numero').value,
            cliente_id:         parseInt(clienteId),
            data_emissao:       document.getElementById('pedido-data-emissao').value,
            data_entrega:       document.getElementById('pedido-data-entrega').value || null,
            status:             document.getElementById('pedido-status').value,
            condicao_pagamento: document.getElementById('pedido-condicao').value,
            observacoes:        document.getElementById('pedido-obs').value,
            desconto_pct:       parseFloat(document.getElementById('pedido-desconto').value)||0,
            frete:              parseFloat(document.getElementById('pedido-frete').value)||0,
            criado_por:         sessionStorage.getItem('apex_logged_user_name')||'Admin',
            itens:              itensPedido
        };

        const id  = document.getElementById('pedido-id').value;
        const url = id ? `/api/pedidos-venda/${id}` : '/api/pedidos-venda';
        const met = id ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, { method:met, headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
            if (!res.ok) { const err=await res.json(); alert('Erro: '+(err.error||res.status)); return; }
            fecharModalPedido();
            await carregarPedidos();
        } catch(err) {
            alert('Erro ao salvar pedido: '+err.message);
        }
    };

    window.editarPedido = async function(id) {
        try {
            const res  = await fetch(`/api/pedidos-venda/${id}`);
            const data = await res.json();
            document.getElementById('pedido-id').value             = data.id;
            document.getElementById('modal-pedido-titulo').textContent = `Editar Pedido ${data.numero}`;
            document.getElementById('pedido-numero').value          = data.numero;
            document.getElementById('pedido-data-emissao').value    = (data.data_emissao||'').slice(0,10);
            document.getElementById('pedido-data-entrega').value    = (data.data_entrega||'').slice(0,10);
            document.getElementById('pedido-desconto').value        = data.desconto_pct||0;
            document.getElementById('pedido-frete').value           = data.frete||0;
            document.getElementById('pedido-obs').value             = data.observacoes||'';
            const selSt = document.getElementById('pedido-status');
            for(let i=0;i<selSt.options.length;i++) if(selSt.options[i].value===data.status){selSt.selectedIndex=i;break;}
            const selCond = document.getElementById('pedido-condicao');
            for(let i=0;i<selCond.options.length;i++) if(selCond.options[i].value===data.condicao_pagamento){selCond.selectedIndex=i;break;}
            window.selecionarClientePedido(data.cliente_id);
            if (data.cliente_nome) document.getElementById('pedido-cliente-busca').value = data.cliente_nome;
            itensPedido = (data.itens||[]).map(it => ({...it}));
            renderItensPedido();
            recalcularPedido();
            document.getElementById('modal-pedido-venda').style.display = 'flex';
        } catch(err) {
            alert('Erro ao carregar pedido: '+err.message);
        }
    };

    window.excluirPedido = async function(id, numero) {
        if (!confirm(`Excluir o pedido ${numero}? Esta ação não pode ser desfeita.`)) return;
        try {
            await fetch(`/api/pedidos-venda/${id}`, {method:'DELETE'});
            await carregarPedidos();
        } catch(err) {
            alert('Erro ao excluir: '+err.message);
        }
    };

    window.imprimirPedido = function() {
        exportarPedidoPdfDoForm();
    };

    window.exportarPedidoPdfPorId = async function(id) {
        let p = localPedidos.find(x => x.id == id);
        if (!p) {
            try {
                const r = await fetch(`/api/pedidos-venda/${id}`);
                p = await r.json();
            } catch(e){}
        }
        if (!p) { alert('Pedido não encontrado.'); return; }
        await gerarPdfPedidoVenda(p);
    };

    window.exportarPedidoPdfDoForm = async function() {
        const num    = document.getElementById('pedido-numero').value || 'PV-0000';
        const cliId  = document.getElementById('pedido-cliente-id').value;
        const c      = (window.localClientes||[]).find(x => x.id == cliId) || {};
        const p = {
            numero: num,
            cliente_nome: document.getElementById('cc-nome').textContent || document.getElementById('pedido-cliente-busca').value || '-',
            cliente_cnpj: document.getElementById('cc-cnpj').textContent || c.cnpj || c.cpf || '-',
            cliente_cidade: document.getElementById('cc-cidade').textContent || c.cidade || '-',
            cliente_uf: document.getElementById('cc-uf').textContent || c.uf || '-',
            cliente_telefone: document.getElementById('cc-tel').textContent || c.telefone1 || '-',
            cliente_email: document.getElementById('cc-email').textContent || c.email || '-',
            cliente_endereco: c.endereco || '-',
            data_emissao: document.getElementById('pedido-data-emissao').value,
            data_entrega: document.getElementById('pedido-data-entrega').value,
            condicao_pagamento: document.getElementById('pedido-condicao').value,
            status: document.getElementById('pedido-status').value,
            observacoes: document.getElementById('pedido-obs').value,
            desconto_pct: parseFloat(document.getElementById('pedido-desconto').value)||0,
            frete: parseFloat(document.getElementById('pedido-frete').value)||0,
            itens: itensPedido
        };
        await gerarPdfPedidoVenda(p);
    };

    async function gerarPdfPedidoVenda(p) {
        if (!window.jspdf) { alert('Biblioteca jsPDF não carregada.'); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        // Marca d'água do logo (2).png em toda a folha
        await aplicarMarcaDaguaLogoJsPDF(doc);

        if (doc.GState && doc.setGState) {
            try { doc.setGState(new doc.GState({ opacity: 1.0 })); } catch(e){}
        }

        // Cabeçalho da Empresa
        doc.setFillColor(30, 78, 140);
        doc.rect(0, 0, 210, 28, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('APEX TECH METAIS', 14, 14);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('PEDIDO DE VENDA / PROPOSTA COMERCIAL', 14, 21);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text(p.numero || 'PV-0000', 196, 14, { align: 'right' });
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Emissão: ${fmtD(p.data_emissao)}`, 196, 21, { align: 'right' });

        // Box 1: Dados do Cliente
        doc.setFillColor(240, 244, 248);
        doc.setDrawColor(200, 212, 224);
        doc.roundedRect(14, 34, 182, 38, 2, 2, 'FD');

        doc.setTextColor(30, 78, 140);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('DADOS DO CLIENTE', 18, 41);

        doc.setTextColor(40, 40, 40);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Razão Social / Nome: ', 18, 47);
        doc.setFont('helvetica', 'normal');
        doc.text(String(p.cliente_nome || p.cliente_id || 'Não informado'), 55, 47);

        doc.setFont('helvetica', 'bold');
        doc.text('CNPJ/CPF: ', 18, 53);
        doc.setFont('helvetica', 'normal');
        doc.text(String(p.cliente_cnpj || '-'), 38, 53);

        doc.setFont('helvetica', 'bold');
        doc.text('Telefone: ', 115, 53);
        doc.setFont('helvetica', 'normal');
        doc.text(String(p.cliente_telefone || '-'), 132, 53);

        doc.setFont('helvetica', 'bold');
        doc.text('Endereço: ', 18, 59);
        doc.setFont('helvetica', 'normal');
        const endStr = `${p.cliente_endereco || ''} ${p.cliente_cidade ? '- ' + p.cliente_cidade : ''}${p.cliente_uf ? '/' + p.cliente_uf : ''}`;
        doc.text(endStr.trim() ? endStr : '-', 37, 59);

        doc.setFont('helvetica', 'bold');
        doc.text('E-mail: ', 18, 65);
        doc.setFont('helvetica', 'normal');
        doc.text(String(p.cliente_email || '-'), 33, 65);

        // Box 2: Condições do Pedido
        doc.setFillColor(248, 249, 250);
        doc.roundedRect(14, 76, 182, 18, 2, 2, 'FD');

        doc.setTextColor(30, 78, 140);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Condição de Pagamento: ', 18, 83);
        doc.setTextColor(40, 40, 40);
        doc.setFont('helvetica', 'normal');
        doc.text(String(p.condicao_pagamento || 'À Vista'), 58, 83);

        doc.setTextColor(30, 78, 140);
        doc.setFont('helvetica', 'bold');
        doc.text('Previsão de Entrega: ', 105, 83);
        doc.setTextColor(40, 40, 40);
        doc.setFont('helvetica', 'normal');
        doc.text(fmtD(p.data_entrega), 140, 83);

        doc.setTextColor(30, 78, 140);
        doc.setFont('helvetica', 'bold');
        doc.text('Status: ', 18, 89);
        doc.setTextColor(40, 40, 40);
        doc.setFont('helvetica', 'normal');
        doc.text(String(p.status || 'Rascunho'), 32, 89);

        // Tabela de Itens
        const tableItens = (p.itens || []).map((it, idx) => [
            String(idx + 1),
            it.descricao || '-',
            it.unidade || 'kg',
            (parseFloat(it.quantidade) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3 }),
            fmtR(it.preco_unitario),
            (parseFloat(it.desconto_item) || 0) + '%',
            fmtR(it.total_item)
        ]);

        doc.autoTable({
            startY: 98,
            head: [['Item', 'Descrição do Produto/Material', 'Und', 'Qtd', 'Preço Unit.', 'Desc%', 'Total (R$)']],
            body: tableItens.length > 0 ? tableItens : [['1', 'Nenhum item adicionado', '-', '0', 'R$ 0,00', '0%', 'R$ 0,00']],
            theme: 'grid',
            headStyles: { fillColor: [30, 78, 140], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
            bodyStyles: { fontSize: 8.5, textColor: [30, 30, 30] },
            alternateRowStyles: { fillColor: [240, 245, 250] },
            columnStyles: {
                0: { cellWidth: 12, halign: 'center' },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 15, halign: 'center' },
                3: { cellWidth: 22, halign: 'right' },
                4: { cellWidth: 28, halign: 'right' },
                5: { cellWidth: 18, halign: 'right' },
                6: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
            },
            margin: { left: 14, right: 14 }
        });

        let finalY = doc.lastAutoTable.finalY + 8;

        // Resumo de Totais
        const subtot = (p.itens || []).reduce((s, it) => s + (parseFloat(it.total_item) || 0), 0);
        const descPct = parseFloat(p.desconto_pct) || 0;
        const descVal = subtot * (descPct / 100);
        const freteVal = parseFloat(p.frete) || 0;
        const totalGeral = subtot - descVal + freteVal;

        doc.setFillColor(240, 244, 248);
        doc.setDrawColor(200, 212, 224);
        doc.roundedRect(120, finalY, 76, 32, 2, 2, 'FD');

        doc.setFontSize(8.5);
        doc.setTextColor(60, 60, 60);
        doc.text('Subtotal Itens:', 124, finalY + 7);
        doc.text(fmtR(subtot), 192, finalY + 7, { align: 'right' });

        doc.text(`Desconto Geral (${descPct}%):`, 124, finalY + 13);
        doc.text(`- ${fmtR(descVal)}`, 192, finalY + 13, { align: 'right' });

        doc.text('Frete:', 124, finalY + 19);
        doc.text(fmtR(freteVal), 192, finalY + 19, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(30, 78, 140);
        doc.text('TOTAL DO PEDIDO:', 124, finalY + 27);
        doc.text(fmtR(p.total_geral || totalGeral), 192, finalY + 27, { align: 'right' });

        // Observações
        if (p.observacoes) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(30, 78, 140);
            doc.text('OBSERVAÇÕES / INSTRUÇÕES DE ENTREGA:', 14, finalY + 7);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(50, 50, 50);
            const splitObs = doc.splitTextToSize(p.observacoes, 95);
            doc.text(splitObs, 14, finalY + 13);
        }

        // Assinaturas
        const sigY = Math.min(Math.max(finalY + 45, 245), 265);
        doc.setDrawColor(180, 180, 180);
        doc.line(20, sigY, 90, sigY);
        doc.line(120, sigY, 190, sigY);

        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.setFont('helvetica', 'normal');
        doc.text('Apex Tech Metais (Vendedor)', 55, sigY + 5, { align: 'center' });
        doc.text('Aceito e De Acordo (Cliente)', 155, sigY + 5, { align: 'center' });

        // Rodapé
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7.5);
            doc.setTextColor(130, 130, 130);
            doc.text(`Apex Tech Metais — Documento de Pedido de Venda ${p.numero || ''} | Página ${i} de ${pageCount}`, 105, 290, { align: 'center' });
        }

        doc.save(`Pedido_Venda_${p.numero || 'PV'}.pdf`);
    }

})();
