const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// Replace AWS import with Upstash
content = content.replace(
    "const { SchedulerClient, CreateScheduleCommand, DeleteScheduleCommand } = require('@aws-sdk/client-scheduler');",
    "const { Client } = require('@upstash/qstash');"
);

// Replace syncEventBridgeSchedule in app.put
content = content.replace(
    /if \(typeof syncEventBridgeSchedule === 'function'\) await syncEventBridgeSchedule/g,
    "if (typeof syncQStashSchedule === 'function') await syncQStashSchedule"
);

// Remove the AWS function completely and replace with QStash function
const awsFuncRegex = /\/\/ Helper: Integração do LME com AWS EventBridge Scheduler[\s\S]*?\}\n\}/;

const qstashFunc = `// Helper: Integração do LME com Upstash QStash (Agendador Gratuito)
async function syncQStashSchedule(horario, diasAtivos, ativo) {
    if (!process.env.QSTASH_TOKEN || !process.env.QSTASH_TARGET_URL) {
        console.warn('⚠️ [QSTASH] Token ou Target URL não configurados. Abortando criação do agendamento.');
        return;
    }
    
    const client = new Client({ token: process.env.QSTASH_TOKEN });
    
    try {
        // Obter todos os agendamentos e deletar (limpeza)
        const schedules = await client.schedules.list();
        for (const sch of schedules) {
            await client.schedules.delete({ id: sch.scheduleId }).catch(() => {});
        }
        
        if (ativo !== 'true') {
            await pool.query("UPDATE lme_agendamentos SET status = 'CANCELLED' WHERE status = 'PENDING'");
            return;
        }

        // QStash usa UTC. Precisamos converter o horário de Brasília (UTC-3) para UTC (+3)
        let [h, m] = horario.split(':').map(Number);
        
        let shiftDay = false;
        h = h + 3;
        if (h >= 24) {
            h = h - 24;
            shiftDay = true;
        }

        // JS Days: 0=Sun, 1=Mon... 
        let convertedDays = diasAtivos.map(d => {
            if (shiftDay) {
                return (d + 1) > 6 ? 0 : d + 1;
            }
            return d;
        });

        const ebDays = convertedDays.join(',');
        const scheduleId = crypto.randomUUID();
        
        await pool.query("UPDATE lme_agendamentos SET status = 'CANCELLED' WHERE status = 'PENDING'");
        await pool.query(
            "INSERT INTO lme_agendamentos (id, horario_agendado, dias_semana) VALUES (?, ?, ?)",
            [scheduleId, horario, diasAtivos.join(',')]
        );
        
        const response = await client.schedules.create({
            destination: process.env.QSTASH_TARGET_URL,
            cron: \`\${m} \${h} * * \${ebDays}\`,
            body: JSON.stringify({ scheduleId, source: 'qstash' }),
            headers: {
                "Authorization": \`Bearer \${process.env.CRON_SECRET || 'secret'}\`,
                "Content-Type": "application/json"
            }
        });
        
        if (response.scheduleId) {
            await pool.query(
                "UPDATE lme_agendamentos SET eventbridge_schedule_arn = ? WHERE id = ?",
                [response.scheduleId, scheduleId]
            );
        }
        console.log(\`✅ [QSTASH] Schedule criado: \${response.scheduleId} (UTC: \${h}:\${m} | Dias: \${ebDays})\`);
    } catch (err) {
        console.error('❌ [QSTASH] Erro criando schedule:', err.message);
    }
}`;

content = content.replace(awsFuncRegex, qstashFunc);

fs.writeFileSync('server.js', content);
console.log('QStash integration applied.');
