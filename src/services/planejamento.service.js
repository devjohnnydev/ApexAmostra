/**
 * src/services/planejamento.service.js
 * Pipeline de cálculo do plano trimestral (8 passos).
 * Separado do controller para permitir teste unitário sem banco de dados.
 */

'use strict';

const logger = require('../../config/logger');

// ─── Constantes dos Cenários ─────────────────────────────────────────────────
const CENARIO_DEFAULTS = {
    Conservador: { volume_percentual: 80,  eficiencia_inicial: 75, margem_minima: 30 },
    Ponderado:   { volume_percentual: 100, eficiencia_inicial: 85, margem_minima: 25 },
    Agressivo:   { volume_percentual: 120, eficiencia_inicial: 92, margem_minima: 20 },
};

// ─── Alertas Estratégicos ─────────────────────────────────────────────────────
const ALERTAS = {
    R01: { id: 'R01', nivel: 'Critico', mensagem: 'Margem projetada abaixo do mínimo do cenário. Aprovação bloqueada.' },
    R03: { id: 'R03', nivel: 'Alto',    mensagem: 'Carga de linha acima de 90%% da capacidade. Considere turno adicional.' },
    R07: { id: 'R07', nivel: 'Critico', mensagem: 'Capital requerido acima do limite do cenário. Priorize produtos com maior lucro/hora.' },
    R10: { id: 'R10', nivel: 'Alto',    mensagem: 'Desvio semanal do forecast acima de 10%%. Gerado flag de replanejamento.' },
};

/**
 * Passo 1: Validar metas do trimestre contra premissas do cenário.
 * @param {object} metas   — { receita_meta, margem_bruta_meta, capital_maximo }
 * @param {object} cenario — linha da tabela cenarios_planejamento
 * @returns {{ ok: boolean, alertas: string[] }}
 */
function validarMetas(metas, cenario) {
    const alertas = [];

    // R01 — Margem projetada abaixo do mínimo
    if (parseFloat(metas.margem_bruta_meta) < parseFloat(cenario.margem_minima)) {
        alertas.push(ALERTAS.R01.mensagem);
    }

    // R07 — Capital acima do limite
    if (cenario.capital_maximo && parseFloat(metas.capital_maximo) > parseFloat(cenario.capital_maximo)) {
        alertas.push(ALERTAS.R07.mensagem);
    }

    return { ok: alertas.length === 0, alertas };
}

/**
 * Passo 2: Distribuição de faturamento por produto → quilos.
 * @param {number} receita_meta      — R$ faturamento alvo no trimestre
 * @param {Array}  produtos          — [{ produto_id, produto_nome, mix_percentual, preco, custo, rendimento }]
 * @returns {Array} produtos enriquecidos com kg_entrada, kg_saida, margem, capital_necessario
 */
function calcularMixProdutos(receita_meta, produtos) {
    let totalMix = produtos.reduce((s, p) => s + parseFloat(p.mix_percentual || 0), 0);
    if (totalMix === 0) totalMix = 100; // evitar divisão por zero

    return produtos.map(p => {
        const mix    = parseFloat(p.mix_percentual) || 0;
        const preco  = parseFloat(p.preco) || 0;
        const custo  = parseFloat(p.custo) || 0;
        const rend   = parseFloat(p.rendimento) || 1; // kg saída / kg entrada

        const receita_produto = receita_meta * (mix / totalMix);
        const kg_saida        = preco > 0 ? receita_produto / preco : 0;
        const kg_entrada      = rend > 0  ? kg_saida / rend         : 0;
        const margem          = preco > 0 ? ((preco - custo) / preco) * 100 : 0;
        const capital_necessario = kg_entrada * custo;

        return {
            ...p,
            kg_entrada: +kg_entrada.toFixed(3),
            kg_saida:   +kg_saida.toFixed(3),
            margem:     +margem.toFixed(2),
            capital_necessario: +capital_necessario.toFixed(2),
        };
    });
}

/**
 * Passo 3: Necessidade líquida descontando estoque e ordens em processo.
 * @param {Array}  produtos_calculados — saída do passo 2
 * @param {object} estoques            — { [produto_id]: { estoque_kg, ordens_kg } }
 * @returns {Array} produtos com campo necessidade_liquida_kg
 */
