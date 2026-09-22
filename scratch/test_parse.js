const axios = require('axios');
const cheerio = require('cheerio');

axios.get('https://shockmetais.com.br/lme/').then(res => {
    const $ = cheerio.load(res.data);
    const dailyRows = [];
    $('#boxtabela table tbody tr').each((i, el) => {
        const tds = $(el).find('td');
        if (tds.length < 8) return;
        if ($(tds[0]).hasClass('lmemedia') || $(tds[0]).hasClass('lmemensal')) return;
        dailyRows.push($(tds[0]).text().trim());
    });
    console.log('Rows parsed:', dailyRows.length, dailyRows);
}).catch(err => console.error(err.message));
