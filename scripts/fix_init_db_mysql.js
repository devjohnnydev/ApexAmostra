/**
 * Script para substituir a função initDatabase() no server.js
 * com uma versão totalmente compatível com MySQL
 */
const fs = require('fs');

const newInitDatabase = `
async function initDatabase() {
    if (!pool) {
        console.log('⚠️  Banco de dados não configurado. Usando armazenamento em memória.');
        return;
    }
    
    // Função auxiliar para executar cada CREATE TABLE individualmente
    async function runSQL(sql, label) {
        try {
            await pool.query(sql);
        } catch(e) {
            // Ignora erros de coluna/índice já existente
            if (!e.message.includes('Duplicate column') && !e.message.includes('already exists')) {
                console.warn(\`⚠️ [\${label}]: \${e.message}\`);
            }
        }
    }

    try {
        console.log('🗄️  Inicializando banco de dados MySQL...');

        await runSQL(\`CREATE TABLE IF NOT EXISTS solucoes (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            nome      TEXT    NOT NULL,
            img       TEXT    NOT NULL,
            descricao TEXT    NOT NULL,
            ordem     INTEGER DEFAULT 0,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'solucoes');

        await runSQL(\`CREATE TABLE IF NOT EXISTS materiais (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            nome      TEXT    NOT NULL,
            imagem    TEXT,
            descricao TEXT    NOT NULL,
            locais    JSON,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'materiais');

        await runSQL(\`CREATE TABLE IF NOT EXISTS noticias (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            titulo    TEXT    NOT NULL,
            url       TEXT,
            resumo    TEXT,
            data_pub  DATE,
            categoria TEXT,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'noticias');

        await runSQL(\`CREATE TABLE IF NOT EXISTS settings (
            \\\`key\\\`   VARCHAR(255) PRIMARY KEY,
            value TEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'settings');

        await runSQL(\`CREATE TABLE IF NOT EXISTS galeria (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            url       TEXT NOT NULL,
            titulo    TEXT NOT NULL,
            ordem     INTEGER DEFAULT 0,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'galeria');

        await runSQL(\`CREATE TABLE IF NOT EXISTS lme_destinatarios (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            nome      TEXT NOT NULL,
            email     TEXT NOT NULL,
            tipo      TEXT DEFAULT 'lme',
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'lme_destinatarios');

        await runSQL(\`CREATE TABLE IF NOT EXISTS pedidos_venda (
            id                     INT AUTO_INCREMENT PRIMARY KEY,
            numero                 VARCHAR(50) NOT NULL UNIQUE,
            cliente_id             INTEGER,
            cliente_nome           TEXT,
            data_emissao           DATE,
            data_entrega           DATE,
            status                 VARCHAR(50) NOT NULL DEFAULT 'Rascunho',
            condicao_pagamento     TEXT,
            observacoes            TEXT,
            desconto_pct           DECIMAL(5,2) DEFAULT 0.00,
            frete                  DECIMAL(10,2) DEFAULT 0.00,
            total_itens            DECIMAL(14,2) DEFAULT 0.00,
            total_geral            DECIMAL(14,2) DEFAULT 0.00,
            criado_por             TEXT,
            criado_por_perfil      TEXT,
            aprovado_por           TEXT,
            data_aprovacao         TIMESTAMP NULL,
            endereco_entrega       TEXT,
            responsavel_recebimento TEXT,
            tipo_frete             TEXT,
            criado_em              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            atualizado_em          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'pedidos_venda');

        await runSQL(\`CREATE TABLE IF NOT EXISTS pedidos_venda_itens (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            pedido_id      INTEGER NOT NULL,
            material_id    INTEGER,
            descricao      TEXT NOT NULL,
            unidade        TEXT DEFAULT 'kg',
            quantidade     DECIMAL(12,3) NOT NULL,
            preco_unitario DECIMAL(10,4) NOT NULL,
            desconto_item  DECIMAL(5,2) DEFAULT 0.00,
            total_item     DECIMAL(14,2) NOT NULL,
            FOREIGN KEY (pedido_id) REFERENCES pedidos_venda(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'pedidos_venda_itens');

        await runSQL(\`CREATE TABLE IF NOT EXISTS fornecedores (
            id                 INT AUTO_INCREMENT PRIMARY KEY,
            codfor             INTEGER UNIQUE,
            nome               VARCHAR(255) NOT NULL,
            apelido            VARCHAR(255),
            fone1              TEXT,
            fone2              TEXT,
            whatsapp           TEXT,
            celular            TEXT,
            tabela             TEXT,
            concorrente        TEXT,
            status_ok          TEXT,
            dias               INTEGER DEFAULT 0,
            ultima_entrega     DATE,
            tipo_pessoa        TEXT,
            data_cadastro      DATE,
            endereco           TEXT,
            numero             TEXT,
            complemento        TEXT,
            bairro             TEXT,
            cidade             TEXT,
            uf                 TEXT,
            cep                TEXT,
            cnpj               VARCHAR(18),
            ie                 TEXT,
            im                 TEXT,
            rg                 TEXT,
            emissor            TEXT,
            cpf                TEXT,
            comprador          VARCHAR(150),
            email              VARCHAR(150),
            condicao_pagamento TEXT,
            usuario_cadastro   TEXT,
            ultimo_alterou     TEXT,
            dias_atraso        INTEGER DEFAULT 0,
            dias_previsao      INTEGER DEFAULT 0,
            filial             TEXT,
            criado_em          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            atualizado_em      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'fornecedores');

        await runSQL(\`CREATE TABLE IF NOT EXISTS clientes (
            id                  INT AUTO_INCREMENT PRIMARY KEY,
            codigo              INTEGER NOT NULL UNIQUE,
            nome                TEXT NOT NULL,
            fantasia            TEXT,
            telefone1           TEXT,
            telefone2           TEXT,
            dias                TEXT,
            ultima_saida        DATE,
            endereco            TEXT,
            numero              TEXT,
            bairro              TEXT,
            cidade              TEXT,
            uf                  TEXT,
            pais                TEXT,
            cep                 TEXT,
            cnpj                TEXT,
            ie                  TEXT,
            cpf                 TEXT,
            rg                  TEXT,
            tipo_cliente        TEXT,
            contato_comercial   TEXT,
            contato_financeiro  TEXT,
            status              TEXT,
            vendedor            TEXT,
            filial              TEXT,
            email               TEXT,
            usuario_cadastro    TEXT,
            ultimo_alterou      TEXT,
            atualizado          TEXT,
            criado_em           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'clientes');

        await runSQL(\`CREATE TABLE IF NOT EXISTS materiais_catalogo (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            nome        TEXT NOT NULL,
            unidade     TEXT DEFAULT 'kg',
            categoria   TEXT NOT NULL,
            cor         TEXT,
            ncm         TEXT,
            observacoes TEXT,
            criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'materiais_catalogo');

        await runSQL(\`CREATE TABLE IF NOT EXISTS residuos_catalogo (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            nome        TEXT NOT NULL,
            unidade     TEXT DEFAULT 'kg',
            categoria   TEXT NOT NULL,
            cor         TEXT,
            ncm         TEXT,
            observacoes TEXT,
            criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'residuos_catalogo');

        await runSQL(\`CREATE TABLE IF NOT EXISTS ligas_catalogo (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            nome        TEXT NOT NULL,
            unidade     TEXT DEFAULT 'kg',
            categoria   TEXT NOT NULL,
            cor         TEXT,
            ncm         TEXT,
            observacoes TEXT,
            criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'ligas_catalogo');

        await runSQL(\`CREATE TABLE IF NOT EXISTS tabela_precos (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            material_id     INTEGER NOT NULL,
            preco_entregar  DECIMAL(10,2) DEFAULT 0.00,
            preco_coletar   DECIMAL(10,2) DEFAULT 0.00,
            venda_ref       DECIMAL(10,2) DEFAULT 0.00,
            comissao        DECIMAL(10,2) DEFAULT 0.00,
            pis_cofins      DECIMAL(10,2) DEFAULT 0.00,
            fidc            DECIMAL(10,2) DEFAULT 0.00,
            icms            DECIMAL(10,2) DEFAULT 0.00,
            frete_coleta    DECIMAL(10,2) DEFAULT 0.00,
            validade        DATE NOT NULL,
            criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'tabela_precos');

        await runSQL(\`CREATE TABLE IF NOT EXISTS tabela_precos_residuos (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            material_id     INTEGER NOT NULL,
            preco_entregar  DECIMAL(10,2) DEFAULT 0.00,
            preco_coletar   DECIMAL(10,2) DEFAULT 0.00,
            venda_ref       DECIMAL(10,2) DEFAULT 0.00,
            comissao        DECIMAL(6,2) DEFAULT 0.00,
            pis_cofins      DECIMAL(6,2) DEFAULT 0.00,
            fidc            DECIMAL(6,2) DEFAULT 0.00,
            icms            DECIMAL(6,2) DEFAULT 0.00,
            frete_coleta    DECIMAL(10,2) DEFAULT 0.00,
            validade        DATE NOT NULL,
            criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'tabela_precos_residuos');

        await runSQL(\`CREATE TABLE IF NOT EXISTS tabela_precos_ligas (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            material_id     INTEGER NOT NULL,
            preco_entregar  DECIMAL(10,2) DEFAULT 0.00,
            preco_coletar   DECIMAL(10,2) DEFAULT 0.00,
            venda_ref       DECIMAL(10,2) DEFAULT 0.00,
            comissao        DECIMAL(6,2) DEFAULT 0.00,
            pis_cofins      DECIMAL(6,2) DEFAULT 0.00,
            fidc            DECIMAL(6,2) DEFAULT 0.00,
            icms            DECIMAL(6,2) DEFAULT 0.00,
            frete_coleta    DECIMAL(10,2) DEFAULT 0.00,
            validade        DATE NOT NULL,
            criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'tabela_precos_ligas');

        await runSQL(\`CREATE TABLE IF NOT EXISTS tabela_precos_volume (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            material_id     INTEGER NOT NULL,
            preco_entregar  DECIMAL(10,2) DEFAULT 0.00,
            preco_coletar   DECIMAL(10,2) DEFAULT 0.00,
            venda_ref       DECIMAL(10,2) DEFAULT 0.00,
            comissao        DECIMAL(6,2) DEFAULT 0.00,
            pis_cofins      DECIMAL(6,2) DEFAULT 0.00,
            fidc            DECIMAL(6,2) DEFAULT 0.00,
            icms            DECIMAL(6,2) DEFAULT 0.00,
            frete_coleta    DECIMAL(10,2) DEFAULT 0.00,
            validade        DATE NOT NULL,
            criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'tabela_precos_volume');

        await runSQL(\`CREATE TABLE IF NOT EXISTS tabela_precos_fundicao (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            material_id     INTEGER NOT NULL,
            preco_entregar  DECIMAL(10,2) DEFAULT 0.00,
            preco_coletar   DECIMAL(10,2) DEFAULT 0.00,
            venda_ref       DECIMAL(10,2) DEFAULT 0.00,
            comissao        DECIMAL(6,2) DEFAULT 0.00,
            pis_cofins      DECIMAL(6,2) DEFAULT 0.00,
            fidc            DECIMAL(6,2) DEFAULT 0.00,
            icms            DECIMAL(6,2) DEFAULT 0.00,
            frete_coleta    DECIMAL(10,2) DEFAULT 0.00,
            validade        DATE NOT NULL,
            criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'tabela_precos_fundicao');

        await runSQL(\`CREATE TABLE IF NOT EXISTS amostras (
            id                    INT AUTO_INCREMENT PRIMARY KEY,
            numero_amostra        TEXT NOT NULL,
            nome_material         TEXT,
            data                  DATE NOT NULL,
            fornecedor_id         INTEGER NOT NULL,
            responsavel           TEXT NOT NULL,
            representante         TEXT,
            peso_inicial          DECIMAL(14,4) NOT NULL,
            status                TEXT DEFAULT 'Em Análise',
            observacoes           TEXT,
            foto_original         TEXT,
            tempo_desmonte        INTEGER DEFAULT 0,
            parecer_tecnico       TEXT,
            decisao_diretoria     TEXT DEFAULT 'Aguardando',
            tecnico_analise       TEXT,
            admin_aprovacao       TEXT,
            motivo_reprovacao     TEXT,
            data_decisao          TIMESTAMP NULL,
            preco_compra_entregar DECIMAL(10,2),
            preco_compra_coletar  DECIMAL(10,2),
            preco_validade        TIMESTAMP NULL,
            autorizado_por        TEXT,
            obs_diretoria         TEXT,
            criado_em             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'amostras');

        await runSQL(\`CREATE TABLE IF NOT EXISTS componentes_amostra (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            amostra_id  INTEGER NOT NULL,
            material_id INTEGER NOT NULL,
            peso        DECIMAL(12,3) NOT NULL,
            percentual  DECIMAL(5,2) NOT NULL,
            observacoes TEXT,
            foto        TEXT,
            dificuldade TEXT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'componentes_amostra');

        await runSQL(\`CREATE TABLE IF NOT EXISTS lotes_compra (
            id                    INT AUTO_INCREMENT PRIMARY KEY,
            amostra_id            INTEGER,
            fornecedor_id         INTEGER NOT NULL,
            produto               TEXT NOT NULL,
            peso_comprado         DECIMAL(12,3) NOT NULL,
            preco_compra          DECIMAL(10,2) NOT NULL,
            percentual_rendimento DECIMAL(5,2) NOT NULL,
            material_id           INTEGER NOT NULL,
            preco_venda_material  DECIMAL(10,2) NOT NULL,
            comissao              DECIMAL(5,2) DEFAULT 2.0,
            fidc                  DECIMAL(5,2) DEFAULT 2.3,
            mes                   TEXT NOT NULL,
            cliente               TEXT,
            prazo_recebimento_dias INTEGER,
            forma_pagamento       TEXT,
            simulacoes_historico  JSON,
            criado_em             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'lotes_compra');

        await runSQL(\`CREATE TABLE IF NOT EXISTS estoque (
            material_id INTEGER PRIMARY KEY,
            saldo       DECIMAL(12,3) DEFAULT 0.000
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'estoque');

        await runSQL(\`CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            material_id INTEGER NOT NULL,
            tipo        TEXT NOT NULL,
            quantidade  DECIMAL(12,3) NOT NULL,
            motivo      TEXT,
            data        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'movimentacoes_estoque');

        await runSQL(\`CREATE TABLE IF NOT EXISTS usuarios (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            \\\`user\\\`    TEXT NOT NULL,
            pass      TEXT NOT NULL,
            perfil    TEXT NOT NULL,
            nome      TEXT NOT NULL,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'usuarios');

        await runSQL(\`CREATE TABLE IF NOT EXISTS fotos_amostra (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            amostra_id     INTEGER NOT NULL,
            tipo           TEXT DEFAULT 'bruta',
            etapa          TEXT DEFAULT 'Recebimento',
            componente_idx INTEGER DEFAULT NULL,
            data_b64       LONGTEXT NOT NULL,
            mimetype       TEXT DEFAULT 'image/jpeg',
            nome           TEXT,
            criado_em      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'fotos_amostra');

        await runSQL(\`CREATE TABLE IF NOT EXISTS audit_logs (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            usuario    TEXT DEFAULT 'Sistema',
            acao       TEXT NOT NULL,
            detalhe    TEXT,
            amostra_id INTEGER,
            ip         TEXT,
            criado_em  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'audit_logs');

        await runSQL(\`CREATE TABLE IF NOT EXISTS planejamento_compras (
            id                      INT AUTO_INCREMENT PRIMARY KEY,
            tipo_planejamento       TEXT DEFAULT 'COMPRA_VENDA',
            material_id             INTEGER,
            fornecedor_id           INTEGER,
            quantidade_necessaria   DECIMAL(12,3) NOT NULL,
            quantidade_realizada_kg DECIMAL(12,3) DEFAULT 0.00,
            ponto_pedido_kg         DECIMAL(12,3) DEFAULT 0.00,
            lead_time_dias          INTEGER DEFAULT 7,
            preco_estimado          DECIMAL(10,4) DEFAULT 0.00,
            custo_total_estimado    DECIMAL(14,2) DEFAULT 0.00,
            custo_total_realizado   DECIMAL(14,2) DEFAULT 0.00,
            mes_referencia          TEXT,
            status                  TEXT DEFAULT 'Sugerido',
            observacoes             TEXT,
            criado_em               TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'planejamento_compras');

        await runSQL(\`CREATE TABLE IF NOT EXISTS equipamentos_industriais (
            id                        INT AUTO_INCREMENT PRIMARY KEY,
            nome_equipamento          TEXT NOT NULL,
            codigo_tag                VARCHAR(255) UNIQUE NOT NULL,
            setor                     TEXT DEFAULT 'Processamento',
            capacidade_nominal_kgh    DECIMAL(10,2) DEFAULT 1000.00,
            disponibilidade_horas_dia DECIMAL(5,2) DEFAULT 16.00,
            tempo_setup_horas         DECIMAL(5,2) DEFAULT 1.00,
            eficiencia_oee_pct        DECIMAL(5,2) DEFAULT 85.00,
            status                    TEXT DEFAULT 'Operacional',
            observacoes               TEXT,
            criado_em                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'equipamentos_industriais');

        await runSQL(\`CREATE TABLE IF NOT EXISTS ordens_producao (
            id                     INT AUTO_INCREMENT PRIMARY KEY,
            numero_op              VARCHAR(255) UNIQUE NOT NULL,
            amostra_id             INTEGER,
            lote_id                INTEGER,
            material_entrada       TEXT,
            peso_entrada_kg        DECIMAL(12,3) NOT NULL,
            material_saida_id      INTEGER,
            peso_saida_estimado_kg DECIMAL(12,3) DEFAULT 0.00,
            data_inicio_prevista   DATE,
            data_fim_prevista      DATE,
            responsavel_pcp        TEXT,
            status                 TEXT DEFAULT 'Planejada',
            observacoes            TEXT,
            criado_em              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            atualizado_em          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'ordens_producao');

        await runSQL(\`CREATE TABLE IF NOT EXISTS ordens_producao_etapas (
            id                   INT AUTO_INCREMENT PRIMARY KEY,
            op_id                INTEGER NOT NULL,
            nome_etapa           TEXT NOT NULL,
            ordem                INTEGER DEFAULT 1,
            equipamento_id       INTEGER,
            tempo_estimado_horas DECIMAL(8,2) DEFAULT 0.00,
            tempo_real_horas     DECIMAL(8,2) DEFAULT 0.00,
            status_etapa         TEXT DEFAULT 'Pendente',
            operador_responsavel TEXT,
            observacoes          TEXT,
            FOREIGN KEY (op_id) REFERENCES ordens_producao(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'ordens_producao_etapas');

        await runSQL(\`CREATE TABLE IF NOT EXISTS planejamento_producao_insumos (
            id                       INT AUTO_INCREMENT PRIMARY KEY,
            periodo                  TEXT NOT NULL,
            produto_id               INTEGER,
            produto_nome             TEXT,
            meta_faturamento_rs      DECIMAL(14,2) DEFAULT 0.00,
            preco_venda_produto_rs   DECIMAL(14,4) DEFAULT 0.00,
            qtd_produto_necessaria   DECIMAL(12,3) DEFAULT 0.00,
            custo_total_projetado_rs DECIMAL(14,2) DEFAULT 0.00,
            margem_projetada_pct     DECIMAL(8,4) DEFAULT 0.00,
            prazo_compra_ate         DATE,
            prazo_venda_ate          DATE,
            status                   TEXT DEFAULT 'Pendente',
            criado_em                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'planejamento_producao_insumos');

        await runSQL(\`CREATE TABLE IF NOT EXISTS planejamento_producao_linhas (
            id                    INT AUTO_INCREMENT PRIMARY KEY,
            planejamento_id       INTEGER NOT NULL,
            insumo_produto_id     INTEGER,
            insumo_nome           TEXT NOT NULL,
            coeficiente_pct       DECIMAL(8,4) NOT NULL DEFAULT 100,
            qtd_necessaria        DECIMAL(12,3) DEFAULT 0.00,
            preco_compra_tabela   DECIMAL(14,4) DEFAULT 0.00,
            preco_compra_simulado DECIMAL(14,4) DEFAULT 0.00,
            preco_venda_tabela    DECIMAL(14,4) DEFAULT 0.00,
            custo_total_insumo    DECIMAL(14,2) DEFAULT 0.00,
            criado_em             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (planejamento_id) REFERENCES planejamento_producao_insumos(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'planejamento_producao_linhas');

        await runSQL(\`CREATE TABLE IF NOT EXISTS planejamento_producao_movimentacoes (
            id                INT AUTO_INCREMENT PRIMARY KEY,
            linha_id          INTEGER NOT NULL,
            planejamento_id   INTEGER NOT NULL,
            tipo              TEXT NOT NULL,
            quantidade        DECIMAL(12,3) NOT NULL,
            preco_unitario    DECIMAL(14,4) NOT NULL,
            valor_total       DECIMAL(14,2),
            data_movimentacao DATE,
            obs               TEXT,
            criado_em         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (linha_id) REFERENCES planejamento_producao_linhas(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'planejamento_producao_movimentacoes');

        await runSQL(\`CREATE TABLE IF NOT EXISTS planejamento_comercial_revenda (
            id                        INT AUTO_INCREMENT PRIMARY KEY,
            mes_referencia            TEXT NOT NULL,
            produto_id                INTEGER,
            produto_nome              TEXT,
            compra_planejada_kg       DECIMAL(12,3) DEFAULT 0.00,
            venda_planejada_kg        DECIMAL(12,3) DEFAULT 0.00,
            investimento_planejado_rs DECIMAL(14,2) DEFAULT 0.00,
            faturamento_previsto_rs   DECIMAL(14,2) DEFAULT 0.00,
            compra_realizada_kg       DECIMAL(12,3) DEFAULT 0.00,
            venda_realizada_rs        DECIMAL(14,2) DEFAULT 0.00,
            venda_realizada_kg        DECIMAL(12,3) DEFAULT 0.00,
            participacao_meta_pct     DECIMAL(5,2) DEFAULT 0.00,
            preco_compra_estimado     DECIMAL(14,2) DEFAULT 0.00,
            preco_venda_estimado      DECIMAL(14,2) DEFAULT 0.00,
            preco_compra_realizado    DECIMAL(14,2) DEFAULT 0.00,
            preco_venda_realizado     DECIMAL(14,2) DEFAULT 0.00,
            prazo_compra_ate          DATE,
            prazo_venda_ate           DATE,
            status                    TEXT DEFAULT 'Em Cotação',
            observacoes               TEXT,
            criado_em                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'planejamento_comercial_revenda');

        await runSQL(\`CREATE TABLE IF NOT EXISTS planejamento_comercial_transacoes (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            planejamento_id INTEGER NOT NULL,
            tipo            VARCHAR(10) NOT NULL,
            quantidade_kg   DECIMAL(12,3) NOT NULL,
            preco_unitario  DECIMAL(14,2) NOT NULL,
            valor_total     DECIMAL(14,2) NOT NULL,
            data_transacao  DATE NOT NULL,
            observacoes     TEXT,
            criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'planejamento_comercial_transacoes');

        await runSQL(\`CREATE TABLE IF NOT EXISTS parametros_estoque_prazos (
            id                     INT AUTO_INCREMENT PRIMARY KEY,
            material_id            INTEGER UNIQUE NOT NULL,
            lead_time_compra_dias  INTEGER DEFAULT 7,
            prazo_entrega_dias     INTEGER DEFAULT 15,
            prazo_producao_dias    INTEGER DEFAULT 5,
            estoque_minimo_kg      DECIMAL(12,3) DEFAULT 0.00,
            estoque_seguranca_kg   DECIMAL(12,3) DEFAULT 0.00,
            prazo_permanencia_dias INTEGER DEFAULT 30,
            atualizado_em          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'parametros_estoque_prazos');

        await runSQL(\`CREATE TABLE IF NOT EXISTS configuracao_cenarios_planejamento (
            id                     INT AUTO_INCREMENT PRIMARY KEY,
            percentual_conservador DECIMAL(5,2) DEFAULT 80.00,
            percentual_moderado    DECIMAL(5,2) DEFAULT 100.00,
            percentual_agressivo   DECIMAL(5,2) DEFAULT 120.00,
            cenario_foco           VARCHAR(20) DEFAULT 'AGRESSIVO',
            meta_base_padrao_rs    DECIMAL(15,2) DEFAULT 1000000.00,
            atualizado_em          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'configuracao_cenarios_planejamento');

        await runSQL(\`CREATE TABLE IF NOT EXISTS planejamento_estrategico (
            id                     INT AUTO_INCREMENT PRIMARY KEY,
            mes                    VARCHAR(7) NOT NULL,
            material_id            INTEGER NOT NULL,
            qtd_conservador        DECIMAL(12,3) DEFAULT 0.00,
            qtd_moderado           DECIMAL(12,3) DEFAULT 0.00,
            qtd_agressivo          DECIMAL(12,3) DEFAULT 0.00,
            qtd_realizado          DECIMAL(12,3) DEFAULT 0.00,
            margem_alvo            DECIMAL(8,4) DEFAULT NULL,
            valor_compra_realizado DECIMAL(14,2) DEFAULT 0.00,
            valor_venda_realizado  DECIMAL(14,2) DEFAULT 0.00,
            criado_em              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_mes_material (mes, material_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'planejamento_estrategico');

        await runSQL(\`CREATE TABLE IF NOT EXISTS planejamento_estrategicov3 (
            id                    INT AUTO_INCREMENT PRIMARY KEY,
            mes                   VARCHAR(7) NOT NULL,
            material_id           INTEGER NOT NULL,
            meta_faturamento      DECIMAL(14,2) DEFAULT 0.00,
            margem_desejada       DECIMAL(5,2) DEFAULT 0.00,
            operacao              VARCHAR(15) DEFAULT 'entrega',
            qtd_realizado         DECIMAL(12,3) DEFAULT 0.00,
            valor_venda_realizado DECIMAL(14,2) DEFAULT 0.00,
            criado_em             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_mes_material_v3 (mes, material_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'planejamento_estrategicov3');

        await runSQL(\`CREATE TABLE IF NOT EXISTS estrategiav3_planos (
            id                       INT AUTO_INCREMENT PRIMARY KEY,
            titulo                   VARCHAR(150),
            data_inicial             DATE,
            data_final               DATE,
            frente                   VARCHAR(50),
            meta_faturamento         DECIMAL(14,2) DEFAULT 0.00,
            status                   VARCHAR(50) DEFAULT 'EM ANDAMENTO',
            cenario_conservador_pct  DECIMAL(5,2) DEFAULT 80.00,
            cenario_moderado_pct     DECIMAL(5,2) DEFAULT 100.00,
            cenario_agressivo_pct    DECIMAL(5,2) DEFAULT 120.00,
            faturamento_realizado    DECIMAL(14,2) DEFAULT NULL,
            investimento_realizado   DECIMAL(14,2) DEFAULT NULL,
            volume_realizado         DECIMAL(12,3) DEFAULT NULL,
            observacoes              TEXT,
            criado_em                TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'estrategiav3_planos');

        await runSQL(\`CREATE TABLE IF NOT EXISTS estrategiav3_mix (
            id                      INT AUTO_INCREMENT PRIMARY KEY,
            plano_id                INTEGER,
            material_id             INTEGER NOT NULL,
            fracao_pct              DECIMAL(5,2) DEFAULT 0.00,
            volume_necessario       DECIMAL(12,3) DEFAULT 0.00,
            faturamento_alvo        DECIMAL(14,2) DEFAULT 0.00,
            investimento_necessario DECIMAL(14,2) DEFAULT 0.00,
            faturamento_realizado   DECIMAL(14,2) DEFAULT 0.00,
            FOREIGN KEY (plano_id) REFERENCES estrategiav3_planos(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'estrategiav3_mix');

        await runSQL(\`CREATE TABLE IF NOT EXISTS pcp_planejamentos (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            ano             INTEGER NOT NULL,
            mes             VARCHAR(20) NOT NULL,
            meta_mensal     DECIMAL(14,4) NOT NULL,
            dias_trabalhados INTEGER NOT NULL,
            qtd_linhas      INTEGER NOT NULL,
            status          VARCHAR(50) DEFAULT 'RASCUNHO',
            observacoes     TEXT,
            criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            criado_por      VARCHAR(100)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'pcp_planejamentos');

        await runSQL(\`CREATE TABLE IF NOT EXISTS pcp_linhas (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            planejamento_id  INTEGER NOT NULL,
            numero_linha     INTEGER NOT NULL,
            meta_mensal      DECIMAL(14,4) NOT NULL,
            meta_diaria      DECIMAL(14,4) NOT NULL,
            percentual_carga DECIMAL(14,4) NOT NULL,
            FOREIGN KEY (planejamento_id) REFERENCES pcp_planejamentos(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'pcp_linhas');

        await runSQL(\`CREATE TABLE IF NOT EXISTS pcp_mix (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            planejamento_id  INTEGER NOT NULL,
            material_id      INTEGER NOT NULL,
            linha_id         INTEGER,
            numero_linha     INTEGER NOT NULL,
            volume_total     DECIMAL(14,4) NOT NULL,
            percentual_volume DECIMAL(14,4) NOT NULL,
            meta_dia         DECIMAL(14,4) NOT NULL,
            FOREIGN KEY (planejamento_id) REFERENCES pcp_planejamentos(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'pcp_mix');

        await runSQL(\`CREATE TABLE IF NOT EXISTS pcp_plano_diario (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            planejamento_id  INTEGER NOT NULL,
            data             DATE NOT NULL,
            is_dia_produtivo TINYINT(1) DEFAULT 1,
            meta_l1          DECIMAL(14,4) DEFAULT 0,
            meta_l2          DECIMAL(14,4) DEFAULT 0,
            meta_l3          DECIMAL(14,4) DEFAULT 0,
            meta_l4          DECIMAL(14,4) DEFAULT 0,
            meta_total_dia   DECIMAL(14,4) DEFAULT 0,
            FOREIGN KEY (planejamento_id) REFERENCES pcp_planejamentos(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'pcp_plano_diario');

        await runSQL(\`CREATE TABLE IF NOT EXISTS pcp_producao_real (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            plano_diario_id INTEGER NOT NULL UNIQUE,
            real_l1         DECIMAL(14,4) DEFAULT 0,
            real_l2         DECIMAL(14,4) DEFAULT 0,
            real_l3         DECIMAL(14,4) DEFAULT 0,
            real_l4         DECIMAL(14,4) DEFAULT 0,
            real_total      DECIMAL(14,4) DEFAULT 0,
            observacao      TEXT,
            atualizado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            atualizado_por  VARCHAR(100),
            FOREIGN KEY (plano_diario_id) REFERENCES pcp_plano_diario(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4\`, 'pcp_producao_real');

        // Semeando Produtos Necessários para o PCP
        const pcpMaterials = [
            "Sucata de fio misto sujo (ELETRONICO)",
            "Sucata de induzidos",
            "Sucata de transformadores Cobre",
            "Sucata de cooler",
            "Sucata de disjuntores",
            "Sucata de tomada e conectores",
            "Sucata de fio de instalação",
            "Sucata de fio de internet",
            "Sucata de fio misto limpo",
            "Ajuste de arredondamento"
        ];
        
        for (const matName of pcpMaterials) {
            try {
                const [rows] = await pool.query('SELECT 1 FROM materiais_catalogo WHERE nome = ? LIMIT 1', [matName]);
                if (rows.length === 0) {
                    await pool.query(
                        'INSERT INTO materiais_catalogo (nome, unidade, categoria, cor, ncm, observacoes) VALUES (?, ?, ?, ?, ?, ?)',
                        [matName, 'kg', 'PCP', '#4b7bec', '0000.00.00', 'Produto gerado para compatibilidade do módulo PCP']
                    );
                }
            } catch(e) {}
        }

        dbAvailable = true;
        console.log('✅ Banco de dados MySQL inicializado com sucesso!');
    } catch (err) {
        console.error('❌ Erro ao inicializar banco de dados MySQL:', err.message);
        dbAvailable = false;
    }
}
`;