function calcularNecessidadeLiquida(produtos_calculados, estoques) {
    return produtos_calculados.map(p => {
        const est = estoques[p.produto_id] || { estoque_kg: 0, ordens_kg: 0 };
        const necessidade_liquida_kg = Math.max(
            0,
            p.kg_entrada - parseFloat(est.estoque_kg) - parseFloat(est.ordens_kg)
        );
        return { ...p, necessidade_liquida_kg: +necessidade_liquida_kg.toFixed(3) };
    });
}

/**
 * Passo 4: Carteira de compras — capital e agenda de recebimento.
 * Assume recebimento uniforme a partir da data_inicio do trimestre.
 * @param {Array}  produtos    — saída do passo 3
 * @param {string} data_inicio — '2026-01-01' (primeiro dia do trimestre)
 * @returns {Array} produtos com capital_compras e data_recebimento estimada
 */
function calcularCarteiraCompras(produtos, data_inicio) {
    const inicio = new Date(data_inicio);
    return produtos.map((p, idx) => {
        // Escalonar recebimentos a cada ~2 semanas por produto
        const semanas_offset = idx % 6;
        const data_recebimento = new Date(inicio);
        data_recebimento.setDate(data_recebimento.getDate() + semanas_offset * 14);

        const capital_compras = +(p.necessidade_liquida_kg * (parseFloat(p.custo) || 0)).toFixed(2);

        return {
            ...p,
            capital_compras,
            data_recebimento: data_recebimento.toISOString().split('T')[0],
        };
    });
}

/**
 * Passo 5: Conversão de quilos em horas-máquina.
 * @param {Array}  produtos  — saída do passo 4
 * @param {number} taxa_kg_h — kg/hora médio da linha (padrão: 500 kg/h)
 * @returns {{ horas_necessarias: number, por_produto: Array }}
 */
function calcularHorasMaquina(produtos, taxa_kg_h = 500) {
    let horas_necessarias = 0;
    const por_produto = produtos.map(p => {
        const horas_maquina = taxa_kg_h > 0
            ? +(p.necessidade_liquida_kg / taxa_kg_h).toFixed(2)
            : 0;
        horas_necessarias += horas_maquina;
        return { ...p, horas_maquina };
    });
    return { horas_necessarias: +horas_necessarias.toFixed(2), por_produto };
}

/**
 * Passo 6: Verificar carga vs. capacidade disponível.
 * @param {number} horas_necessarias
 * @param {number} horas_disponiveis — calendário menos manutenções
 * @param {string} cenario_nome      — 'Conservador' | 'Ponderado' | 'Agressivo'
 * @returns {{ carga_percentual: number, alertas: string[] }}
 */
function verificarCapacidade(horas_necessarias, horas_disponiveis, cenario_nome) {
    const alertas = [];
    if (horas_disponiveis <= 0) return { carga_percentual: 100, alertas: [ALERTAS.R03.mensagem] };

    const carga_percentual = +((horas_necessarias / horas_disponiveis) * 100).toFixed(2);
    if (carga_percentual > 90) alertas.push(ALERTAS.R03.mensagem);

    return { carga_percentual, alertas };
}

/**
 * Passo 7: Distribuir planejado em 13 semanas.
 * Retorna array de 13 objetos { numero_semana, planejado, congelada }.
 * Semana 1 = congelada somente APÓS aprovação (controlado pelo controller).
 * @param {number} receita_meta
 * @param {number} [semana_congelada_valor=null] — se já existe semana 1 realizada, manter valor
 * @returns {Array}
 */
function distribuirSemanas(receita_meta, semana_congelada_valor = null) {
    const receita_disponivel = semana_congelada_valor !== null
        ? receita_meta - semana_congelada_valor
        : receita_meta;

    const semanas_livres = semana_congelada_valor !== null ? 12 : 13;
    const por_semana = semanas_livres > 0 ? +(receita_disponivel / semanas_livres).toFixed(2) : 0;

    const semanas = [];
    for (let i = 1; i <= 13; i++) {
        if (i === 1 && semana_congelada_valor !== null) {
            semanas.push({
                numero_semana:    1,
                planejado:        +semana_congelada_valor.toFixed(2),
                programado:       +semana_congelada_valor.toFixed(2),
                realizado:        0,
                forecast:         +semana_congelada_valor.toFixed(2),
                desvio_percentual: 0,
                congelada:        true,
            });
        } else {
            semanas.push({
                numero_semana:    i,
                planejado:        por_semana,
                programado:       por_semana,
                realizado:        0,
                forecast:         por_semana,
                desvio_percentual: 0,
                congelada:        false,
            });
        }
    }
    return semanas;
}

