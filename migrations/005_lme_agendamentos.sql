-- ============================================================
-- Migration 005: Tabela de Agendamentos (LME) para Idempotência e EventBridge
-- ============================================================

CREATE TABLE IF NOT EXISTS lme_agendamentos (
    id VARCHAR(36) PRIMARY KEY, -- UUID gerado pelo sistema
    horario_agendado VARCHAR(5) NOT NULL, -- ex: '14:00'
    dias_semana VARCHAR(50) NOT NULL, -- ex: '1,2,3,4,5'
    status ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    eventbridge_schedule_arn VARCHAR(512),
    timezone VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',
    processing_started_at DATETIME NULL,
    sent_at DATETIME NULL,
    last_error TEXT NULL,
    attempts INT NOT NULL DEFAULT 0,
    resend_message_id VARCHAR(255) NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
