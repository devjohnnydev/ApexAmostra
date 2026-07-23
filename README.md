# Apex Tech Metais - Portal Corporativo & Sistema ERP / Painel LME

Este é o repositório oficial do portal corporativo e sistema ERP de gestão comercial da **Apex Tech Metais**. O projeto evoluiu de uma landing page estática para uma plataforma web completa que inclui servidor backend em Node.js, banco de dados PostgreSQL persistente, controle de estoque inteligente, pedidos de venda, análise de amostras, gestão de fornecedores, web scrapers integrados de cotações de metais e um agendador automatizado de relatórios diários via e-mail (Resend API).

---

## 📌 Visão Geral do Sistema

O portal foi projetado com uma estética visual premium e moderna (Dark Mode), focado em fornecer tanto informações corporativas para clientes finais quanto uma ferramenta ERP interna de alta performance.

### 🚀 Principais Módulos

1. **Landing Page Institucional (Página Pública)**
   - Grade responsiva de soluções da empresa com efeito interativo 3D Tilt.
   - Catálogo dinâmico de materiais comercializados.
   - Blog / Seção de notícias atualizada dinamicamente.
   - Tabela de cotações em tempo real mostrando os valores do dia para os principais metais LME e a cotação cambial do dólar.

2. **Painel ERP & Administrativo Privado (`/admin.html`)**
   - **Pedidos de Venda:** Emissão de pedidos com busca inteligente de clientes do banco de dados, acentos normalizados (NFD), preenchimento automático de prazos/condições, cálculo automático de frete/desconto e atalho rápido para **+ Cadastrar Novo Cliente**.
   - **Geração de PDF de Pedidos:** Exportação com layout corporativo, marca d'água oficial (`logo (2).png`), tabela itemizada e bloco de assinaturas.
   - **Tabela de Preços & Calendário de Vigência:** Widget interativo de calendário visual por dias do mês para consulta e alteração rápida de vigência de preços.
   - **Atalho da Tecla ESC (Escape):** Suporte nativo para cancelar operações ou fechar modais e menudropdowns instantaneamente.
   - **Gestão de Clientes & Fornecedores:** Cadastro completo no PostgreSQL com geração automática de código sequencial e validações.
   - **Análise de Amostras & Estoque Inteligente:** Acompanhamento de materiais e amostragem técnica.
   - **Módulo de Relatórios Semanais LME:** Exibe dados históricos estruturados por semanas, calcula automaticamente as médias, variações e estimativas de base de 90% a 110% sobre a cotação do metal.
   - **Exportação de Dados:** Geração de relatórios em PDF Corporativo e planilhas Excel (.xlsx).

3. **Gerenciador e Agendador de E-mails LME**
   - **Configurações do Resend**: Integração com a API do Resend para disparo de e-mails robustos.
   - **CRUD de Destinatários**: Gestão inline de destinatários para relatórios diários de cotação da LME.
   - **Agendador Diário**: Processo em segundo plano que roda a cada minuto no servidor, verificando o fuso horário local (`America/Sao_Paulo`).

---

## 🛠️ Tecnologias e Bibliotecas Utilizadas

### 📂 Backend (Node.js & Express)
* **Express (`^4.19.2`)**: Servidor HTTP e APIs REST.
* **pg (`^8.21.0`)**: Driver do PostgreSQL com conexão por pooling e resiliência em falhas.
* **Axios & Cheerio**: Requisições externas e web scraping das cotações diárias de metais LME.
* **Puppeteer (`^25.3.0`)**: Renderização e geração de relatórios em PDF fiéis ao design.
* **ExcelJS (`^4.4.0`)**: Manipulação e geração de planilhas Excel (.xlsx).

### 📂 Frontend (HTML5, Vanilla CSS & Javascript)
* **Design System / Dark Mode**: Tema escuro com variáveis CSS e `color-scheme: dark` integrado para calendários nativos do navegador.
* **FontAwesome (`v6.5.0`)**: Ícones vetoriais corporativos.
* **jsPDF & jsPDF-AutoTable**: Geração cliente-side de PDFs de pedidos de venda com marca d'água.
* **Chart.js (`^4.4.0`)**: Gráficos dinâmicos de tendências e cotações da LME.

---

## 🔒 Auditoria de Segurança & Integridade

- **Validação de Entradas & SQL Injection:** Todas as rotas de banco de dados usam consultas parametrizadas (`$1, $2, ...`), impedindo injeções de SQL.
- **Resiliência a Código Sequencial:** O backend calcula automaticamente o próximo `codigo` sequencial livre na tabela de clientes caso não seja informado, evitando violações de unicidade (`NOT NULL UNIQUE`).
- **Tratamento de Timezone:** Datas são formatadas via `formatarDataSemFuso` dividindo a string em componentes `AAAA-MM-DD`, prevenindo o erro comum de deslocamento de 1 dia pelo fuso de Brasília (UTC-3).

---

## ⚙️ Como Configurar e Executar o Projeto Localmente

### Pré-requisitos
- Node.js instalado (Versão 18 ou superior).
- Banco de dados PostgreSQL configurado (local ou cloud como Railway/Neon).

### Passo a Passo

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/devjohnnydev/ApexAmostra.git
   cd ApexAmostra/apextech
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as Variáveis de Ambiente (`.env`):**
   ```env
   PORT=3000
   DATABASE_URL=postgres://usuario:senha@host:5432/banco
   RESEND_API_KEY=re_...
   RESEND_FROM=suaempresa@dominio.com
   ```

4. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```
   O sistema estará disponível em: [http://localhost:3000](http://localhost:3000)

---

> Desenvolvido para a **Apex Tech Metais** com foco em alta performance, usabilidade inteligente e inteligência comercial. 🌿
