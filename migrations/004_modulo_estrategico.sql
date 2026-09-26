-- ============================================================
-- Migration 004: Módulo Estratégico de Planejamento e Previsão
-- ApexTech Metais — criado em 2026-09-25
-- Premissa: não colide com tabelas futuras de pátio/lote/PCP operacional
-- ============================================================

-- 1. Cenários de planejamento (Conservador / Ponderado / Agressivo)
CREATE TABLE IF NOT EXISTS cenarios_planejamento (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    nome               VARCHAR(50) NOT NULL,           -- 'Conservador' | 'Ponderado' | 'Agressivo'
    versao             INT NOT NULL DEFAULT 1,
    volume_percentual  DECIMAL(6,2)  NOT NULL,         -- 80 | 100 | 120 (%)
    eficiencia_inicial DECIMAL(6,2)  NOT NULL,         -- 75 | 85  | 92  (%)
    margem_minima      DECIMAL(6,2)  NOT NULL,         -- 30 | 25  | 20  (%)
    capital_maximo     DECIMAL(15,2) DEFAULT NULL,     -- limite de capital (R$); NULL = sem limite
    ativo              BOOLEAN       NOT NULL DEFAULT FALSE,
    autor_id           INT           NOT NULL,
    justificativa      TEXT,
    criado_em          DATETIME      DEFAULT CURRENT_TIMESTAMP,
    -- Cada linha é uma versão imutável; versão anterior fica com ativo=false
    UNIQUE KEY uq_cenario_versao (nome, versao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed: 3 cenários iniciais (versão 1, nenhum ativo até aprovação manual)
INSERT IGNORE INTO cenarios_planejamento
    (nome, versao, volume_percentual, eficiencia_inicial, margem_minima, ativo, autor_id, justificativa)
VALUES
    ('Conservador', 1, 80.00, 75.00, 30.00, FALSE, 1, 'Cenário inicial padrão'),
    ('Ponderado',   1,100.00, 85.00, 25.00, FALSE, 1, 'Cenário inicial padrão'),
    ('Agressivo',   1,120.00, 92.00, 20.00, FALSE, 1, 'Cenário inicial padrão');

-- 2. Planos estratégicos trimestrais (cabeçalho)
CREATE TABLE IF NOT EXISTS planos_estrategicos (
    plano_id         INT AUTO_INCREMENT PRIMARY KEY,
    trimestre        VARCHAR(10)  NOT NULL,            -- ex: '2026-Q1'
    versao           INT          NOT NULL DEFAULT 1,
    cenario_id       INT          NOT NULL,
    autor_id         INT          NOT NULL,
    data_aprovacao   DATETIME     NULL,
    situacao         ENUM('rascunho','aprovado','substituido') NOT NULL DEFAULT 'rascunho',
    receita_meta     DECIMAL(15,2),
    margem_bruta_meta DECIMAL(5,2),
    capital_maximo   DECIMAL(15,2),
    estoque_final_meta DECIMAL(15,2),
    -- Capacidade calculada (passos 5-6 do pipeline)
    horas_disponiveis DECIMAL(10,2) DEFAULT NULL,
    horas_necessarias DECIMAL(10,2) DEFAULT NULL,
    carga_percentual  DECIMAL(6,2)  DEFAULT NULL,
    criado_em        DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cenario_id) REFERENCES cenarios_planejamento(id),
    UNIQUE KEY uq_plano_trimestre_versao (trimestre, versao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Mix de produtos do plano (passo 2 do pipeline)
CREATE TABLE IF NOT EXISTS plano_produtos (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    plano_id        INT          NOT NULL,
    produto_id      INT          NOT NULL,            -- FK futura para tabela de produtos
    produto_nome    VARCHAR(255) NOT NULL,            -- denormalizado para legibilidade
    mix_percentual  DECIMAL(5,2),
    preco           DECIMAL(15,2),
    custo           DECIMAL(15,2),
    margem          DECIMAL(5,2),
    -- Conversão em kg (passo 2)
    kg_entrada      DECIMAL(15,2),
    rendimento      DECIMAL(5,2),
    kg_saida        DECIMAL(15,2),
    -- Compras (passo 4)
    capital_necessario  DECIMAL(15,2) DEFAULT NULL,
    data_recebimento    DATE          DEFAULT NULL,
    -- Capacidade (passo 5)
    horas_maquina   DECIMAL(10,2) DEFAULT NULL,
    FOREIGN KEY (plano_id) REFERENCES planos_estrategicos(plano_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Semanas do plano (13 semanas; semana 1 congelada após aprovação)
CREATE TABLE IF NOT EXISTS plano_semanas (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    plano_id         INT         NOT NULL,
    numero_semana    TINYINT     NOT NULL,            -- 1 a 13
    congelada        BOOLEAN     NOT NULL DEFAULT FALSE,
    planejado        DECIMAL(15,2),
    programado       DECIMAL(15,2),
    realizado        DECIMAL(15,2) NOT NULL DEFAULT 0,
    forecast         DECIMAL(15,2),
    desvio_percentual DECIMAL(5,2),
    acao_corretiva   TEXT,
    atualizado_em    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (plano_id) REFERENCES planos_estrategicos(plano_id),
    UNIQUE KEY uq_plano_semana (plano_id, numero_semana)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Log de auditoria específico do módulo estratégico
--    (complementa o audit_logs genérico com campos de valor_anterior/novo)
CREATE TABLE IF NOT EXISTS estrategico_audit_log (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    entidade       VARCHAR(50)  NOT NULL,             -- 'cenario' | 'plano' | 'semana'
    entidade_id    INT          NOT NULL,
    usuario        VARCHAR(100) NOT NULL,
    acao           VARCHAR(100) NOT NULL,
    valor_anterior TEXT,
    valor_novo     TEXT,
    justificativa  TEXT,
    ip             VARCHAR(45),
    criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
