const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
    console.log('Iniciando o navegador...');
    let chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    
    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: "new",
        args: ['--no-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        console.log('Navegando para o site ao vivo...');
        // Oculta erros 404/503 na saida padrao
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        
        await page.goto('https://apextechmetais.apextechmetais.com.br/admin.html', { waitUntil: 'networkidle2', timeout: 30000 });

        console.log('Esperando carregar as permissões e o dashboard...');
        await new Promise(r => setTimeout(r, 5000));

        console.log('Tirando screenshot do dashboard original...');
        await page.screenshot({ path: 'live_dashboard.png' });

        console.log('Clicando em Fornecedores...');
        const clicked = await page.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-target="fornecedores-view"]');
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });

        console.log('Clique em Fornecedores disparado:', clicked);
        await new Promise(r => setTimeout(r, 3000));

        console.log('Tirando screenshot da tela de Fornecedores...');
        await page.screenshot({ path: 'live_fornecedores.png' });

        const secState = await page.evaluate(() => {
            const sec = document.getElementById('fornecedores-view');
            return sec ? { id: sec.id, display: sec.style.display, cssText: sec.style.cssText, className: sec.className, innerTextLength: sec.innerText.length } : null;
        });
        console.log('Estado do fornecedores-view:', secState);

        const bodyContent = await page.evaluate(() => document.body.innerHTML.substring(0, 500));
        console.log('Body start:', bodyContent);

    } catch (err) {
        console.error('Erro durante o teste:', err);
    } finally {
        await browser.close();
    }
})();
