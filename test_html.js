const fs = require('fs');
const html = fs.readFileSync('admin.html', 'utf8');
const dashboardStart = html.indexOf('<section id="dashboard"');
const dashboardStr = html.substring(dashboardStart, dashboardStart + 50000);
console.log('Dashboard starts at:', dashboardStart);
const nextSection = dashboardStr.indexOf('<section', 1);
console.log('Next section tag is at relative offset:', nextSection);
const firstEndSection = dashboardStr.indexOf('</section>');
console.log('First </section> tag is at relative offset:', firstEndSection);
if (firstEndSection > nextSection && nextSection !== -1) {
    console.log('DASHBOARD IS NOT CLOSED PROPERLY! Next section starts inside it!');
} else {
    console.log('Dashboard closes properly.');
}
