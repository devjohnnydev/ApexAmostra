const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const express   = require('express');
const dotenv    = require('dotenv');
const path      = require('path');
const axios     = require('axios');
const cheerio   = require('cheerio');
const puppeteer = require('puppeteer');
const multer    = require('multer');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const logger    = require('./config/logger');

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.warn('⚠️ AVISO CRÍTICO: JWT_SECRET não definido no .env. Gerando chave aleatória temporária. Todos os usuários serão deslogados caso o servidor reinicie.');
    JWT_SECRET = require('crypto').randomBytes(64).toString('hex');
}
// ─── Multer: armazenamento em memória (fotos de amostras) ──────────────────────
const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB por foto
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Apenas imagens são permitidas'), false);
    }
});

// Carregar variáveis de ambiente
dotenv.config();

const app  = express();
app.set('trust proxy', 1); // Necessário para o express-rate-limit funcionar atrás de um proxy (Railway)

// ─── Utilitários ─────────────────────────────────────────────────────────────
/**
 * Capitaliza cada palavra do nome (ex: "sucata de cobre" → "Sucata De Cobre").
 * Artigos/preposições curtos em português permanecem em minúsculas quando no meio.
 */
function formatarNomeCapitalizado(nome) {
    if (!nome || typeof nome !== 'string') return nome;
    const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'com', 'para', 'por']);
    return nome
        .trim()
        .toLowerCase()
        .split(' ')
        .filter(p => p.length > 0)
        .map((palavra, idx) =>
            idx === 0 || !minusculas.has(palavra)
                ? palavra.charAt(0).toUpperCase() + palavra.slice(1)
                : palavra
        )
        .join(' ');
}
const PORT = process.env.PORT || 3000;

// ─── SEGURANÇA BÁSICA (HELMET REMOVIDO TEMPORARIAMENTE) ──────────────────────
// app.use(helmet());

// ─── MySQL Pool (Hostinger) ───────────────────────────────────────────────────
let pool = null;
let dbAvailable = false;

if (process.env.DB_HOST || process.env.DATABASE_URL) {
    const mysql = require('mysql2/promise');
    pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log(`🗄️  MySQL pool criado para ${process.env.DB_HOST}/${process.env.DB_NAME}`);
}

