/**
 * src/routes/cenarios.routes.js
 * CRUD de cenários de planejamento com versionamento imutável.
 * Padrão: module.exports = function(pool, dbAvailable, memStore, registrarAuditLog)
 */

'use strict';

const express = require('express');
const logger  = require('../../config/logger');

module.exports = function(pool, dbAvailable, memStore, registrarAuditLog) {
    const router = express.Router();

    const runQ = (sql, params = []) => {
        if (!pool) throw new Error('Módulo Estratégico requer banco de dados MySQL.');
        return pool.query(sql, params);
    };

    // ── GET /api/cenarios — lista a versão mais recente de cada cenário ──────
    router.get('/', async (req, res) => {
        try {
            const [rows] = await runQ(`
                SELECT c.*
                FROM cenarios_planejamento c
                INNER JOIN (
                    SELECT nome, MAX(versao) AS max_versao
                    FROM cenarios_planejamento
                    GROUP BY nome
                ) latest ON c.nome = latest.nome AND c.versao = latest.max_versao
                ORDER BY FIELD(c.nome, 'Conservador', 'Ponderado', 'Agressivo')
            `);
            res.json(rows);
        } catch (err) {
            logger.error(`[CENARIOS] GET /: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    // ── GET /api/cenarios/historico/:nome — todas as versões de um cenário ──
    router.get('/historico/:nome', async (req, res) => {
        try {
            const [rows] = await runQ(
                `SELECT * FROM cenarios_planejamento WHERE nome = ? ORDER BY versao DESC`,
                [req.params.nome]
            );
            res.json(rows);
        } catch (err) {
            logger.error(`[CENARIOS] GET /historico: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    // ── POST /api/cenarios — nova versão de premissas (nunca sobrescreve) ───
    // Perfil: Diretoria (protegido via requireRole no server.js)
    router.post('/', async (req, res) => {
        try {
            const { nome, volume_percentual, eficiencia_inicial, margem_minima, capital_maximo, justificativa } = req.body;
            const autor_id = req.user?.id || 1;

            const nomes_validos = ['Conservador', 'Ponderado', 'Agressivo'];
            if (!nomes_validos.includes(nome)) {
                return res.status(400).json({ error: `Nome de cenário inválido. Use: ${nomes_validos.join(', ')}` });
            }

            if (!justificativa || justificativa.trim().length < 5) {
                return res.status(400).json({ error: 'Justificativa obrigatória (mínimo 5 caracteres) para auditoria.' });
            }

            // Busca versão atual para comparação e incremento
            const [[atual]] = await runQ(
                `SELECT * FROM cenarios_planejamento WHERE nome = ? ORDER BY versao DESC LIMIT 1`,
                [nome]
            );

            const nova_versao = atual ? atual.versao + 1 : 1;

            // Inserir nova versão (imutável)
            const [result] = await runQ(`
                INSERT INTO cenarios_planejamento
                    (nome, versao, volume_percentual, eficiencia_inicial, margem_minima, capital_maximo, ativo, autor_id, justificativa)
                VALUES (?, ?, ?, ?, ?, ?, FALSE, ?, ?)
            `, [nome, nova_versao, volume_percentual, eficiencia_inicial, margem_minima, capital_maximo || null, autor_id, justificativa]);

            // Log de auditoria estruturado
            logger.info(`[CENARIOS] Nova versão criada: ${nome} v${nova_versao} por ${req.user?.user} | ` +
                `anterior: margem=${atual?.margem_minima ?? '-'} → novo: margem=${margem_minima} | justificativa: ${justificativa}`);

            if (registrarAuditLog) {
                await registrarAuditLog(
                    req.user?.user,
                    'CENARIO_NOVO',
                    JSON.stringify({
                        cenario: nome,
                        versao: nova_versao,
                        valor_anterior: atual ? { margem_minima: atual.margem_minima, volume_percentual: atual.volume_percentual } : null,
                        valor_novo: { margem_minima, volume_percentual },
                        justificativa,
                    }),
                    null,
                    req
                );
            }

            res.status(201).json({ id: result.insertId, nome, versao: nova_versao, message: 'Nova versão do cenário criada com sucesso.' });
        } catch (err) {
            logger.error(`[CENARIOS] POST /: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    // ── PUT /api/cenarios/:id/ativar — ativa um cenário (desativa todos os outros) ──
    // Perfil: Diretoria
    router.put('/:id/ativar', async (req, res) => {
        try {
            const { id } = req.params;
            const { justificativa } = req.body;

            if (!justificativa || justificativa.trim().length < 5) {
                return res.status(400).json({ error: 'Justificativa obrigatória para ativar cenário.' });
            }

            const [[cenario]] = await runQ(`SELECT * FROM cenarios_planejamento WHERE id = ?`, [id]);
            if (!cenario) return res.status(404).json({ error: 'Cenário não encontrado.' });

            // Desativa todos, ativa somente este
            await runQ(`UPDATE cenarios_planejamento SET ativo = FALSE`);
            await runQ(`UPDATE cenarios_planejamento SET ativo = TRUE WHERE id = ?`, [id]);

            logger.info(`[CENARIOS] Cenário ativado: ${cenario.nome} v${cenario.versao} por ${req.user?.user} | justificativa: ${justificativa}`);

            if (registrarAuditLog) {
                await registrarAuditLog(req.user?.user, 'CENARIO_ATIVADO',
                    JSON.stringify({ cenario_id: id, nome: cenario.nome, versao: cenario.versao, justificativa }), null, req);
            }

            res.json({ success: true, message: `Cenário ${cenario.nome} v${cenario.versao} ativado.` });
        } catch (err) {
            logger.error(`[CENARIOS] PUT /:id/ativar: ${err.message}`);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
