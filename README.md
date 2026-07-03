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

## 🛠️ Tecnologias e Bibliotecas Utilizadas

O sistema da **Apex Tech Metais** foi projetado utilizando soluções robustas tanto no frontend quanto no backend. Abaixo detalhamos a stack completa:

### 📂 Backend (Node.js & Express)
* **Express (`^4.19.2`)**: Framework web para criação do servidor HTTP, roteamento de APIs REST e entrega de arquivos estáticos.
* **Axios (`^1.18.0`)**: Cliente HTTP robusto utilizado para requisições externas (integração com a API do Resend e consultas a fontes de cotações).
* **Cheerio (`^1.2.0`)**: Parser de HTML baseado em jQuery para raspagem de dados (web scraping) das cotações diárias de metais LME.
* **Puppeteer (`^25.3.0`)**: Navegador headless integrado para renderizar o dashboard administrativamente no servidor e gerar relatórios em PDF fiéis ao design.
* **pg (`^8.21.0`)**: Driver oficial do PostgreSQL utilizado para pooling de conexões e persistência de dados.
* **Nodemailer (`^9.0.3`)**: Biblioteca para envio e formatação de e-mails direto pelo servidor.
* **ExcelJS (`^4.4.0`)**: Ferramenta de manipulação de planilhas para a estruturação lógica e gravação do arquivo Excel (.xlsx) no backend.
* **Canvas (`^3.2.3`) & JSDOM (`^29.1.1`)**: Emulação de ambiente DOM e renderização 2D para processamentos gráficos em servidor headless.
* **Dotenv (`^16.4.5`)**: Gerenciador de variáveis de ambiente para armazenamento seguro de chaves de API, credenciais e configurações de porta.

### 📂 Frontend (HTML5, Vanilla CSS & Javascript)
* **FontAwesome (`v6.5.0`)**: Biblioteca de ícones vetoriais moderna para a barra de navegação e botões do painel.
* **Google Fonts**: Fontes tipográficas premium **Raleway** e **Lato** para um design limpo e corporativo.
* **Chart.js (`^4.4.0`)**: Renderização dinâmica de gráficos de barras e tendências históricas de cotações com interatividade.
* **Chartjs-plugin-datalabels (`^2.2.0`)**: Rótulos e indicadores numéricos acima das barras dos gráficos.
* **html2canvas (`^1.4.1`)**: Captura do layout e elementos DOM da tela do dashboard administrativo, convertendo-os em imagens de alta fidelidade para compartilhamento rápido ou exportação.
* **jsPDF (`^2.5.1`)**: Biblioteca de geração de PDFs dinâmicos diretamente no lado do cliente.

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

