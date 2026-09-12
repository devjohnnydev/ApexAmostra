const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
    let chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    
    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: "new",
        args: ['--no-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        const localUrl = 'file:///' + path.join(__dirname, 'admin.html').replace(/\\/g, '/');
        console.log('Navegando para:', localUrl);
        await page.goto(localUrl, { waitUntil: 'networkidle2' });

        // Overwrite login status so it doesn't try to auth
        await page.evaluate(() => {
            sessionStorage.setItem('apex_admin_logged_in', 'true');
            if (document.getElementById('login-overlay')) {
                document.getElementById('login-overlay').style.display = 'none';
            }
            if (document.getElementById('admin-dashboard-container')) {
                document.getElementById('admin-dashboard-container').style.display = 'flex';
            }
        });

        console.log('Clicando em Planejamento Estratégico...');
        const clicked = await page.evaluate(() => {
            const btn = document.querySelector('.nav-item[data-target="planejamento-estrategicov3-view"]');
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        console.log('Clicado:', clicked);

        await new Promise(r => setTimeout(r, 1000));

        const boundingBox = await page.evaluate(() => {
            const sec = document.getElementById('planejamento-estrategicov3-view');
            if (!sec) return null;
            const rect = sec.getBoundingClientRect();
            const computed = window.getComputedStyle(sec);
            const mainContent = document.querySelector('.main-content');
            const mainRect = mainContent ? mainContent.getBoundingClientRect() : null;
            const container = document.getElementById('admin-dashboard-container');
            const containerRect = container ? container.getBoundingClientRect() : null;
                let current = sec.parentElement;
                let hiddenParent = null;
                while (current && current.tagName !== 'BODY') {
                    const comp = window.getComputedStyle(current);
                    if (comp.display === 'none' || comp.visibility === 'hidden' || comp.opacity === '0' || comp.height === '0px') {
                        hiddenParent = current.tagName + '#' + current.id + '.' + current.className + ' (display: ' + comp.display + ', height: ' + comp.height + ')';
                        break;
                    }
                    current = current.parentElement;
                }

            return {
                id: sec.id,
                display: computed.display,
                width: rect.width,
                height: rect.height,
                hiddenParent: hiddenParent
            };
        });

        console.log('Bounding Box e Estilos:', boundingBox);
        
        await page.screenshot({ path: 'local_fornecedores.png' });

    } catch (err) {
        console.error('Erro:', err);
    } finally {
        await browser.close();
    }
})();
