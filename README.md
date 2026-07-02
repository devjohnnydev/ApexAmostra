# Apex Tech Metais - Portal Corporativo & Painel Administrativo LME

Este é o repositório oficial do portal corporativo da **Apex Tech Metais**. O projeto evoluiu de uma landing page estática para um sistema web completo que inclui servidor backend em Node.js, banco de dados persistente, painel de administração privado com controle de conteúdo, web scrapers integrados de cotações de metais e um agendador automatizado de relatórios diários via e-mail (Resend API).

---

## 📌 Visão Geral do Sistema

O portal foi projetado com uma estética visual premium e moderna (Dark Mode), focado em fornecer tanto informações corporativas para clientes finais quanto uma ferramenta de trabalho interna de alta performance para os administradores da empresa.

### 🚀 Principais Módulos

1. **Landing Page Institucional (Página Pública)**
   - Grade responsiva de soluções da empresa com efeito interativo 3D Tilt.
   - Catálogo dinâmico de materiais comercializados.
   - Blog / Seção de notícias atualizada dinamicamente.
   - Tabela de cotações em tempo real mostrando os valores do dia para os principais metais LME e a cotação cambial do dólar.

2. **Painel Administrativo Privado (`/admin.html`)**
   - Sistema de login seguro para administradores.
   - **Gestor de Conteúdo (CMS)**: Permite ativar/desativar seções inteiras da Landing Page, gerenciar o catálogo de materiais e cadastrar notícias/novidades com imagem e links.
   - **Módulo de Relatórios Semanais LME**: Exibe dados históricos estruturados por semanas, calcula automaticamente as médias, variações e estimativas de base de 90% a 110% sobre a cotação do metal.
   - **Exportação de Dados**: Geração automática de relatórios em **PDF Corporativo** (otimizado para impressão/retrato) e planilhas **Excel (.xlsx)**.

3. **Gerenciador e Agendador de E-mails LME**
   - **Configurações do Resend**: Integração com a API do Resend para disparo de e-mails robustos contornando bloqueios de firewalls.
   - **CRUD de Destinatários**: Gestão inline de quem deve receber o relatório diário das cotações da LME.
   - **Agendador Diário**: Processo em segundo plano que roda a cada minuto no servidor, verificando o fuso horário local (`America/Sao_Paulo`) para enviar as cotações automaticamente na hora agendada.
   - **Ação Rápida**: Botão para disparo manual de testes imediatos diretamente para toda a lista de destinatários.

---

## 🛠️ Tecnologias Utilizadas

### 📂 Backend (Node.js & Express)
- **Express**: Servidor HTTP e roteamento de APIs REST.
- **Cheerio & Axios**: Web scraping diário extraindo cotações oficiais e câmbio em tempo real.
- **Axios (Resend API)**: Envio de e-mails dinâmicos utilizando a API HTTP da Resend sobre a porta 443.
- **pg (PostgreSQL)**: Driver de conexão e persistência de dados no banco de dados corporativo da Railway.

### 📂 Frontend (HTML, CSS & Vanilla JS)
- **HTML5 & CSS3 (Vanilla)**: Estruturação semântica e estilização premium baseada em variáveis nativas (`:root`), Flexbox e CSS Grid.
- **Chart.js**: Renderização reativa de gráficos de tendências de preços no painel.
- **ExcelJS**: Biblioteca utilizada pelo navegador para a montagem e estilização sob demanda de planilhas XLSX detalhadas.
- **JsPDF & AutoTable**: Geração e estruturação de documentos PDF profissionais no lado do cliente.

---

## ⚙️ Como Configurar e Executar o Projeto Localmente

### Pré-requisitos
- Node.js instalado (Versão 18 ou superior recomendada).
- Conta no Resend (caso deseje testar o disparo de e-mails).

### Passo a Passo

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/devjohnnydev/apextech.git
   cd apextech
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as Variáveis de Ambiente:**
   Crie um arquivo chamado `.env` na raiz do projeto e adicione as seguintes chaves:
   ```env
   PORT=3000
   DATABASE_URL=seu_link_de_conexao_postgresql (Opcional - usa cache em memória local se estiver vazio)
   RESEND_API_KEY=sua_chave_do_resend (Ex: re_...)
   RESEND_FROM=seu_email_verificado_no_resend (Ex: josetiago@lme.lat)
   ```

4. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```
   O portal estará disponível em: [http://localhost:3000](http://localhost:3000)

---

> Desenvolvido com foco em alta performance, usabilidade inteligente e robustez corporativa. 🌿
