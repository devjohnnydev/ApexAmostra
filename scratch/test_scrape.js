const axios = require('axios');
const cheerio = require('cheerio');

async function run() {
    try {
        const { data: html } = await axios.get('https://shockmetais.com.br/lme/');
        const $ = cheerio.load(html);
        const rows = [];
        $('#boxtabela table tbody tr').each((i, el) => {
            const tds = $(el).find('td');
            if (tds.length >= 8) {
                rows.push($(tds[0]).text().trim());
            }
        });
        console.log("Scraped rows:", rows);
        
        // Also check what year parseDate uses
        const year = String(new Date().getFullYear());
        console.log("Year used:", year);
        
        function parseDate(str, year) {
            const m = str.match(/(\d+)\/(\w+)/);
            if (!m) return null;
            const months = { Jan:0,Fev:1,Mar:2,Abr:3,Mai:4,Jun:5,Jul:6,Ago:7,Set:8,Out:9,Nov:10,Dez:11 };
            const mon = months[m[2]];
            if (mon === undefined) return null;
            return new Date(Number(year), mon, Number(m[1]));
        }

        const dates = rows.map(r => parseDate(r, year)).filter(Boolean);
        console.log("Parsed dates:", dates);
    } catch(e) {
        console.error("Error:", e);
    }
}
run();
