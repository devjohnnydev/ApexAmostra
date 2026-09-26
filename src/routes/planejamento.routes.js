/**
 * src/routes/planejamento.routes.js
 * Módulo Estratégico — Planos Trimestrais e Semanas.
 * Cobre passos 1–7 do pipeline + endpoint de exportação Excel.
 */

'use strict';

const express = require('express');
const logger  = require('../../config/logger');
const svc     = require('../services/planejamento.service');

module.exports = function(pool, dbAvailable, memStore, registrarAuditLog) {
    const router = express.Router();

    const runQ = (sql, params = []) => {
        if (!pool) throw new Error('Módulo Estratégico requer banco de dados MySQL.');
        return pool.query(sql, params);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // PLANOS
    // ─────────────────────────────────────────────────────────────────────────

    // ── GET /api/planejamento-estrategico — lista planos (versões mais recentes) ──
    router.get('/', async (req, res) => {
        try {
            const [rows] = await runQ(`
                SELECT pe.*, c.nome AS cenario_nome, c.margem_minima, c.volume_percentual, c.eficiencia_inicial
                FROM planos_estrategicos pe
                JOIN cenarios_planejamento c ON pe.cenario_id = c.id
                ORDER BY pe.plano_id DESC
                LIMIT 50
            `);
            res.json(rows);
        } catch (err) {
            logger.error(`[PLANEJAMENTO] GET /: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/planejamento-estrategico/:id — plano completo com produtos e semanas ──
    router.get('/:id', async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);

            const [[plano]] = await runQ(`
                SELECT pe.*, c.nome AS cenario_nome, c.margem_minima, c.volume_percentual,
                       c.eficiencia_inicial, c.capital_maximo AS cenario_capital_maximo
                FROM planos_estrategicos pe
                JOIN cenarios_planejamento c ON pe.cenario_id = c.id
                WHERE pe.plano_id = ?
            `, [id]);

            if (!plano) return res.status(404).json({ error: 'Plano não encontrado.' });

            const [produtos] = await runQ(
                `SELECT * FROM plano_produtos WHERE plano_id = ? ORDER BY id ASC`, [id]
            );
            const [semanas] = await runQ(
                `SELECT * FROM plano_semanas WHERE plano_id = ? ORDER BY numero_semana ASC`, [id]
            );

            res.json({ ...plano, produtos, semanas });
        } catch (err) {
            logger.error(`[PLANEJAMENTO] GET /:id: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/planejamento-estrategico — cria novo plano (rascunho) ─────
    // Perfil de escrita: Diretoria, PCP/Produção
    router.post('/', async (req, res) => {
        try {
            const userRole = (req.user?.perfil || '').trim().toLowerCase();
            const podeEscrever = userRole.includes('diretoria') || userRole.includes('admin')
                              || userRole.includes('pcp') || userRole.includes('produ');
            if (!podeEscrever) {
                return res.status(403).json({ error: `Acesso negado para o seu perfil: ${req.user?.perfil}. Criação de plano requer perfil Diretoria ou Produção/PCP.` });
            }

            const {
                trimestre, cenario_id, receita_meta, margem_bruta_meta,
                capital_maximo, estoque_final_meta,
                produtos = [], estoques = {},
                horas_disponiveis, taxa_kg_h, data_inicio,
            } = req.body;

            const autor_id = req.user?.id || 1;

            if (!trimestre || !cenario_id) {
                return res.status(400).json({ error: 'Campos obrigatórios: trimestre, cenario_id.' });
            }

            // Busca cenário
            const [[cenario]] = await runQ(`SELECT * FROM cenarios_planejamento WHERE id = ?`, [cenario_id]);
            if (!cenario) return res.status(400).json({ error: 'Cenário não encontrado.' });

            // Próxima versão para este trimestre
            const [[{ max_versao }]] = await runQ(
                `SELECT COALESCE(MAX(versao), 0) AS max_versao FROM planos_estrategicos WHERE trimestre = ?`,
                [trimestre]
            );
            const nova_versao = max_versao + 1;

            // Executar pipeline de cálculo (passos 1–7)
            const resultado = svc.calcularPlanoCompleto({
                metas: { receita_meta, margem_bruta_meta, capital_maximo, estoque_final_meta },
                produtos,
                estoques,
                cenario,
                data_inicio: data_inicio || `${trimestre.split('-')[0]}-01-01`,
                horas_disponiveis: horas_disponiveis || 1183,
                taxa_kg_h: taxa_kg_h || 500,
            });

            // Verifica bloqueio R01 — impede criação se margem inválida
            const alertaCritico = resultado.alertas.find(a => a.includes('Margem projetada'));
            if (alertaCritico) {
                return res.status(422).json({
                    error: alertaCritico,
                    alerta_id: 'R01',
                    margem_bruta_meta,
                    margem_minima: cenario.margem_minima,
                });
            }

            // Persiste cabeçalho do plano
            const [planResult] = await runQ(`
                INSERT INTO planos_estrategicos
                    (trimestre, versao, cenario_id, autor_id, situacao,
                     receita_meta, margem_bruta_meta, capital_maximo, estoque_final_meta,
                     horas_disponiveis, horas_necessarias, carga_percentual)
                VALUES (?, ?, ?, ?, 'rascunho', ?, ?, ?, ?, ?, ?, ?)
            `, [
                trimestre, nova_versao, cenario_id, autor_id,
                receita_meta, margem_bruta_meta, capital_maximo, estoque_final_meta,
                resultado.horas_disponiveis, resultado.horas_necessarias, resultado.carga_percentual,
            ]);

            const plano_id = planResult.insertId;

            // Persiste produtos calculados
            if (resultado.produtos_calculados.length > 0) {
                const prodVals = resultado.produtos_calculados.map(p => [
                    plano_id, p.produto_id || 0, p.produto_nome || '',
                    p.mix_percentual, p.preco, p.custo, p.margem,
                    p.kg_entrada, p.rendimento, p.kg_saida,
                    p.capital_necessario, p.data_recebimento, p.horas_maquina,
                ]);
                for (const v of prodVals) {
                    await runQ(`
                        INSERT INTO plano_produtos
                            (plano_id, produto_id, produto_nome, mix_percentual, preco, custo, margem,
                             kg_entrada, rendimento, kg_saida, capital_necessario, data_recebimento, horas_maquina)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, v);
                }
            }

            // Persiste 13 semanas
            for (const s of resultado.semanas) {
                await runQ(`
                    INSERT INTO plano_semanas
                        (plano_id, numero_semana, congelada, planejado, programado, realizado, forecast, desvio_percentual)
                    VALUES (?, ?, ?, ?, ?, 0, ?, 0)
                `, [plano_id, s.numero_semana, s.congelada, s.planejado, s.programado, s.forecast]);
            }

            logger.info(`[PLANEJAMENTO] Plano criado: id=${plano_id}, trimestre=${trimestre}, v${nova_versao}, cenario=${cenario.nome}, por=${req.user?.user}`);

            res.status(201).json({
                plano_id,
                trimestre,
                versao: nova_versao,
                alertas: resultado.alertas,
                horas_necessarias: resultado.horas_necessarias,
                carga_percentual: resultado.carga_percentual,
                capital_total: resultado.capital_total,
                message: 'Plano criado como rascunho.',
            });
        } catch (err) {
            logger.error(`[PLANEJAMENTO] POST /: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    // ── PUT /api/planejamento-estrategico/:id/aprovar — aprova e congela semana 1 ──
    // Perfil: Diretoria
    router.put('/:id/aprovar', async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            const { justificativa } = req.body;

            if (!justificativa || justificativa.trim().length < 5) {
                return res.status(400).json({ error: 'Justificativa obrigatória para aprovação.' });
            }

            const [[plano]] = await runQ(
                `SELECT pe.*, c.margem_minima FROM planos_estrategicos pe JOIN cenarios_planejamento c ON pe.cenario_id = c.id WHERE pe.plano_id = ?`,
                [id]
            );
            if (!plano) return res.status(404).json({ error: 'Plano não encontrado.' });
            if (plano.situacao !== 'rascunho') {
                return res.status(409).json({ error: `Plano já está com situação '${plano.situacao}'.` });
            }

            // Bloquear aprovação se margem abaixo do mínimo (R01)
            if (parseFloat(plano.margem_bruta_meta) < parseFloat(plano.margem_minima)) {
                return res.status(422).json({
                    error: svc.ALERTAS.R01.mensagem,
                    alerta_id: 'R01',
                    margem_bruta_meta: plano.margem_bruta_meta,
                    margem_minima: plano.margem_minima,
                });
            }

            // Marcar versões anteriores como 'substituido'
            await runQ(`
                UPDATE planos_estrategicos
                SET situacao = 'substituido'
                WHERE trimestre = ? AND plano_id != ? AND situacao = 'aprovado'
            `, [plano.trimestre, id]);

            // Aprovar e congelar semana 1
            await runQ(`UPDATE planos_estrategicos SET situacao = 'aprovado', data_aprovacao = NOW() WHERE plano_id = ?`, [id]);
            await runQ(`UPDATE plano_semanas SET congelada = TRUE WHERE plano_id = ? AND numero_semana = 1`, [id]);

            logger.info(`[PLANEJAMENTO] Plano aprovado: id=${id}, trimestre=${plano.trimestre} por ${req.user?.user} | justificativa: ${justificativa}`);

            if (registrarAuditLog) {
                await registrarAuditLog(req.user?.user, 'PLANO_APROVADO',
                    JSON.stringify({ plano_id: id, trimestre: plano.trimestre, justificativa }), null, req);
            }

            res.json({ success: true, message: 'Plano aprovado. Semana 1 congelada.' });
        } catch (err) {
            logger.error(`[PLANEJAMENTO] PUT /:id/aprovar: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SEMANAS
    // ─────────────────────────────────────────────────────────────────────────

    // ── PUT /api/planejamento-estrategico/:id/semanas/:num — editar semana ──
    // Perfil: Diretoria (semanas 2-13 também PCP, mas RBAC granular é feito aqui)
    router.put('/:id/semanas/:num', async (req, res) => {
        try {
            const plano_id     = parseInt(req.params.id, 10);
            const numero_semana = parseInt(req.params.num, 10);
            const { programado, acao_corretiva } = req.body;

            const userRole = (req.user?.perfil || '').trim().toLowerCase();
            const isDiretoria = userRole.includes('diretoria') || userRole.includes('admin');
            const isPCP       = userRole.includes('pcp') || userRole.includes('planejamento') || userRole.includes('produ');

            // Busca semana
            const [[semana]] = await runQ(
                `SELECT ps.*, pe.situacao FROM plano_semanas ps JOIN planos_estrategicos pe ON ps.plano_id = pe.plano_id WHERE ps.plano_id = ? AND ps.numero_semana = ?`,
                [plano_id, numero_semana]
            );

            if (!semana) return res.status(404).json({ error: 'Semana não encontrada.' });

            // Semana 1 congelada: somente Diretoria pode ver, ninguém edita via API
            if (semana.congelada) {
                return res.status(403).json({ error: 'Semana 1 está congelada e não pode ser editada após aprovação.' });
            }

            // PCP não pode alterar semana 1 (por segurança, mesmo se não congelada)
            if (numero_semana === 1 && !isDiretoria) {
                return res.status(403).json({ error: 'Apenas Diretoria pode editar a semana 1.' });
            }

            // PCP não pode alterar margem mínima — verificação já feita no cenário, não aqui

            await runQ(`
                UPDATE plano_semanas
                SET programado = ?, acao_corretiva = ?
                WHERE plano_id = ? AND numero_semana = ?
            `, [programado, acao_corretiva || null, plano_id, numero_semana]);

            logger.info(`[PLANEJAMENTO] Semana ${numero_semana} do plano ${plano_id} atualizada por ${req.user?.user}`);

            res.json({ success: true });
        } catch (err) {
            logger.error(`[PLANEJAMENTO] PUT /:id/semanas/:num: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    // ── PUT /api/planejamento-estrategico/:id/semanas/:num/realizado — lançar realizado ──
    // Chamado pelo job CRON e manualmente pela Diretoria
    router.put('/:id/semanas/:num/realizado', async (req, res) => {
        try {
            const plano_id      = parseInt(req.params.id, 10);
            const numero_semana = parseInt(req.params.num, 10);
            const { realizado } = req.body;

            const [[semana]] = await runQ(
                `SELECT * FROM plano_semanas WHERE plano_id = ? AND numero_semana = ?`,
                [plano_id, numero_semana]
            );
            if (!semana) return res.status(404).json({ error: 'Semana não encontrada.' });

            // Semana 1 congelada: realizado pode ser lançado apenas pela Diretoria
            const userRole = (req.user?.perfil || '').trim().toLowerCase();
            if (semana.congelada && !userRole.includes('diretoria') && !userRole.includes('admin')) {
                return res.status(403).json({ error: 'Apenas Diretoria pode lançar realizado na semana congelada.' });
            }

            // Passo 8 — calcular forecast e desvio (lógica pura de serviço)
            const update = svc.atualizarForecastSemana(semana, realizado);

            await runQ(`
                UPDATE plano_semanas
                SET realizado = ?, forecast = ?, desvio_percentual = ?
                WHERE plano_id = ? AND numero_semana = ?
            `, [update.realizado, update.forecast, update.desvio_percentual, plano_id, numero_semana]);

            logger.info(`[PLANEJAMENTO] Forecast atualizado: plano=${plano_id}, semana=${numero_semana}, realizado=${update.realizado}, desvio=${update.desvio_percentual}%`);

            res.json({ success: true, ...update });
        } catch (err) {
            logger.error(`[PLANEJAMENTO] PUT /:id/semanas/:num/realizado: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // EXPORTAÇÃO EXCEL
    // ─────────────────────────────────────────────────────────────────────────

    // ── GET /api/planejamento-estrategico/:id/exportar-excel ─────────────────
    router.get('/:id/exportar-excel', async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);

            const [[plano]] = await runQ(`
                SELECT pe.*, c.nome AS cenario_nome, c.margem_minima
                FROM planos_estrategicos pe
                JOIN cenarios_planejamento c ON pe.cenario_id = c.id
                WHERE pe.plano_id = ?
            `, [id]);
            if (!plano) return res.status(404).json({ error: 'Plano não encontrado.' });

            const [produtos] = await runQ(`SELECT * FROM plano_produtos WHERE plano_id = ? ORDER BY id`, [id]);
            const [semanas]  = await runQ(`SELECT * FROM plano_semanas  WHERE plano_id = ? ORDER BY numero_semana`, [id]);

            const ExcelJS   = require('exceljs');
            const wb        = new ExcelJS.Workbook();
            wb.creator      = 'ApexTech Metais';
            wb.created      = new Date();

            const thin   = { style: 'thin', color: { argb: 'FF000000' } };
            const border = { top: thin, bottom: thin, left: thin, right: thin };
            const hdr    = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } });
            const center = { horizontal: 'center', vertical: 'middle' };
            const bold   = { name: 'Calibri', size: 11, bold: true };
            const base   = { name: 'Calibri', size: 10 };

            // ── Aba 1: Resumo do Plano ────────────────────────────────────────
            const wsResumo = wb.addWorksheet('Resumo');
            wsResumo.columns = [
                { width: 30 }, { width: 20 }, { width: 20 }, { width: 20 },
            ];

            const addTitleRow = (ws, text, cols = 4) => {
                const r = ws.addRow([text]);
                ws.mergeCells(`A${r.number}:D${r.number}`);
                r.getCell(1).font      = { ...bold, size: 14, color: { argb: 'FFFFFFFF' } };
                r.getCell(1).fill      = hdr('1B2A4A');
                r.getCell(1).alignment = center;
                r.height = 28;
            };

            const addKeyValue = (ws, chave, valor) => {
                const r = ws.addRow([chave, valor]);
                r.getCell(1).font = bold;
                r.getCell(1).fill = hdr('E8EDF5');
                r.getCell(1).border = border;
                r.getCell(2).border = border;
                r.getCell(2).font   = base;
                r.height = 18;
            };

            addTitleRow(wsResumo, `PLANO ESTRATÉGICO — ${plano.trimestre} | Cenário: ${plano.cenario_nome}`);
            wsResumo.addRow([]);
            addKeyValue(wsResumo, 'Situação', plano.situacao.toUpperCase());
            addKeyValue(wsResumo, 'Versão', `v${plano.versao}`);
            addKeyValue(wsResumo, 'Receita Meta (R$)', plano.receita_meta);
            addKeyValue(wsResumo, 'Margem Bruta Meta (%)', plano.margem_bruta_meta);
            addKeyValue(wsResumo, 'Capital Máximo (R$)', plano.capital_maximo);
            addKeyValue(wsResumo, 'Margem Mínima do Cenário (%)', plano.margem_minima);
            addKeyValue(wsResumo, 'Horas Disponíveis', plano.horas_disponiveis);
            addKeyValue(wsResumo, 'Horas Necessárias', plano.horas_necessarias);
            addKeyValue(wsResumo, 'Carga (%)', plano.carga_percentual);
            addKeyValue(wsResumo, 'Data Aprovação', plano.data_aprovacao ? new Date(plano.data_aprovacao).toLocaleDateString('pt-BR') : '—');

            // ── Aba 2: Mix de Produtos ────────────────────────────────────────
            const wsProd = wb.addWorksheet('Produtos');
            wsProd.columns = [
                { header: 'Produto',      width: 30 },
                { header: 'Mix (%)',       width: 12 },
                { header: 'Preço (R$)',    width: 14 },
                { header: 'Custo (R$)',    width: 14 },
                { header: 'Margem (%)',    width: 12 },
                { header: 'Kg Entrada',   width: 14 },
                { header: 'Rendimento',   width: 12 },
                { header: 'Kg Saída',     width: 14 },
                { header: 'Capital (R$)', width: 16 },
                { header: 'Entrega',      width: 14 },
                { header: 'Hs Máquina',   width: 12 },
            ];

            const hdrRow = wsProd.getRow(1);
            hdrRow.eachCell(cell => {
                cell.font = { ...bold, color: { argb: 'FFFFFFFF' } };
                cell.fill = hdr('1B2A4A');
                cell.border = border;
                cell.alignment = center;
            });
            hdrRow.height = 22;

            for (const p of produtos) {
                const r = wsProd.addRow([
                    p.produto_nome, p.mix_percentual, p.preco, p.custo, p.margem,
                    p.kg_entrada, p.rendimento, p.kg_saida,
                    p.capital_necessario, p.data_recebimento ? new Date(p.data_recebimento).toLocaleDateString('pt-BR') : '—',
                    p.horas_maquina,
                ]);
                r.eachCell(cell => { cell.font = base; cell.border = border; });
                r.getCell(3).numFmt = 'R$ #,##0.00';
                r.getCell(4).numFmt = 'R$ #,##0.00';
                r.getCell(9).numFmt = 'R$ #,##0.00';
            }

            // ── Aba 3: Plano 13 Semanas ───────────────────────────────────────
            const wsSem = wb.addWorksheet('13 Semanas');
            wsSem.columns = [
                { header: 'Semana',    width: 10 },
                { header: 'Congelada', width: 12 },
                { header: 'Planejado', width: 16 },
                { header: 'Programado',width: 16 },
                { header: 'Realizado', width: 16 },
                { header: 'Forecast',  width: 16 },
                { header: 'Desvio (%)',width: 12 },
                { header: 'Ação Corretiva', width: 30 },
            ];

            const semHdr = wsSem.getRow(1);
            semHdr.eachCell(cell => {
                cell.font = { ...bold, color: { argb: 'FFFFFFFF' } };
                cell.fill = hdr('1B2A4A');
                cell.border = border;
                cell.alignment = center;
            });
            semHdr.height = 22;

            for (const s of semanas) {
                const r = wsSem.addRow([
                    `Semana ${s.numero_semana}`,
                    s.congelada ? '🔒 Sim' : 'Não',
                    s.planejado, s.programado, s.realizado, s.forecast, s.desvio_percentual,
                    s.acao_corretiva || '',
                ]);
                r.eachCell(cell => { cell.font = base; cell.border = border; cell.alignment = center; });
                if (s.congelada) r.getCell(1).fill = hdr('FFE5B4');
                if (parseFloat(s.desvio_percentual) > 10) r.getCell(7).fill = hdr('FFCCCC');
                [3,4,5,6].forEach(col => { r.getCell(col).numFmt = 'R$ #,##0.00'; });
            }

            // Enviar arquivo
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="plano_${plano.trimestre}_v${plano.versao}.xlsx"`);
            await wb.xlsx.write(res);
            res.end();

        } catch (err) {
            logger.error(`[PLANEJAMENTO] GET /:id/exportar-excel: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