// Lê o server.js
let code = fs.readFileSync('server.js', 'utf8');

// Remove a função initDatabase antiga (da linha 257 em diante, até o próximo bloco)
// Estratégia: encontrar o início e o fim da função e substituir
const startMarker = 'async function initDatabase() {';
const startIdx = code.indexOf(startMarker);

if (startIdx === -1) {
    console.error('Função initDatabase não encontrada!');
    process.exit(1);
}

// Encontrar o fim da função (fechar chave no nível raiz)
let depth = 0;
let endIdx = startIdx;
let inString = false;
let stringChar = '';
let i = startIdx;

while (i < code.length) {
    const c = code[i];
    
    if (inString) {
        if (c === '\\') { i += 2; continue; }
        if (c === stringChar) inString = false;
    } else {
        if (c === '"' || c === "'" || c === '`') {
            inString = true;
            stringChar = c;
        } else if (c === '{') {
            depth++;
        } else if (c === '}') {
            depth--;
            if (depth === 0) {
                endIdx = i + 1;
                break;
            }
        }
    }
    i++;
}

const oldFunc = code.substring(startIdx, endIdx);
code = code.replace(oldFunc, newInitDatabase);

// Também precisa remover o client.release() que estava depois da query no código antigo
// e remover a variável `client` que não é mais usada
code = code.replace(/let client;\s*try \{[\s\S]*?client = await pool\.connect\(\);/m, 'try {');
code = code.replace(/\s*} finally \{\s*if \(client\) client\.release\(\);\s*\}/g, '');

// Salva o arquivo
fs.writeFileSync('server.js', code);
console.log('✅ initDatabase() reescrita para MySQL com sucesso!');