/**
 * Passo 8: Atualizar forecast de uma semana com valor realizado.
 * Usado pelo job CRON semanal — pode ser chamado sem pool (lógica pura).
 * @param {object} semana — linha de plano_semanas
 * @param {number} realizado
 * @returns {{ realizado, forecast, desvio_percentual, alerta_r10: boolean }}
 */
function atualizarForecastSemana(semana, realizado) {
    const planejado = parseFloat(semana.planejado) || 0;
    const real      = parseFloat(realizado) || 0;

    const forecast         = real; // forecast da semana fechada = realizado
    const desvio_percentual = planejado > 0
        ? +((Math.abs(real - planejado) / planejado) * 100).toFixed(2)
        : 0;

    const alerta_r10 = desvio_percentual > 10;
    if (alerta_r10) {
        logger.warn(`[ESTRATEGICO] ${ALERTAS.R10.mensagem} — semana ${semana.numero_semana}, plano ${semana.plano_id}, desvio ${desvio_percentual}%`);
    }

    return { realizado: real, forecast, desvio_percentual, alerta_r10 };
}

/**
 * Pipeline completo de cálculo do plano trimestral (passos 1–7).
 * @param {object} params
 * @param {object} params.metas       — { receita_meta, margem_bruta_meta, capital_maximo, estoque_final_meta }
 * @param {Array}  params.produtos     — array de produtos (ver calcularMixProdutos)
 * @param {object} params.estoques     — { [produto_id]: { estoque_kg, ordens_kg } }
 * @param {object} params.cenario      — linha cenarios_planejamento
 * @param {string} params.data_inicio  — '2026-01-01'
 * @param {number} [params.horas_disponiveis=2184] — 13 semanas × 168h (1 turno: 13×91=1183)
 * @param {number} [params.taxa_kg_h=500]
 * @returns {{ ok: boolean, alertas: string[], semanas: Array, produtos_calculados: Array,
 *             horas_necessarias: number, carga_percentual: number, capital_total: number }}
 */
function calcularPlanoCompleto({ metas, produtos, estoques, cenario, data_inicio, horas_disponiveis = 1183, taxa_kg_h = 500 }) {
    const alertas = [];

    // Passo 1
    const validacao = validarMetas(metas, cenario);
    alertas.push(...validacao.alertas);

    // Passo 2
    const p2 = calcularMixProdutos(parseFloat(metas.receita_meta), produtos);

    // Passo 3
    const p3 = calcularNecessidadeLiquida(p2, estoques);

    // Passo 4
    const p4 = calcularCarteiraCompras(p3, data_inicio);

    // Passo 5
    const { horas_necessarias, por_produto: p5 } = calcularHorasMaquina(p4, taxa_kg_h);

    // Passo 6
    const { carga_percentual, alertas: alertasCap } = verificarCapacidade(horas_necessarias, horas_disponiveis, cenario.nome);
    alertas.push(...alertasCap);

    // Capital total
    const capital_total = +p5.reduce((s, p) => s + (p.capital_compras || 0), 0).toFixed(2);

    // R07 — Capital total acima do limite do cenário
    if (cenario.capital_maximo && capital_total > parseFloat(cenario.capital_maximo)) {
        alertas.push(ALERTAS.R07.mensagem);
    }

    // Passo 7
    const semanas = distribuirSemanas(parseFloat(metas.receita_meta));

    return {
        ok:                  validacao.ok && !alertasCap.some(a => a.includes('Critico')),
        alertas:             [...new Set(alertas)], // deduplica
        semanas,
        produtos_calculados: p5,
        horas_necessarias,
        horas_disponiveis,
        carga_percentual,
        capital_total,
    };
}

module.exports = {
    ALERTAS,
    CENARIO_DEFAULTS,
    validarMetas,
    calcularMixProdutos,
    calcularNecessidadeLiquida,
    calcularCarteiraCompras,
    calcularHorasMaquina,
    verificarCapacidade,
    distribuirSemanas,
    atualizarForecastSemana,
    calcularPlanoCompleto,
};