// ─── Proteção contra Crashes & Desligamento Gracioso (Railway) ─────────
process.on('uncaughtException', (err) => {
    logger.error('💥 Erro não tratado (uncaughtException): ' + err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Promessa rejeitada não tratada (unhandledRejection): ' + reason);
});
process.on('SIGTERM', () => {
    console.log('🛑 Sinal SIGTERM recebido do Railway. Encerrando servidor graciosamente...');
    if (pool) pool.end().catch(() => {});
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('🛑 Sinal SIGINT recebido. Encerrando servidor...');
    if (pool) pool.end().catch(() => {});
    process.exit(0);
});

// ─── Armazenamento em memória (fallback sem banco) ──────────────────────────
let nextId = 1000;
const memStore = {
    solucoes: [
        { id: 1, nome: 'Sucatas de Indústrias',    img: 'assets/img/residuos-de-empresas-e-industrias.svg',  descricao: 'Nossos principais serviços incluem a gestão e comercialização de resíduos gerados por indústrias, assegurando o descarte adequado e a reciclagem responsável de materiais. Atendemos a diversos setores industriais, oferecendo soluções inovadoras e eficientes para a gestão de resíduos, com foco constante na sustentabilidade e no reaproveitamento, promovendo um ciclo ambientalmente consciente.', ordem: 1, criado_em: new Date().toISOString() },
        { id: 2, nome: 'Resíduos de Conectores',   img: 'assets/img/icon-residuos-de-conectores.svg',          descricao: 'Tratamos e reciclamos resíduos de conectores elétricos e eletrônicos, assegurando que esses materiais sejam reaproveitados de forma eficiente e sustentável. Nosso processo garante a máxima recuperação de metais, reduzindo o impacto ambienta e promovendo fortemente a economia circular em todos os nossos processos logísticos.', ordem: 2, criado_em: new Date().toISOString() },
        { id: 3, nome: 'Sucatas de Fios e Cabos',  img: 'assets/img/sucata-de-fio.svg',                         descricao: 'Especializamo-nos na compra e reciclagem de sucata de fio e cabos de todos os tipos. Transformamos resíduos em recursos reutilizáveis através de processos de separação de alta tecnologia que isolam o plástico dos metais valiosos como cobre e alumínio de maneira rápida, limpa e altamente sustentável.', ordem: 3, criado_em: new Date().toISOString() },
        { id: 4, nome: 'Resíduos e Sucatas de Obras', img: 'assets/img/residuos-e-sucatas-de-obras.svg',       descricao: 'Oferecemos serviços de gestão de resíduos em obras, proporcionando soluções completas e personalizadas para o setor da construção civil. Trabalhamos com planejamento de coleta programada para manter sua obra limpa, organizada e perfeitamente adequada às normas ambientais mais rigorosas de descarte.', ordem: 4, criado_em: new Date().toISOString() }
    ],
    materiais: [],
    noticias: [],
    settings: {
        show_sobre: 'true',
        show_solucoes: 'true',
        show_catalogo: 'true',
        show_onde_encontramos: 'true',
        show_cotacoes: 'true',
        show_noticias: 'true',
        show_galeria: 'true',
        lme_envio_ativo: 'false',
        lme_envio_horario: '14:00',
        lme_envio_dias: '1,2,3,4,5',
        lme_resend_api_key: '',
        lme_resend_from: 'josetiago@lme.lat',
        role_permissions: JSON.stringify({
            "Administrador": ["view_lme", "view_precos", "view_catalogo", "view_fornecedores", "view_laboratorio", "view_planejamento", "view_estoque", "view_bi", "edit_financeiro", "edit_producao", "view_usuarios"],
            "Laboratório": ["view_laboratorio", "view_catalogo"],
            "Compras": ["view_lme", "view_precos", "view_catalogo", "view_fornecedores", "view_estoque"],
            "Produção": ["view_estoque", "view_planejamento", "view_catalogo", "edit_producao"],
            "Financeiro": ["view_lme", "view_precos", "view_fornecedores", "view_bi", "edit_financeiro"],
            "Diretoria": ["view_lme", "view_precos", "view_catalogo", "view_fornecedores", "view_laboratorio", "view_planejamento", "view_estoque", "view_bi", "edit_financeiro", "edit_producao"]
        })
    },
    lme_destinatarios: [],
    galeria: [
        { id: 1, url: 'assets/img/photo-1595246140625-573b715d11dc.jpg', titulo: 'Triagem de Sucata Eletrônica', ordem: 1 },
        { id: 2, url: 'assets/img/photo-1605647540924-852290f6b0d5.jpg', titulo: 'Processamento de Placas de Circuito', ordem: 2 },
        { id: 3, url: 'assets/img/photo-1532187863486-abf9d39d66e8.jpg', titulo: 'Metais Nobres Separados', ordem: 3 }
    ],
    // ── NOVOS MÓDULOS ──
    fornecedores: [
        { id: 1, razao_social: "Davi Reciclagem de Metais LTDA", nome_fantasia: "davi", cnpj: "12.345.678/0001-99", contato: "Davi", telefone: "(11) 98765-4321", email: "davi@apextech.com", endereco: "Av. da Reciclagem, 1000", observacoes: "Fornecedor Parceiro LME" }
    ],
    materiais_catalogo: [
        { id: 1, nome: "Sucata de chaparia de alumínio", unidade: "kg", categoria: "Alumínio", cor: "#7eb3d5", ncm: "7602.00.00", observacoes: "" },
        { id: 2, nome: "Sucata de alumínio bloco limpo", unidade: "kg", categoria: "Alumínio", cor: "#5a92b5", ncm: "7602.00.00", observacoes: "" },
        { id: 3, nome: "Sucata de alumínio roda", unidade: "kg", categoria: "Alumínio", cor: "#3b6d8c", ncm: "7602.00.00", observacoes: "" },
        { id: 4, nome: "Sucata de radiador de alumínio e cobre", unidade: "kg", categoria: "Alumínio", cor: "#3b6d8a", ncm: "7602.00.00", observacoes: "" },
        { id: 5, nome: "Sucata de cobre 1", unidade: "kg", categoria: "Cobre", cor: "#e07b39", ncm: "7404.00.00", observacoes: "" },
        { id: 6, nome: "Sucata de cobre 2", unidade: "kg", categoria: "Cobre", cor: "#c25e20", ncm: "7404.00.00", observacoes: "" },
        { id: 7, nome: "Sucata de cobre 4", unidade: "kg", categoria: "Cobre", cor: "#a3450c", ncm: "7404.00.00", observacoes: "" },
        { id: 8, nome: "Sucata de fio de internet", unidade: "kg", categoria: "Cobre", cor: "#b0a0c0", ncm: "7404.00.00", observacoes: "" },
        { id: 9, nome: "Sucata de fio de instalação", unidade: "kg", categoria: "Cobre", cor: "#8a7ba8", ncm: "7404.00.00", observacoes: "" },
        { id: 10, nome: "Sucata de fio PP", unidade: "kg", categoria: "Cobre", cor: "#685b8c", ncm: "7404.00.00", observacoes: "" },
        { id: 11, nome: "Sucata de tomada e conectores", unidade: "kg", categoria: "Tomada/Conectores", cor: "#d4b896", ncm: "7404.00.00", observacoes: "" },
        { id: 12, nome: "Sucata de aço 201", unidade: "kg", categoria: "Aço", cor: "#a8c5a0", ncm: "7204.21.00", observacoes: "" },
        { id: 13, nome: "Sucata de aço inox", unidade: "kg", categoria: "Aço", cor: "#7ea374", ncm: "7204.21.00", observacoes: "" },
        { id: 14, nome: "Sucata de cavaco de aço inox", unidade: "kg", categoria: "Aço", cor: "#5a8050", ncm: "7204.21.00", observacoes: "" },
        { id: 15, nome: "Plástico", unidade: "kg", categoria: "Outros", cor: "#cccccc", ncm: "3915.90.00", observacoes: "Resíduos e isolamentos" }
    ],
    tabela_precos: [
        { id: 1, material_id: 1, preco_entregar: 11.30, preco_coletar: 11.00, venda_ref: 12.80, validade: "2026-12-31" },
        { id: 2, material_id: 2, preco_entregar: 11.00, preco_coletar: 10.80, venda_ref: 12.30, validade: "2026-12-31" },
        { id: 3, material_id: 3, preco_entregar: 16.00, preco_coletar: 15.50, venda_ref: 17.50, validade: "2026-12-31" },
        { id: 4, material_id: 4, preco_entregar: 33.50, preco_coletar: 33.00, venda_ref: 37.00, validade: "2026-12-31" },
        { id: 5, material_id: 5, preco_entregar: 68.00, preco_coletar: 67.50, venda_ref: 70.00, validade: "2026-12-31" },
        { id: 8, material_id: 8, preco_entregar: 19.00, preco_coletar: 18.50, venda_ref: 28.10, validade: "2026-12-31" },
        { id: 10, material_id: 10, preco_entregar: 15.00, preco_coletar: 14.50, venda_ref: 23.20, validade: "2026-12-31" },
        { id: 11, material_id: 11, preco_entregar: 4.30, preco_coletar: 4.10, venda_ref: 10.29, validade: "2026-12-31" },
        { id: 12, material_id: 12, preco_entregar: 0.80, preco_coletar: 0.70, venda_ref: 1.60, validade: "2026-12-31" },
        { id: 13, material_id: 13, preco_entregar: 4.50, preco_coletar: 4.30, venda_ref: 5.70, validade: "2026-12-31" },
        { id: 14, material_id: 14, preco_entregar: 4.00, preco_coletar: 3.80, venda_ref: 5.30, validade: "2026-12-31" }
    ],
    amostras: [
        { id: 1, numero_amostra: "AM-001", nome_material: "Fio de Instalação 1.5mm", data: "2026-07-15", fornecedor_id: 1, responsavel: "Eng. Roberto", peso_inicial: 5000, status: "Processado", observacoes: "Fio de Instalação do Fornecedor davi", foto_original: "assets/img/photo-1595246140625-573b715d11dc.jpg" },
        { id: 2, numero_amostra: "AM-002", nome_material: "Fio Misto Comercial", data: "2026-07-16", fornecedor_id: 1, responsavel: "Eng. Roberto", peso_inicial: 20000, status: "Liberado para Produção", observacoes: "Fio Misto", foto_original: "" },
        { id: 3, numero_amostra: "AM-003", nome_material: "Fio Terminais Industrial", data: "2026-07-17", fornecedor_id: 1, responsavel: "Eng. Roberto", peso_inicial: 15000, status: "Aguardando Liberação PCP", observacoes: "Fio Terminais", foto_original: "" }
    ],
    componentes_amostra: [
        { id: 1, amostra_id: 1, material_id: 5, peso: 3100, percentual: 62.0, observacoes: "Cobre 1" },
        { id: 2, amostra_id: 1, material_id: 15, peso: 1900, percentual: 38.0, observacoes: "Isolamento plástico/perda" },
        { id: 3, amostra_id: 2, material_id: 6, peso: 8200, percentual: 41.0, observacoes: "Cobre 2" },
        { id: 4, amostra_id: 2, material_id: 15, peso: 11800, percentual: 59.0, observacoes: "Resíduos e plásticos" },
        { id: 5, amostra_id: 3, material_id: 6, peso: 4650, percentual: 31.0, observacoes: "Cobre 2" },
        { id: 6, amostra_id: 3, material_id: 15, peso: 10350, percentual: 69.0, observacoes: "Resíduos e plásticos" }
    ],
    lotes_compra: [
        { id: 1, amostra_id: 1, fornecedor_id: 1, produto: "fio de instalação", peso_comprado: 5000, preco_compra: 40.50, percentual_rendimento: 62.0, material_id: 5, preco_venda_material: 71.00, comissao: 2.0, fidc: 2.3, mes: "2026-07" },
        { id: 2, amostra_id: 2, fornecedor_id: 1, produto: "fio misto", peso_comprado: 20000, preco_compra: 18.00, percentual_rendimento: 41.0, material_id: 6, preco_venda_material: 65.50, comissao: 2.0, fidc: 2.3, mes: "2026-07" },
        { id: 3, amostra_id: 3, fornecedor_id: 1, produto: "fio terminais", peso_comprado: 15000, preco_compra: 14.00, percentual_rendimento: 31.0, material_id: 6, preco_venda_material: 65.00, comissao: 2.0, fidc: 2.3, mes: "2026-07" }
    ],
    estoque: [
        { material_id: 5, saldo: 3100 },
        { material_id: 6, saldo: 8200 },
        { material_id: 15, saldo: 13700 }
    ],
    movimentacoes_estoque: [
        { id: 1, material_id: 5, tipo: "ENTRADA", quantidade: 3100, motivo: "Processamento da amostra AM-001", data: "2026-07-15" },
        { id: 2, material_id: 15, tipo: "ENTRADA", quantidade: 1900, motivo: "Processamento da amostra AM-001", data: "2026-07-15" },
        { id: 3, material_id: 6, tipo: "ENTRADA", quantidade: 8200, motivo: "Processamento da amostra AM-002", data: "2026-07-16" },
        { id: 4, material_id: 15, tipo: "ENTRADA", quantidade: 11800, motivo: "Processamento da amostra AM-002", data: "2026-07-16" }
    ],
    planejamento_compras: [
        { id: 1, material_id: 5, fornecedor_id: 1, quantidade_necessaria: 10000, ponto_pedido_kg: 5000, lead_time_dias: 7, preco_estimado: 68.00, custo_total_estimado: 680000.00, mes_referencia: "2026-08", status: "Em Cotação", observacoes: "Reposição para alta demanda Cobre 1", criado_em: new Date().toISOString() },
        { id: 2, material_id: 1, fornecedor_id: 1, quantidade_necessaria: 15000, ponto_pedido_kg: 8000, lead_time_dias: 5, preco_estimado: 11.30, custo_total_estimado: 169500.00, mes_referencia: "2026-08", status: "Sugerido", observacoes: "Lote mínimo fornecedor davi", criado_em: new Date().toISOString() }
    ],
    equipamentos_industriais: [
        { id: 1, nome_equipamento: "Triturador Industrial Primário Apex-T1", codigo_tag: "TRIT-01", setor: "Trituração", capacidade_nominal_kgh: 1500, disponibilidade_horas_dia: 16, tempo_setup_horas: 1.5, eficiencia_oee_pct: 88, status: "Operacional", observacoes: "Manutenção preventiva em dia" },
        { id: 2, nome_equipamento: "Esteira de Triagem & Separação Manual", codigo_tag: "EST-01", setor: "Triagem", capacidade_nominal_kgh: 2500, disponibilidade_horas_dia: 16, tempo_setup_horas: 0.5, eficiencia_oee_pct: 92, status: "Operacional", observacoes: "4 operadores por turno" },
        { id: 3, nome_equipamento: "Separador Magnético Overband 500", codigo_tag: "SEP-01", setor: "Separação", capacidade_nominal_kgh: 2000, disponibilidade_horas_dia: 16, tempo_setup_horas: 0.5, eficiencia_oee_pct: 90, status: "Operacional", observacoes: "Alta eficiência remoção ferro" },
        { id: 4, nome_equipamento: "Prensa Hidráulica 100T Metais", codigo_tag: "PRE-01", setor: "Prensagem", capacidade_nominal_kgh: 1200, disponibilidade_horas_dia: 14, tempo_setup_horas: 1.0, eficiencia_oee_pct: 85, status: "Operacional", observacoes: "Fardos padrão exportação" }
    ],
    ordens_producao: [
        {
            id: 1,
            numero_op: "OP-2026-001",
            amostra_id: 1,
            lote_id: 1,
            material_entrada: "Fio de Instalação 1.5mm",
            peso_entrada_kg: 5000,
            material_saida_id: 5,
            peso_saida_estimado_kg: 3100,
            data_inicio_prevista: "2026-08-12",
            data_fim_prevista: "2026-08-14",
            responsavel_pcp: "Eng. Roberto",
            status: "Em Execução",
            observacoes: "Prioridade para entrega ao cliente FIDC",
            criado_em: new Date().toISOString(),
            etapas: [
                { id: 1, op_id: 1, nome_etapa: "Recepção & Pesagem", ordem: 1, equipamento_id: 2, tempo_estimado_horas: 2.0, tempo_real_horas: 1.8, status_etapa: "Concluída", operador_responsavel: "Carlos", observacoes: "Sem anomalias" },
                { id: 2, op_id: 1, nome_etapa: "Trituração & Separação Plástico", ordem: 2, equipamento_id: 1, tempo_estimado_horas: 4.5, tempo_real_horas: 5.0, status_etapa: "Em Andamento", operador_responsavel: "João", observacoes: "Ajuste na lâmina do triturador" },
                { id: 3, op_id: 1, nome_etapa: "Separação Magnética & Prensagem", ordem: 3, equipamento_id: 4, tempo_estimado_horas: 3.0, tempo_real_horas: 0.0, status_etapa: "Pendente", operador_responsavel: "Marcos", observacoes: "" },
                { id: 4, op_id: 1, nome_etapa: "Inspeção de Qualidade & Embalagem", ordem: 4, equipamento_id: null, tempo_estimado_horas: 1.5, tempo_real_horas: 0.0, status_etapa: "Pendente", operador_responsavel: "Eng. Roberto", observacoes: "" }
            ]
        }
    ],
    fotos_amostra: [],   // { id, amostra_id, tipo: 'bruta'|'separada'|'componente', data_b64, mimetype, nome, criado_em }
    usuarios: [
        { id: 1, user: "admin", pass: "?b?$OtCdpJ40BrNkHE2npxGDnOMxYHYl9HRGP6mw/le4NlJCnbtF6iyUS", perfil: "Administrador", nome: "Admin Apex" },
        { id: 2, user: "lab", pass: "?b?$IQb7v6yEEwWAkAqio4ZYOulYFteWjTUect2aDd49Vay7DtxiBQJXm", perfil: "Laboratório", nome: "Dr. Marcos (Lab)" },
        { id: 3, user: "compras", pass: "?b?$mpmo8hj4iXEN/BoZQN2Xr.3kjaps0Ip5yij09/styuWodKyW.cae.", perfil: "Compras", nome: "Ana (Compras)" },
        { id: 4, user: "producao", pass: "?b??BWuIfla8e52NApbFR8yGu9Kq0KYz04aHxLen0Lx9r9dH2OV5iZFe", perfil: "Produção", nome: "Carlos (PCP/Produção)" },
        { id: 5, user: "financeiro", pass: "?b??dxfQXRxOqoHQdeYQsj3Ue7v5CCZdhZOddhihwY4cAeGnRXBckjVK", perfil: "Financeiro", nome: "Mariana (Fin)" },
        { id: 6, user: "diretoria", pass: "?b?$S1be8oS/GPW/h1aM38o0Su0PFjxr8xl0O5QtNRBQ/knqLE6.JeA16", perfil: "Diretoria", nome: "Dr. Tiago (Diretor)" }
    ],
    clientes: [],
    pedidos_venda: [],
    pedidos_venda_itens: [],
    audit_logs: [],
    tabela_precos_residuos: [],
    tabela_precos_ligas: [],
    tabela_precos_volume: [],
    tabela_precos_fundicao: []
};

// Inicializa tabelas na primeira execução (apenas se DB disponível)

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
                console.warn(`⚠️ [${label}]: ${e.message}`);
            }
        }
    }

    try {
        console.log('🗄️  Inicializando banco de dados MySQL...');

        await runSQL(`CREATE TABLE IF NOT EXISTS solucoes (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            nome      TEXT    NOT NULL,
            img       TEXT    NOT NULL,
            descricao TEXT    NOT NULL,
            ordem     INTEGER DEFAULT 0,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'solucoes');

        await runSQL(`CREATE TABLE IF NOT EXISTS materiais (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            nome      TEXT    NOT NULL,
            imagem    TEXT,
            descricao TEXT    NOT NULL,
            locais    JSON,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'materiais');

        await runSQL(`CREATE TABLE IF NOT EXISTS noticias (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            titulo    TEXT    NOT NULL,
            url       TEXT,
            resumo    TEXT,
            data_pub  DATE,
            categoria TEXT,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'noticias');

        await runSQL(`CREATE TABLE IF NOT EXISTS settings (
            \`key\`   VARCHAR(255) PRIMARY KEY,
            value TEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'settings');

        await runSQL(`CREATE TABLE IF NOT EXISTS galeria (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            url       TEXT NOT NULL,
            titulo    TEXT NOT NULL,
            ordem     INTEGER DEFAULT 0,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'galeria');

        await runSQL(`CREATE TABLE IF NOT EXISTS lme_destinatarios (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            nome      TEXT NOT NULL,
            email     TEXT NOT NULL,
            tipo      TEXT DEFAULT 'lme',
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'lme_destinatarios');

        await runSQL(`CREATE TABLE IF NOT EXISTS pedidos_venda (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'pedidos_venda');

        await runSQL(`CREATE TABLE IF NOT EXISTS pedidos_venda_itens (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'pedidos_venda_itens');

        await runSQL(`CREATE TABLE IF NOT EXISTS fornecedores (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'fornecedores');

        await runSQL(`CREATE TABLE IF NOT EXISTS clientes (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'clientes');

        await runSQL(`CREATE TABLE IF NOT EXISTS materiais_catalogo (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            nome        TEXT NOT NULL,
            unidade     TEXT DEFAULT 'kg',
            categoria   TEXT NOT NULL,
            cor         TEXT,
            ncm         TEXT,
            observacoes TEXT,
            criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'materiais_catalogo');

        await runSQL(`CREATE TABLE IF NOT EXISTS residuos_catalogo (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            nome        TEXT NOT NULL,
            unidade     TEXT DEFAULT 'kg',
            categoria   TEXT NOT NULL,
            cor         TEXT,
            ncm         TEXT,
            observacoes TEXT,
            criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'residuos_catalogo');

        await runSQL(`CREATE TABLE IF NOT EXISTS ligas_catalogo (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            nome        TEXT NOT NULL,
            unidade     TEXT DEFAULT 'kg',
            categoria   TEXT NOT NULL,
            cor         TEXT,
            ncm         TEXT,
            observacoes TEXT,
            criado_em   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'ligas_catalogo');

        await runSQL(`CREATE TABLE IF NOT EXISTS tabela_precos (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'tabela_precos');

        await runSQL(`CREATE TABLE IF NOT EXISTS tabela_precos_residuos (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'tabela_precos_residuos');

        await runSQL(`CREATE TABLE IF NOT EXISTS tabela_precos_ligas (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'tabela_precos_ligas');

        await runSQL(`CREATE TABLE IF NOT EXISTS tabela_precos_volume (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'tabela_precos_volume');

        await runSQL(`CREATE TABLE IF NOT EXISTS tabela_precos_fundicao (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'tabela_precos_fundicao');

        await runSQL(`CREATE TABLE IF NOT EXISTS amostras (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'amostras');

        await runSQL(`CREATE TABLE IF NOT EXISTS componentes_amostra (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            amostra_id  INTEGER NOT NULL,
            material_id INTEGER NOT NULL,
            peso        DECIMAL(12,3) NOT NULL,
            percentual  DECIMAL(5,2) NOT NULL,
            observacoes TEXT,
            foto        TEXT,
            dificuldade TEXT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'componentes_amostra');

        await runSQL(`CREATE TABLE IF NOT EXISTS lotes_compra (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'lotes_compra');

        await runSQL(`CREATE TABLE IF NOT EXISTS estoque (
            material_id INTEGER PRIMARY KEY,
            saldo       DECIMAL(12,3) DEFAULT 0.000
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'estoque');

        await runSQL(`CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            material_id INTEGER NOT NULL,
            tipo        TEXT NOT NULL,
            quantidade  DECIMAL(12,3) NOT NULL,
            motivo      TEXT,
            data        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'movimentacoes_estoque');

        await runSQL(`CREATE TABLE IF NOT EXISTS usuarios (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            \`user\`    TEXT NOT NULL,
            pass      TEXT NOT NULL,
            perfil    TEXT NOT NULL,
            nome      TEXT NOT NULL,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'usuarios');

        await runSQL(`CREATE TABLE IF NOT EXISTS fotos_amostra (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            amostra_id     INTEGER NOT NULL,
            tipo           TEXT DEFAULT 'bruta',
            etapa          TEXT DEFAULT 'Recebimento',
            componente_idx INTEGER DEFAULT NULL,
            data_b64       LONGTEXT NOT NULL,
            mimetype       TEXT DEFAULT 'image/jpeg',
            nome           TEXT,
            criado_em      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'fotos_amostra');

        await runSQL(`CREATE TABLE IF NOT EXISTS audit_logs (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            usuario    TEXT DEFAULT 'Sistema',
            acao       TEXT NOT NULL,
            detalhe    TEXT,
            amostra_id INTEGER,
            ip         TEXT,
            criado_em  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'audit_logs');

        await runSQL(`CREATE TABLE IF NOT EXISTS planejamento_compras (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'planejamento_compras');

        await runSQL(`CREATE TABLE IF NOT EXISTS equipamentos_industriais (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'equipamentos_industriais');

        await runSQL(`CREATE TABLE IF NOT EXISTS ordens_producao (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'ordens_producao');

        await runSQL(`CREATE TABLE IF NOT EXISTS ordens_producao_etapas (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'ordens_producao_etapas');

        await runSQL(`CREATE TABLE IF NOT EXISTS planejamento_producao_insumos (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'planejamento_producao_insumos');

        await runSQL(`CREATE TABLE IF NOT EXISTS planejamento_producao_linhas (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'planejamento_producao_linhas');

        await runSQL(`CREATE TABLE IF NOT EXISTS planejamento_producao_movimentacoes (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'planejamento_producao_movimentacoes');

        await runSQL(`CREATE TABLE IF NOT EXISTS planejamento_comercial_revenda (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'planejamento_comercial_revenda');

        await runSQL(`CREATE TABLE IF NOT EXISTS planejamento_comercial_transacoes (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            planejamento_id INTEGER NOT NULL,
            tipo            VARCHAR(10) NOT NULL,
            quantidade_kg   DECIMAL(12,3) NOT NULL,
            preco_unitario  DECIMAL(14,2) NOT NULL,
            valor_total     DECIMAL(14,2) NOT NULL,
            data_transacao  DATE NOT NULL,
            observacoes     TEXT,
            criado_em       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'planejamento_comercial_transacoes');

        await runSQL(`CREATE TABLE IF NOT EXISTS parametros_estoque_prazos (
            id                     INT AUTO_INCREMENT PRIMARY KEY,
            material_id            INTEGER UNIQUE NOT NULL,
            lead_time_compra_dias  INTEGER DEFAULT 7,
            prazo_entrega_dias     INTEGER DEFAULT 15,
            prazo_producao_dias    INTEGER DEFAULT 5,
            estoque_minimo_kg      DECIMAL(12,3) DEFAULT 0.00,
            estoque_seguranca_kg   DECIMAL(12,3) DEFAULT 0.00,
            prazo_permanencia_dias INTEGER DEFAULT 30,
            atualizado_em          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'parametros_estoque_prazos');

        await runSQL(`CREATE TABLE IF NOT EXISTS configuracao_cenarios_planejamento (
            id                     INT AUTO_INCREMENT PRIMARY KEY,
            percentual_conservador DECIMAL(5,2) DEFAULT 80.00,
            percentual_moderado    DECIMAL(5,2) DEFAULT 100.00,
            percentual_agressivo   DECIMAL(5,2) DEFAULT 120.00,
            cenario_foco           VARCHAR(20) DEFAULT 'AGRESSIVO',
            meta_base_padrao_rs    DECIMAL(15,2) DEFAULT 1000000.00,
            atualizado_em          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'configuracao_cenarios_planejamento');

        await runSQL(`CREATE TABLE IF NOT EXISTS planejamento_estrategico (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'planejamento_estrategico');

        await runSQL(`CREATE TABLE IF NOT EXISTS planejamento_estrategicov3 (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'planejamento_estrategicov3');

        await runSQL(`CREATE TABLE IF NOT EXISTS estrategiav3_planos (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'estrategiav3_planos');

        await runSQL(`CREATE TABLE IF NOT EXISTS estrategiav3_mix (
            id                      INT AUTO_INCREMENT PRIMARY KEY,
            plano_id                INTEGER,
            material_id             INTEGER NOT NULL,
            fracao_pct              DECIMAL(5,2) DEFAULT 0.00,
            volume_necessario       DECIMAL(12,3) DEFAULT 0.00,
            faturamento_alvo        DECIMAL(14,2) DEFAULT 0.00,
            investimento_necessario DECIMAL(14,2) DEFAULT 0.00,
            faturamento_realizado   DECIMAL(14,2) DEFAULT 0.00,
            FOREIGN KEY (plano_id) REFERENCES estrategiav3_planos(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'estrategiav3_mix');

        await runSQL(`CREATE TABLE IF NOT EXISTS pcp_planejamentos (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'pcp_planejamentos');

        await runSQL(`CREATE TABLE IF NOT EXISTS pcp_linhas (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            planejamento_id  INTEGER NOT NULL,
            numero_linha     INTEGER NOT NULL,
            meta_mensal      DECIMAL(14,4) NOT NULL,
            meta_diaria      DECIMAL(14,4) NOT NULL,
            percentual_carga DECIMAL(14,4) NOT NULL,
            FOREIGN KEY (planejamento_id) REFERENCES pcp_planejamentos(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'pcp_linhas');

        await runSQL(`CREATE TABLE IF NOT EXISTS pcp_mix (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            planejamento_id  INTEGER NOT NULL,
            material_id      INTEGER NOT NULL,
            linha_id         INTEGER,
            numero_linha     INTEGER NOT NULL,
            volume_total     DECIMAL(14,4) NOT NULL,
            percentual_volume DECIMAL(14,4) NOT NULL,
            meta_dia         DECIMAL(14,4) NOT NULL,
            FOREIGN KEY (planejamento_id) REFERENCES pcp_planejamentos(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'pcp_mix');

        await runSQL(`CREATE TABLE IF NOT EXISTS pcp_plano_diario (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'pcp_plano_diario');

        await runSQL(`CREATE TABLE IF NOT EXISTS pcp_producao_real (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'pcp_producao_real');

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

        // Criar usuário admin padrão se a tabela estiver vazia
        try {
            const [rows] = await pool.query('SELECT COUNT(*) as total FROM usuarios');
            if (rows[0].total === 0) {
                const bcrypt = require('bcryptjs');
                const salt = await bcrypt.genSalt(10);
                const hashed = await bcrypt.hash('apex2026', salt);
                await pool.query(
                    'INSERT INTO usuarios (`user`, pass, perfil, nome) VALUES (?, ?, ?, ?)',
                    ['admin', hashed, 'Administrador', 'Admin Apex']
                );
                console.log('👤 Usuário admin criado automaticamente (senha: apex2026)');
            }
        } catch(e) {
            console.warn('⚠️ Não foi possível criar admin padrão:', e.message);
        }

                // Run safe migrations for missing columns that cause 500 errors
        try { await pool.query('ALTER TABLE pedidos_venda ADD COLUMN cliente_nome TEXT'); } catch(e) {}
        try { await pool.query('ALTER TABLE pedidos_venda ADD COLUMN total_geral DECIMAL(15,2)'); } catch(e) {}
        try { await pool.query('ALTER TABLE clientes ADD COLUMN cnpj TEXT'); } catch(e) {}
        try { await pool.query('ALTER TABLE clientes ADD COLUMN cidade TEXT'); } catch(e) {}
        try { await pool.query('ALTER TABLE clientes ADD COLUMN uf TEXT'); } catch(e) {}

        dbAvailable = true;
        console.log('✅ Banco de dados MySQL inicializado com sucesso!');
    } catch (err) {
        console.error('❌ Erro ao inicializar banco de dados MySQL:', err.message);
        dbAvailable = false;
    }
}


// ─── Middlewares ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Segurança: bloqueia acesso a arquivos sensíveis
app.use((req, res, next) => {
    const blockedFiles = [
        '/.env', '/.env.example', '/package.json', '/package-lock.json',
        '/server.js', '/.gitignore', '/readme.md',
        '/implementation_plan.md', '/task.md', '/walkthrough.md'
    ];
    const requestedPath = req.path.toLowerCase();
    if (blockedFiles.includes(requestedPath) || requestedPath.startsWith('/.git')) {
        return res.status(403).send('Forbidden: Access is denied.');
    }
    next();
});

// Endpoint temporário de DEBUG
app.get('/api/debug-logs', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    try {
        const logContent = fs.readFileSync(path.join(__dirname, 'logs', 'error.log'), 'utf8');
        res.send(logContent);
    } catch(e) {
        res.send('No logs: ' + e.message);
    }
});

app.get('/api/db-test', async (req, res) => {
    try {
        if (!pool) return res.send('No pool');
        const result = await pool.query('SELECT * FROM estrategiav3_mix');
        res.json(result[0]);
    } catch(e) {
        res.send('SQL Error: ' + e.message);
    }
});

// ─── Arquivos Estáticos ───────────────────────────────────────────────────────
// Desabilita cache agressivo de arquivos estáticos para que atualizações apareçam instantaneamente
app.use(express.static(__dirname, {
    etag: false,
    maxAge: 0,
    setHeaders: (res, path) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
}));

// ─── MIDDLEWARES DE SEGURANÇA (RBAC) ─────────────────────────────────────────
const authMiddleware = (req, res, next) => {
    const publicRoutes = ['/login', '/solucoes', '/cotacoes-hoje'];
    if (publicRoutes.includes(req.path) || req.path.startsWith('/public')) return next();
    // Rota de imagem de fotos é pública: a tag <img> do HTML não pode enviar JWT
    if (/^\/api\/amostras\/\d+\/fotos\/\d+\/img$/.test(req.path)) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido. Acesso Negado.' });
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
};

const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
        
        const userRole = (req.user.perfil || '').trim().toLowerCase();
        
        // Permissive admin check
        const isAdmin = userRole.includes('admin') || userRole.includes('master') || userRole.includes('diretor') || userRole === 'undefined' || userRole === 'null' || userRole === '';
        if (isAdmin) return next();

        const rolesLower = allowedRoles.map(r => r.toLowerCase().trim());
        if (rolesLower.includes(userRole)) return next();
        
        return res.status(403).json({ error: 'Acesso negado para o seu perfil: ' + req.user.perfil });
    };
};

// Aplica autenticação em todas as rotas da API
app.use('/api', authMiddleware);

// Middleware Global de Auditoria
const globalAuditMiddleware = async (req, res, next) => {
    // Escuta o término da requisição para registrar apenas se foi sucesso (opcional) ou registra na entrada
    // Vamos registrar na entrada para capturar tentativas, mas ignorar métodos GET e OPTIONS
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        const usuario = req.user ? req.user.user : (req.body.user ? req.body.user : 'Anônimo');
        let acao = req.method;
        let detalhe = `Endpoint: ${req.path}`;
        
        let safeBody = { ...req.body };
        if (safeBody.pass) safeBody.pass = '***'; // Omitir senhas
        
        if (req.path === '/login') {
            acao = 'LOGIN';
            detalhe = 'Tentativa de Login';
        } else if (req.path.includes('/usuarios')) {
            acao = 'USUÁRIOS';
        } else if (req.path.includes('/amostras')) {
            acao = 'AMOSTRAS';
        } else if (req.path.includes('/tabela-precos')) {
            acao = 'PREÇOS';
        } else if (req.path.includes('/pedidos-venda')) {
            acao = 'PEDIDOS';
        } else if (req.path.includes('/fornecedores') || req.path.includes('/clientes')) {
            acao = 'CADASTROS';
        }

        const payloadStr = JSON.stringify(safeBody) || '';
        if (payloadStr !== '{}') {
            detalhe += ` | Dados: ${payloadStr.substring(0, 200)}`;
        }
        
        // Chamada não bloqueante
        registrarAuditLog(usuario, acao, detalhe, null, req).catch(console.error);
    }
    next();
};

app.use('/api', globalAuditMiddleware);

// Regras de Autorização por Agrupamento de Rotas (RBAC)
app.use('/api/usuarios', requireRole(['Diretoria']));
app.use('/api/tabela-precos', requireRole(['Diretoria', 'Compras', 'Comercial']));
app.use('/api/tabela-precos-validade-geral', requireRole(['Diretoria', 'Compras', 'Comercial']));
app.use('/api/tabela-precos-residuos', requireRole(['Diretoria', 'Compras', 'Comercial']));
app.use('/api/tabela-precos-residuos-validade', requireRole(['Diretoria', 'Compras', 'Comercial']));
app.use('/api/tabela-precos-ligas', requireRole(['Diretoria', 'Compras', 'Comercial']));
app.use('/api/tabela-precos-ligas-validade', requireRole(['Diretoria', 'Compras', 'Comercial']));
app.use('/api/tabela-precos-volume', requireRole(['Diretoria', 'Compras', 'Comercial']));
app.use('/api/tabela-precos-volume-validade', requireRole(['Diretoria', 'Compras', 'Comercial']));
app.use('/api/tabela-precos-fundicao', requireRole(['Diretoria', 'Compras', 'Comercial']));
app.use('/api/tabela-precos-fundicao-validade', requireRole(['Diretoria', 'Compras', 'Comercial']));
app.use('/api/amostras', requireRole(['Diretoria', 'Laboratório', 'Produção']));
app.use('/api/planejamento', requireRole(['Diretoria', 'Compras', 'Produção', 'Comercial']));
app.use('/api/planejamento-compras', requireRole(['Diretoria', 'Compras']));
app.use('/api/planejamento-estrategico', requireRole(['Diretoria']));
app.use('/api/planejamento-estrategicov3', requireRole(['Diretoria']));
app.get('/api/estrategiav3_planos', requireRole(['Diretoria', 'Compras', 'Financeiro', 'Produção', 'Comercial']));
app.post('/api/estrategiav3_planos', requireRole(['Diretoria']));
app.put('/api/estrategiav3_planos/:id/status', requireRole(['Diretoria']));
app.put('/api/estrategiav3_planos/:id/resultado_real', requireRole(['Diretoria']));
app.delete('/api/estrategiav3_planos/:id', requireRole(['Diretoria']));

app.get('/api/estrategiav3_mix', requireRole(['Diretoria', 'Compras', 'Financeiro', 'Produção', 'Comercial']));
app.post('/api/estrategiav3_mix', requireRole(['Diretoria']));
app.put('/api/estrategiav3_mix/:id/realizado', requireRole(['Diretoria']));
app.delete('/api/estrategiav3_mix/:id', requireRole(['Diretoria']));
app.use('/api/lme', requireRole(['Diretoria', 'Compras']));
app.use('/api/cotacoes', requireRole(['Diretoria', 'Compras']));
app.use('/api/fornecedores', requireRole(['Diretoria', 'Compras', 'Laboratório', 'Produção']));
app.use('/api/clientes', requireRole(['Diretoria', 'Comercial']));
app.use('/api/materiais', requireRole(['Diretoria', 'Laboratório', 'Compras', 'Produção']));
app.use('/api/materiais-catalogo', requireRole(['Diretoria', 'Laboratório', 'Compras', 'Produção']));
app.use('/api/residuos-catalogo', requireRole(['Diretoria', 'Laboratório', 'Compras', 'Produção']));
app.use('/api/ligas-catalogo', requireRole(['Diretoria', 'Laboratório', 'Compras', 'Produção']));
app.use('/api/pedidos-venda', requireRole(['Diretoria', 'Comercial', 'Financeiro']));
app.use('/api/estoque', requireRole(['Diretoria', 'Produção', 'Laboratório', 'Compras', 'Comercial']));
app.use('/api/audit-logs', requireRole(['Diretoria']));

// ─── API: Login ───────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 50, // Limite de 50 tentativas de login por IP
    message: { success: false, error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const { user, pass } = req.body;
        let foundUser = null;
        
        // Buscar usuário (somente o registro, sem comparar senha na query SQL)
        if (dbAvailable) {
            const result = await pool.query('SELECT * FROM usuarios WHERE `user` = ?', [user]);
            if (result[0].length > 0) {
                foundUser = result[0][0];
            }
        } else {
            const u = memStore.usuarios.find(x => x.user === user);
            if (u) foundUser = u;
        }

        // Validação da senha com bcrypt
        if (foundUser) {
            const passwordMatches = await bcrypt.compare(pass, foundUser.pass);
            
            if (passwordMatches) {
                const perfilFinal = foundUser.perfil;
                // Assina o Token JWT
                const token = jwt.sign({ user: foundUser.user, perfil: perfilFinal, nome: foundUser.nome }, JWT_SECRET, { expiresIn: '12h' });
                return res.json({ success: true, token, user: { user: foundUser.user, perfil: perfilFinal, nome: foundUser.nome } });
            }
        }
        
        res.status(401).json({ success: false, error: 'Usuário ou senha inválidos.' });
    } catch (error) {
        console.error('Erro na autenticação:', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
});

// ─── API: Usuários (CRUD) ──────────────────────────────────────────────────────
app.get('/api/usuarios', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query('SELECT id, `user`, perfil, nome FROM usuarios ORDER BY id ASC');
            return res.json(result[0]);
        }
        res.json(memStore.usuarios.map(({ id, user, perfil, nome }) => ({ id, user, perfil, nome })));
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar usuários.' });
    }
});

app.post('/api/usuarios', async (req, res) => {
    try {
        const { user, pass, perfil, nome } = req.body;
        if (!user || !pass || !perfil || !nome) return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
        
        // Gerar o hash da senha
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(pass, salt);

        if (dbAvailable) {
            const result = await pool.query(
                'INSERT INTO usuarios (`user`, pass, perfil, nome) VALUES (?, ?, ?, ?)',
                [user, hashedPassword, perfil, nome]
            );
            return res.json({ id: result[0].insertId, user, perfil, nome });
        } else {
            const newU = { id: nextId++, user, pass: hashedPassword, perfil, nome };
            memStore.usuarios.push(newU);
            return res.json({ id: newU.id, user, perfil, nome });
        }
    } catch (err) {
        res.status(500).json({ error: 'Erro ao criar usuário: ' + err.message });
    }
});

app.delete('/api/usuarios/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (dbAvailable) {
            await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
        } else {
            memStore.usuarios = memStore.usuarios.filter(x => x.id !== id);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao excluir usuário.' });
    }
});

// ─── API: Fornecedores (CRUD com Paginação Server-side) ────────────────────────
app.get('/api/fornecedores', async (req, res) => {
    try {
        const page = parseInt(req.query.page);
        const limit = parseInt(req.query.limit) || 50;
        const search = (req.query.search || '').trim().toLowerCase();

        if (dbAvailable) {
            let whereClause = '';
            let params = [];
            if (search) {
                whereClause = `WHERE LOWER(nome) LIKE ? OR LOWER(COALESCE(apelido,'')) LIKE ? OR LOWER(COALESCE(cnpj,'')) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ?`;
                params.push(`%${search}%`);
            }

            const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM fornecedores ${whereClause}`, params);
            const total = parseInt(countResult[0].total);

            let dataQuery = `
                SELECT id, codfor, nome, apelido, fone1, fone2, whatsapp, celular,
                       tabela, concorrente, status_ok, dias, ultima_entrega,
                       tipo_pessoa, data_cadastro, endereco, numero, complemento,
                       bairro, cidade, uf, cep, cnpj, ie, im, rg, emissor, cpf,
                       comprador, email, condicao_pagamento, usuario_cadastro,
                       ultimo_alterou, dias_atraso, dias_previsao, filial,
                       criado_em, atualizado_em
                FROM fornecedores ${whereClause} ORDER BY nome ASC
            `;

            if (page) {
                const offset = (page - 1) * limit;
                dataQuery += ` LIMIT ? OFFSET ?`;
                params.push(limit, offset);
            }

            const result = await pool.query(dataQuery, params);
            if (page) {
                return res.json({
                    data: result[0],
                    total,
                    page,
                    totalPages: Math.ceil(total / limit)
                });
            }
            return res.json(result[0]);
        } else {
            let list = memStore.fornecedores || [];
            if (search) {
                list = list.filter(f => 
                    (f.nome || '').toLowerCase().includes(search) ||
                    (f.apelido || '').toLowerCase().includes(search) ||
                    (f.cnpj || '').toLowerCase().includes(search) ||
                    (f.email || '').toLowerCase().includes(search)
                );
            }
            const total = list.length;
            if (page) {
                const start = (page - 1) * limit;
                return res.json({
                    data: list.slice(start, start + limit),
                    total,
                    page,
                    totalPages: Math.ceil(total / limit)
                });
            }
            res.json(list);
        }
    } catch (err) {
        console.error('Erro ao buscar fornecedores:', err);
        res.status(500).json({ error: 'Erro ao buscar fornecedores.' });
    }
});

app.post('/api/fornecedores', async (req, res) => {
    try {
        const { razao_social, nome_fantasia, cnpj, cpf, ie, contato,
                telefone, fone2, whatsapp, celular, email,
                endereco, numero, bairro, cidade, uf, cep,
                observacoes, condicao_pagamento, tabela, filial } = req.body;
        if (dbAvailable) {
            const result = await pool.query(
                `INSERT INTO fornecedores (nome, apelido, cnpj, cpf, ie, comprador, fone1, fone2,
                  whatsapp, celular, email, endereco, numero, bairro, cidade, uf, cep,
                  complemento, condicao_pagamento, tabela, filial)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [razao_social, nome_fantasia, cnpj, cpf, ie, contato,
                 telefone, fone2, whatsapp, celular, email,
                 endereco, numero, bairro, cidade, uf, cep,
                 observacoes, condicao_pagamento, tabela, filial]
            );
            return res.json(result[0][0]);
        }
        const newF = { 
            id: Date.now(), nome: razao_social, apelido: nome_fantasia, cnpj, cpf, ie, 
            comprador: contato, fone1: telefone, fone2, whatsapp, celular, email, 
            endereco, numero, bairro, cidade, uf, cep, 
            complemento: observacoes, condicao_pagamento, tabela, filial 
        };
        memStore.fornecedores.push(newF);
        return res.json(newF);
    } catch (err) {
        console.error('Erro ao criar fornecedor:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/fornecedores/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { razao_social, nome_fantasia, cnpj, cpf, ie, contato,
                telefone, fone2, whatsapp, celular, email,
                endereco, numero, bairro, cidade, uf, cep,
                observacoes, condicao_pagamento, tabela, filial } = req.body;
        if (dbAvailable) {
            const result = await pool.query(
                `UPDATE fornecedores SET
                    nome=?, apelido=?, cnpj=?, cpf=?, ie=?, comprador=?,
                    fone1=?, fone2=?, whatsapp=?, celular=?, email=?,
                    endereco=?, numero=?, bairro=?, cidade=?, uf=?,
                    cep=?, complemento=?, condicao_pagamento=?, tabela=?,
                    filial=?, atualizado_em=NOW()
                WHERE id=?`,
                [razao_social, nome_fantasia, cnpj, cpf, ie, contato,
                 telefone, fone2, whatsapp, celular, email,
                 endereco, numero, bairro, cidade, uf, cep,
                 observacoes, condicao_pagamento, tabela, filial, id]
            );
            if (result[0].length === 0) return res.status(404).json({ error: 'Fornecedor não encontrado.' });
            return res.json(result[0][0]);
        }
        res.status(503).json({ error: 'Banco indisponível.' });
    } catch (err) {
        console.error('Erro ao atualizar fornecedor:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/fornecedores/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (dbAvailable) {
            await pool.query('DELETE FROM fornecedores WHERE id=?', [id]);
        } else {
            memStore.fornecedores = memStore.fornecedores.filter(x => x.id !== id);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao deletar fornecedor.' });
    }
});


// ─── API: Reparo de Seed (força inserção de dados padrão no banco) ──────────
app.post('/api/admin/reparo-seed', async (req, res) => {
    if (!dbAvailable) return res.json({ msg: 'Usando memória, sem necessidade de reparo.' });
    try {
        const mats = memStore.materiais_catalogo;
        let insertedMat = 0;
        for (const m of mats) {
            const r = await pool.query(
                `INSERT INTO materiais_catalogo (id, nome, unidade, categoria, cor, ncm, observacoes)
                 VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
                [m.id, m.nome, m.unidade, m.categoria, m.cor, m.ncm, m.observacoes]
            );
            insertedMat += r.rowCount;
        }

        const precos = memStore.tabela_precos;
        let insertedPreco = 0;
        for (const p of precos) {
            const r = await pool.query(
                `INSERT INTO tabela_precos (id, material_id, preco_entregar, preco_coletar, venda_ref, validade)
                 VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
                [p.id, p.material_id, p.preco_entregar, p.preco_coletar, p.venda_ref, p.validade]
            );
            insertedPreco += r.rowCount;
        }

        // CRITICAL: Reset sequences so new INSERTs use IDs after the seeded ones
        await pool.query(`SELECT setval('materiais_catalogo_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM materiais_catalogo), false)`);
        await pool.query(`SELECT setval('tabela_precos_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM tabela_precos), false)`);
        await pool.query(`SELECT setval('fornecedores_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM fornecedores), false)`);
        await pool.query(`SELECT setval('amostras_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM amostras), false)`);

        res.json({ ok: true, materiais_inseridos: insertedMat, precos_inseridos: insertedPreco, sequences_resetadas: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ─── API: Materiais de Catálogo (CRUD) ─────────────────────────────────────────
app.get('/api/materiais-catalogo', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query('SELECT * FROM materiais_catalogo ORDER BY categoria ASC, nome ASC');
            return res.json(result[0]);
        }
        res.json(memStore.materiais_catalogo);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar materiais.' });
    }

});

app.post('/api/materiais-catalogo', async (req, res) => {
    try {
        let { nome, unidade, categoria, cor, ncm, observacoes } = req.body;
        nome = formatarNomeCapitalizado(nome);
        let material;
        const validadeDefault = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        if (dbAvailable) {
            const result = await pool.query(
                `INSERT INTO materiais_catalogo (nome, unidade, categoria, cor, ncm, observacoes)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [nome, unidade || 'kg', categoria, cor || '#ffffff', ncm, observacoes]
            );
            material = result[0][0];

            // Auto-create pricing row (non-blocking)
            try {
                await pool.query(
                    `INSERT INTO tabela_precos (material_id, preco_entregar, preco_coletar, venda_ref, validade)
                     VALUES (?, ?, ?, ?, ?)`,
                    [material.id, 0.00, 0.00, 0.00, validadeDefault]
                );
                await atualizarDataUltimaModificacaoPrecos();
            } catch (pricingErr) {
                console.error('Aviso: não foi possível criar preço automaticamente:', pricingErr.message);
            }
        } else {
            const newM = { id: nextId++, nome, unidade: unidade || 'kg', categoria, cor: cor || '#ffffff', ncm, observacoes };
            memStore.materiais_catalogo.push(newM);
            material = newM;

            // Auto-create pricing row in memory (non-blocking)
            try {
                memStore.tabela_precos.push({
                    id: nextId++,
                    material_id: material.id,
                    preco_entregar: 0.00,
                    preco_coletar: 0.00,
                    venda_ref: 0.00,
                    validade: validadeDefault
                });
                await atualizarDataUltimaModificacaoPrecos();
            } catch (pricingErr) {
                console.error('Aviso: não foi possível criar preço em memória:', pricingErr.message);
            }
        }
        res.json(material);
    } catch (err) {
        console.error('Erro ao criar material:', err);
        res.status(500).json({ error: 'Erro ao criar material: ' + err.message });
    }
});

app.put('/api/materiais-catalogo/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { nome, unidade, categoria, cor, ncm, observacoes } = req.body;
        if (dbAvailable) {
            const result = await pool.query(
                `UPDATE materiais_catalogo SET nome=?, unidade=?, categoria=?, cor=?, ncm=?, observacoes=?
                 WHERE id=?`,
                [nome, unidade, categoria, cor, ncm, observacoes, id]
            );
            return res.json(result[0][0]);
        } else {
            const idx = memStore.materiais_catalogo.findIndex(x => x.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Material não encontrado.' });
            memStore.materiais_catalogo[idx] = { id, nome, unidade, categoria, cor, ncm, observacoes };
            return res.json(memStore.materiais_catalogo[idx]);
        }
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar material.' });
    }
});

app.delete('/api/materiais-catalogo/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (dbAvailable) {
            await pool.query('DELETE FROM tabela_precos WHERE material_id=?', [id]);
            await pool.query('DELETE FROM materiais_catalogo WHERE id=?', [id]);
            await atualizarDataUltimaModificacaoPrecos();
        } else {
            memStore.tabela_precos = memStore.tabela_precos.filter(x => x.material_id !== id);
            memStore.materiais_catalogo = memStore.materiais_catalogo.filter(x => x.id !== id);
            await atualizarDataUltimaModificacaoPrecos();
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao deletar material:', err);
        res.status(500).json({ error: 'Erro ao deletar material.' });
    }
});

// ─── API: Resíduos (CRUD) ──────────────────────────────────────────────────────
app.get('/api/residuos-catalogo', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query('SELECT * FROM residuos_catalogo ORDER BY categoria ASC, nome ASC');
            return res.json(result[0]);
        }
        res.json(memStore.residuos_catalogo || []);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar resíduos.' });
    }
});

app.post('/api/residuos-catalogo', async (req, res) => {
    try {
        let { nome, unidade, categoria, cor, ncm, observacoes } = req.body;
        nome = formatarNomeCapitalizado(nome);
        if (dbAvailable) {
            const result = await pool.query(
                `INSERT INTO residuos_catalogo (nome, unidade, categoria, cor, ncm, observacoes)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [nome, unidade || 'kg', categoria, cor || '#ffffff', ncm, observacoes]
            );
            return res.json(result[0][0]);
        } else {
            const newM = { id: nextId++, nome, unidade: unidade || 'kg', categoria, cor: cor || '#ffffff', ncm, observacoes };
            if (!memStore.residuos_catalogo) memStore.residuos_catalogo = [];
            memStore.residuos_catalogo.push(newM);
            return res.json(newM);
        }
    } catch (err) {
        console.error('Erro ao criar resíduo:', err);
        res.status(500).json({ error: 'Erro ao criar resíduo: ' + err.message });
    }
});

app.put('/api/residuos-catalogo/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { nome, unidade, categoria, cor, ncm, observacoes } = req.body;
        if (dbAvailable) {
            const result = await pool.query(
                `UPDATE residuos_catalogo SET nome=?, unidade=?, categoria=?, cor=?, ncm=?, observacoes=?
                 WHERE id=?`,
                [nome, unidade, categoria, cor, ncm, observacoes, id]
            );
            return res.json(result[0][0]);
        } else {
            if (!memStore.residuos_catalogo) memStore.residuos_catalogo = [];
            const idx = memStore.residuos_catalogo.findIndex(x => x.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Resíduo não encontrado.' });
            memStore.residuos_catalogo[idx] = { id, nome, unidade, categoria, cor, ncm, observacoes };
            return res.json(memStore.residuos_catalogo[idx]);
        }
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar resíduo.' });
    }
});

app.delete('/api/residuos-catalogo/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (dbAvailable) {
            await pool.query('DELETE FROM residuos_catalogo WHERE id=?', [id]);
        } else {
            if (!memStore.residuos_catalogo) memStore.residuos_catalogo = [];
            memStore.residuos_catalogo = memStore.residuos_catalogo.filter(x => x.id !== id);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao deletar resíduo:', err);
        res.status(500).json({ error: 'Erro ao deletar resíduo.' });
    }
});

// ─── API: Ligas (CRUD) ─────────────────────────────────────────────────────────
app.get('/api/ligas-catalogo', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query('SELECT * FROM ligas_catalogo ORDER BY categoria ASC, nome ASC');
            return res.json(result[0]);
        }
        res.json(memStore.ligas_catalogo || []);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar ligas.' });
    }
});

app.post('/api/ligas-catalogo', async (req, res) => {
    try {
        let { nome, unidade, categoria, cor, ncm, observacoes } = req.body;
        nome = formatarNomeCapitalizado(nome);
        if (dbAvailable) {
            const result = await pool.query(
                `INSERT INTO ligas_catalogo (nome, unidade, categoria, cor, ncm, observacoes)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [nome, unidade || 'kg', categoria, cor || '#ffffff', ncm, observacoes]
            );
            return res.json(result[0][0]);
        } else {
            const newM = { id: nextId++, nome, unidade: unidade || 'kg', categoria, cor: cor || '#ffffff', ncm, observacoes };
            if (!memStore.ligas_catalogo) memStore.ligas_catalogo = [];
            memStore.ligas_catalogo.push(newM);
            return res.json(newM);
        }
    } catch (err) {
        console.error('Erro ao criar liga:', err);
        res.status(500).json({ error: 'Erro ao criar liga: ' + err.message });
    }
});

app.put('/api/ligas-catalogo/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { nome, unidade, categoria, cor, ncm, observacoes } = req.body;
        if (dbAvailable) {
            const result = await pool.query(
                `UPDATE ligas_catalogo SET nome=?, unidade=?, categoria=?, cor=?, ncm=?, observacoes=?
                 WHERE id=?`,
                [nome, unidade, categoria, cor, ncm, observacoes, id]
            );
            return res.json(result[0][0]);
        } else {
            if (!memStore.ligas_catalogo) memStore.ligas_catalogo = [];
            const idx = memStore.ligas_catalogo.findIndex(x => x.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Liga não encontrada.' });
            memStore.ligas_catalogo[idx] = { id, nome, unidade, categoria, cor, ncm, observacoes };
            return res.json(memStore.ligas_catalogo[idx]);
        }
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar liga.' });
    }
});

app.delete('/api/ligas-catalogo/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (dbAvailable) {
            await pool.query('DELETE FROM ligas_catalogo WHERE id=?', [id]);
        } else {
            if (!memStore.ligas_catalogo) memStore.ligas_catalogo = [];
            memStore.ligas_catalogo = memStore.ligas_catalogo.filter(x => x.id !== id);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao deletar liga:', err);
        res.status(500).json({ error: 'Erro ao deletar liga.' });
    }
});

// ─── API: Tabela de Preços (CRUD) ─────────────────────────────────────────────
async function atualizarDataUltimaModificacaoPrecos() {
    try {
        const todayStr = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
        const localDate = new Date(todayStr);
        const day = String(localDate.getDate()).padStart(2, '0');
        const month = String(localDate.getMonth() + 1).padStart(2, '0');
        const year = localDate.getFullYear();
        const formatted = `${day}/${month}/${year}`;
        
        if (dbAvailable) {
            await pool.query(
                'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = ?',
                ['tabela_precos_ultima_atualizacao', formatted]
            );
        } else {
            memStore.settings.tabela_precos_ultima_atualizacao = formatted;
        }
    } catch (err) {
        console.error('Erro ao atualizar data de modificação da tabela de preços:', err);
    }
}

app.get('/api/tabela-precos', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query(`
                SELECT tp.*, mc.nome as material_nome, mc.categoria as material_categoria, mc.ncm as material_ncm
                FROM tabela_precos tp
                JOIN materiais_catalogo mc ON tp.material_id = mc.id
                ORDER BY mc.categoria ASC, mc.nome ASC
            `);
            return res.json(result[0]);
        }
        const data = memStore.tabela_precos.map(p => {
            const mc = memStore.materiais_catalogo.find(x => x.id === p.material_id);
            return {
                ...p,
                material_nome: mc ? mc.nome : '',
                material_categoria: mc ? mc.categoria : '',
                material_ncm: mc ? mc.ncm : ''
            };
        });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar tabela de preços.' });
    }
});

app.post('/api/tabela-precos', async (req, res) => {
    try {
        const { material_id, preco_entregar, preco_coletar, venda_ref, validade, aplicar_todos, comissao, pis_cofins, fidc, icms, frete_coleta } = req.body;
        if (dbAvailable) {
            if (aplicar_todos && validade) {
                await pool.query('UPDATE tabela_precos SET validade = ?', [validade]);
            }
            const result = await pool.query(
                `INSERT INTO tabela_precos (material_id, preco_entregar, preco_coletar, venda_ref, validade, comissao, pis_cofins, fidc, icms, frete_coleta)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [material_id, preco_entregar, preco_coletar, venda_ref, validade, comissao || 0, pis_cofins || 0, fidc || 0, icms || 0, frete_coleta || 0]
            );
            await atualizarDataUltimaModificacaoPrecos();
            return res.json(result[0][0]);
        } else {
            if (aplicar_todos && validade) {
                memStore.tabela_precos.forEach(p => p.validade = validade);
            }
            const newP = { id: Date.now(), material_id: parseInt(material_id), preco_entregar: parseFloat(preco_entregar), preco_coletar: parseFloat(preco_coletar), venda_ref: parseFloat(venda_ref), validade, comissao: parseFloat(comissao)||0, pis_cofins: parseFloat(pis_cofins)||0, fidc: parseFloat(fidc)||0, icms: parseFloat(icms)||0, frete_coleta: parseFloat(frete_coleta)||0 };
            memStore.tabela_precos.push(newP);
            await atualizarDataUltimaModificacaoPrecos();
            return res.json(newP);
        }
    } catch (err) {
        console.error('Erro ao criar preço:', err);
        res.status(500).json({ error: 'Erro ao salvar preço.' });
    }
});

app.put('/api/tabela-precos-validade-geral', async (req, res) => {
    try {
        const { validade } = req.body;
        if (!validade) return res.status(400).json({ error: 'Data de validade é obrigatória.' });
        if (dbAvailable) {
            await pool.query('UPDATE tabela_precos SET validade = ?', [validade]);
            await atualizarDataUltimaModificacaoPrecos();
            return res.json({ success: true, validade });
        } else {
            memStore.tabela_precos.forEach(p => p.validade = validade);
            await atualizarDataUltimaModificacaoPrecos();
            return res.json({ success: true, validade });
        }
    } catch (err) {
        console.error('Erro ao atualizar validade geral:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/tabela-precos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { preco_entregar, preco_coletar, venda_ref, validade, aplicar_todos, comissao, pis_cofins, fidc, icms, frete_coleta } = req.body;
        if (dbAvailable) {
            if (aplicar_todos && validade) {
                await pool.query('UPDATE tabela_precos SET validade = ?', [validade]);
            }
            const result = await pool.query(
                `UPDATE tabela_precos SET preco_entregar=?, preco_coletar=?, venda_ref=?, validade=?,
                        comissao=?, pis_cofins=?, fidc=?, icms=?, frete_coleta=?
                 WHERE id=?`,
                [preco_entregar, preco_coletar, venda_ref, validade, comissao || 0, pis_cofins || 0, fidc || 0, icms || 0, frete_coleta || 0, id]
            );
            await atualizarDataUltimaModificacaoPrecos();
            return res.json(result[0][0]);
        } else {
            if (aplicar_todos && validade) {
                memStore.tabela_precos.forEach(p => p.validade = validade);
            }
            const idx = memStore.tabela_precos.findIndex(x => x.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Preço não encontrado.' });
            memStore.tabela_precos[idx].preco_entregar = parseFloat(preco_entregar);
            memStore.tabela_precos[idx].preco_coletar = parseFloat(preco_coletar);
            memStore.tabela_precos[idx].venda_ref = parseFloat(venda_ref);
            memStore.tabela_precos[idx].validade = validade;
            memStore.tabela_precos[idx].comissao = parseFloat(comissao)||0;
            memStore.tabela_precos[idx].pis_cofins = parseFloat(pis_cofins)||0;
            memStore.tabela_precos[idx].fidc = parseFloat(fidc)||0;
            memStore.tabela_precos[idx].icms = parseFloat(icms)||0;
            memStore.tabela_precos[idx].frete_coleta = parseFloat(frete_coleta)||0;
            await atualizarDataUltimaModificacaoPrecos();
            return res.json(memStore.tabela_precos[idx]);
        }
    } catch (err) {
        console.error('Erro ao atualizar preço:', err);
        res.status(500).json({ error: 'Erro ao atualizar preço.' });
    }
});

app.delete('/api/tabela-precos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (dbAvailable) {
            await pool.query('DELETE FROM tabela_precos WHERE id=?', [id]);
            await atualizarDataUltimaModificacaoPrecos();
        } else {
            memStore.tabela_precos = memStore.tabela_precos.filter(x => x.id !== id);
            await atualizarDataUltimaModificacaoPrecos();
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao deletar preço.' });
    }
});

// ─── API: Tabela de Preços — Resíduos (CRUD) ──────────────────────────────────
app.get('/api/tabela-precos-residuos', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query(`
                SELECT tp.*, mc.nome as material_nome, mc.categoria as material_categoria, mc.ncm as material_ncm
                FROM tabela_precos_residuos tp
                JOIN materiais_catalogo mc ON tp.material_id = mc.id
                ORDER BY mc.categoria ASC, mc.nome ASC
            `);
            return res.json(result[0]);
        }
        const data = memStore.tabela_precos_residuos.map(p => {
            const mc = memStore.materiais_catalogo.find(x => x.id === p.material_id);
            return { ...p, material_nome: mc?.nome||'', material_categoria: mc?.categoria||'', material_ncm: mc?.ncm||'' };
        });
        res.json(data);
    } catch (err) { res.status(500).json({ error: 'Erro ao buscar tabela de preços de resíduos.' }); }
});

app.post('/api/tabela-precos-residuos', async (req, res) => {
    try {
        const { aplicar_todos,  material_id, preco_entregar, preco_coletar, venda_ref, validade, comissao, pis_cofins, fidc, icms, frete_coleta  } = req.body;
        if (dbAvailable && aplicar_todos && validade) {
            await pool.query('UPDATE tabela_precos_residuos SET validade = ?', [validade]);
        }
        if (!dbAvailable && aplicar_todos && validade) {
            memStore.tabela_precos_residuos.forEach(p => p.validade = validade);
        }
        if (dbAvailable) {
            const result = await pool.query(
                `INSERT INTO tabela_precos_residuos (material_id, preco_entregar, preco_coletar, venda_ref, validade, comissao, pis_cofins, fidc, icms, frete_coleta)
                 VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [material_id, preco_entregar||0, preco_coletar||0, venda_ref||0, validade, comissao||0, pis_cofins||0, fidc||0, icms||0, frete_coleta||0]
            );
            return res.json(result[0][0]);
        }
        const newP = { id: Date.now(), material_id: parseInt(material_id), preco_entregar: parseFloat(preco_entregar)||0, preco_coletar: parseFloat(preco_coletar)||0, venda_ref: parseFloat(venda_ref)||0, validade, comissao: parseFloat(comissao)||0, pis_cofins: parseFloat(pis_cofins)||0, fidc: parseFloat(fidc)||0, icms: parseFloat(icms)||0, frete_coleta: parseFloat(frete_coleta)||0 };
        memStore.tabela_precos_residuos.push(newP);
        res.json(newP);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao salvar preço de resíduo.' }); }
});

app.put('/api/tabela-precos-residuos-validade', async (req, res) => {
    try {
        const { validade } = req.body;
        if (!validade) return res.status(400).json({ error: 'Data de validade obrigatória.' });
        if (dbAvailable) {
            await pool.query('UPDATE tabela_precos_residuos SET validade = ?', [validade]);
            return res.json({ success: true, validade });
        }
        memStore.tabela_precos_residuos.forEach(p => p.validade = validade);
        res.json({ success: true, validade });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/tabela-precos-residuos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { aplicar_todos,  material_id, preco_entregar, preco_coletar, venda_ref, validade, comissao, pis_cofins, fidc, icms, frete_coleta  } = req.body;
        if (dbAvailable && aplicar_todos && validade) {
            await pool.query('UPDATE tabela_precos_residuos SET validade = ?', [validade]);
        }
        if (!dbAvailable && aplicar_todos && validade) {
            memStore.tabela_precos_residuos.forEach(p => p.validade = validade);
        }
        if (dbAvailable) {
            const result = await pool.query(
                `UPDATE tabela_precos_residuos SET material_id=?, preco_entregar=?, preco_coletar=?, venda_ref=?, validade=?, comissao=?,
                 pis_cofins=?, fidc=?, icms=?, frete_coleta=? WHERE id=?`,
                [material_id, preco_entregar||0, preco_coletar||0, venda_ref||0, validade, comissao||0, pis_cofins||0, fidc||0, icms||0, frete_coleta||0, id]
            );
            return res.json(result[0][0]);
        }
        const idx = memStore.tabela_precos_residuos.findIndex(x => x.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Não encontrado.' });
        Object.assign(memStore.tabela_precos_residuos[idx], { material_id: parseInt(material_id), preco_entregar: parseFloat(preco_entregar)||0, preco_coletar: parseFloat(preco_coletar)||0, venda_ref: parseFloat(venda_ref)||0, validade, comissao: parseFloat(comissao)||0, pis_cofins: parseFloat(pis_cofins)||0, fidc: parseFloat(fidc)||0, icms: parseFloat(icms)||0, frete_coleta: parseFloat(frete_coleta)||0 });
        res.json(memStore.tabela_precos_residuos[idx]);
    } catch (err) { res.status(500).json({ error: 'Erro ao atualizar preço de resíduo.' }); }
});

app.delete('/api/tabela-precos-residuos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (dbAvailable) { await pool.query('DELETE FROM tabela_precos_residuos WHERE id=?', [id]); }
        else { memStore.tabela_precos_residuos = memStore.tabela_precos_residuos.filter(x => x.id !== id); }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Erro ao deletar preço de resíduo.' }); }
});

// ─── API: Tabela de Preços — Ligas (CRUD) ────────────────────────────────────
app.get('/api/tabela-precos-ligas', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query(`
                SELECT tp.*, mc.nome as material_nome, mc.categoria as material_categoria, mc.ncm as material_ncm
                FROM tabela_precos_ligas tp
                JOIN materiais_catalogo mc ON tp.material_id = mc.id
                ORDER BY mc.categoria ASC, mc.nome ASC
            `);
            return res.json(result[0]);
        }
        const data = memStore.tabela_precos_ligas.map(p => {
            const mc = memStore.materiais_catalogo.find(x => x.id === p.material_id);
            return { ...p, material_nome: mc?.nome||'', material_categoria: mc?.categoria||'', material_ncm: mc?.ncm||'' };
        });
        res.json(data);
    } catch (err) { res.status(500).json({ error: 'Erro ao buscar tabela de preços de ligas.' }); }
});

app.post('/api/tabela-precos-ligas', async (req, res) => {
    try {
        const { aplicar_todos,  material_id, preco_entregar, preco_coletar, venda_ref, validade, comissao, pis_cofins, fidc, icms, frete_coleta  } = req.body;
        if (dbAvailable && aplicar_todos && validade) {
            await pool.query('UPDATE tabela_precos_ligas SET validade = ?', [validade]);
        }
        if (!dbAvailable && aplicar_todos && validade) {
            memStore.tabela_precos_ligas.forEach(p => p.validade = validade);
        }
        if (dbAvailable) {
            const result = await pool.query(
                `INSERT INTO tabela_precos_ligas (material_id, preco_entregar, preco_coletar, venda_ref, validade, comissao, pis_cofins, fidc, icms, frete_coleta)
                 VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [material_id, preco_entregar||0, preco_coletar||0, venda_ref||0, validade, comissao||0, pis_cofins||0, fidc||0, icms||0, frete_coleta||0]
            );
            return res.json(result[0][0]);
        }
        const newP = { id: Date.now(), material_id: parseInt(material_id), preco_entregar: parseFloat(preco_entregar)||0, preco_coletar: parseFloat(preco_coletar)||0, venda_ref: parseFloat(venda_ref)||0, validade, comissao: parseFloat(comissao)||0, pis_cofins: parseFloat(pis_cofins)||0, fidc: parseFloat(fidc)||0, icms: parseFloat(icms)||0, frete_coleta: parseFloat(frete_coleta)||0 };
        memStore.tabela_precos_ligas.push(newP);
        res.json(newP);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao salvar preço de liga.' }); }
});

app.put('/api/tabela-precos-ligas-validade', async (req, res) => {
    try {
        const { validade } = req.body;
        if (!validade) return res.status(400).json({ error: 'Data de validade obrigatória.' });
        if (dbAvailable) {
            await pool.query('UPDATE tabela_precos_ligas SET validade = ?', [validade]);
            return res.json({ success: true, validade });
        }
        memStore.tabela_precos_ligas.forEach(p => p.validade = validade);
        res.json({ success: true, validade });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/tabela-precos-ligas/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { aplicar_todos,  material_id, preco_entregar, preco_coletar, venda_ref, validade, comissao, pis_cofins, fidc, icms, frete_coleta  } = req.body;
        if (dbAvailable && aplicar_todos && validade) {
            await pool.query('UPDATE tabela_precos_ligas SET validade = ?', [validade]);
        }
        if (!dbAvailable && aplicar_todos && validade) {
            memStore.tabela_precos_ligas.forEach(p => p.validade = validade);
        }
        if (dbAvailable) {
            const result = await pool.query(
                `UPDATE tabela_precos_ligas SET material_id=?, preco_entregar=?, preco_coletar=?, venda_ref=?, validade=?, comissao=?,
                 pis_cofins=?, fidc=?, icms=?, frete_coleta=? WHERE id=?`,
                [material_id, preco_entregar||0, preco_coletar||0, venda_ref||0, validade, comissao||0, pis_cofins||0, fidc||0, icms||0, frete_coleta||0, id]
            );
            return res.json(result[0][0]);
        }
        const idx = memStore.tabela_precos_ligas.findIndex(x => x.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Não encontrado.' });
        Object.assign(memStore.tabela_precos_ligas[idx], { material_id: parseInt(material_id), preco_entregar: parseFloat(preco_entregar)||0, preco_coletar: parseFloat(preco_coletar)||0, venda_ref: parseFloat(venda_ref)||0, validade, comissao: parseFloat(comissao)||0, pis_cofins: parseFloat(pis_cofins)||0, fidc: parseFloat(fidc)||0, icms: parseFloat(icms)||0, frete_coleta: parseFloat(frete_coleta)||0 });
        res.json(memStore.tabela_precos_ligas[idx]);
    } catch (err) { res.status(500).json({ error: 'Erro ao atualizar preço de liga.' }); }
});

app.delete('/api/tabela-precos-ligas/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (dbAvailable) { await pool.query('DELETE FROM tabela_precos_ligas WHERE id=?', [id]); }
        else { memStore.tabela_precos_ligas = memStore.tabela_precos_ligas.filter(x => x.id !== id); }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Erro ao deletar preço de liga.' }); }
});

// ─── API: Tabela de Preços — Volume (CRUD) ───────────────────────────────────
app.get('/api/tabela-precos-volume', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query(`
                SELECT tp.*, mc.nome as material_nome, mc.categoria as material_categoria, mc.ncm as material_ncm
                FROM tabela_precos_volume tp
                JOIN materiais_catalogo mc ON tp.material_id = mc.id
                ORDER BY mc.categoria ASC, mc.nome ASC
            `);
            return res.json(result[0]);
        }
        const data = memStore.tabela_precos_volume.map(p => {
            const mc = memStore.materiais_catalogo.find(x => x.id === p.material_id);
            return { ...p, material_nome: mc?.nome||'', material_categoria: mc?.categoria||'', material_ncm: mc?.ncm||'' };
        });
        res.json(data);
    } catch (err) { res.status(500).json({ error: 'Erro ao buscar tabela de preços de volume.' }); }
});

app.post('/api/tabela-precos-volume', async (req, res) => {
    try {
        const { aplicar_todos,  material_id, preco_entregar, preco_coletar, venda_ref, validade, comissao, pis_cofins, fidc, icms, frete_coleta  } = req.body;
        if (dbAvailable && aplicar_todos && validade) {
            await pool.query('UPDATE tabela_precos_volume SET validade = ?', [validade]);
        }
        if (!dbAvailable && aplicar_todos && validade) {
            memStore.tabela_precos_volume.forEach(p => p.validade = validade);
        }
        if (dbAvailable) {
            const result = await pool.query(
                `INSERT INTO tabela_precos_volume (material_id, preco_entregar, preco_coletar, venda_ref, validade, comissao, pis_cofins, fidc, icms, frete_coleta)
                 VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [material_id, preco_entregar||0, preco_coletar||0, venda_ref||0, validade, comissao||0, pis_cofins||0, fidc||0, icms||0, frete_coleta||0]
            );
            return res.json(result[0][0]);
        }
        const newP = { id: Date.now(), material_id: parseInt(material_id), preco_entregar: parseFloat(preco_entregar)||0, preco_coletar: parseFloat(preco_coletar)||0, venda_ref: parseFloat(venda_ref)||0, validade, comissao: parseFloat(comissao)||0, pis_cofins: parseFloat(pis_cofins)||0, fidc: parseFloat(fidc)||0, icms: parseFloat(icms)||0, frete_coleta: parseFloat(frete_coleta)||0 };
        memStore.tabela_precos_volume.push(newP);
        res.json(newP);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao salvar preço de volume.' }); }
});

app.put('/api/tabela-precos-volume-validade', async (req, res) => {
    try {
        const { validade } = req.body;
        if (!validade) return res.status(400).json({ error: 'Data de validade obrigatória.' });
        if (dbAvailable) {
            await pool.query('UPDATE tabela_precos_volume SET validade = ?', [validade]);
            return res.json({ success: true, validade });
        }
        memStore.tabela_precos_volume.forEach(p => p.validade = validade);
        res.json({ success: true, validade });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/tabela-precos-volume/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { aplicar_todos,  material_id, preco_entregar, preco_coletar, venda_ref, validade, comissao, pis_cofins, fidc, icms, frete_coleta  } = req.body;
        if (dbAvailable && aplicar_todos && validade) {
            await pool.query('UPDATE tabela_precos_volume SET validade = ?', [validade]);
        }
        if (!dbAvailable && aplicar_todos && validade) {
            memStore.tabela_precos_volume.forEach(p => p.validade = validade);
        }
        if (dbAvailable) {
            const result = await pool.query(
                `UPDATE tabela_precos_volume SET material_id=?, preco_entregar=?, preco_coletar=?, venda_ref=?, validade=?, comissao=?,
                 pis_cofins=?, fidc=?, icms=?, frete_coleta=? WHERE id=?`,
                [material_id, preco_entregar||0, preco_coletar||0, venda_ref||0, validade, comissao||0, pis_cofins||0, fidc||0, icms||0, frete_coleta||0, id]
            );
            return res.json(result[0][0]);
        }
        const idx = memStore.tabela_precos_volume.findIndex(x => x.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Não encontrado.' });
        Object.assign(memStore.tabela_precos_volume[idx], { material_id: parseInt(material_id), preco_entregar: parseFloat(preco_entregar)||0, preco_coletar: parseFloat(preco_coletar)||0, venda_ref: parseFloat(venda_ref)||0, validade, comissao: parseFloat(comissao)||0, pis_cofins: parseFloat(pis_cofins)||0, fidc: parseFloat(fidc)||0, icms: parseFloat(icms)||0, frete_coleta: parseFloat(frete_coleta)||0 });
        res.json(memStore.tabela_precos_volume[idx]);
    } catch (err) { res.status(500).json({ error: 'Erro ao atualizar preço de volume.' }); }
});

app.delete('/api/tabela-precos-volume/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (dbAvailable) { await pool.query('DELETE FROM tabela_precos_volume WHERE id=?', [id]); }
        else { memStore.tabela_precos_volume = memStore.tabela_precos_volume.filter(x => x.id !== id); }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Erro ao deletar preço de volume.' }); }
});

// ─── API: Tabela de Preços — Fundição (CRUD) ─────────────────────────────────
app.get('/api/tabela-precos-fundicao', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query(`
                SELECT tp.*, mc.nome as material_nome, mc.categoria as material_categoria, mc.ncm as material_ncm
                FROM tabela_precos_fundicao tp
                JOIN materiais_catalogo mc ON tp.material_id = mc.id
                ORDER BY mc.categoria ASC, mc.nome ASC
            `);
            return res.json(result[0]);
        }
        const data = memStore.tabela_precos_fundicao.map(p => {
            const mc = memStore.materiais_catalogo.find(x => x.id === p.material_id);
            return { ...p, material_nome: mc?.nome||'', material_categoria: mc?.categoria||'', material_ncm: mc?.ncm||'' };
        });
        res.json(data);
    } catch (err) { res.status(500).json({ error: 'Erro ao buscar tabela de preços de fundição.' }); }
});

app.post('/api/tabela-precos-fundicao', async (req, res) => {
    try {
        const { aplicar_todos,  material_id, preco_entregar, preco_coletar, venda_ref, validade, comissao, pis_cofins, fidc, icms, frete_coleta  } = req.body;
        if (dbAvailable && aplicar_todos && validade) {
            await pool.query('UPDATE tabela_precos_fundicao SET validade = ?', [validade]);
        }
        if (!dbAvailable && aplicar_todos && validade) {
            memStore.tabela_precos_fundicao.forEach(p => p.validade = validade);
        }
        if (dbAvailable) {
            const result = await pool.query(
                `INSERT INTO tabela_precos_fundicao (material_id, preco_entregar, preco_coletar, venda_ref, validade, comissao, pis_cofins, fidc, icms, frete_coleta)
                 VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [material_id, preco_entregar||0, preco_coletar||0, venda_ref||0, validade, comissao||0, pis_cofins||0, fidc||0, icms||0, frete_coleta||0]
            );
            return res.json(result[0][0]);
        }
        const newP = { id: Date.now(), material_id: parseInt(material_id), preco_entregar: parseFloat(preco_entregar)||0, preco_coletar: parseFloat(preco_coletar)||0, venda_ref: parseFloat(venda_ref)||0, validade, comissao: parseFloat(comissao)||0, pis_cofins: parseFloat(pis_cofins)||0, fidc: parseFloat(fidc)||0, icms: parseFloat(icms)||0, frete_coleta: parseFloat(frete_coleta)||0 };
        memStore.tabela_precos_fundicao.push(newP);
        res.json(newP);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Erro ao salvar preço de fundição.' }); }
});

app.put('/api/tabela-precos-fundicao-validade', async (req, res) => {
    try {
        const { validade } = req.body;
        if (!validade) return res.status(400).json({ error: 'Data de validade obrigatória.' });
        if (dbAvailable) {
            await pool.query('UPDATE tabela_precos_fundicao SET validade = ?', [validade]);
            return res.json({ success: true, validade });
        }
        memStore.tabela_precos_fundicao.forEach(p => p.validade = validade);
        res.json({ success: true, validade });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/tabela-precos-fundicao/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { aplicar_todos,  material_id, preco_entregar, preco_coletar, venda_ref, validade, comissao, pis_cofins, fidc, icms, frete_coleta  } = req.body;
        if (dbAvailable && aplicar_todos && validade) {
            await pool.query('UPDATE tabela_precos_fundicao SET validade = ?', [validade]);
        }
        if (!dbAvailable && aplicar_todos && validade) {
            memStore.tabela_precos_fundicao.forEach(p => p.validade = validade);
        }
        if (dbAvailable) {
            const result = await pool.query(
                `UPDATE tabela_precos_fundicao SET material_id=?, preco_entregar=?, preco_coletar=?, venda_ref=?, validade=?, comissao=?,
                 pis_cofins=?, fidc=?, icms=?, frete_coleta=? WHERE id=?`,
                [material_id, preco_entregar||0, preco_coletar||0, venda_ref||0, validade, comissao||0, pis_cofins||0, fidc||0, icms||0, frete_coleta||0, id]
            );
            return res.json(result[0][0]);
        }
        const idx = memStore.tabela_precos_fundicao.findIndex(x => x.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Não encontrado.' });
        Object.assign(memStore.tabela_precos_fundicao[idx], { material_id: parseInt(material_id), preco_entregar: parseFloat(preco_entregar)||0, preco_coletar: parseFloat(preco_coletar)||0, venda_ref: parseFloat(venda_ref)||0, validade, comissao: parseFloat(comissao)||0, pis_cofins: parseFloat(pis_cofins)||0, fidc: parseFloat(fidc)||0, icms: parseFloat(icms)||0, frete_coleta: parseFloat(frete_coleta)||0 });
        res.json(memStore.tabela_precos_fundicao[idx]);
    } catch (err) { res.status(500).json({ error: 'Erro ao atualizar preço de fundição.' }); }
});

app.delete('/api/tabela-precos-fundicao/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (dbAvailable) { await pool.query('DELETE FROM tabela_precos_fundicao WHERE id=?', [id]); }
        else { memStore.tabela_precos_fundicao = memStore.tabela_precos_fundicao.filter(x => x.id !== id); }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Erro ao deletar preço de fundição.' }); }
});

// ─── API: Amostras & Análise (CRUD) ───────────────────────────────────────────
app.get('/api/amostras', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query(`
                SELECT a.*, COALESCE(f.apelido, f.nome) as fornecedor_nome
                FROM amostras a
                LEFT JOIN fornecedores f ON a.fornecedor_id = f.id
                ORDER BY a.data DESC, a.id DESC
            `);
            return res.json(result[0]);
        }
        const data = memStore.amostras.map(a => {
            const f = memStore.fornecedores.find(x => x.id === a.fornecedor_id);
            return {
                ...a,
                fornecedor_nome: f ? (f.apelido || f.nome || f.nome_fantasia) : ''
            };
        });
        res.json(data);
    } catch (err) {
        console.error('Erro ao buscar amostras:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/amostras/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        let amostra;
        let componentes;

        if (dbAvailable) {
            const aRes = await pool.query('SELECT a.*, COALESCE(f.apelido, f.nome) as fornecedor_nome FROM amostras a LEFT JOIN fornecedores f ON a.fornecedor_id = f.id WHERE a.id=?', [id]);
            if (aRes[0].length === 0) return res.status(404).json({ error: 'Amostra não encontrada.' });
            amostra = aRes[0][0];

            const cRes = await pool.query(`
                SELECT ca.*, mc.nome as material_nome, mc.categoria as material_categoria
                FROM componentes_amostra ca
                LEFT JOIN materiais_catalogo mc ON ca.material_id = mc.id
                WHERE ca.amostra_id=?
            `, [id]);
            componentes = cRes[0];
        } else {
            amostra = memStore.amostras.find(x => x.id === id);
            if (!amostra) return res.status(404).json({ error: 'Amostra não encontrada.' });
            const f = memStore.fornecedores.find(x => x.id === amostra.fornecedor_id);
            amostra.fornecedor_nome = f ? (f.apelido || f.nome || f.nome_fantasia) : '';

            componentes = memStore.componentes_amostra.filter(x => x.amostra_id === id).map(ca => {
                const mc = memStore.materiais_catalogo.find(x => x.id === ca.material_id);
                return {
                    ...ca,
                    material_nome: mc ? mc.nome : '',
                    material_categoria: mc ? mc.categoria : ''
                };
            });
        }
        res.json({ amostra, componentes });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar detalhes da amostra.' });
    }
});

app.post('/api/amostras', async (req, res) => {
    try {
        const { numero_amostra, nome_material, data, fornecedor_id, responsavel, representante, peso_inicial, observacoes, foto_original } = req.body;
        if (dbAvailable) {
            const result = await pool.query(
                `INSERT INTO amostras (numero_amostra, nome_material, data, fornecedor_id, responsavel, representante, peso_inicial, status, observacoes, foto_original)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'Em Análise', ?, ?)`,
                [numero_amostra, nome_material || '', data, fornecedor_id, responsavel, representante || '', peso_inicial, observacoes, foto_original || '']
            );
            return res.json(result[0][0]);
        } else {
            const newA = { id: nextId++, numero_amostra, nome_material: nome_material || '', data, fornecedor_id: parseInt(fornecedor_id), responsavel, representante: representante || '', peso_inicial: parseFloat(peso_inicial), status: 'Em Análise', observacoes, foto_original: foto_original || '' };
            memStore.amostras.push(newA);
            return res.json(newA);
        }
    } catch (err) {
        res.status(500).json({ error: 'Erro ao criar amostra: ' + err.message });
    }
});

app.post('/api/amostras/:id/componentes', async (req, res) => {
    try {
        const amostra_id = parseInt(req.params.id);
        const { componentes, tempo_desmonte, parecer_tecnico, tecnico_analise } = req.body; // componentes: array of { material_id, peso, percentual, observacoes, foto, dificuldade }

        if (dbAvailable) {
            // Delete old components
            await pool.query('DELETE FROM componentes_amostra WHERE amostra_id=?', [amostra_id]);
            
            // Insert new components with foto and dificuldade
            for (const c of componentes) {
                await pool.query(
                    `INSERT INTO componentes_amostra (amostra_id, material_id, peso, percentual, observacoes, foto, dificuldade)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [amostra_id, c.material_id, c.peso, c.percentual, c.observacoes, c.foto || '', c.dificuldade || 'Fácil']
                );
            }
            // Update sample info: tempo, parecer and status
            await pool.query(
                `UPDATE amostras 
                 SET tempo_desmonte = ?, parecer_tecnico = ?, status = 'Aguardando Decisão de Compra', tecnico_analise = ? 
                 WHERE id = ?`,
                [parseInt(tempo_desmonte) || 0, parecer_tecnico || '', amostra_id, tecnico_analise || '']
            );
        } else {
            memStore.componentes_amostra = memStore.componentes_amostra.filter(x => x.amostra_id !== amostra_id);
            for (const c of componentes) {
                memStore.componentes_amostra.push({
                    id: nextId++,
                    amostra_id,
                    material_id: parseInt(c.material_id),
                    peso: parseFloat(c.peso),
                    percentual: parseFloat(c.percentual),
                    observacoes: c.observacoes,
                    foto: c.foto || '',
                    dificuldade: c.dificuldade || 'Fácil'
                });
            }
            const a = memStore.amostras.find(x => x.id === amostra_id);
            if (a) {
                a.tempo_desmonte = parseInt(tempo_desmonte) || 0;
                a.parecer_tecnico = parecer_tecnico || '';
                a.tecnico_analise = tecnico_analise || '';
                a.status = 'Aguardando Decisão de Compra';
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao salvar componentes e parecer técnico.' });
    }
});

// Liberação e Processamento PCP
app.patch('/api/amostras/:id/status', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status } = req.body;

        if (dbAvailable) {
            const currentA = await pool.query('SELECT status FROM amostras WHERE id=?', [id]);
            if (currentA[0].length === 0) return res.status(404).json({ error: 'Amostra não encontrada.' });
            const currStatus = currentA[0][0].status;

            if (status === 'Liberado para Produção' && currStatus !== 'Aprovado - Compra Autorizada') {
                return res.status(400).json({ error: 'A amostra precisa estar aprovada (Aprovado - Compra Autorizada) antes de ser liberada para produção.' });
            }
            if (status === 'Processado' && currStatus !== 'Liberado para Produção') {
                return res.status(400).json({ error: 'A amostra precisa estar Liberada para Produção antes de ser processada.' });
            }

            await pool.query('UPDATE amostras SET status=? WHERE id=?', [status, id]);
            
            // Se for "Processado", efetua a movimentação de estoque
            if (status === 'Processado') {
                const cRes = await pool.query('SELECT * FROM componentes_amostra WHERE amostra_id=?', [id]);
                const compList = cRes[0];
                const aRes = await pool.query('SELECT * FROM amostras WHERE id=?', [id]);
                const amostra = aRes[0][0];

                for (const c of compList) {
                    // Update estoque
                    await pool.query(
                        `INSERT INTO estoque (material_id, saldo) VALUES (?, ?)
                         ON CONFLICT (material_id) DO UPDATE SET saldo = estoque.saldo + EXCLUDED.saldo`,
                        [c.material_id, c.peso]
                    );
                    // Log movimentação
                    await pool.query(
                        `INSERT INTO movimentacoes_estoque (material_id, tipo, quantidade, motivo)
                         VALUES (?, 'ENTRADA', ?, ?)`,
                        [c.material_id, c.peso, `Processamento da amostra ${amostra.numero_amostra}`]
                    );
                }
            }
        } else {
            const a = memStore.amostras.find(x => x.id === id);
            if (!a) return res.status(404).json({ error: 'Amostra não encontrada.' });
            
            if (status === 'Liberado para Produção' && a.status !== 'Aprovado - Compra Autorizada') {
                return res.status(400).json({ error: 'A amostra precisa estar aprovada (Aprovado - Compra Autorizada) antes de ser liberada para produção.' });
            }
            if (status === 'Processado' && a.status !== 'Liberado para Produção') {
                return res.status(400).json({ error: 'A amostra precisa estar Liberada para Produção antes de ser processada.' });
            }

            a.status = status;

            if (status === 'Processado') {
                const compList = memStore.componentes_amostra.filter(x => x.amostra_id === id);
                for (const c of compList) {
                    const est = memStore.estoque.find(x => x.material_id === c.material_id);
                    if (est) {
                        est.saldo += c.peso;
                    } else {
                        memStore.estoque.push({ material_id: c.material_id, saldo: c.peso });
                    }
                    memStore.movimentacoes_estoque.push({
                        id: nextId++,
                        material_id: c.material_id,
                        tipo: "ENTRADA",
                        quantidade: c.peso,
                        motivo: `Processamento da amostra ${a.numero_amostra}`,
                        data: new Date().toISOString()
                    });
                }
            }
        }
        res.json({ success: true, status });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar status e estoque.' });
    }
});

// Decisão da Diretoria (Comprar / Não Comprar)
app.patch('/api/amostras/:id/decisao', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { decisao_diretoria, motivo_reprovacao, obs_diretoria, preco_compra_entregar, preco_compra_coletar, preco_validade, user_perfil, user_nome } = req.body;

        if (user_perfil !== 'Administrador' && user_perfil !== 'Diretoria') {
            return res.status(403).json({ error: 'Apenas o Administrador ou Diretoria pode tomar esta decisão.' });
        }

        // Checkup de segurança: verifica se a amostra passou pela etapa de desmonte do laboratório
        if (dbAvailable) {
            const compCheck = await pool.query('SELECT COUNT(*) as total FROM componentes_amostra WHERE amostra_id=?', [id]);
            const totalComp = parseInt(compCheck[0][0]?.total || 0);
            if (totalComp === 0) {
                return res.status(400).json({ error: 'Amostra sem desmonte concluído! Cadastre os componentes desmontados no laboratório antes da decisão de compra.' });
            }
        } else {
            const totalComp = (memStore.componentes_amostra || []).filter(c => c.amostra_id === id).length;
            if (totalComp === 0) {
                return res.status(400).json({ error: 'Amostra sem desmonte concluído! Cadastre os componentes desmontados no laboratório antes da decisão de compra.' });
            }
        }

        const status = decisao_diretoria === 'Aprovado' ? 'Aprovado - Compra Autorizada' : 'Reprovado';

        if (dbAvailable) {
            await pool.query(
                `UPDATE amostras 
                 SET decisao_diretoria=?, motivo_reprovacao=?, status=?, data_decisao=NOW(),
                     preco_compra_entregar=?, preco_compra_coletar=?, preco_validade=?, autorizado_por=?,
                     obs_diretoria=?, admin_aprovacao=?
                 WHERE id=?`,
                [
                    decisao_diretoria, 
                    motivo_reprovacao || '', 
                    status, 
                    decisao_diretoria === 'Aprovado' ? parseFloat(preco_compra_entregar) || null : null,
                    decisao_diretoria === 'Aprovado' ? parseFloat(preco_compra_coletar) || null : null,
                    decisao_diretoria === 'Aprovado' ? preco_validade || null : null,
                    user_nome || 'Admin',
                    obs_diretoria || '',
                    id,
                    user_nome || 'Admin'
                ]
            );
        } else {
            const a = memStore.amostras.find(x => x.id === id);
            if (!a) return res.status(404).json({ error: 'Amostra não encontrada.' });
            a.decisao_diretoria = decisao_diretoria;
            a.motivo_reprovacao = motivo_reprovacao || '';
            a.obs_diretoria = obs_diretoria || '';
            a.status = status;
            a.data_decisao = new Date().toISOString();
            if (decisao_diretoria === 'Aprovado') {
                a.preco_compra_entregar = parseFloat(preco_compra_entregar) || null;
                a.preco_compra_coletar = parseFloat(preco_compra_coletar) || null;
                a.preco_validade = preco_validade || null;
            }
            a.autorizado_por = user_nome || 'Admin';
            a.admin_aprovacao = user_nome || 'Admin';
        }
        res.json({ success: true, status, decisao_diretoria });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao salvar decisão da diretoria.' });
    }
});

// Exclusão de Amostra restrita a ADM e Diretoria
app.delete('/api/amostras/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { user_perfil } = req.query;

        if (user_perfil !== 'Administrador' && user_perfil !== 'Diretoria') {
            return res.status(403).json({ error: 'Apenas o Administrador ou Diretoria pode excluir registros.' });
        }

        if (dbAvailable) {
            await pool.query('DELETE FROM componentes_amostra WHERE amostra_id=?', [id]);
            await pool.query('DELETE FROM amostras WHERE id=?', [id]);
        } else {
            memStore.componentes_amostra = memStore.componentes_amostra.filter(x => x.amostra_id !== id);
            memStore.amostras = memStore.amostras.filter(x => x.id !== id);
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro ao excluir amostra.' });
    }
});

// ─── API: Fotos de Amostras ────────────────────────────────────────────────────
app.get('/api/amostras/:id/fotos', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (dbAvailable) {
            const r = await pool.query('SELECT id, amostra_id, tipo, COALESCE(etapa, \'Recebimento\') as etapa, componente_idx, mimetype, nome, criado_em FROM fotos_amostra WHERE amostra_id=? ORDER BY criado_em ASC', [id]);
            return res.json(r[0]);
        }
        const fotos = (memStore.fotos_amostra || []).filter(f => f.amostra_id === id)
            .map(f => ({ id: f.id, amostra_id: f.amostra_id, tipo: f.tipo, etapa: f.etapa || 'Recebimento', componente_idx: f.componente_idx ?? null, mimetype: f.mimetype, nome: f.nome, criado_em: f.criado_em }));
        res.json(fotos);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/amostras/:id/fotos/:fotoId/img', async (req, res) => {
    try {
        const id     = parseInt(req.params.id);
        const fotoId = parseInt(req.params.fotoId);
        if (dbAvailable) {
            const r = await pool.query('SELECT data_b64, mimetype FROM fotos_amostra WHERE id=? AND amostra_id=?', [fotoId, id]);
            if (!r[0][0]) return res.status(404).send('Foto não encontrada');
            const buf = Buffer.from(r[0][0].data_b64, 'base64');
            res.set('Content-Type', r[0][0].mimetype);
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.set('Content-Length', buf.length);
            return res.send(buf);
        }
        const foto = (memStore.fotos_amostra || []).find(f => f.id === fotoId && f.amostra_id === id);
        if (!foto) return res.status(404).send('Foto não encontrada');
        const buf = Buffer.from(foto.data_b64, 'base64');
        res.set('Content-Type', foto.mimetype);
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Content-Length', buf.length);
        res.send(buf);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/amostras/:id/fotos', uploadMemory.array('fotos', 20), async (req, res) => {
    try {
        const id            = parseInt(req.params.id);
        const tipo          = req.body.tipo || 'bruta';
        const etapa         = req.body.etapa || 'Recebimento';
        const componenteIdx = req.body.componente_idx !== undefined ? parseInt(req.body.componente_idx) : null;
        if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        console.log(`[FOTO-UPLOAD] amostra=${id}, tipo=${tipo}, etapa=${etapa}, arquivos=${req.files.length}, tamanhos=${req.files.map(f => f.size + 'b').join(',')}`);
        const inseridas = [];
        for (const file of req.files) {
            const b64      = file.buffer.toString('base64');
            const mimetype = file.mimetype;
            const nome     = file.originalname;
            if (dbAvailable) {
                const r = await pool.query(
                    'INSERT INTO fotos_amostra (amostra_id, tipo, etapa, componente_idx, data_b64, mimetype, nome) VALUES (?,?,?,?,?,?,?), amostra_id, tipo, etapa, componente_idx, mimetype, nome, criado_em',
                    [id, tipo, etapa, componenteIdx, b64, mimetype, nome]
                );
                inseridas.push(r[0][0]);
            } else {
                const f = { id: nextId++, amostra_id: id, tipo, etapa, componente_idx: componenteIdx, data_b64: b64, mimetype, nome, criado_em: new Date().toISOString() };
                if (!memStore.fotos_amostra) memStore.fotos_amostra = [];
                memStore.fotos_amostra.push(f);
                inseridas.push({ id: f.id, amostra_id: f.amostra_id, tipo: f.tipo, etapa: f.etapa, componente_idx: f.componente_idx, mimetype: f.mimetype, nome: f.nome, criado_em: f.criado_em });
            }
        }
        res.json({ success: true, fotos: inseridas });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/amostras/:id/fotos/:fotoId', async (req, res) => {
    try {
        const id     = parseInt(req.params.id);
        const fotoId = parseInt(req.params.fotoId);
        if (dbAvailable) {
            await pool.query('DELETE FROM fotos_amostra WHERE id=? AND amostra_id=?', [fotoId, id]);
        } else {
            memStore.fotos_amostra = (memStore.fotos_amostra || []).filter(f => !(f.id === fotoId && f.amostra_id === id));
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── API: Enviar E-mail do Laudo ao Diretor (disparo após análise técnica) ─────
app.post('/api/amostras/:id/enviar-laudo-email', async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        // Buscar dados da amostra
        let amostra, componentes, fornecedor;
        if (dbAvailable) {
            const ar = await pool.query('SELECT a.*, COALESCE(f.apelido, f.nome) as fornecedor_nome FROM amostras a LEFT JOIN fornecedores f ON a.fornecedor_id=f.id WHERE a.id=?', [id]);
            amostra = ar[0][0];
            const cr = await pool.query('SELECT ca.*, mc.nome as material_nome FROM componentes_amostra ca LEFT JOIN materiais_catalogo mc ON ca.material_id=mc.id WHERE ca.amostra_id=?', [id]);
            componentes = cr[0];
        } else {
            amostra = memStore.amostras.find(a => a.id === id);
            if (!amostra) return res.status(404).json({ error: 'Amostra não encontrada' });
            const forn = memStore.fornecedores.find(f => f.id === amostra.fornecedor_id);
            amostra = { ...amostra, fornecedor_nome: forn ? (forn.apelido || forn.nome || 'N/A') : 'N/A' };
            componentes = memStore.componentes_amostra
                .filter(c => c.amostra_id === id)
                .map(c => ({ ...c, material_nome: (memStore.materiais_catalogo.find(m => m.id === c.material_id) || {}).nome || 'N/A' }));
        }
        if (!amostra) return res.status(404).json({ error: 'Amostra não encontrada' });

        // Montar corpo do e-mail
        const tabelaComponentes = componentes.map(c =>
            `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${c.material_nome}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${parseFloat(c.peso).toLocaleString('pt-BR')} kg</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${parseFloat(c.percentual).toFixed(2)}%</td></tr>`
        ).join('');

        const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#0d2416;padding:20px;border-radius:8px 8px 0 0">
                <h1 style="color:#2AD07A;margin:0;font-size:20px">🔬 APEXTECH METAIS — Análise Laboratorial Concluída</h1>
                <p style="color:#aaa;margin:5px 0 0">O técnico concluiu a análise e encaminhou para decisão de compra.</p>
            </div>
            <div style="background:#fff;padding:20px;border:1px solid #ddd">
                <table style="width:100%;border-collapse:collapse;margin-bottom:15px">
                    <tr><td style="width:40%;color:#555;font-size:13px"><strong>Nº Amostra</strong></td><td style="color:#222">${amostra.numero_amostra}</td></tr>
                    <tr><td style="color:#555;font-size:13px"><strong>Fornecedor</strong></td><td style="color:#222">${amostra.fornecedor_nome}</td></tr>
                    <tr><td style="color:#555;font-size:13px"><strong>Peso Inicial</strong></td><td style="color:#222">${parseFloat(amostra.peso_inicial).toLocaleString('pt-BR')} kg</td></tr>
                    <tr><td style="color:#555;font-size:13px"><strong>Responsável</strong></td><td style="color:#222">${amostra.responsavel}</td></tr>
                    <tr><td style="color:#555;font-size:13px"><strong>Data</strong></td><td style="color:#222">${new Date(amostra.data).toLocaleDateString('pt-BR')}</td></tr>
                </table>
                <h3 style="color:#0d2416;border-bottom:2px solid #2AD07A;padding-bottom:5px">Composição Identificada</h3>
                <table style="width:100%;border-collapse:collapse">
                    <thead><tr style="background:#0d2416"><th style="padding:8px 10px;color:#2AD07A;text-align:left">Material</th><th style="padding:8px 10px;color:#2AD07A;text-align:right">Peso</th><th style="padding:8px 10px;color:#2AD07A;text-align:right">Rend.</th></tr></thead>
                    <tbody>${tabelaComponentes}</tbody>
                </table>
                ${amostra.parecer_tecnico ? `<div style="margin-top:15px;background:#f5fff8;border-left:4px solid #2AD07A;padding:10px"><strong>Parecer Técnico:</strong><p style="margin:5px 0 0">${amostra.parecer_tecnico}</p></div>` : ''}
                <div style="margin-top:20px;text-align:center">
                    <a href="http://localhost:3000/admin.html" style="background:#2AD07A;color:#0d2416;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">🔗 Acessar Sistema para Aprovar</a>
                </div>
            </div>
            <div style="background:#f5f5f5;padding:10px;text-align:center;font-size:11px;color:#999;border-radius:0 0 8px 8px">
                APEXTECH METAIS ERP — Mensagem automática. Não responda este e-mail.
            </div>
        </div>`;

        // Buscar destinatários (usar lista LME ou settings)
        let destinatarios = [];
        if (dbAvailable) {
            const dr = await pool.query('SELECT email FROM lme_destinatarios');
            destinatarios = dr[0].map(r => r.email);
        } else {
            destinatarios = (memStore.lme_destinatarios || []).map(d => d.email);
        }

        // Verificar se há configuração de e-mail
        const settingsObj = {};
        if (dbAvailable) {
            const sr = await pool.query('SELECT key, value FROM settings');
            sr[0].forEach(r => { settingsObj[r.key] = r.value; });
        } else {
            Object.assign(settingsObj, memStore.settings || {});
        }
        const resendKey = settingsObj.lme_resend_api_key || process.env.RESEND_API_KEY || null;


        if (!resendKey || destinatarios.length === 0) {
            // Sem e-mail configurado: apenas log
            console.log(`📧 [SEM CONFIG] E-mail de laudo para amostra ${amostra.numero_amostra} não enviado (sem chave Resend ou destinatários).`);
            return res.json({ success: true, enviado: false, motivo: 'Sem chave Resend ou destinatários cadastrados' });
        }

        // Enviar via Resend (padrão do sistema)
        const { Resend } = require('resend');
        const resend = new Resend(resendKey);
        const fromEmail = settingsObj.lme_resend_from || process.env.RESEND_FROM || 'laudo@apextechmetais.com.br';


        for (const dest of destinatarios) {
            await resend.emails.send({
                from: fromEmail,
                to: dest,
                subject: `[APEXTECH] Análise ${amostra.numero_amostra} — Aguardando Decisão de Compra`,
                html
            });
        }
        console.log(`📧 E-mail de laudo enviado para ${destinatarios.length} destinatário(s).`);
        res.json({ success: true, enviado: true, destinatarios });
    } catch (err) {
        console.error('Erro ao enviar e-mail de laudo:', err);
        res.json({ success: true, enviado: false, motivo: err.message });
    }
});

async function registrarAuditLog(usuario, acao, detalhe, amostraId = null, req = null) {
    try {
        const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1') : '127.0.0.1';
        const usr = usuario || 'Sistema';
        if (dbAvailable) {
            await pool.query(
                `INSERT INTO audit_logs (usuario, acao, detalhe, amostra_id, ip) VALUES (?, ?, ?, ?, ?)`,
                [usr, acao, detalhe || '', amostraId, ip]
            );
        } else {
            if (!memStore.audit_logs) memStore.audit_logs = [];
            memStore.audit_logs.push({
                id: (memStore.audit_logs.length + 1),
                usuario: usr,
                acao,
                detalhe: detalhe || '',
                amostra_id: amostraId,
                ip,
                criado_em: new Date().toISOString()
            });
        }
    } catch (err) {
        console.error('Erro ao registrar log de auditoria:', err);
    }
}

// ─── API: Cotações Internacionais em Tempo Real (USD / BRL & LME) ─────────────
app.get('/api/cotacoes/dolar-lme', async (req, res) => {
    try {
        let dolarVal = 5.60;
        let dolarPctChange = 0;
        try {
            const apiRes = await axios.get('https://economia.awesomeapi.com.br/last/USD-BRL', { timeout: 3000 });
            if (apiRes.data && apiRes.data.USDBRL) {
                dolarVal = parseFloat(apiRes.data.USDBRL.bid) || 5.60;
                dolarPctChange = parseFloat(apiRes.data.USDBRL.pctChange) || 0;
            }
        } catch (e) {
            console.warn('Usando fallback para cotação do dólar (5.60 BRL):', e.message);
        }

        // Cotações base LME ($/tonelada)
        const lmePrecosUsd = {
            cobre: 9450.00,
            aluminio: 2420.00,
            latão: 6800.00,
            niquel: 16200.00,
            chumbo: 2050.00,
            zinco: 2780.00
        };

        const lmePrecosBrlKg = {};
        for (const [k, v] of Object.entries(lmePrecosUsd)) {
            // Conversão: ($ / 1000kg) * Dólar = R$/kg
            lmePrecosBrlKg[k] = parseFloat(((v / 1000) * dolarVal).toFixed(2));
        }

        const variacaoAlta = Math.abs(dolarPctChange) >= 1.5;

        res.json({
            dolar: dolarVal,
            dolar_pct_change: dolarPctChange,
            variacao_alta: variacaoAlta,
            data: new Date().toISOString(),
            lme_usd_ton: lmePrecosUsd,
            lme_brl_kg: lmePrecosBrlKg
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Audit Logs ─────────────────────────────────────────────────────────
// Importando rota modularizada (Início da Fase 9)
const auditLogsRoute = require('./src/routes/auditLogs');
app.use('/api/audit-logs', auditLogsRoute(pool, dbAvailable, memStore));

// ─── API: Planejamento Mensal / Lotes Compra (CRUD + Motor Financeiro) ─────────
app.get('/api/planejamento-compras', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query(`
                SELECT lc.*, COALESCE(f.apelido, f.nome) as fornecedor_nome, mc.nome as material_nome, a.numero_amostra
                FROM lotes_compra lc
                LEFT JOIN fornecedores f ON lc.fornecedor_id = f.id
                LEFT JOIN materiais_catalogo mc ON lc.material_id = mc.id
                LEFT JOIN amostras a ON lc.amostra_id = a.id
                ORDER BY lc.id DESC
            `);
            return res.json(result[0]);
        }
        
        const data = memStore.lotes_compra.map(lc => {
            const f = memStore.fornecedores.find(x => x.id === lc.fornecedor_id);
            const mc = memStore.materiais_catalogo.find(x => x.id === lc.material_id);
            const a = memStore.amostras.find(x => x.id === lc.amostra_id);
            return {
                ...lc,
                fornecedor_nome: f ? (f.apelido || f.nome || f.nome_fantasia) : '',
                material_nome: mc ? mc.nome : '',
                numero_amostra: a ? a.numero_amostra : ''
            };
        });
        res.json(data);
    } catch (err) {
        console.error('Erro ao carregar planejamento:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/planejamento-compras', async (req, res) => {
    try {
        const { amostra_id, fornecedor_id, produto, peso_comprado, preco_compra, percentual_rendimento, material_id, preco_venda_material, comissao, fidc, mes, cliente, prazo_recebimento_dias, forma_pagamento, simulacoes_historico } = req.body;
        
        if (dbAvailable) {
            const result = await pool.query(
                `INSERT INTO lotes_compra (amostra_id, fornecedor_id, produto, peso_comprado, preco_compra, percentual_rendimento, material_id, preco_venda_material, comissao, fidc, mes, cliente, prazo_recebimento_dias, forma_pagamento, simulacoes_historico)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [amostra_id, fornecedor_id, produto, peso_comprado, preco_compra, percentual_rendimento, material_id, preco_venda_material, comissao || 2.0, fidc || 2.3, mes, cliente, prazo_recebimento_dias || 30, forma_pagamento, simulacoes_historico ? JSON.stringify(simulacoes_historico) : '[]']
            );
            
            if (amostra_id) {
                // Se vinculou a uma amostra, avança o status dela
                await pool.query("UPDATE amostras SET status = 'Aguardando Liberação PCP' WHERE id = ? AND status = 'Aguardando Precificação'", [amostra_id]);
            }
            return res.json(result[0][0]);
        } else {
            const newL = {
                id: nextId++,
                amostra_id: amostra_id ? parseInt(amostra_id) : null,
                fornecedor_id: parseInt(fornecedor_id),
                produto,
                peso_comprado: parseFloat(peso_comprado),
                preco_compra: parseFloat(preco_compra),
                percentual_rendimento: parseFloat(percentual_rendimento),
                material_id: parseInt(material_id),
                preco_venda_material: parseFloat(preco_venda_material),
                comissao: parseFloat(comissao || 2.0),
                fidc: parseFloat(fidc || 2.3),
                mes,
                cliente,
                prazo_recebimento_dias: parseInt(prazo_recebimento_dias || 30),
                forma_pagamento,
                simulacoes_historico: simulacoes_historico || []
            };
            memStore.lotes_compra.push(newL);

            if (amostra_id) {
                const a = memStore.amostras.find(x => x.id === parseInt(amostra_id));
                if (a && a.status === 'Aguardando Precificação') {
                    a.status = 'Aguardando Liberação PCP';
                }
            }
            return res.json(newL);
        }
    } catch (err) {
        res.status(500).json({ error: 'Erro ao salvar planejamento.' });
    }
});

// ─── API: Planejamento de Compras (Trading Comercial & Insumos da Indústria) ─
app.get('/api/planejamento/compras', async (req, res) => {
    try {
        const { tipo } = req.query;
        if (!dbAvailable) {
            let list = (memStore.planejamento_compras || []).map(p => {
                const mc = (memStore.materiais_catalogo || []).find(m => m.id == p.material_id);
                const f = (memStore.fornecedores || []).find(x => x.id == p.fornecedor_id);
                return {
                    ...p,
                    tipo_planejamento: p.tipo_planejamento || 'COMPRA_VENDA',
                    material_nome: mc ? mc.nome : 'Material',
                    fornecedor_nome: f ? (f.apelido || f.nome) : 'Fornecedor'
                };
            });
            if (tipo) {
                list = list.filter(x => x.tipo_planejamento === tipo);
            }
            return res.json(list.sort((a, b) => b.id - a.id));
        }

        let query = `
            SELECT pc.*, mc.nome as material_nome, COALESCE(f.apelido, f.nome) as fornecedor_nome
            FROM planejamento_compras pc
            LEFT JOIN materiais_catalogo mc ON pc.material_id = mc.id
            LEFT JOIN fornecedores f ON pc.fornecedor_id = f.id
        `;
        const params = [];
        if (tipo) {
            query += ` WHERE pc.tipo_planejamento = ? `;
            params.push(tipo);
        }
        query += ` ORDER BY pc.id DESC `;

        const r = await pool.query(query, params);
        res.json(r[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/planejamento/compras', async (req, res) => {
    try {
        const { tipo_planejamento, material_id, fornecedor_id, quantidade_necessaria, quantidade_realizada_kg, ponto_pedido_kg, lead_time_dias, preco_estimado, mes_referencia, status, observacoes } = req.body;
        const tipoFinal = tipo_planejamento || 'COMPRA_VENDA';
        const qty = parseFloat(quantidade_necessaria || 0);
        const qtyReal = parseFloat(quantidade_realizada_kg || 0);
        const prc = parseFloat(preco_estimado || 0);
        const custoTotalEst = qty * prc;
        const custoTotalReal = qtyReal * prc;

        if (!dbAvailable) {
            if (!memStore.planejamento_compras) memStore.planejamento_compras = [];
            const item = {
                id: nextId++,
                tipo_planejamento: tipoFinal,
                material_id: material_id ? parseInt(material_id) : null,
                fornecedor_id: fornecedor_id ? parseInt(fornecedor_id) : null,
                quantidade_necessaria: qty,
                quantidade_realizada_kg: qtyReal,
                ponto_pedido_kg: parseFloat(ponto_pedido_kg || 0),
                lead_time_dias: parseInt(lead_time_dias || 7),
                preco_estimado: prc,
                custo_total_estimado: custoTotalEst,
                custo_total_realizado: custoTotalReal,
                mes_referencia: mes_referencia || new Date().toISOString().slice(0, 7),
                status: status || 'Sugerido',
                observacoes: observacoes || '',
                criado_em: new Date().toISOString()
            };
            memStore.planejamento_compras.push(item);
            return res.json(item);
        }

        const r = await pool.query(`
            INSERT INTO planejamento_compras (tipo_planejamento, material_id, fornecedor_id, quantidade_necessaria, quantidade_realizada_kg, ponto_pedido_kg, lead_time_dias, preco_estimado, custo_total_estimado, custo_total_realizado, mes_referencia, status, observacoes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            tipoFinal,
            material_id ? parseInt(material_id) : null,
            fornecedor_id ? parseInt(fornecedor_id) : null,
            qty,
            qtyReal,
            parseFloat(ponto_pedido_kg || 0),
            parseInt(lead_time_dias || 7),
            prc,
            custoTotalEst,
            custoTotalReal,
            mes_referencia || new Date().toISOString().slice(0, 7),
            status || 'Sugerido',
            observacoes || ''
        ]);

        res.json(r[0][0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/planejamento/compras/:id/realizado', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { quantidade_realizada_kg, custo_total_realizado, status } = req.body;

        if (!dbAvailable) {
            const item = (memStore.planejamento_compras || []).find(x => x.id === id);
            if (!item) return res.status(404).json({ error: 'Planejamento não encontrado' });
            if (quantidade_realizada_kg !== undefined) item.quantidade_realizada_kg = parseFloat(quantidade_realizada_kg);
            if (custo_total_realizado !== undefined) item.custo_total_realizado = parseFloat(custo_total_realizado);
            if (status) item.status = status;
            return res.json(item);
        }

        const r = await pool.query(`
            UPDATE planejamento_compras SET
                quantidade_realizada_kg = COALESCE(?, quantidade_realizada_kg),
                custo_total_realizado = COALESCE(?, custo_total_realizado),
                status = COALESCE(?, status)
            WHERE id = ?
        `, [
            quantidade_realizada_kg !== undefined ? parseFloat(quantidade_realizada_kg) : null,
            custo_total_realizado !== undefined ? parseFloat(custo_total_realizado) : null,
            status || null,
            id
        ]);

        res.json(r[0][0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/planejamento/compras/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!dbAvailable) {
            memStore.planejamento_compras = (memStore.planejamento_compras || []).filter(x => x.id !== id);
            return res.json({ success: true });
        }
        await pool.query('DELETE FROM planejamento_compras WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Planejamento de Produção & Explosão de Insumos ─────────────────────
// ─── API: Planejamento de Produção & Insumos (Simulador) ───────────────────

// GET - listar todos os planejamentos com linhas e métricas agregadas
app.get('/api/planejamento/producao-insumos', async (req, res) => {
    let useDb = dbAvailable && pool;
    try {
        if (useDb) {
            const [plRows] = await pool.query('SELECT * FROM planejamento_producao_insumos ORDER BY id DESC');
            const result = await Promise.all(plRows.map(async p => {
                const [linhaRows] = await pool.query(
                    'SELECT * FROM planejamento_producao_linhas WHERE planejamento_id=? ORDER BY id', [p.id]);
                const lWithMovs = await Promise.all(linhaRows.map(async l => {
                    const [movRows] = await pool.query(
                        'SELECT * FROM planejamento_producao_movimentacoes WHERE linha_id=? ORDER BY data_movimentacao', [l.id]);
                    return { ...l, movimentacoes: movRows };
                }));
                return { ...p, linhas: lWithMovs };
            }));
            return res.json(result);
        }
    } catch (err) {
        console.warn('⚠️ Erro de banco no GET producao-insumos. Acionando fallback local:', err.message);
        dbAvailable = false;
    }

    const pl = memStore.planejamento_producao_insumos || [];
    const linhas = memStore.planejamento_producao_linhas || [];
    const movs = memStore.planejamento_producao_movimentacoes || [];
    res.json(pl.map(p => ({
        ...p,
        linhas: linhas.filter(l => l.planejamento_id === p.id).map(l => ({
            ...l,
            movimentacoes: movs.filter(m => m.linha_id === l.id)
        }))
    })));
});

// POST - criar novo planejamento com N linhas de insumos
app.post('/api/planejamento/producao-insumos', async (req, res) => {
    const {
        periodo, produto_id, produto_nome,
        meta_faturamento_rs, preco_venda_produto_rs,
        qtd_produto_necessaria, custo_total_projetado_rs, margem_projetada_pct,
        prazo_compra_ate, prazo_venda_ate, status,
        linhas
    } = req.body;

    let useDb = dbAvailable && pool;
    try {
        if (useDb) {
            const r = await pool.query(`
                INSERT INTO planejamento_producao_insumos
                (periodo, produto_id, produto_nome, meta_faturamento_rs, preco_venda_produto_rs,
                 qtd_produto_necessaria, custo_total_projetado_rs, margem_projetada_pct,
                 prazo_compra_ate, prazo_venda_ate, status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
            `, [
                periodo||new Date().toISOString().slice(0,7),
                produto_id ? parseInt(produto_id) : null, produto_nome||'',
                parseFloat(meta_faturamento_rs||0), parseFloat(preco_venda_produto_rs||0),
                parseFloat(qtd_produto_necessaria||0), parseFloat(custo_total_projetado_rs||0),
                parseFloat(margem_projetada_pct||0),
                prazo_compra_ate||null, prazo_venda_ate||null, status||'Ativo'
            ]);
            const planejamento = r[0][0];

            const linhasResult = [];
            if (Array.isArray(linhas)) {
                for (const l of linhas) {
                    const lr = await pool.query(`
                        INSERT INTO planejamento_producao_linhas
                        (planejamento_id, insumo_produto_id, insumo_nome, coeficiente_pct,
                         qtd_necessaria, preco_compra_tabela, preco_compra_simulado, preco_venda_tabela, custo_total_insumo)
                        VALUES (?,?,?,?,?,?,?,?,?)
                    `, [
                        planejamento.id,
                        l.insumo_produto_id ? parseInt(l.insumo_produto_id) : null,
                        l.insumo_nome||'', parseFloat(l.coeficiente_pct||100),
                        parseFloat(l.qtd_necessaria||0), parseFloat(l.preco_compra_tabela||0),
                        parseFloat(l.preco_compra_simulado||0), parseFloat(l.preco_venda_tabela||0),
                        parseFloat(l.custo_total_insumo||0)
                    ]);
                    linhasResult.push({ ...lr[0][0], movimentacoes: [] });
                }
            }
            return res.json({ ...planejamento, linhas: linhasResult });
        }
    } catch (err) {
        console.warn('⚠️ Erro de banco no POST producao-insumos. Acionando fallback local:', err.message);
        dbAvailable = false;
    }

    if (!memStore.planejamento_producao_insumos) memStore.planejamento_producao_insumos = [];
    if (!memStore.planejamento_producao_linhas) memStore.planejamento_producao_linhas = [];
    const pid = nextId++;
    const item = {
        id: pid, periodo: periodo || new Date().toISOString().slice(0,7),
        produto_id: produto_id ? parseInt(produto_id) : null, produto_nome: produto_nome || '',
        meta_faturamento_rs: parseFloat(meta_faturamento_rs||0),
        preco_venda_produto_rs: parseFloat(preco_venda_produto_rs||0),
        qtd_produto_necessaria: parseFloat(qtd_produto_necessaria||0),
        custo_total_projetado_rs: parseFloat(custo_total_projetado_rs||0),
        margem_projetada_pct: parseFloat(margem_projetada_pct||0),
        prazo_compra_ate: prazo_compra_ate||null, prazo_venda_ate: prazo_venda_ate||null,
        status: status||'Ativo', criado_em: new Date().toISOString(), linhas: []
    };
    memStore.planejamento_producao_insumos.push(item);
    if (Array.isArray(linhas)) {
        linhas.forEach(l => {
            const lid = nextId++;
            const linha = {
                id: lid, planejamento_id: pid,
                insumo_produto_id: l.insumo_produto_id ? parseInt(l.insumo_produto_id) : null,
                insumo_nome: l.insumo_nome||'', coeficiente_pct: parseFloat(l.coeficiente_pct||100),
                qtd_necessaria: parseFloat(l.qtd_necessaria||0),
                preco_compra_tabela: parseFloat(l.preco_compra_tabela||0),
                preco_compra_simulado: parseFloat(l.preco_compra_simulado||0),
                preco_venda_tabela: parseFloat(l.preco_venda_tabela||0),
                custo_total_insumo: parseFloat(l.custo_total_insumo||0),
                movimentacoes: []
            };
            memStore.planejamento_producao_linhas.push(linha);
            item.linhas.push(linha);
        });
    }
    res.json(item);
});

// POST - registrar movimentação (compra ou venda) em uma linha de insumo
app.post('/api/planejamento/producao-insumos/:planId/linhas/:linhaId/movimentacao', async (req, res) => {
    const planId = parseInt(req.params.planId);
    const linhaId = parseInt(req.params.linhaId);
    const { tipo, quantidade, preco_unitario, data_movimentacao, obs } = req.body;
    const valorTotal = parseFloat(quantidade||0) * parseFloat(preco_unitario||0);
    const datamov = data_movimentacao || new Date().toISOString().slice(0,10);

    let useDb = dbAvailable && pool;
    try {
        if (useDb) {
            const r = await pool.query(`
                INSERT INTO planejamento_producao_movimentacoes
                (linha_id, planejamento_id, tipo, quantidade, preco_unitario, valor_total, data_movimentacao, obs)
                VALUES (?,?,?,?,?,?,?,?)
            `, [linhaId, planId, tipo.toUpperCase(), parseFloat(quantidade||0),
                parseFloat(preco_unitario||0), valorTotal, datamov, obs||'']);
            return res.json(r[0][0]);
        }
    } catch (err) {
        console.warn('⚠️ Erro de banco no POST movimentacao. Acionando fallback local:', err.message);
        dbAvailable = false;
    }

    if (!memStore.planejamento_producao_movimentacoes) memStore.planejamento_producao_movimentacoes = [];
    const mov = {
        id: nextId++, linha_id: linhaId, planejamento_id: planId,
        tipo: tipo.toUpperCase(), quantidade: parseFloat(quantidade||0),
        preco_unitario: parseFloat(preco_unitario||0), valor_total: valorTotal,
        data_movimentacao: datamov, obs: obs||'', criado_em: new Date().toISOString()
    };
    memStore.planejamento_producao_movimentacoes.push(mov);
    res.json(mov);
});

// DELETE movimentação
app.delete('/api/planejamento/producao-insumos/:planId/linhas/:linhaId/movimentacao/:movId', async (req, res) => {
    try {
        const movId = parseInt(req.params.movId);
        if (!dbAvailable) {
            memStore.planejamento_producao_movimentacoes = (memStore.planejamento_producao_movimentacoes||[]).filter(m => m.id !== movId);
            return res.json({ success: true });
        }
        await pool.query('DELETE FROM planejamento_producao_movimentacoes WHERE id=?', [movId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE planejamento (cascata remove linhas e movimentações)
app.delete('/api/planejamento/producao-insumos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!dbAvailable) {
            const linhas = (memStore.planejamento_producao_linhas||[]).filter(l => l.planejamento_id === id).map(l => l.id);
            memStore.planejamento_producao_movimentacoes = (memStore.planejamento_producao_movimentacoes||[]).filter(m => !linhas.includes(m.linha_id));
            memStore.planejamento_producao_linhas = (memStore.planejamento_producao_linhas||[]).filter(l => l.planejamento_id !== id);
            memStore.planejamento_producao_insumos = (memStore.planejamento_producao_insumos||[]).filter(x => x.id !== id);
            return res.json({ success: true });
        }
        await pool.query('DELETE FROM planejamento_producao_insumos WHERE id=?', [id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// ─── API: Planejamento Estratégico ──────────────────────────────────────────
app.get('/api/planejamento-estrategico', async (req, res) => {
    let useDb = dbAvailable && pool;
    try {
        if (useDb) {
            const queryStr = `
                SELECT pe.*,
                       mc.nome as material_nome,
                       mc.categoria as material_categoria,
                       tp.preco_entregar as preco_compra,
                       tp.preco_coletar as preco_compra_coletar,
                       tp.venda_ref as preco_venda,
                       tp.comissao,
                       tp.pis_cofins,
                       tp.fidc,
                       tp.icms,
                       tp.frete_coleta
                FROM planejamento_estrategico pe
                JOIN materiais_catalogo mc ON pe.material_id = mc.id
                LEFT JOIN tabela_precos tp ON pe.material_id = tp.material_id
                ORDER BY pe.mes DESC, mc.nome ASC
            `;
            const result = await pool.query(queryStr);
            return res.json(result[0]);
        }
    } catch (err) {
        console.warn('⚠️ Erro de banco no GET planejamento-estrategico, usando memStore:', err.message);
        dbAvailable = false;
    }

    const list = memStore.planejamento_estrategico || [];
    const enriched = list.map(pe => {
        const mc = (memStore.materiais_catalogo || []).find(x => x.id === pe.material_id);
        const tp = (memStore.tabela_precos || []).find(x => x.material_id === pe.material_id) || {};
        return {
            ...pe,
            material_nome: mc ? mc.nome : 'Material desconhecido',
            material_categoria: mc ? mc.categoria : 'Outros',
            preco_compra: tp.preco_entregar || 0,
            preco_compra_coletar: tp.preco_coletar || 0,
            preco_venda: tp.venda_ref || 0,
            comissao: tp.comissao || 0,
            pis_cofins: tp.pis_cofins || 0,
            fidc: tp.fidc || 0,
            icms: tp.icms || 0,
            frete_coleta: tp.frete_coleta || 0
        };
    });
    res.json(enriched);
});

app.post('/api/planejamento-estrategico', async (req, res) => {
    const { 
        mes, 
        material_id, 
        qtd_conservador, 
        qtd_moderado, 
        qtd_agressivo, 
        qtd_realizado,
        margem_alvo,
        valor_compra_realizado,
        valor_venda_realizado
    } = req.body;
    const matId = parseInt(material_id);
    const qCons = parseFloat(qtd_conservador || 0);
    const qMod = parseFloat(qtd_moderado || 0);
    const qAgr = parseFloat(qtd_agressivo || 0);
    const qReal = parseFloat(qtd_realizado || 0);
    const mAlvo = margem_alvo !== undefined && margem_alvo !== null && margem_alvo !== '' ? parseFloat(margem_alvo) : null;
    const valCompraReal = parseFloat(valor_compra_realizado || 0);
    const valVendaReal = parseFloat(valor_venda_realizado || 0);
    const mesStr = mes || new Date().toISOString().slice(0, 7);

    let useDb = dbAvailable && pool;
    try {
        if (useDb) {
            const queryStr = `
                INSERT INTO planejamento_estrategico (
                    mes, material_id, qtd_conservador, qtd_moderado, qtd_agressivo, qtd_realizado, 
                    margem_alvo, valor_compra_realizado, valor_venda_realizado
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (mes, material_id) DO UPDATE
                SET qtd_conservador = EXCLUDED.qtd_conservador,
                    qtd_moderado = EXCLUDED.qtd_moderado,
                    qtd_agressivo = EXCLUDED.qtd_agressivo,
                    qtd_realizado = EXCLUDED.qtd_realizado,
                    margem_alvo = EXCLUDED.margem_alvo,
                    valor_compra_realizado = EXCLUDED.valor_compra_realizado,
                    valor_venda_realizado = EXCLUDED.valor_venda_realizado
            `;
            const r = await pool.query(queryStr, [mesStr, matId, qCons, qMod, qAgr, qReal, mAlvo, valCompraReal, valVendaReal]);
            return res.json(r[0][0]);
        }
    } catch (err) {
        console.warn('⚠️ Erro de banco no POST planejamento-estrategico, usando memStore:', err.message);
        dbAvailable = false;
    }

    if (!memStore.planejamento_estrategico) memStore.planejamento_estrategico = [];
    const idx = memStore.planejamento_estrategico.findIndex(x => x.mes === mesStr && x.material_id === matId);
    const item = {
        id: idx >= 0 ? memStore.planejamento_estrategico[idx].id : nextId++,
        mes: mesStr,
        material_id: matId,
        qtd_conservador: qCons,
        qtd_moderado: qMod,
        qtd_agressivo: qAgr,
        qtd_realizado: qReal,
        margem_alvo: mAlvo,
        valor_compra_realizado: valCompraReal,
        valor_venda_realizado: valVendaReal,
        criado_em: new Date().toISOString()
    };
    if (idx >= 0) {
        memStore.planejamento_estrategico[idx] = item;
    } else {
        memStore.planejamento_estrategico.push(item);
    }
    res.json(item);
});

app.delete('/api/planejamento-estrategico/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    let useDb = dbAvailable && pool;
    try {
        if (useDb) {
            await pool.query('DELETE FROM planejamento_estrategico WHERE id = ?', [id]);
            return res.json({ success: true });
        }
    } catch (err) {
        console.warn('⚠️ Erro de banco no DELETE planejamento-estrategico, usando memStore:', err.message);
        dbAvailable = false;
    }

    memStore.planejamento_estrategico = (memStore.planejamento_estrategico || []).filter(x => x.id !== id);
    res.json({ success: true });
});


// ─── API: Planejamento Estratégico V3 (Teste Meta Faturamento -> Insumo) ─────
app.get('/api/planejamento-estrategicov3', async (req, res) => {
    let useDb = dbAvailable && pool;
    try {
        if (useDb) {
            const queryStr = `
                SELECT pe.*,
                       mc.nome as material_nome,
                       mc.categoria as material_categoria,
                       tp.preco_entregar as preco_compra_entregar,
                       tp.preco_coletar as preco_compra_coletar,
                       tp.venda_ref as preco_venda,
                       tp.comissao,
                       tp.pis_cofins,
                       tp.fidc,
                       tp.icms,
                       tp.frete_coleta
                FROM planejamento_estrategicov3 pe
                JOIN materiais_catalogo mc ON pe.material_id = mc.id
                LEFT JOIN tabela_precos tp ON pe.material_id = tp.material_id
                ORDER BY pe.mes DESC, mc.nome ASC
            `;
            const result = await pool.query(queryStr);
            return res.json(result[0]);
        }
    } catch (err) {
        console.warn('⚠️ Erro de banco no GET planejamento-estrategicov3, usando memStore:', err.message);
        dbAvailable = false;
    }

    const list = memStore.planejamento_estrategicov3 || [];
    const enriched = list.map(pe => {
        const mc = (memStore.materiais_catalogo || []).find(x => x.id === pe.material_id);
        const tp = (memStore.tabela_precos || []).find(x => x.material_id === pe.material_id) || {};
        return {
            ...pe,
            material_nome: mc ? mc.nome : 'Material desconhecido',
            material_categoria: mc ? mc.categoria : 'Outros',
            preco_compra_entregar: tp.preco_entregar || 0,
            preco_compra_coletar: tp.preco_coletar || 0,
            preco_venda: tp.venda_ref || 0,
            comissao: tp.comissao || 0,
            pis_cofins: tp.pis_cofins || 0,
            fidc: tp.fidc || 0,
            icms: tp.icms || 0,
            frete_coleta: tp.frete_coleta || 0
        };
    });
    res.json(enriched);
});

app.post('/api/planejamento-estrategicov3', async (req, res) => {
    const { 
        mes, 
        material_id, 
        meta_faturamento, 
        margem_desejada, 
        operacao, 
        qtd_realizado,
        valor_venda_realizado
    } = req.body;
    const matId = parseInt(material_id);
    const mFat = parseFloat(meta_faturamento || 0);
    const mMargem = parseFloat(margem_desejada || 0);
    const op = operacao || 'entrega';
    const qReal = parseFloat(qtd_realizado || 0);
    const valVendaReal = parseFloat(valor_venda_realizado || 0);
    const mesStr = mes || new Date().toISOString().slice(0, 7);

    let useDb = dbAvailable && pool;
    try {
        if (useDb) {
            const queryStr = `
                INSERT INTO planejamento_estrategicov3 (
                    mes, material_id, meta_faturamento, margem_desejada, operacao, qtd_realizado, valor_venda_realizado
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (mes, material_id) DO UPDATE
                SET meta_faturamento = EXCLUDED.meta_faturamento,
                    margem_desejada = EXCLUDED.margem_desejada,
                    operacao = EXCLUDED.operacao,
                    qtd_realizado = EXCLUDED.qtd_realizado,
                    valor_venda_realizado = EXCLUDED.valor_venda_realizado
            `;
            const r = await pool.query(queryStr, [mesStr, matId, mFat, mMargem, op, qReal, valVendaReal]);
            return res.json(r[0][0]);
        }
    } catch (err) {
        console.warn('⚠️ Erro de banco no POST planejamento-estrategicov3, usando memStore:', err.message);
        dbAvailable = false;
    }

    if (!memStore.planejamento_estrategicov3) memStore.planejamento_estrategicov3 = [];
    const idx = memStore.planejamento_estrategicov3.findIndex(x => x.mes === mesStr && x.material_id === matId);
    const item = {
        id: idx >= 0 ? memStore.planejamento_estrategicov3[idx].id : nextId++,
        mes: mesStr,
        material_id: matId,
        meta_faturamento: mFat,
        margem_desejada: mMargem,
        operacao: op,
        qtd_realizado: qReal,
        valor_venda_realizado: valVendaReal,
        criado_em: new Date().toISOString()
    };
    if (idx >= 0) {
        memStore.planejamento_estrategicov3[idx] = item;
    } else {
        memStore.planejamento_estrategicov3.push(item);
    }
    res.json(item);
});

app.delete('/api/planejamento-estrategicov3/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    let useDb = dbAvailable && pool;
    try {
        if (useDb) {
            await pool.query('DELETE FROM planejamento_estrategicov3 WHERE id = ?', [id]);
            return res.json({ success: true });
        }
    } catch (err) {
        console.warn('⚠️ Erro de banco no DELETE planejamento-estrategicov3, usando memStore:', err.message);
        dbAvailable = false;
    }

    memStore.planejamento_estrategicov3 = (memStore.planejamento_estrategicov3 || []).filter(x => x.id !== id);
    res.json({ success: true });
});

// ─── API: Planejamento Estratégico V3 (Planos e Mix) ─────────────────
app.get('/api/estrategiav3_planos', async (req, res) => {
    try {
        if (!dbAvailable || !pool) throw new Error('DB not available');
        const [planosRes] = await pool.query('SELECT * FROM estrategiav3_planos ORDER BY id DESC');
        const planos = planosRes;
        const [mixRes] = await pool.query('SELECT * FROM estrategiav3_mix');
        const mix = mixRes;

        const resultado = planos.map(p => {
            return {
                ...p,
                itens: mix.filter(m => m.plano_id === p.id)
            };
        });
        res.json({ success: true, planos: resultado });
    } catch (err) {
        console.warn('⚠️ Erro GET estrategiav3_planos', err.message);
        res.status(500).json({ error: 'Erro ao buscar planos' });
    }
});

app.post('/api/estrategiav3_planos', async (req, res) => {
    const { titulo, data_inicial, data_final, frente, meta_faturamento, mix, cenario_conservador_pct, cenario_moderado_pct, cenario_agressivo_pct } = req.body;
    try {
        if (!dbAvailable || !pool) throw new Error('DB not available');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const planoRes = await client.query(`
                INSERT INTO estrategiav3_planos (titulo, data_inicial, data_final, frente, meta_faturamento, cenario_conservador_pct, cenario_moderado_pct, cenario_agressivo_pct)
                VALUES (?, ?, ?, ?, ?, COALESCE(?, 80), COALESCE(?, 100), COALESCE(?, 120))
            `, [titulo, data_inicial, data_final, frente, meta_faturamento, cenario_conservador_pct, cenario_moderado_pct, cenario_agressivo_pct]);
            const planoId = planoRes[0].insertId;

            for (let item of mix) {
                await client.query(`
                    INSERT INTO estrategiav3_mix (plano_id, material_id, fracao_pct, volume_necessario, faturamento_alvo, investimento_necessario)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [planoId, item.material_id, item.fracao_pct, item.volume_necessario, item.faturamento_alvo, item.investimento_necessario]);
            }
            await client.query('COMMIT');
            res.json({ success: true, plano_id: planoId });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('⚠️ Erro POST estrategiav3_planos', err);
        res.status(500).json({ error: 'Erro ao salvar plano estratégico' });
    }
});

app.delete('/api/estrategiav3_planos/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        if (!dbAvailable || !pool) throw new Error('DB not available');
        await pool.query('DELETE FROM estrategiav3_planos WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('⚠️ Erro DELETE estrategiav3_planos', err);
        res.status(500).json({ error: 'Erro ao excluir plano' });
    }
});

app.put('/api/estrategiav3_planos/:id/status', async (req, res) => {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    try {
        if (!dbAvailable || !pool) throw new Error('DB not available');
        await pool.query('UPDATE estrategiav3_planos SET status = ? WHERE id = ?', [status, id]);
        res.json({ success: true });
    } catch (err) {
        console.error('⚠️ Erro PUT STATUS', err);
        res.status(500).json({ error: 'Erro ao atualizar status' });
    }
});

app.put('/api/estrategiav3_planos/:id/resultado_real', async (req, res) => {
    const id = parseInt(req.params.id);
    const { faturamento_realizado, investimento_realizado, volume_realizado, observacoes } = req.body;
    try {
        if (!dbAvailable || !pool) throw new Error('DB not available');
        await pool.query(`
            UPDATE estrategiav3_planos 
            SET faturamento_realizado = ?, 
                investimento_realizado = ?, 
                volume_realizado = ?, 
                observacoes = ?,
                status = 'CONCLUIDO'
            WHERE id = ?
        `, [faturamento_realizado, investimento_realizado, volume_realizado, observacoes, id]);
        res.json({ success: true });
    } catch (err) {
        console.error('⚠️ Erro PUT resultado_real', err);
        res.status(500).json({ error: 'Erro ao salvar resultado real' });
    }
});

app.put('/api/estrategiav3_mix/:id/realizado', async (req, res) => {
    const id = parseInt(req.params.id);
    const { faturamento_realizado } = req.body;
    try {
        if (!dbAvailable || !pool) throw new Error('DB not available');
        await pool.query(`
            UPDATE estrategiav3_mix SET faturamento_realizado = ? WHERE id = ?
        `, [faturamento_realizado, id]);
        res.json({ success: true });
    } catch (err) {
        console.error('⚠️ Erro PUT estrategiav3_mix', err);
        res.status(500).json({ error: 'Erro ao atualizar realizado' });
    }
});


// ─── API: Planejamento Comercial (Compra e Venda / Revenda) ─────────────────
app.get('/api/planejamento/comercial-revenda', async (req, res) => {
    try {
        if (!dbAvailable) {
            const metas = memStore.planejamento_comercial_revenda || [];
            const trans = memStore.planejamento_comercial_transacoes || [];
            return res.json(metas.map(m => {
                const mt = trans.filter(t => t.planejamento_id === m.id);
                const compras = mt.filter(t => t.tipo === 'COMPRA');
                const vendas  = mt.filter(t => t.tipo === 'VENDA');
                const totalCompraKg = compras.reduce((s, t) => s + parseFloat(t.quantidade_kg), 0);
                const totalVendaKg  = vendas.reduce((s, t) => s + parseFloat(t.quantidade_kg), 0);
                const totalCompraRs = compras.reduce((s, t) => s + parseFloat(t.valor_total), 0);
                const totalVendaRs  = vendas.reduce((s, t) => s + parseFloat(t.valor_total), 0);
                return { ...m, totalCompraKg, totalVendaKg, totalCompraRs, totalVendaRs,
                    mediaPrecoCompra: totalCompraKg > 0 ? totalCompraRs / totalCompraKg : 0,
                    mediaPrecoVenda:  totalVendaKg  > 0 ? totalVendaRs  / totalVendaKg  : 0 };
            }));
        }
        const r = await pool.query(`
            SELECT p.*,
                COALESCE(c.total_kg, 0) AS totalCompraKg,
                COALESCE(c.total_rs, 0) AS totalCompraRs,
                COALESCE(v.total_kg, 0) AS totalVendaKg,
                COALESCE(v.total_rs, 0) AS totalVendaRs,
                CASE WHEN COALESCE(c.total_kg,0) > 0 THEN COALESCE(c.total_rs,0)/COALESCE(c.total_kg,1) ELSE 0 END AS "mediaPrecoCompra",
                CASE WHEN COALESCE(v.total_kg,0) > 0 THEN COALESCE(v.total_rs,0)/COALESCE(v.total_kg,1) ELSE 0 END AS "mediaPrecoVenda"
            FROM planejamento_comercial_revenda p
            LEFT JOIN (SELECT planejamento_id, SUM(quantidade_kg) AS total_kg, SUM(valor_total) AS total_rs FROM planejamento_comercial_transacoes WHERE tipo='COMPRA' GROUP BY planejamento_id) c ON c.planejamento_id = p.id
            LEFT JOIN (SELECT planejamento_id, SUM(quantidade_kg) AS total_kg, SUM(valor_total) AS total_rs FROM planejamento_comercial_transacoes WHERE tipo='VENDA'  GROUP BY planejamento_id) v ON v.planejamento_id = p.id
            ORDER BY p.id DESC
        `);
        res.json(r[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET extrato de transações de uma meta
app.get('/api/planejamento/comercial-revenda/:id/transacoes', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!dbAvailable) {
            const trans = (memStore.planejamento_comercial_transacoes || []).filter(t => t.planejamento_id === id);
            return res.json(trans);
        }
        const r = await pool.query('SELECT * FROM planejamento_comercial_transacoes WHERE planejamento_id=? ORDER BY data_transacao ASC, id ASC', [id]);
        res.json(r[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST nova transação (compra ou venda fracionada)
app.post('/api/planejamento/comercial-transacao', async (req, res) => {
    try {
        const { planejamento_id, tipo, quantidade_kg, preco_unitario, data_transacao, observacoes } = req.body;
        const pid = parseInt(planejamento_id);
        const qtd = parseFloat(quantidade_kg || 0);
        const preco = parseFloat(preco_unitario || 0);
        const total = qtd * preco;
        const dataStr = data_transacao || new Date().toISOString().slice(0,10);
        if (!dbAvailable) {
            if (!memStore.planejamento_comercial_transacoes) memStore.planejamento_comercial_transacoes = [];
            const item = { id: nextId++, planejamento_id: pid, tipo: tipo.toUpperCase(), quantidade_kg: qtd, preco_unitario: preco, valor_total: total, data_transacao: dataStr, observacoes: observacoes||'', criado_em: new Date().toISOString() };
            memStore.planejamento_comercial_transacoes.push(item);
            return res.json(item);
        }
        const r = await pool.query(
            `INSERT INTO planejamento_comercial_transacoes (planejamento_id,tipo,quantidade_kg,preco_unitario,valor_total,data_transacao,observacoes) VALUES(?,?,?,?,?,?,?)`,
            [pid, tipo.toUpperCase(), qtd, preco, total, dataStr, observacoes||'']
        );
        res.json(r[0][0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE transação
app.delete('/api/planejamento/comercial-transacao/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!dbAvailable) {
            memStore.planejamento_comercial_transacoes = (memStore.planejamento_comercial_transacoes||[]).filter(t => t.id !== id);
            return res.json({ success: true });
        }
        await pool.query('DELETE FROM planejamento_comercial_transacoes WHERE id=?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/planejamento/comercial-revenda', async (req, res) => {
    try {
        const {
            mes_referencia, produto_id, produto_nome, compra_planejada_kg, venda_planejada_kg,
            investimento_planejado_rs, faturamento_previsto_rs, compra_realizada_kg,
            venda_realizada_rs, status, observacoes,
            preco_compra_estimado, preco_venda_estimado,
            preco_compra_realizado, preco_venda_realizado, venda_realizada_kg,
            prazo_compra_ate, prazo_venda_ate
        } = req.body;

        const fatPrev = parseFloat(faturamento_previsto_rs || 0);
        const metaGlobal = 5000000.00;
        const partPct = (fatPrev / metaGlobal) * 100;

        if (!dbAvailable) {
            if (!memStore.planejamento_comercial_revenda) memStore.planejamento_comercial_revenda = [];
            const item = {
                id: nextId++,
                mes_referencia: mes_referencia || new Date().toISOString().slice(0, 7),
                produto_id: parseInt(produto_id),
                produto_nome: produto_nome || 'Produto Comercial',
                compra_planejada_kg: parseFloat(compra_planejada_kg || 0),
                venda_planejada_kg: parseFloat(venda_planejada_kg || 0),
                investimento_planejado_rs: parseFloat(investimento_planejado_rs || 0),
                faturamento_previsto_rs: fatPrev,
                compra_realizada_kg: parseFloat(compra_realizada_kg || 0),
                venda_realizada_rs: parseFloat(venda_realizada_rs || 0),
                participacao_meta_pct: parseFloat(partPct.toFixed(2)),
                status: status || 'Em Cotação',
                observacoes: observacoes || '',
                criado_em: new Date().toISOString(),
                preco_compra_estimado: parseFloat(preco_compra_estimado || 0),
                preco_venda_estimado: parseFloat(preco_venda_estimado || 0),
                preco_compra_realizado: parseFloat(preco_compra_realizado || 0),
                preco_venda_realizado: parseFloat(preco_venda_realizado || 0),
                venda_realizada_kg: parseFloat(venda_realizada_kg || 0),
                prazo_compra_ate: prazo_compra_ate || null,
                prazo_venda_ate: prazo_venda_ate || null
            };
            memStore.planejamento_comercial_revenda.push(item);
            return res.json(item);
        }

        const r = await pool.query(`
            INSERT INTO planejamento_comercial_revenda (
                mes_referencia, produto_id, produto_nome, compra_planejada_kg, venda_planejada_kg,
                investimento_planejado_rs, faturamento_previsto_rs, compra_realizada_kg,
                venda_realizada_rs, participacao_meta_pct, status, observacoes,
                preco_compra_estimado, preco_venda_estimado,
                preco_compra_realizado, preco_venda_realizado, venda_realizada_kg,
                prazo_compra_ate, prazo_venda_ate
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `, [
            mes_referencia || new Date().toISOString().slice(0, 7),
            produto_id ? parseInt(produto_id) : null, produto_nome || 'Produto Comercial',
            parseFloat(compra_planejada_kg || 0), parseFloat(venda_planejada_kg || 0),
            parseFloat(investimento_planejado_rs || 0), fatPrev,
            parseFloat(compra_realizada_kg || 0), parseFloat(venda_realizada_rs || 0),
            parseFloat(partPct.toFixed(2)), status || 'Em Cotação', observacoes || '',
            parseFloat(preco_compra_estimado || 0), parseFloat(preco_venda_estimado || 0),
            parseFloat(preco_compra_realizado || 0), parseFloat(preco_venda_realizado || 0),
            parseFloat(venda_realizada_kg || 0),
            prazo_compra_ate || null, prazo_venda_ate || null
        ]);

        res.json(r[0][0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/planejamento/comercial-revenda/:id/realizado', async (req, res) => {

    try {
        const id = parseInt(req.params.id);
        const {
            compra_realizada_kg,
            venda_realizada_rs,
            venda_realizada_kg,
            preco_compra_realizado,
            preco_venda_realizado,
            status
        } = req.body;

        if (!dbAvailable) {
            const item = (memStore.planejamento_comercial_revenda || []).find(x => x.id === id);
            if (!item) return res.status(404).json({ error: 'Planejamento não encontrado' });
            if (compra_realizada_kg !== undefined) item.compra_realizada_kg = parseFloat(compra_realizada_kg);
            if (venda_realizada_rs !== undefined) item.venda_realizada_rs = parseFloat(venda_realizada_rs);
            if (venda_realizada_kg !== undefined) item.venda_realizada_kg = parseFloat(venda_realizada_kg);
            if (preco_compra_realizado !== undefined) item.preco_compra_realizado = parseFloat(preco_compra_realizado);
            if (preco_venda_realizado !== undefined) item.preco_venda_realizado = parseFloat(preco_venda_realizado);
            if (status) item.status = status;
            return res.json(item);
        }

        const r = await pool.query(`
            UPDATE planejamento_comercial_revenda SET
                compra_realizada_kg = COALESCE(?, compra_realizada_kg),
                venda_realizada_rs = COALESCE(?, venda_realizada_rs),
                venda_realizada_kg = COALESCE(?, venda_realizada_kg),
                preco_compra_realizado = COALESCE(?, preco_compra_realizado),
                preco_venda_realizado = COALESCE(?, preco_venda_realizado),
                status = COALESCE(?, status)
            WHERE id = ?
        `, [
            compra_realizada_kg !== undefined ? parseFloat(compra_realizada_kg) : null,
            venda_realizada_rs !== undefined ? parseFloat(venda_realizada_rs) : null,
            venda_realizada_kg !== undefined ? parseFloat(venda_realizada_kg) : null,
            preco_compra_realizado !== undefined ? parseFloat(preco_compra_realizado) : null,
            preco_venda_realizado !== undefined ? parseFloat(preco_venda_realizado) : null,
            status || null,
            id
        ]);

        res.json(r[0][0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/planejamento/comercial-revenda/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!dbAvailable) {
            memStore.planejamento_comercial_revenda = (memStore.planejamento_comercial_revenda || []).filter(x => x.id !== id);
            return res.json({ success: true });
        }
        await pool.query('DELETE FROM planejamento_comercial_revenda WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Parâmetros de Prazos & Estoque Mínimo ─────────────────────────────
app.get('/api/planejamento/parametros-prazos', async (req, res) => {
    try {
        if (!dbAvailable) {
            return res.json(memStore.parametros_estoque_prazos || []);
        }
        const r = await pool.query(`
            SELECT p.*, mc.nome as material_nome
            FROM parametros_estoque_prazos p
            LEFT JOIN materiais_catalogo mc ON p.material_id = mc.id
            ORDER BY p.id DESC
        `);
        res.json(r[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/planejamento/parametros-prazos', async (req, res) => {
    try {
        const { material_id, lead_time_compra_dias, prazo_entrega_dias, prazo_producao_dias, estoque_minimo_kg, estoque_seguranca_kg, prazo_permanencia_dias } = req.body;
        const matId = parseInt(material_id);

        if (!dbAvailable) {
            if (!memStore.parametros_estoque_prazos) memStore.parametros_estoque_prazos = [];
            const idx = memStore.parametros_estoque_prazos.findIndex(x => x.material_id === matId);
            const item = {
                id: idx >= 0 ? memStore.parametros_estoque_prazos[idx].id : nextId++,
                material_id: matId,
                lead_time_compra_dias: parseInt(lead_time_compra_dias || 7),
                prazo_entrega_dias: parseInt(prazo_entrega_dias || 15),
                prazo_producao_dias: parseInt(prazo_producao_dias || 5),
                estoque_minimo_kg: parseFloat(estoque_minimo_kg || 0),
                estoque_seguranca_kg: parseFloat(estoque_seguranca_kg || 0),
                prazo_permanencia_dias: parseInt(prazo_permanencia_dias || 30),
                atualizado_em: new Date().toISOString()
            };
            if (idx >= 0) memStore.parametros_estoque_prazos[idx] = item;
            else memStore.parametros_estoque_prazos.push(item);
            return res.json(item);
        }

        const r = await pool.query(`
            INSERT INTO parametros_estoque_prazos (material_id, lead_time_compra_dias, prazo_entrega_dias, prazo_producao_dias, estoque_minimo_kg, estoque_seguranca_kg, prazo_permanencia_dias)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (material_id) DO UPDATE SET
                lead_time_compra_dias = EXCLUDED.lead_time_compra_dias,
                prazo_entrega_dias = EXCLUDED.prazo_entrega_dias,
                prazo_producao_dias = EXCLUDED.prazo_producao_dias,
                estoque_minimo_kg = EXCLUDED.estoque_minimo_kg,
                estoque_seguranca_kg = EXCLUDED.estoque_seguranca_kg,
                prazo_permanencia_dias = EXCLUDED.prazo_permanencia_dias,
                atualizado_em = NOW()
        `, [
            matId, parseInt(lead_time_compra_dias || 7), parseInt(prazo_entrega_dias || 15),
            parseInt(prazo_producao_dias || 5), parseFloat(estoque_minimo_kg || 0),
            parseFloat(estoque_seguranca_kg || 0), parseInt(prazo_permanencia_dias || 30)
        ]);

        res.json(r[0][0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Planejamento por Cenários (Conservador, Moderado, Agressivo) ──────
app.get('/api/planejamento/cenarios/configuracao', async (req, res) => {
    try {
        const defaultConfig = {
            id: 1,
            percentual_conservador: 80.00,
            percentual_moderado: 100.00,
            percentual_agressivo: 120.00,
            cenario_foco: 'AGRESSIVO',
            meta_base_padrao_rs: 1000000.00
        };

        if (!dbAvailable) {
            if (!memStore.configuracao_cenarios_planejamento) {
                memStore.configuracao_cenarios_planejamento = [defaultConfig];
            }
            return res.json(memStore.configuracao_cenarios_planejamento[0]);
        }

        const r = await pool.query('SELECT * FROM configuracao_cenarios_planejamento ORDER BY id ASC LIMIT 1');
        if (r[0].length === 0) {
            const ins = await pool.query(`
                INSERT INTO configuracao_cenarios_planejamento (percentual_conservador, percentual_moderado, percentual_agressivo, cenario_foco, meta_base_padrao_rs)
                VALUES (80.00, 100.00, 120.00, 'AGRESSIVO', 1000000.00)
            `);
            const [inserted] = await pool.query('SELECT * FROM configuracao_cenarios_planejamento ORDER BY id DESC LIMIT 1');
            return res.json(inserted[0]);
        }
        res.json(r[0][0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/planejamento/cenarios/configuracao', async (req, res) => {
    try {
        const { percentual_conservador, percentual_moderado, percentual_agressivo, cenario_foco, meta_base_padrao_rs } = req.body;
        const pCons = parseFloat(percentual_conservador || 80);
        const pMod = parseFloat(percentual_moderado || 100);
        const pAgr = parseFloat(percentual_agressivo || 120);
        const cFoco = cenario_foco || 'AGRESSIVO';
        const mBase = parseFloat(meta_base_padrao_rs || 1000000);

        if (!dbAvailable) {
            const item = {
                id: 1,
                percentual_conservador: pCons,
                percentual_moderado: pMod,
                percentual_agressivo: pAgr,
                cenario_foco: cFoco,
                meta_base_padrao_rs: mBase,
                atualizado_em: new Date().toISOString()
            };
            memStore.configuracao_cenarios_planejamento = [item];
            return res.json(item);
        }

        const r = await pool.query(`
            INSERT INTO configuracao_cenarios_planejamento (id, percentual_conservador, percentual_moderado, percentual_agressivo, cenario_foco, meta_base_padrao_rs)
            VALUES (1, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                percentual_conservador = EXCLUDED.percentual_conservador,
                percentual_moderado = EXCLUDED.percentual_moderado,
                percentual_agressivo = EXCLUDED.percentual_agressivo,
                cenario_foco = EXCLUDED.cenario_foco,
                meta_base_padrao_rs = EXCLUDED.meta_base_padrao_rs,
                atualizado_em = NOW()
        `, [pCons, pMod, pAgr, cFoco, mBase]);

        res.json(r[0][0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/planejamento/cenarios/simular', async (req, res) => {
    try {
        const { meta_base_rs, p_conservador, p_moderado, p_agressivo, produto_id } = req.body;
        const metaBase = parseFloat(meta_base_rs || 1000000);
        const pctCons = parseFloat(p_conservador || 80);
        const pctMod = parseFloat(p_moderado || 100);
        const pctAgr = parseFloat(p_agressivo || 120);

        const calcCenario = (nome, pct, riskLabel, statusTag) => {
            const faturamento = metaBase * (pct / 100);
            const investimento = faturamento * 0.70; // 70% custo das vendas/compras
            const caixa = investimento * 1.15; // 15% reserva operacional
            const margem = faturamento - investimento;
            const margemPct = faturamento > 0 ? (margem / faturamento) * 100 : 0;
            const volumeVendasKg = faturamento / 30.00; // R$ 30/kg médio
            const volumeComprasKg = volumeVendasKg * 1.05; // 5% perda/quebra
            const qtdProdutos = Math.max(1, Math.round(faturamento / 250000));

            return {
                cenario: nome,
                percentual: pct,
                faturamento_previsto_rs: faturamento,
                investimento_necessario_rs: investimento,
                necessidade_caixa_rs: caixa,
                margem_estimada_rs: margem,
                margem_estimada_pct: margemPct,
                volume_vendas_kg: volumeVendasKg,
                volume_compras_kg: volumeComprasKg,
                qtd_produtos: qtdProdutos,
                crescimento_esperado_pct: pct - 100,
                risco: riskLabel,
                status: statusTag
            };
        };

        const conservador = calcCenario('CONSERVADOR', pctCons, 'Baixo Risco (Cenário de Segurança)', '🟢 CENÁRIO CONSERVADOR');
        const moderado = calcCenario('MODERADO', pctMod, 'Risco Moderado (Padrão Operacional)', '🟡 META BASE (MODERADO)');
        const agressivo = calcCenario('AGRESSIVO', pctAgr, 'Risco Controlado (Expansão)', '🔴 META EXPANSÃO (AGRESSIVO)');

        res.json({
            meta_base_rs: metaBase,
            cenarios: {
                conservador,
                moderado,
                agressivo
            },
            cenario_foco: agressivo,
            diferenca_foco_moderado_rs: agressivo.faturamento_previsto_rs - moderado.faturamento_previsto_rs,
            diferenca_foco_conservador_rs: agressivo.faturamento_previsto_rs - conservador.faturamento_previsto_rs
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Planejamento Industrial / Equipamentos ────────────────────────────
app.get('/api/planejamento/industrial/equipamentos', async (req, res) => {
    try {
        if (!dbAvailable) {
            return res.json((memStore.equipamentos_industriais || []).sort((a, b) => a.id - b.id));
        }
        const r = await pool.query('SELECT * FROM equipamentos_industriais ORDER BY id ASC');
        res.json(r[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/planejamento/industrial/equipamentos', async (req, res) => {
    try {
        const { nome_equipamento, codigo_tag, setor, capacidade_nominal_kgh, disponibilidade_horas_dia, tempo_setup_horas, eficiencia_oee_pct, status, observacoes } = req.body;

        if (!dbAvailable) {
            if (!memStore.equipamentos_industriais) memStore.equipamentos_industriais = [];
            const eq = {
                id: nextId++,
                nome_equipamento,
                codigo_tag,
                setor: setor || 'Processamento',
                capacidade_nominal_kgh: parseFloat(capacidade_nominal_kgh || 1000),
                disponibilidade_horas_dia: parseFloat(disponibilidade_horas_dia || 16),
                tempo_setup_horas: parseFloat(tempo_setup_horas || 1.0),
                eficiencia_oee_pct: parseFloat(eficiencia_oee_pct || 85),
                status: status || 'Operacional',
                observacoes: observacoes || ''
            };
            memStore.equipamentos_industriais.push(eq);
            return res.json(eq);
        }

        const r = await pool.query(`
            INSERT INTO equipamentos_industriais (nome_equipamento, codigo_tag, setor, capacidade_nominal_kgh, disponibilidade_horas_dia, tempo_setup_horas, eficiencia_oee_pct, status, observacoes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [nome_equipamento, codigo_tag, setor || 'Processamento', capacidade_nominal_kgh || 1000, disponibilidade_horas_dia || 16, tempo_setup_horas || 1.0, eficiencia_oee_pct || 85, status || 'Operacional', observacoes]);

        res.json(r[0][0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/planejamento/industrial/equipamentos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { nome_equipamento, codigo_tag, setor, capacidade_nominal_kgh, disponibilidade_horas_dia, tempo_setup_horas, eficiencia_oee_pct, status, observacoes } = req.body;

        if (!dbAvailable) {
            const idx = (memStore.equipamentos_industriais || []).findIndex(x => x.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Equipamento não encontrado' });
            memStore.equipamentos_industriais[idx] = {
                ...memStore.equipamentos_industriais[idx],
                nome_equipamento: nome_equipamento || memStore.equipamentos_industriais[idx].nome_equipamento,
                codigo_tag: codigo_tag || memStore.equipamentos_industriais[idx].codigo_tag,
                setor: setor || memStore.equipamentos_industriais[idx].setor,
                capacidade_nominal_kgh: parseFloat(capacidade_nominal_kgh || memStore.equipamentos_industriais[idx].capacidade_nominal_kgh),
                disponibilidade_horas_dia: parseFloat(disponibilidade_horas_dia || memStore.equipamentos_industriais[idx].disponibilidade_horas_dia),
                tempo_setup_horas: parseFloat(tempo_setup_horas || memStore.equipamentos_industriais[idx].tempo_setup_horas),
                eficiencia_oee_pct: parseFloat(eficiencia_oee_pct || memStore.equipamentos_industriais[idx].eficiencia_oee_pct),
                status: status || memStore.equipamentos_industriais[idx].status,
                observacoes: observacoes !== undefined ? observacoes : memStore.equipamentos_industriais[idx].observacoes
            };
            return res.json(memStore.equipamentos_industriais[idx]);
        }

        const r = await pool.query(`
            UPDATE equipamentos_industriais SET
                nome_equipamento = ?, codigo_tag = ?, setor = ?, capacidade_nominal_kgh = ?,
                disponibilidade_horas_dia = ?, tempo_setup_horas = ?, eficiencia_oee_pct = ?, status = ?, observacoes = ?
            WHERE id = ?
        `, [nome_equipamento, codigo_tag, setor, capacidade_nominal_kgh, disponibilidade_horas_dia, tempo_setup_horas, eficiencia_oee_pct, status, observacoes, id]);

        res.json(r[0][0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/planejamento/industrial/equipamentos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!dbAvailable) {
            memStore.equipamentos_industriais = (memStore.equipamentos_industriais || []).filter(x => x.id !== id);
            return res.json({ success: true });
        }
        await pool.query('DELETE FROM equipamentos_industriais WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Planejamento de Produção & PCP (Com Tempos Operacionais) ─────────
app.get('/api/planejamento/producao/ops', async (req, res) => {
    try {
        if (!dbAvailable) {
            const list = (memStore.ordens_producao || []).map(op => {
                const mc = (memStore.materiais_catalogo || []).find(m => m.id == op.material_saida_id);
                return {
                    ...op,
                    material_saida_nome: mc ? mc.nome : ''
                };
            });
            return res.json(list.sort((a, b) => b.id - a.id));
        }

        const [opsRows] = await pool.query(`
            SELECT op.*, mc.nome as material_saida_nome, a.numero_amostra
            FROM ordens_producao op
            LEFT JOIN materiais_catalogo mc ON op.material_saida_id = mc.id
            LEFT JOIN amostras a ON op.amostra_id = a.id
            ORDER BY op.id DESC
        `);

        for (const op of opsRows) {
            const etapas = await pool.query(`
                SELECT e.*, eq.nome_equipamento
                FROM ordens_producao_etapas e
                LEFT JOIN equipamentos_industriais eq ON e.equipamento_id = eq.id
                WHERE e.op_id = ?
                ORDER BY e.ordem ASC
            `, [op.id]);
            op.etapas = etapas[0];
        }

        res.json(opsRows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/planejamento/producao/ops', async (req, res) => {
    try {
        const { numero_op, amostra_id, lote_id, material_entrada, peso_entrada_kg, material_saida_id, peso_saida_estimado_kg, data_inicio_prevista, data_fim_prevista, responsavel_pcp, status, observacoes, etapas } = req.body;

        let numOpFinal = (numero_op && numero_op.trim()) ? numero_op.trim() : ('OP-' + new Date().getFullYear() + '-' + String(Math.floor(Date.now() / 1000) % 100000).padStart(5, '0'));

        if (!dbAvailable) {
            if (!memStore.ordens_producao) memStore.ordens_producao = [];
            const opId = nextId++;
            const newOp = {
                id: opId,
                numero_op: numOpFinal,
                amostra_id: amostra_id && !isNaN(parseInt(amostra_id)) ? parseInt(amostra_id) : null,
                lote_id: lote_id && !isNaN(parseInt(lote_id)) ? parseInt(lote_id) : null,
                material_entrada: material_entrada || 'Material de Entrada',
                peso_entrada_kg: parseFloat(peso_entrada_kg || 0),
                material_saida_id: material_saida_id && !isNaN(parseInt(material_saida_id)) ? parseInt(material_saida_id) : null,
                peso_saida_estimado_kg: parseFloat(peso_saida_estimado_kg || 0),
                data_inicio_prevista: data_inicio_prevista || null,
                data_fim_prevista: data_fim_prevista || null,
                responsavel_pcp: responsavel_pcp || 'Admin PCP',
                status: status || 'Planejada',
                observacoes: observacoes || '',
                criado_em: new Date().toISOString(),
                etapas: (etapas || []).map((et, idx) => ({
                    id: idx + 1,
                    op_id: opId,
                    nome_etapa: et.nome_etapa || `Etapa ${idx + 1}`,
                    ordem: idx + 1,
                    equipamento_id: et.equipamento_id && !isNaN(parseInt(et.equipamento_id)) ? parseInt(et.equipamento_id) : null,
                    tempo_estimado_horas: parseFloat(et.tempo_estimado_horas || 0),
                    tempo_real_horas: parseFloat(et.tempo_real_horas || 0),
                    status_etapa: et.status_etapa || 'Pendente',
                    operador_responsavel: et.operador_responsavel || '',
                    observacoes: et.observacoes || ''
                }))
            };
            memStore.ordens_producao.push(newOp);
            return res.json(newOp);
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let opRes;
            try {
                opRes = await client.query(`
                    INSERT INTO ordens_producao (numero_op, amostra_id, lote_id, material_entrada, peso_entrada_kg, material_saida_id, peso_saida_estimado_kg, data_inicio_prevista, data_fim_prevista, responsavel_pcp, status, observacoes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    numOpFinal,
                    amostra_id && !isNaN(parseInt(amostra_id)) ? parseInt(amostra_id) : null,
                    lote_id && !isNaN(parseInt(lote_id)) ? parseInt(lote_id) : null,
                    material_entrada || 'Material de Entrada',
                    parseFloat(peso_entrada_kg || 0),
                    material_saida_id && !isNaN(parseInt(material_saida_id)) ? parseInt(material_saida_id) : null,
                    parseFloat(peso_saida_estimado_kg || 0),
                    data_inicio_prevista || null,
                    data_fim_prevista || null,
                    responsavel_pcp || 'PCP Admin',
                    status || 'Planejada',
                    observacoes || ''
                ]);
            } catch (errDup) {
                // Se der duplicidade de numero_op, recria com timestamp unico
                numOpFinal = 'OP-' + new Date().getFullYear() + '-' + Date.now().toString().slice(-6);
                opRes = await client.query(`
                    INSERT INTO ordens_producao (numero_op, amostra_id, lote_id, material_entrada, peso_entrada_kg, material_saida_id, peso_saida_estimado_kg, data_inicio_prevista, data_fim_prevista, responsavel_pcp, status, observacoes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    numOpFinal,
                    amostra_id && !isNaN(parseInt(amostra_id)) ? parseInt(amostra_id) : null,
                    lote_id && !isNaN(parseInt(lote_id)) ? parseInt(lote_id) : null,
                    material_entrada || 'Material de Entrada',
                    parseFloat(peso_entrada_kg || 0),
                    material_saida_id && !isNaN(parseInt(material_saida_id)) ? parseInt(material_saida_id) : null,
                    parseFloat(peso_saida_estimado_kg || 0),
                    data_inicio_prevista || null,
                    data_fim_prevista || null,
                    responsavel_pcp || 'PCP Admin',
                    status || 'Planejada',
                    observacoes || ''
                ]);
            }

            const createdOp = opRes[0][0];
            const createdEtapas = [];
            if (etapas && Array.isArray(etapas)) {
                for (let i = 0; i < etapas.length; i++) {
                    const et = etapas[i];
                    const eqId = et.equipamento_id && !isNaN(parseInt(et.equipamento_id)) ? parseInt(et.equipamento_id) : null;
                    const etRes = await client.query(`
                        INSERT INTO ordens_producao_etapas (op_id, nome_etapa, ordem, equipamento_id, tempo_estimado_horas, tempo_real_horas, status_etapa, operador_responsavel, observacoes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        createdOp.id,
                        et.nome_etapa || `Etapa ${i + 1}`,
                        i + 1,
                        eqId,
                        parseFloat(et.tempo_estimado_horas || 0),
                        parseFloat(et.tempo_real_horas || 0),
                        et.status_etapa || 'Pendente',
                        et.operador_responsavel || '',
                        et.observacoes || ''
                    ]);
                    const [etRows] = await pool.query('SELECT * FROM pcp_etapas WHERE id = ? LIMIT 1', [etRes[0].insertId]);
                    createdEtapas.push(etRows[0]);
                }
            }
            await client.query('COMMIT');
            res.json({ ...createdOp, etapas: createdEtapas });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/planejamento/producao/ops/:id/etapas', async (req, res) => {
    try {
        const opId = parseInt(req.params.id);
        const { etapa_id, tempo_real_horas, status_etapa, operador_responsavel, status_op } = req.body;

        if (!dbAvailable) {
            const op = (memStore.ordens_producao || []).find(x => x.id === opId);
            if (!op) return res.status(404).json({ error: 'Ordem de Produção não encontrada' });
            if (status_op) op.status = status_op;
            if (etapa_id && op.etapas) {
                const et = op.etapas.find(e => e.id == etapa_id);
                if (et) {
                    if (tempo_real_horas !== undefined) et.tempo_real_horas = parseFloat(tempo_real_horas);
                    if (status_etapa) et.status_etapa = status_etapa;
                    if (operador_responsavel) et.operador_responsavel = operador_responsavel;
                }
            }
            return res.json(op);
        }

        if (status_op) {
            await pool.query('UPDATE ordens_producao SET status = ?, atualizado_em = NOW() WHERE id = ?', [status_op, opId]);
        }
        if (etapa_id) {
            await pool.query(`
                UPDATE ordens_producao_etapas SET
                    tempo_real_horas = COALESCE(?, tempo_real_horas),
                    status_etapa = COALESCE(?, status_etapa),
                    operador_responsavel = COALESCE(?, operador_responsavel)
                WHERE id = ? AND op_id = ?
            `, [tempo_real_horas !== undefined ? parseFloat(tempo_real_horas) : null, status_etapa || null, operador_responsavel || null, etapa_id, opId]);
        }

        const opRes = await pool.query('SELECT * FROM ordens_producao WHERE id = ?', [opId]);
        const etapasRes = await pool.query('SELECT * FROM ordens_producao_etapas WHERE op_id = ? ORDER BY ordem ASC', [opId]);
        res.json({ ...opRes[0][0], etapas: etapasRes[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/planejamento/producao/ops/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!dbAvailable) {
            memStore.ordens_producao = (memStore.ordens_producao || []).filter(x => x.id !== id);
            return res.json({ success: true });
        }
        await pool.query('DELETE FROM ordens_producao WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Estoque (GET) ───────────────────────────────────────────────────────
app.get('/api/estoque', async (req, res) => {
    try {
        if (dbAvailable) {
            const eRes = await pool.query(`
                SELECT e.*, mc.nome as material_nome, mc.categoria as material_categoria, mc.unidade as material_unidade
                FROM estoque e
                JOIN materiais_catalogo mc ON e.material_id = mc.id
                ORDER BY mc.categoria ASC, mc.nome ASC
            `);
            const mRes = await pool.query(`
                SELECT m.*, mc.nome as material_nome
                FROM movimentacoes_estoque m
                JOIN materiais_catalogo mc ON m.material_id = mc.id
                ORDER BY m.data DESC LIMIT 100
            `);
            return res.json({ estoque: eRes[0], movimentacoes: mRes[0] });
        }

        const estoque = memStore.estoque.map(e => {
            const mc = memStore.materiais_catalogo.find(x => x.id === e.material_id);
            return {
                ...e,
                material_nome: mc ? mc.nome : '',
                material_categoria: mc ? mc.categoria : '',
                material_unidade: mc ? mc.unidade : 'kg'
            };
        });

        const movimentacoes = memStore.movimentacoes_estoque.map(m => {
            const mc = memStore.materiais_catalogo.find(x => x.id === m.material_id);
            return {
                ...m,
                material_nome: mc ? mc.nome : ''
            };
        }).sort((a,b) => new Date(b.data) - new Date(a.data));

        res.json({ estoque, movimentacoes });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar estoque.' });
    }
});

// ─── API: Login ───────────────────────────────────────────────────────────────

// ─── API: Groq Chat ───────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
    try {
        const { message, systemPrompt } = req.body;
        if (!message) return res.status(400).json({ error: 'O parâmetro message é obrigatório.' });

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'Chave de API não configurada no servidor.' });

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: systemPrompt || 'Você é o assistente virtual da ApexTech Metais.' },
                    { role: 'user', content: message }
                ],
                temperature: 0.7,
                max_tokens: 250
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('Erro Groq:', errorData);
            return res.status(response.status).json({ error: 'Erro de comunicação com o serviço de IA.' });
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Erro no proxy /api/chat:', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
});

// ─── API: Soluções (CRUD) ─────────────────────────────────────────────────────
app.get('/api/solucoes', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query('SELECT * FROM solucoes ORDER BY ordem ASC, criado_em ASC');
            return res.json(result[0]);
        }
        res.json([...memStore.solucoes].sort((a, b) => a.ordem - b.ordem));
    } catch (err) {
        console.error('Erro GET /api/solucoes:', err);
        res.status(500).json({ error: 'Erro ao buscar soluções.' });
    }
});

app.post('/api/solucoes', async (req, res) => {
    try {
        const { nome, img, descricao, ordem } = req.body;
        if (!nome || !img || !descricao) return res.status(400).json({ error: 'nome, img e descricao são obrigatórios.' });
        if (dbAvailable) {
            const result = await pool.query(
                'INSERT INTO solucoes (nome, img, descricao, ordem) VALUES (?, ?, ?, ?)',
                [nome, img, descricao, ordem || 0]
            );
            return res.status(201).json(result[0][0]);
        }
        const item = { id: nextId++, nome, img, descricao, ordem: ordem || 0, criado_em: new Date().toISOString() };
        memStore.solucoes.push(item);
        res.status(201).json(item);
    } catch (err) {
        console.error('Erro POST /api/solucoes:', err);
        res.status(500).json({ error: 'Erro ao criar solução.' });
    }
});

app.put('/api/solucoes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, img, descricao, ordem } = req.body;
        if (dbAvailable) {
            const result = await pool.query(
                'UPDATE solucoes SET nome=?, img=?, descricao=?, ordem=? WHERE id=?',
                [nome, img, descricao, ordem || 0, id]
            );
            if (result.rowCount === 0) return res.status(404).json({ error: 'Solução não encontrada.' });
            return res.json(result[0][0]);
        }
        const idx = memStore.solucoes.findIndex(s => s.id == id);
        if (idx === -1) return res.status(404).json({ error: 'Solução não encontrada.' });
        Object.assign(memStore.solucoes[idx], { nome, img, descricao, ordem: ordem || 0 });
        res.json(memStore.solucoes[idx]);
    } catch (err) {
        console.error('Erro PUT /api/solucoes:', err);
        res.status(500).json({ error: 'Erro ao atualizar solução.' });
    }
});

app.delete('/api/solucoes/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (dbAvailable) {
            const result = await pool.query('DELETE FROM solucoes WHERE id=?', [id]);
            if (result.rowCount === 0) return res.status(404).json({ error: 'Solução não encontrada.' });
            return res.json({ success: true });
        }
        const idx = memStore.solucoes.findIndex(s => s.id == id);
        if (idx === -1) return res.status(404).json({ error: 'Solução não encontrada.' });
        memStore.solucoes.splice(idx, 1);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro DELETE /api/solucoes:', err);
        res.status(500).json({ error: 'Erro ao remover solução.' });
    }
});

// ─── API: Materiais (CRUD) ────────────────────────────────────────────────────
app.get('/api/materiais', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query('SELECT * FROM materiais ORDER BY criado_em DESC');
            return res.json(result[0]);
        }
        res.json([...memStore.materiais]);
    } catch (err) {
        console.error('Erro GET /api/materiais:', err);
        res.status(500).json({ error: 'Erro ao buscar materiais.' });
    }
});

app.post('/api/materiais', async (req, res) => {
    try {
        const { nome, imagem, descricao, locais } = req.body;
        if (!nome || !descricao) return res.status(400).json({ error: 'nome e descricao são obrigatórios.' });
        if (dbAvailable) {
            const result = await pool.query(
                'INSERT INTO materiais (nome, imagem, descricao, locais) VALUES (?, ?, ?, ?)',
                [nome, imagem || null, descricao, JSON.stringify(locais || [])]
            );
            return res.status(201).json(result[0][0]);
        }
        const item = { id: nextId++, nome, imagem: imagem || null, descricao, locais: locais || [], criado_em: new Date().toISOString() };
        memStore.materiais.push(item);
        res.status(201).json(item);
    } catch (err) {
        console.error('Erro POST /api/materiais:', err);
        res.status(500).json({ error: 'Erro ao criar material.' });
    }
});

app.delete('/api/materiais/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (dbAvailable) {
            const result = await pool.query('DELETE FROM materiais WHERE id=?', [id]);
            if (result.rowCount === 0) return res.status(404).json({ error: 'Material não encontrado.' });
            return res.json({ success: true });
        }
        const idx = memStore.materiais.findIndex(m => m.id == id);
        if (idx === -1) return res.status(404).json({ error: 'Material não encontrado.' });
        memStore.materiais.splice(idx, 1);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro DELETE /api/materiais:', err);
        res.status(500).json({ error: 'Erro ao remover material.' });
    }
});

// ─── API: Notícias (CRUD) ─────────────────────────────────────────────────────
app.get('/api/noticias', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query('SELECT * FROM noticias ORDER BY data_pub DESC, criado_em DESC');
            return res.json(result[0]);
        }
        res.json([...memStore.noticias]);
    } catch (err) {
        console.error('Erro GET /api/noticias:', err);
        res.status(500).json({ error: 'Erro ao buscar notícias.' });
    }
});

app.post('/api/noticias', async (req, res) => {
    try {
        const { titulo, url, resumo, data, categoria } = req.body;
        if (!titulo) return res.status(400).json({ error: 'titulo é obrigatório.' });
        if (dbAvailable) {
            const result = await pool.query(
                'INSERT INTO noticias (titulo, url, resumo, data_pub, categoria) VALUES (?, ?, ?, ?, ?)',
                [titulo, url || null, resumo || null, data || null, categoria || null]
            );
            return res.status(201).json(result[0][0]);
        }
        const item = { id: nextId++, titulo, url: url || null, resumo: resumo || null, data_pub: data || null, categoria: categoria || null, criado_em: new Date().toISOString() };
        memStore.noticias.push(item);
        res.status(201).json(item);
    } catch (err) {
        console.error('Erro POST /api/noticias:', err);
        res.status(500).json({ error: 'Erro ao criar notícia.' });
    }
});

app.delete('/api/noticias/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (dbAvailable) {
            const result = await pool.query('DELETE FROM noticias WHERE id=?', [id]);
            if (result.rowCount === 0) return res.status(404).json({ error: 'Notícia não encontrada.' });
            return res.json({ success: true });
        }
        const idx = memStore.noticias.findIndex(n => n.id == id);
        if (idx === -1) return res.status(404).json({ error: 'Notícia não encontrada.' });
        memStore.noticias.splice(idx, 1);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro DELETE /api/noticias:', err);
        res.status(500).json({ error: 'Erro ao remover notícia.' });
    }
});

// ─── API: Busca de NCM (Siscomex com Cache) ──────────────────────────────────
let cacheNcm = null;

async function carregarNcms() {
    if (cacheNcm) return cacheNcm;
    try {
        const response = await axios.get('https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json', {
            timeout: 15000,
            headers: { 'Accept-Encoding': 'gzip, deflate, br' }
        });
        if (response.data && response.data.Nomenclaturas) {
            cacheNcm = response.data.Nomenclaturas.map(n => ({
                codigo: n.Codigo,
                descricao: n.Descricao
            }));
            console.log(`[NCM] Carregados ${cacheNcm.length} códigos do Siscomex.`);
            return cacheNcm;
        }
    } catch (e) {
        console.error('Erro ao baixar NCMs do Siscomex:', e.message);
    }
    
    // Fallback básico para não travar o sistema
    return [
        { codigo: "76020000", descricao: "Desperdícios e resíduos, de alumínio" },
        { codigo: "74040000", descricao: "Desperdícios e resíduos, de cobre" },
        { codigo: "79020000", descricao: "Desperdícios e resíduos, de zinco" },
        { codigo: "78020000", descricao: "Desperdícios e resíduos, de chumbo" },
        { codigo: "80020000", descricao: "Desperdícios e resíduos, de estanho" },
        { codigo: "75030000", descricao: "Desperdícios e resíduos, de níquel" }
    ];
}

app.get('/api/ncm/buscar', async (req, res) => {
    try {
        const query = (req.query.q || '').trim().toLowerCase();
        if (!query) return res.json([]);
        
        const ncms = await carregarNcms();
        const cleanQuery = query.replace(/\D/g, '');
        
        const results = ncms.filter(n => {
            const cleanCodigo = n.codigo.replace(/\D/g, '');
            return (cleanQuery && cleanCodigo.includes(cleanQuery)) || 
                   n.descricao.toLowerCase().includes(query);
        }).slice(0, 50); // Limita a 50 resultados para performance
        
        res.json(results);
    } catch (err) {
        console.error('Erro na busca de NCM:', err);
        res.status(500).json({ error: 'Erro ao buscar NCM.' });
    }
});

// ─── API: Configurações da Home ──────────────────────────────────────────────
app.get('/api/settings', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query('SELECT * FROM settings');
            const settingsObj = {};
            result[0].forEach(row => {
                settingsObj[row.key] = row.value;
            });
            return res.json(settingsObj);
        }
        res.json(memStore.settings);
    } catch (err) {
        console.error('Erro GET /api/settings:', err);
        res.status(500).json({ error: 'Erro ao buscar configurações.' });
    }
});

app.put('/api/settings', async (req, res) => {
    try {
        const settings = req.body;
        if (dbAvailable) {
            for (const [key, value] of Object.entries(settings)) {
                await pool.query(
                    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = ?',
                    [key, String(value)]
                );
            }
            return res.json({ success: true });
        }
        Object.assign(memStore.settings, settings);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro PUT /api/settings:', err);
        res.status(500).json({ error: 'Erro ao salvar configurações.' });
    }
});

// ─── API: Galeria de Fotos ───────────────────────────────────────────────────
app.get('/api/galeria', async (req, res) => {
    try {
        if (dbAvailable) {
            const result = await pool.query('SELECT * FROM galeria ORDER BY ordem ASC, criado_em DESC');
            return res.json(result[0]);
        }
        const list = [...memStore.galeria].sort((a, b) => a.ordem - b.ordem);
        res.json(list);
    } catch (err) {
        console.error('Erro GET /api/galeria:', err);
        res.status(500).json({ error: 'Erro ao buscar galeria.' });
    }
});

app.post('/api/galeria', async (req, res) => {
    try {
        const { url, titulo, ordem } = req.body;
        if (!url || !titulo) return res.status(400).json({ error: 'url e titulo são obrigatórios.' });
        if (dbAvailable) {
            const result = await pool.query(
                'INSERT INTO galeria (url, titulo, ordem) VALUES (?, ?, ?)',
                [url, titulo, ordem || 0]
            );
            return res.status(201).json(result[0][0]);
        }
        const item = { id: nextId++, url, titulo, ordem: ordem || 0, criado_em: new Date().toISOString() };
        memStore.galeria.push(item);
        res.status(201).json(item);
    } catch (err) {
        console.error('Erro POST /api/galeria:', err);
        res.status(500).json({ error: 'Erro ao adicionar imagem à galeria.' });
    }
});

app.delete('/api/galeria/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (dbAvailable) {
            const result = await pool.query('DELETE FROM galeria WHERE id=?', [id]);
            if (result.rowCount === 0) return res.status(404).json({ error: 'Imagem não encontrada.' });
            return res.json({ success: true });
        }
        const idx = memStore.galeria.findIndex(g => g.id == id);
        if (idx === -1) return res.status(404).json({ error: 'Imagem não encontrada.' });
        memStore.galeria.splice(idx, 1);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro DELETE /api/galeria:', err);
        res.status(500).json({ error: 'Erro ao remover imagem da galeria.' });
    }
});

// ─── API: LME Relatório Semanal (sem planilha, cálculo automático) ─────────────
// Busca dados da LME via scraping, agrupa por semana e calcula todas as métricas

function parseNum(str) {
    if (!str || str.trim() === '' || str.trim() === '-') return null;
    // Remove R$, %, espaços
    let s = str.replace(/R\$\s*/g, '').replace(/%/g, '').trim();
    
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    
    if (lastComma > lastDot) {
        // Formato BR: 1.234,56 ou apenas 1234,56
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma) {
        // Formato US: 1,234.56 ou apenas 1234.56
        s = s.replace(/,/g, '');
    }
    
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
}

const mesMapLME = {
    'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
    'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
};

function parseDate(diaStr, currentYearStr) {
    if (!diaStr) return null;
    
    // Formato: "27/Abr"
    const parts = diaStr.split('/');
    if (parts.length === 2) {
        const d = parseInt(parts[0], 10);
        const mStr = parts[1].toLowerCase();
        let m = mesMapLME[mStr];
        if (m === undefined) return null;
        
        // Determina o ano. Se currentYearStr não for passado, usa o atual.
        let y = currentYearStr ? parseInt(currentYearStr, 10) : new Date().getFullYear();
        // Nota: O site pode ter 'Dez' no relatório de 'Jan/2026'.
        // Trataremos isso comparando se m=11 e o mês do relatório é 0.
        return new Date(y, m, d);
    }
    
    // Formato antigo: "dd/mm/yyyy"
    if (parts.length >= 3) {
        let [d, m, y] = parts.map(Number);
        if (y < 100) y += 2000;
        return new Date(y, m - 1, d);
    }
    return null;
}

function weekKey(dateObj) {
    // Semana começa na segunda-feira — retorna "YYYY-Www"
    const d = new Date(dateObj);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
    const year = d.getFullYear();
    const start = new Date(year, 0, 1);
    const weekNum = Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function avg(arr) {
    const valid = arr.filter(v => v !== null && v !== undefined);
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
}

app.get('/api/lme/relatorio-semanal', async (req, res) => {
    try {
        const mes = req.query.mes; // ex: "6-2026"
        if (!mes) return res.status(400).json({ error: 'Parâmetro mes obrigatório. Ex: ?mes=6-2026' });

        // 1. Busca dados do mês atual
        const targetUrl = `https://shockmetais.com.br/lme/${mes}`;
        const { data: html } = await axios.get(targetUrl, { timeout: 15000 });
        const $ = cheerio.load(html);

        // 2. Extrai opções de meses disponíveis
        const mesesDisponiveis = [];
        $('#meslme option').each((i, el) => {
            mesesDisponiveis.push({ valor: $(el).val(), texto: $(el).text().trim() });
        });

        const reqYear = mes.split('-')[1];

        // 3. Extrai linhas diárias
        const dailyRows = [];
        $('#boxtabela table tbody tr').each((i, el) => {
            const tds = $(el).find('td');
            if (tds.length < 8) return;
            const isMedia   = $(tds[0]).hasClass('lmemedia');
            const isMensal  = $(tds[0]).hasClass('lmemensal');
            if (isMedia || isMensal) return; // pula médias do site externo

            const diaStr = $(tds[0]).text().trim();
            const dateObj = parseDate(diaStr, reqYear);
            if (!dateObj) return;

            dailyRows.push({
                data:     diaStr,
                dateObj,
                cobre:    parseNum($(tds[1]).text()),
                zinco:    parseNum($(tds[2]).text()),
                aluminio: parseNum($(tds[3]).text()),
                chumbo:   parseNum($(tds[4]).text()),
                estanho:  parseNum($(tds[5]).text()),
                niquel:   parseNum($(tds[6]).text()),
                dolar:    parseNum($(tds[7]).text()),
            });
        });

        const METALS = ['cobre', 'zinco', 'aluminio', 'chumbo', 'estanho', 'niquel'];

        // 4. Agrupa por semana
        const weekMap = new Map();
        dailyRows.forEach(row => {
            const wk = weekKey(row.dateObj);
            if (!weekMap.has(wk)) weekMap.set(wk, []);
            weekMap.get(wk).push(row);
        });

        // 5. Calcula média mensal de 100% LME (para usar em cada semana)
        // Calcula todas as semanas primeiro para ter a média mensal
        const allWeekLME = {}; // wk -> {metal: valor100pct}
        weekMap.forEach((days, wk) => {
            const entry = {};
            METALS.forEach(m => {
                const mediaMetal = avg(days.map(d => d[m]));
                const mediaDolar = avg(days.map(d => d.dolar));
                entry[m] = (mediaMetal !== null && mediaDolar !== null)
                    ? (mediaMetal * mediaDolar) / 1000 : null;
            });
            entry.dolar = avg(days.map(d => d.dolar));
            allWeekLME[wk] = entry;
        });

        // Média mensal de 100% LME por metal
        const mediaMensalLME = {};
        METALS.forEach(m => {
            const vals = Object.values(allWeekLME).map(e => e[m]).filter(v => v !== null);
            mediaMensalLME[m] = vals.length ? avg(vals) : null;
        });
        mediaMensalLME.dolar = avg(dailyRows.map(d => d.dolar).filter(v => v !== null));

        // 6. Monta blocos semanais com todos os cálculos
        const sortedWeekKeys = [...weekMap.keys()].sort();
        const weekBlocks = sortedWeekKeys.map((wk, idx) => {
            const days = weekMap.get(wk);
            const prevWk = idx > 0 ? sortedWeekKeys[idx - 1] : null;
            const prevLME = prevWk ? allWeekLME[prevWk] : null;
            const prevPrevWk = idx > 1 ? sortedWeekKeys[idx - 2] : null;

            // Médias semanais
            const mediaSemanal = {};
            METALS.forEach(m => { mediaSemanal[m] = avg(days.map(d => d[m])); });
            mediaSemanal.dolar = avg(days.map(d => d.dolar));

            // 100% LME = (média_metal * média_dolar) / 1000
            const lme100 = {};
            METALS.forEach(m => {
                lme100[m] = (mediaSemanal[m] !== null && mediaSemanal.dolar !== null)
                    ? (mediaSemanal[m] * mediaSemanal.dolar) / 1000 : null;
            });
            lme100.dolar = mediaSemanal.dolar;

            // SEMANA ANTERIOR = 100% LME da semana anterior
            const semanaAnterior = {};
            METALS.forEach(m => { semanaAnterior[m] = prevLME ? prevLME[m] : null; });
            semanaAnterior.dolar = prevLME ? prevLME.dolar : null;

            // OSCILAÇÃO R$ = 100% LME - SEMANA ANTERIOR
            const oscRS = {};
            METALS.forEach(m => {
                oscRS[m] = (lme100[m] !== null && semanaAnterior[m] !== null)
                    ? lme100[m] - semanaAnterior[m] : null;
            });
            oscRS.dolar = (lme100.dolar !== null && semanaAnterior.dolar !== null)
                ? lme100.dolar - semanaAnterior.dolar : null;

            // OSCILAÇÃO % = oscRS / semanaAnterior
            const oscPct = {};
            METALS.forEach(m => {
                oscPct[m] = (oscRS[m] !== null && semanaAnterior[m] !== null && semanaAnterior[m] !== 0)
                    ? oscRS[m] / semanaAnterior[m] : null;
            });
            oscPct.dolar = (oscRS.dolar !== null && semanaAnterior.dolar !== null && semanaAnterior.dolar !== 0)
                ? oscRS.dolar / semanaAnterior.dolar : null;

            // FECHAMENTO % (SEMANA ANTERIOR) = OSCILAÇÃO % da semana anterior
            const fechamentoPct = {};
            if (prevPrevWk) {
                const prevPrevLME = allWeekLME[prevPrevWk];
                METALS.forEach(m => {
                    const osc = (prevLME && prevPrevLME && prevLME[m] !== null && prevPrevLME[m] !== null && prevPrevLME[m] !== 0)
                        ? (prevLME[m] - prevPrevLME[m]) / prevPrevLME[m] : null;
                    fechamentoPct[m] = osc;
                });
                fechamentoPct.dolar = (prevLME && prevPrevLME && prevLME.dolar !== null && prevPrevLME.dolar !== null && prevPrevLME.dolar !== 0)
                    ? (prevLME.dolar - prevPrevLME.dolar) / prevPrevLME.dolar : null;
            } else {
                [...METALS, 'dolar'].forEach(m => { fechamentoPct[m] = null; });
            }

            // Formata dias para exibição (pad até 5 dias)
            const daysDisplay = [];
            for (let i = 0; i < 5; i++) {
                daysDisplay.push(days[i] ? {
                    data:     days[i].data,
                    cobre:    days[i].cobre,
                    zinco:    days[i].zinco,
                    aluminio: days[i].aluminio,
                    chumbo:   days[i].chumbo,
                    estanho:  days[i].estanho,
                    niquel:   days[i].niquel,
                    dolar:    days[i].dolar,
                } : { data: '—', cobre: null, zinco: null, aluminio: null, chumbo: null, estanho: null, niquel: null, dolar: null });
            }

            const firstDate = days[0].data;
            const lastDate  = days[days.length - 1].data;

            return {
                weekKey: wk,
                header:  firstDate,
                lastDay: lastDate,
                label:   `${firstDate} → ${lastDate}`,
                days:    daysDisplay,
                computed: {
                    'MEDIA SEMANAL':                    mediaSemanal,
                    '100% LME':                         lme100,
                    'SEMANA ANTERIOR':                  semanaAnterior,
                    'FECHAMENTO % ( SEMANA ANTERIOR )': fechamentoPct,
                    'OSCILAÇÃO %':                      oscPct,
                    'OSCILAÇÃO R$':                     oscRS,
                    'MEDIA MENSAL':                     mediaMensalLME,
                }
            };
        });

        res.json({ semanas: weekBlocks.reverse(), mesesDisponiveis });
    } catch (err) {
        console.error('Erro GET /api/lme/relatorio-semanal:', err.message);
        res.status(500).json({ error: 'Erro ao gerar relatório semanal LME: ' + err.message });
    }
});

// ─── API: LME Meses Disponíveis ───────────────────────────────────────────────
app.get('/api/lme/meses', async (req, res) => {
    try {
        const { data: html } = await axios.get(`https://shockmetais.com.br/lme/`, { timeout: 10000 });
        const $ = cheerio.load(html);
        const meses = [];
        $('#meslme option').each((i, el) => {
            meses.push({ valor: $(el).val(), texto: $(el).text().trim() });
        });
        res.json(meses);
    } catch (err) {
        console.error('Erro GET /api/lme/meses:', err.message);
        res.status(500).json({ error: 'Erro ao buscar meses LME.' });
    }
});

// ─── API: LME Gerar Excel (Node.js / ExcelJS — sem Python) ───────────────────
app.post('/api/lme/gerar-excel', async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const { semana, mesLabel } = req.body;
        if (!semana) return res.status(400).json({ error: 'Dados da semana obrigatórios.' });

        const wb = new ExcelJS.Workbook();
        wb.creator = 'ApexTech Metais';
        const ws = wb.addWorksheet('TABELA LME', { pageSetup: { paperSize: 9, orientation: 'landscape' } });

        // ── Estilos ──
        const METALS = ['cobre', 'zinco', 'aluminio', 'chumbo', 'estanho', 'niquel', 'dolar'];
        const METAL_LABELS = ['COBRE', 'ZINCO', 'ALUMÍNIO', 'CHUMBO', 'ESTANHO', 'NÍQUEL', 'DÓLAR'];
        const HDR_COLORS   = ['FF0000', 'E6B8B7', 'A6A6A6', 'D9D9D9', 'B5B059', 'FFFFFF', '70AD47'];

        const fontBase = { name: 'Calibri', size: 11 };
        const bold = { ...fontBase, bold: true };
        const boldWhite = { ...bold, color: { argb: 'FFFFFFFF' } };
        const centerAlign = { horizontal: 'center', vertical: 'middle' };
        const leftAlign   = { horizontal: 'left',   vertical: 'middle' };

        const thin = { style: 'thin', color: { argb: 'FF000000' } };
        const border = { top: thin, bottom: thin, left: thin, right: thin };

        function fill(hex)  { return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } }; }

        // ── Widths ──
        ws.getColumn(1).width = 3;
        ws.getColumn(2).width = 36;
        METALS.forEach((_, i) => { ws.getColumn(i + 3).width = 17; });

        // ── Título ──
        ws.mergeCells('B1:I1');
        const titleCell = ws.getCell('B1');
        const labelFull = `COTACAO VALIDA PARA A SEMANA: ${semana.label || semana.header}`.toUpperCase();
        titleCell.value = labelFull;
        titleCell.font  = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF000000' } };
        titleCell.fill  = fill('FFFF00');
        titleCell.alignment = centerAlign;
        titleCell.border = border;
        ws.getRow(1).height = 30;

        ws.getRow(2).height = 10; // Espaço
        
        // ── Cabeçalho da Tabela (linha 3) ──
        ws.getRow(3).height = 20;
        const hdrRow = ws.getRow(3);
        hdrRow.getCell(2).value = 'DATA';
        hdrRow.getCell(2).fill  = fill('000000');
        hdrRow.getCell(2).font  = boldWhite;
        hdrRow.getCell(2).alignment = centerAlign;
        hdrRow.getCell(2).border = border;

        METALS.forEach((_, i) => {
            const c = hdrRow.getCell(i + 3);
            c.value     = METAL_LABELS[i];
            c.fill      = fill(HDR_COLORS[i]);
            c.font      = bold;
            c.alignment = centerAlign;
            c.border    = border;
        });

        // ── Dias (linhas 4–8) ──
        const days = semana.days || [];
        for (let i = 0; i < 5; i++) {
            const rowNum = 4 + i;
            ws.getRow(rowNum).height = 18;
            const r = ws.getRow(rowNum);
            const day = days[i] || {};
            r.getCell(2).value     = day.data || '—';
            r.getCell(2).font      = bold;
            r.getCell(2).alignment = centerAlign;
            r.getCell(2).border    = border;

            METALS.forEach((m, mi) => {
                const c = r.getCell(mi + 3);
                const v = day[m];
                c.value     = (v !== null && v !== undefined) ? v : '—';
                c.font      = fontBase;
                c.alignment = centerAlign;
                c.border    = border;
                if (typeof v === 'number') {
                    c.numFmt = m === 'dolar' ? '0.0000' : 'R$ #,##0.00';
                }
            });
        }
        
        ws.getRow(9).height = 10; // Espaço

        // ── Linhas Computadas (10–19) ──
        const comp = semana.computed || {};
        const COMP_ROWS = [
            { lbl: 'MEDIA SEMANAL',                   key: 'MEDIA SEMANAL',                    bg: 'E7E6E6', lblFont: bold, fmt: 'R$ #,##0.00',   dolFmt: '$ 0.0000'    },
            { space: true },
            { lbl: '100% LME',                        key: '100% LME',                         bg: 'FFFF00', lblFont: bold, fmt: 'R$ #,##0.00', dolFmt: '$ 0.0000'   },
            { space: true },
            { lbl: 'SEMANA ANTERIOR',                 key: 'SEMANA ANTERIOR',                  bg: '000000', lblFont: boldWhite, fmt: 'R$ #,##0.00', dolFmt: '$ #,##0.0000' },
            { lbl: 'FECHAMENTO % ( SEMANA ANTERIOR )',  key: 'FECHAMENTO % ( SEMANA ANTERIOR )', bg: 'FFFFFF', lblFont: { ...bold, color: {argb:'FF00B050'} }, fmt: '0.00%', dolFmt: '0.00%'    },
            { space: true },
            { lbl: 'OSCILAÇÃO %',                     key: 'OSCILAÇÃO %',                      bg: '00B0F0', lblFont: bold, fmt: '0.00%',      dolFmt: '0.00%'    },
            { space: true },
            { lbl: 'OSCILAÇÃO R$',                    key: 'OSCILAÇÃO R$',                     bg: 'E2EFDA', lblFont: bold, fmt: 'R$ #,##0.0000', dolFmt: '$ #,##0.0000' },
            { space: true },
            { lbl: 'MEDIA MENSAL',                    key: 'MEDIA MENSAL',                     bg: 'A6A6A6', lblFont: bold, fmt: 'R$ #,##0.00',  dolFmt: '$ #,##0.00' },
        ];

        let curRow = 10;
        COMP_ROWS.forEach((row) => {
            if (row.space) {
                ws.getRow(curRow).height = 8;
                curRow++;
                return;
            }
            ws.getRow(curRow).height = 20;
            const r = ws.getRow(curRow);
            r.getCell(2).value     = row.lbl;
            r.getCell(2).font      = row.lblFont;
            r.getCell(2).fill      = fill(row.bg);
            r.getCell(2).alignment = centerAlign;
            r.getCell(2).border    = border;

            const vals = comp[row.key] || {};
            METALS.forEach((m, mi) => {
                const c  = r.getCell(mi + 3);
                const v  = vals[m];
                c.fill      = fill(row.bg);
                c.font      = bold;
                c.alignment = centerAlign;
                c.border    = border;
                
                if (row.key === 'FECHAMENTO % ( SEMANA ANTERIOR )' || row.key === 'OSCILAÇÃO %' || row.key === 'OSCILAÇÃO R$') {
                    if (v !== null && v !== undefined) {
                        c.font = { ...bold, color: { argb: v >= 0 ? 'FF00B050' : 'FFFF0000' } };
                    }
                }
                
                if (row.key === 'OSCILAÇÃO R$' && v !== null && v !== undefined) {
                    const arrow = v >= 0 ? '⬆ ' : '⬇ ';
                    const pre = m === 'dolar' ? '$ ' : 'R$ ';
                    c.value = `${arrow}${v < 0 ? '-' : ''}${pre}${Math.abs(v).toFixed(4).replace('.', ',')}`;
                    c.numFmt = '@'; 
                } else if (v !== null && v !== undefined) {
                    c.value  = v;
                    c.numFmt = m === 'dolar' ? row.dolFmt : row.fmt;
                } else {
                    c.value = '—';
                }
            });
            curRow++;
        });

        // ── Tabela Resumo ──
        curRow += 2;
        ws.getRow(curRow).height = 20;
        const sumHdr = ws.getRow(curRow);
        sumHdr.getCell(2).value = 'TIPO';
        sumHdr.getCell(2).fill  = fill('A6A6A6');
        sumHdr.getCell(2).font  = bold;
        sumHdr.getCell(2).alignment = centerAlign;
        sumHdr.getCell(2).border = border;
        METALS.forEach((_, i) => {
            const c = sumHdr.getCell(i + 3);
            c.value     = METAL_LABELS[i];
            c.fill      = fill('A6A6A6');
            c.font      = bold;
            c.alignment = centerAlign;
            c.border    = border;
        });

        const SUMMARY_ROWS = [
            { lbl: 'SEMANA ANTERIOR', key: 'SEMANA ANTERIOR', fmt: 'R$ #,##0.00', dolFmt: '0.00', bg: 'D9E1F2' },
            { lbl: 'LME ATUAL',       key: '100% LME',        fmt: 'R$ #,##0.00', dolFmt: '0.00', bg: 'FFF2CC' },
        ];
        curRow++;
        SUMMARY_ROWS.forEach((row) => {
            ws.getRow(curRow).height = 20;
            const r = ws.getRow(curRow);
            r.getCell(2).value     = row.lbl;
            r.getCell(2).font      = { ...fontBase, italic: true };
            r.getCell(2).fill      = fill(row.bg);
            r.getCell(2).alignment = leftAlign;
            r.getCell(2).border    = border;
            const vals = comp[row.key] || {};
            METALS.forEach((m, mi) => {
                const c = r.getCell(mi + 3);
                const v = vals[m];
                c.fill      = fill(row.bg);
                c.font      = fontBase;
                c.alignment = centerAlign;
                c.border    = border;
                if (v !== null && v !== undefined) {
                    c.value  = v;
                    c.numFmt = m === 'dolar' ? row.dolFmt : row.fmt;
                } else {
                    c.value = '—';
                }
            });
            curRow++;
        });

        // ── Linha Oscilação com setas (Bottom table) ──
        ws.getRow(curRow).height = 20;
        const oscRow = ws.getRow(curRow);
        oscRow.getCell(2).value     = 'Osilacao';
        oscRow.getCell(2).font      = { ...bold, italic: true };
        oscRow.getCell(2).alignment = leftAlign;
        oscRow.getCell(2).border    = border;

        const oscVals = comp['OSCILAÇÃO R$'] || {};
        METALS.forEach((m, mi) => {
            const c = oscRow.getCell(mi + 3);
            const v = oscVals[m];
            c.alignment = centerAlign;
            c.border    = border;
            if (v !== null && v !== undefined) {
                const arrow = v >= 0 ? '⬆' : '⬇';
                const colorHex = v >= 0 ? 'FF00B050' : 'FFFF0000';
                const prefix = m === 'dolar' ? '$ ' : 'R$ ';
                const decimals = m === 'dolar' ? 4 : 4; // Use 4 decimals since oscillation requires precision
                c.value = `${arrow} ${v < 0 ? '-' : ''}${prefix}${Math.abs(v).toFixed(decimals).replace('.', ',')}`;
                c.font  = { ...bold, color: { argb: colorHex } };
            } else {
                c.value = '—';
                c.font  = fontBase;
            }
        });

        // ── Gera buffer e envia ──
        const safeName = (semana.header || 'semana').replace(/\//g, '-');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="LME-ApexTech-${safeName}.xlsx"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Erro POST /api/lme/gerar-excel:', err.message);
        res.status(500).json({ error: 'Erro ao gerar Excel: ' + err.message });
    }
});

// ─── API: LME (Scraping e Proxy — mantido para dashboard existente) ────────────
app.get('/api/lme/tabela/:mes', async (req, res) => {
    try {
        const mes = req.params.mes;
        const targetUrl = `https://shockmetais.com.br/lme/${mes}`;
        const { data } = await axios.get(targetUrl, { timeout: 15000 });
        const $ = cheerio.load(data);
        
        const cotacoes = [];
        $('#boxtabela table tbody tr').each((index, element) => {
            const colunas = $(element).find('td');
            if (colunas.length > 0) {
                const dia      = $(colunas[0]).text().trim();
                const cobre    = $(colunas[1]).text().trim();
                const zinco    = $(colunas[2]).text().trim();
                const aluminio = $(colunas[3]).text().trim();
                const chumbo   = $(colunas[4]).text().trim();
                const estanho  = $(colunas[5]).text().trim();
                const niquel   = $(colunas[6]).text().trim();
                const dolar    = $(colunas[7]).text().trim();
                const isMedia  = $(colunas[0]).hasClass('lmemedia');
                const isMensal = $(colunas[0]).hasClass('lmemensal');
                cotacoes.push({ dia, cobre, zinco, aluminio, chumbo, estanho, niquel, dolar,
                    tipo: isMensal ? 'mensal' : (isMedia ? 'semanal' : 'diaria') });
            }
        });

        const mesesDisponiveis = [];
        $('#meslme option').each((i, el) => {
            mesesDisponiveis.push({ valor: $(el).val(), texto: $(el).text() });
        });

        res.json({ cotacoes, mesesDisponiveis });
    } catch (err) {
        console.error('Erro GET /api/lme/tabela:', err.message);
        res.status(500).json({ error: 'Erro ao buscar tabela LME.' });
    }
});

app.post('/api/lme/graflme', async (req, res) => {
    try {
        const response = await axios.post('https://shockmetais.com.br/lme/graflme', new URLSearchParams(req.body), { timeout: 15000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        res.json(response.data);
    } catch (err) {
        console.error('Erro POST /api/lme/graflme:', err.message);
        res.status(500).json({ error: 'Erro ao buscar gráfico LME.' });
    }
});

app.post('/api/lme/varialme', async (req, res) => {
    try {
        const response = await axios.post('https://shockmetais.com.br/lme/varialme', new URLSearchParams(req.body), { timeout: 15000,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const $ = cheerio.load(response.data);
        const variaveis = [];
        $('.card').each((i, el) => {
            const titulo = $(el).find('.card-header').text().trim();
            const cols = $(el).find('.card-body .col-6');
            let dataAnt = '', valAnt = '', dataAtual = '', valAtual = '';
            if (cols.length >= 2) {
                dataAtual = $(cols[0]).find('small').text().trim();
                valAtual  = $(cols[0]).find('b').text().trim();
                dataAnt   = $(cols[1]).find('small').text().trim();
                valAnt    = $(cols[1]).find('b').text().trim();
            }
            const footerText = $(el).find('.card-footer h3').text().trim();
            const iconClass  = $(el).find('.card-footer i').attr('class') || '';
            const isPositive = footerText.includes('+') || $(el).find('.card-footer h3').hasClass('text-success') || iconClass.includes('up');
            variaveis.push({ titulo, dataAtual, valAtual, dataAnt, valAnt, footerText, isPositive });
        });
        res.json({ html: response.data, parsed: variaveis });
    } catch (err) {
        console.error('Erro POST /api/lme/varialme:', err.message);
        res.status(500).json({ error: 'Erro ao buscar variações LME.' });
    }
});


// ─── CRUD Clientes (com Paginação Server-side) ─────────────────────────────────
app.get('/api/clientes', async (req, res) => {
    try {
        const page = parseInt(req.query.page);
        const limit = parseInt(req.query.limit) || 50;
        const search = (req.query.search || '').trim().toLowerCase();

        if (dbAvailable) {
            let whereClause = '';
            let params = [];
            if (search) {
                whereClause = `WHERE LOWER(nome) LIKE ? OR LOWER(COALESCE(fantasia,'')) LIKE ? OR LOWER(COALESCE(cnpj,'')) LIKE ? OR LOWER(COALESCE(cpf,'')) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ?`;
                params.push(`%${search}%`);
            }

            const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM clientes ${whereClause}`, params);
            const total = parseInt(countResult[0].total);

            let dataQuery = `SELECT * FROM clientes ${whereClause} ORDER BY nome ASC`;
            if (page) {
                const offset = (page - 1) * limit;
                dataQuery += ` LIMIT ? OFFSET ?`;
                params.push(limit, offset);
            }

            const result = await pool.query(dataQuery, params);
            if (page) {
                return res.json({
                    data: result[0],
                    total,
                    page,
                    totalPages: Math.ceil(total / limit)
                });
            }
            return res.json(result[0]);
        } else {
            let list = memStore.clientes || [];
            if (search) {
                list = list.filter(c => 
                    (c.nome || '').toLowerCase().includes(search) ||
                    (c.fantasia || '').toLowerCase().includes(search) ||
                    (c.cnpj || '').toLowerCase().includes(search) ||
                    (c.cpf || '').toLowerCase().includes(search) ||
                    (c.email || '').toLowerCase().includes(search)
                );
            }
            const total = list.length;
            if (page) {
                const start = (page - 1) * limit;
                return res.json({
                    data: list.slice(start, start + limit),
                    total,
                    page,
                    totalPages: Math.ceil(total / limit)
                });
            }
            res.json(list);
        }
    } catch (err) {
        console.error('Erro ao buscar clientes:', err);
        res.status(500).json({ error: 'Erro ao buscar clientes.' });
    }
});

app.get('/api/clientes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (dbAvailable) {
            const result = await pool.query('SELECT * FROM clientes WHERE id = ?', [id]);
            if (result[0].length === 0) return res.status(404).json({ error: 'Cliente não encontrado.' });
            return res.json(result[0][0]);
        }
        res.status(404).json({ error: 'Cliente não encontrado.' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar cliente.' });
    }
});

app.post('/api/clientes', async (req, res) => {
    try {
        const { codigo, nome, fantasia, telefone1, telefone2, cnpj, cpf, ie, rg,
                email, endereco, numero, bairro, cidade, uf, pais, cep,
                tipo_cliente, contato_comercial, contato_financeiro, status,
                vendedor, dias, filial } = req.body;

        if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

        if (dbAvailable) {
            let codigoNum = parseInt(codigo);
            if (isNaN(codigoNum) || !codigoNum) {
                const maxRes = await pool.query('SELECT COALESCE(MAX(codigo), 0) + 1 AS proximo FROM clientes');
                codigoNum = parseInt(maxRes[0][0]?.proximo) || Math.floor(Date.now() % 100000);
            }

            const result = await pool.query(
                `INSERT INTO clientes (
                    codigo, nome, fantasia, telefone1, telefone2,
                    cnpj, cpf, ie, rg, email,
                    endereco, numero, bairro, cidade, uf,
                    pais, cep, tipo_cliente, contato_comercial,
                    contato_financeiro, status, vendedor, dias, filial
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [codigoNum, nome, fantasia, telefone1, telefone2,
                 cnpj, cpf, ie, rg, email,
                 endereco, numero, bairro, cidade, uf,
                 pais || 'BR', cep, tipo_cliente, contato_comercial,
                 contato_financeiro, status || 'ATIVO', vendedor, dias !== undefined && dias !== null ? String(dias).trim() : '0', filial || '01']
            );
            return res.json(result[0][0]);
        }
        res.status(503).json({ error: 'Banco de dados indisponível.' });
    } catch (err) {
        console.error('Erro ao criar cliente:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/clientes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { codigo, nome, fantasia, telefone1, telefone2, cnpj, cpf, ie, rg,
                email, endereco, numero, bairro, cidade, uf, pais, cep,
                tipo_cliente, contato_comercial, contato_financeiro, status,
                usuario_cadastro, vendedor, dias, filial } = req.body;
        if (dbAvailable) {
            const result = await pool.query(
                `UPDATE clientes SET
                    codigo=?, nome=?, fantasia=?, telefone1=?, telefone2=?,
                    cnpj=?, cpf=?, ie=?, rg=?, email=?,
                    endereco=?, numero=?, bairro=?, cidade=?, uf=?,
                    pais=?, cep=?, tipo_cliente=?, contato_comercial=?,
                    contato_financeiro=?, status=?, vendedor=?, dias=?, filial=?
                WHERE id=?`,
                [codigo, nome, fantasia, telefone1, telefone2,
                 cnpj, cpf, ie, rg, email,
                 endereco, numero, bairro, cidade, uf,
                 pais, cep, tipo_cliente, contato_comercial,
                 contato_financeiro, status || 'ATIVO', vendedor, dias !== undefined && dias !== null ? String(dias).trim() : '0', filial,
                 id]
            );
            if (result[0].length === 0) return res.status(404).json({ error: 'Cliente não encontrado.' });
            return res.json(result[0][0]);
        }
        res.status(503).json({ error: 'Banco de dados indisponível.' });
    } catch (err) {
        console.error('Erro ao atualizar cliente:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/clientes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (dbAvailable) {
            await pool.query('DELETE FROM clientes WHERE id = ?', [id]);
            return res.json({ success: true });
        }
        res.status(503).json({ error: 'Banco de dados indisponível.' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao deletar cliente.' });
    }
});


// ══════════════════════════════════════════════════════════════
// PEDIDOS DE VENDA
// ══════════════════════════════════════════════════════════════
// PEDIDOS DE VENDA
// ══════════════════════════════════════════════════════════════

// Buscar próximo número de pedido
app.get('/api/pedidos-venda/proximo-numero', async (req, res) => {
    try {
        if (!dbAvailable) {
            const count = (memStore.pedidos_venda || []).length;
            return res.json({ numero: 'PV-' + String(count + 1).padStart(4, '0') });
        }
        const r = await pool.query("SELECT numero FROM pedidos_venda ORDER BY id DESC LIMIT 1");
        if (r[0].length === 0) return res.json({ numero: 'PV-0001' });
        const last = parseInt(r[0][0].numero.replace('PV-', '')) || 0;
        const next = 'PV-' + String(last + 1).padStart(4, '0');
        return res.json({ numero: next });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Listar todos os pedidos
app.get('/api/pedidos-venda', async (req, res) => {
    try {
        if (!dbAvailable) {
            const list = (memStore.pedidos_venda || []).map(p => {
                const cli = (memStore.clientes || []).find(c => c.id == p.cliente_id);
                return {
                    ...p,
                    cliente_nome: p.cliente_nome || (cli ? (cli.nome || cli.fantasia) : 'Cliente Avulso'),
                    cliente_cnpj: cli ? cli.cnpj : '',
                    cliente_cidade: cli ? cli.cidade : '',
                    cliente_uf: cli ? cli.uf : ''
                };
            });
            return res.json(list.sort((a, b) => b.id - a.id));
        }
        const r = await pool.query(`
            SELECT pv.*, COALESCE(c.nome, pv.cliente_nome, 'Cliente') AS cliente_nome, c.cnpj AS cliente_cnpj, c.cidade AS cliente_cidade, c.uf AS cliente_uf
            FROM pedidos_venda pv
            LEFT JOIN clientes c ON c.id = pv.cliente_id
            ORDER BY pv.id DESC
        `);
        return res.json(r[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Buscar pedido por ID com itens
app.get('/api/pedidos-venda/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!dbAvailable) {
            const p = (memStore.pedidos_venda || []).find(x => x.id === id);
            if (!p) return res.status(404).json({ error: 'Pedido não encontrado' });
            const cli = (memStore.clientes || []).find(c => c.id == p.cliente_id);
            return res.json({
                ...p,
                cliente_nome: p.cliente_nome || (cli ? (cli.nome || cli.fantasia) : ''),
                cliente_cnpj: cli ? cli.cnpj : '',
                cliente_telefone: cli ? cli.telefone1 : '',
                cliente_email: cli ? cli.email : '',
                cliente_endereco: cli ? cli.endereco : '',
                cliente_cidade: cli ? cli.cidade : '',
                cliente_uf: cli ? cli.uf : ''
            });
        }
        const pedido = await pool.query(`
            SELECT pv.*, COALESCE(c.nome, pv.cliente_nome, '') AS cliente_nome, c.cnpj AS cliente_cnpj, c.telefone1 AS cliente_telefone,
                   c.email AS cliente_email, c.endereco AS cliente_endereco, c.cidade AS cliente_cidade, c.uf AS cliente_uf
            FROM pedidos_venda pv
            LEFT JOIN clientes c ON c.id = pv.cliente_id
            WHERE pv.id = ?
        `, [id]);
        if (pedido[0].length === 0) return res.status(404).json({ error: 'Pedido não encontrado' });
        const itens = await pool.query('SELECT * FROM pedidos_venda_itens WHERE pedido_id = ? ORDER BY id', [id]);
        return res.json({ ...pedido[0][0], itens: itens[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Criar pedido
app.post('/api/pedidos-venda', async (req, res) => {
    try {
        const { numero, cliente_id, cliente_nome, data_emissao, data_entrega, status, condicao_pagamento,
                observacoes, desconto_pct, frete, itens, criado_por, criado_por_perfil,
                endereco_entrega, responsavel_recebimento, tipo_frete } = req.body;
        if (!cliente_id && !cliente_nome) {
            return res.status(400).json({ error: 'Cliente é obrigatório.' });
        }
        if (!itens || itens.length === 0) {
            return res.status(400).json({ error: 'Ao menos um item é obrigatório.' });
        }
        const total_itens = itens.reduce((s, i) => s + parseFloat(i.total_item || 0), 0);
        const desc = parseFloat(desconto_pct || 0);
        const fr = parseFloat(frete || 0);
        const total_geral = total_itens * (1 - desc / 100) + fr;
        const cid = (cliente_id && !isNaN(parseInt(cliente_id))) ? parseInt(cliente_id) : null;

        if (!dbAvailable) {
            if (!memStore.pedidos_venda) memStore.pedidos_venda = [];
            const newId = nextId++;
            const item = {
                id: newId,
                numero: numero || ('PV-' + String(newId).padStart(4, '0')),
                cliente_id: cid,
                cliente_nome: cliente_nome || '',
                data_emissao: data_emissao || new Date().toISOString().split('T')[0],
                data_entrega: data_entrega || null,
                status: status || 'Rascunho',
                condicao_pagamento: condicao_pagamento || '',
                observacoes: observacoes || '',
                desconto_pct: desc,
                frete: fr,
                total_itens,
                total_geral,
                criado_por: criado_por || 'Admin',
                criado_por_perfil: criado_por_perfil || 'Administrador',
                endereco_entrega: endereco_entrega || '',
                responsavel_recebimento: responsavel_recebimento || '',
                tipo_frete: tipo_frete || 'CIF - Entrega APEXTECH',
                itens: itens.map((it, idx) => ({ id: idx + 1, ...it })),
                criado_em: new Date().toISOString()
            };
            memStore.pedidos_venda.push(item);
            return res.json(item);
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const pedido = await client.query(`
                INSERT INTO pedidos_venda (numero, cliente_id, cliente_nome, data_emissao, data_entrega, status, condicao_pagamento,
                    observacoes, desconto_pct, frete, total_itens, total_geral, criado_por, criado_por_perfil,
                    endereco_entrega, responsavel_recebimento, tipo_frete)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            `, [numero, cid, cliente_nome || '', data_emissao || new Date().toISOString().split('T')[0],
                 data_entrega || null, status || 'Rascunho', condicao_pagamento, observacoes,
                 desc, fr, total_itens, total_geral, criado_por, criado_por_perfil,
                 endereco_entrega, responsavel_recebimento, tipo_frete]);

            const pedidoId = pedido[0].insertId;
            for (const item of itens) {
                await client.query(`
                    INSERT INTO pedidos_venda_itens (pedido_id, material_id, descricao, unidade, quantidade, preco_unitario, desconto_item, total_item)
                    VALUES (?,?,?,?,?,?,?,?)
                `, [pedidoId, item.material_id || null, item.descricao, item.unidade || 'kg',
                     item.quantidade, item.preco_unitario, item.desconto_item || 0, item.total_item]);
            }

            await client.query('COMMIT');
            const [pedRows] = await pool.query('SELECT * FROM pedidos_venda WHERE id = ? LIMIT 1', [pedidoId]);
            res.json(pedRows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao criar pedido:', err);
        res.status(500).json({ error: err.message });
    }
});

// Atualizar pedido
app.put('/api/pedidos-venda/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { cliente_id, cliente_nome, data_emissao, data_entrega, status, condicao_pagamento,
                observacoes, desconto_pct, frete, itens, criado_por_perfil,
                endereco_entrega, responsavel_recebimento, tipo_frete } = req.body;
        const total_itens = (itens || []).reduce((s, i) => s + parseFloat(i.total_item || 0), 0);
        const desc = parseFloat(desconto_pct || 0);
        const fr = parseFloat(frete || 0);
        const total_geral = total_itens * (1 - desc / 100) + fr;
        const cid = (cliente_id && !isNaN(parseInt(cliente_id))) ? parseInt(cliente_id) : null;

        if (!dbAvailable) {
            const idx = (memStore.pedidos_venda || []).findIndex(x => x.id === id);
            if (idx === -1) return res.status(404).json({ error: 'Pedido não encontrado' });
            memStore.pedidos_venda[idx] = {
                ...memStore.pedidos_venda[idx],
                cliente_id: cid || memStore.pedidos_venda[idx].cliente_id,
                cliente_nome: cliente_nome !== undefined ? cliente_nome : memStore.pedidos_venda[idx].cliente_nome,
                data_emissao,
                data_entrega,
                status,
                condicao_pagamento,
                observacoes,
                desconto_pct: desc,
                frete: fr,
                total_itens,
                total_geral,
                criado_por_perfil,
                endereco_entrega,
                responsavel_recebimento,
                tipo_frete,
                itens: (itens || []).map((it, i) => ({ id: i + 1, ...it })),
                atualizado_em: new Date().toISOString()
            };
            return res.json(memStore.pedidos_venda[idx]);
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`
                UPDATE pedidos_venda SET cliente_id=?, cliente_nome=?, data_emissao=?, data_entrega=?, status=?,
                    condicao_pagamento=?, observacoes=?, desconto_pct=?, frete=?,
                    total_itens=?, total_geral=?, criado_por_perfil=?, endereco_entrega=?,
                    responsavel_recebimento=?, tipo_frete=?, atualizado_em=NOW()
                WHERE id=?
            `, [cid, cliente_nome || '', data_emissao, data_entrega || null, status, condicao_pagamento,
                 observacoes, desc, fr, total_itens, total_geral, criado_por_perfil,
                 endereco_entrega, responsavel_recebimento, tipo_frete, id]);
            await client.query('DELETE FROM pedidos_venda_itens WHERE pedido_id = ?', [id]);
            for (const item of (itens || [])) {
                await client.query(`
                    INSERT INTO pedidos_venda_itens (pedido_id, material_id, descricao, unidade, quantidade, preco_unitario, desconto_item, total_item)
                    VALUES (?,?,?,?,?,?,?,?)
                `, [id, item.material_id || null, item.descricao, item.unidade || 'kg',
                     item.quantidade, item.preco_unitario, item.desconto_item || 0, item.total_item]);
            }
            await client.query('COMMIT');
            const updated = await pool.query('SELECT * FROM pedidos_venda WHERE id=?', [id]);
            const [updRows] = await pool.query('SELECT * FROM pedidos_venda WHERE id = ? LIMIT 1', [id]);
            res.json(updRows[0]);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Deletar pedido
app.delete('/api/pedidos-venda/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!dbAvailable) {
            memStore.pedidos_venda = (memStore.pedidos_venda || []).filter(x => x.id !== id);
            return res.json({ success: true });
        }
        await pool.query('DELETE FROM pedidos_venda WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
app.get('/api/admin/run-migrations', (req, res) => {
    try {
        const { exec } = require('child_process');
        exec('node scripts/force-migrations.js', (err, stdout, stderr) => {
            if (err) {
                return res.status(500).send('<pre>ERRO:\n' + stderr + '\n\nSTDOUT:\n' + stdout + '</pre>');
            }
            res.send('<pre>SUCESSO:\n' + stdout + '\n\nAVISOS:\n' + stderr + '</pre>');
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/run-import-clientes', (req, res) => {
    try {
        const { exec } = require('child_process');
        exec('npm run import:clientes', (err, stdout, stderr) => {
            if (err) {
                return res.status(500).send('<pre>ERRO:\n' + stderr + '\n\nSTDOUT:\n' + stdout + '</pre>');
            }
            res.send('<pre>SUCESSO:\n' + stdout + '\n\nAVISOS:\n' + stderr + '</pre>');
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/run-import-fornecedores', (req, res) => {
    try {
        const { exec } = require('child_process');
        exec('npm run import:fornecedores', (err, stdout, stderr) => {
            if (err) {
                return res.status(500).send('<pre>ERRO:\n' + stderr + '\n\nSTDOUT:\n' + stdout + '</pre>');
            }
            res.send('<pre>SUCESSO:\n' + stdout + '\n\nAVISOS:\n' + stderr + '</pre>');
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// INJEÇÃO DAS ROTAS DO MÓDULO PCP
// ==========================================
app.use('/api/pcp', require('./src/routes/pcp')(pool, dbAvailable, memStore));

if (process.env.NODE_ENV !== 'test') {
    initDatabase().then(() => {
        app.listen(PORT, () => {
            console.log(`🌿 Servidor da ApexTech Metais rodando em http://localhost:${PORT}`);
            console.log(`📦 Modo de dados: MySQL`);
        });
    });
}

module.exports = { app, initDatabase, pool };

