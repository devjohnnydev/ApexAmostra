const fs = require('fs');
fs.appendFileSync('.env', '\nQSTASH_URL="https://qstash-eu-central-1.upstash.io"\nQSTASH_TOKEN="eyJVc2VySUQiOiI3ZmM1YmIyNy04YjY3LTQ4MmItYmFkYy05MmRlNzcxMDYwZDIiLCJQYXNzd29yZCI6ImM4YTk0Y2VlMDE5MDQyM2Y4YjU2NWRlN2E3YWJkMDEzIn0="\nQSTASH_TARGET_URL="https://apextechmetais.com.br/api/lme/cron-trigger"\nCRON_SECRET="ApexLmeSegredo123"\n');
console.log('Appended to .env');
