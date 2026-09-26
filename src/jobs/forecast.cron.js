/**
 * src/jobs/forecast.cron.js
 * Job semanal — Passo 8 do pipeline estratégico.
 * Atualiza automaticamente realizado + desvio_percentual nas plano_semanas.
 * Reutiliza o padrão cron.schedule já usado para o envio do Relatório LME.
 *
 * Agendamento padrão: toda segunda-feira às 06:00 (America/Sao_Paulo)
 * Para o job rodar ele deve ser requerido DENTRO do bloco initDatabase().then(...)
 * do server.js, da mesma forma que o cron do LME.
 */

'use strict';

const cron   = require('node-cron');
const logger = require('../../config/logger');
const svc    = require('../services/planejamento.service');

/**
 * Executa o update de forecast para todos os planos aprovados com semanas fechadas.
 * Semana fechada = numero_semana < semana_atual_do_trimestre E realizado = 0.
 *
 * Em produção, o dado de `realizado` deve vir de um sistema de apontamento
 * (NF, OEE, etc.). Por enquanto o job serve como gatilho; o lançamento real
 * vem via POST /api/planejamento-estrategico/:id/semanas/:num/realizado.
 *
 * O job verifica R10 (desvio > 10%) e loga alertas.
 *
 * @param {import('mysql2/promise').Pool} pool
 */
async function runForecastJob(pool) {
    logger.info('[FORECAST CRON] Iniciando job de atualização de forecast semanal...');

    try {
        // Busca todas as semanas de planos aprovados que têm realizado > 0 mas desvio não calculado
        const [semanas] = await pool.query(`
            SELECT ps.*
            FROM plano_semanas ps
            JOIN planos_estrategicos pe ON ps.plano_id = pe.plano_id
            WHERE pe.situacao = 'aprovado'
              AND ps.realizado > 0
              AND (ps.desvio_percentual IS NULL OR ps.desvio_percentual = 0)
            ORDER BY ps.plano_id ASC, ps.numero_semana ASC
        `);

        if (semanas.length === 0) {
            logger.info('[FORECAST CRON] Nenhuma semana pendente de atualização de desvio.');
            return;
        }

        let atualizadas = 0;
        let alertas_r10 = 0;

        for (const semana of semanas) {
            const update = svc.atualizarForecastSemana(semana, semana.realizado);

            await pool.query(`
                UPDATE plano_semanas
                SET forecast = ?, desvio_percentual = ?
                WHERE id = ?
            `, [update.forecast, update.desvio_percentual, semana.id]);

            atualizadas++;

            if (update.alerta_r10) {
                alertas_r10++;
                // Log já feito dentro de atualizarForecastSemana via logger.warn
            }
        }

        logger.info(`[FORECAST CRON] Concluído: ${atualizadas} semana(s) atualizadas, ${alertas_r10} alerta(s) R10 gerado(s).`);

    } catch (err) {
        logger.error(`[FORECAST CRON] Erro durante execução do job: ${err.message}\n${err.stack}`);
    }
}

/**
 * Registra o cron semanal de forecast.
 * @param {import('mysql2/promise').Pool} pool
 * @returns {cron.ScheduledTask}
 */
function registrarForecastCron(pool) {
    // Toda segunda-feira às 06:00, fuso São Paulo — compatível com o padrão do LME cron
    const task = cron.schedule('0 6 * * 1', async () => {
        await runForecastJob(pool);
    }, {
        timezone: 'America/Sao_Paulo'
    });

    logger.info('[FORECAST CRON] Agendador de forecast estratégico registrado (toda 2ª-feira às 06:00, fuso: America/Sao_Paulo)');
    return task;
}

module.exports = { registrarForecastCron, runForecastJob };
