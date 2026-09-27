const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const target1 = `            return res.json({ success: true });
        }
        Object.assign(memStore.settings, settings);`;
        
const replacement1 = `            if (settings.lme_envio_horario !== undefined || settings.lme_envio_dias !== undefined || settings.lme_envio_ativo !== undefined) {
                const ativo = settings.lme_envio_ativo;
                const horario = settings.lme_envio_horario || '14:00';
                const diasAtivosStr = settings.lme_envio_dias || '1,2,3,4,5';
                if (typeof syncEventBridgeSchedule === 'function') await syncEventBridgeSchedule(horario, diasAtivosStr.split(',').map(Number), ativo);
            }
            return res.json({ success: true });
        }
        Object.assign(memStore.settings, settings);`;

content = content.replace(target1, replacement1);

// Append function to end
const helperFunc = `
// Helper: Integração do LME com AWS EventBridge Scheduler
async function syncEventBridgeSchedule(horario, diasAtivos, ativo) {
    if (!process.env.EVENTBRIDGE_ROLE_ARN || !process.env.EVENTBRIDGE_TARGET_ARN) {
        console.warn('⚠️ [EVENTBRIDGE] Role/Target ARN not configured. Cannot create AWS schedule.');
        return;
    }
    const client = new SchedulerClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const scheduleName = 'LME_Daily_Report_Schedule';
    try {
        await client.send(new DeleteScheduleCommand({ Name: scheduleName })).catch(() => {});
        if (ativo !== 'true') {
            await pool.query("UPDATE lme_agendamentos SET status = 'CANCELLED' WHERE status = 'PENDING'");
            return;
        }
        const [h, m] = horario.split(':');
        const dayMap = { 0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT' };
        const ebDays = diasAtivos.map(d => dayMap[d]).join(',');
        const scheduleId = crypto.randomUUID();
        
        await pool.query("UPDATE lme_agendamentos SET status = 'CANCELLED' WHERE status = 'PENDING'");
        await pool.query(
            "INSERT INTO lme_agendamentos (id, horario_agendado, dias_semana) VALUES (?, ?, ?)",
            [scheduleId, horario, diasAtivos.join(',')]
        );
        
        const response = await client.send(new CreateScheduleCommand({
            Name: scheduleName,
            ScheduleExpression: \`cron(\${m} \${h} ? * \${ebDays} *)\`,
            ScheduleExpressionTimezone: 'America/Sao_Paulo',
            FlexibleTimeWindow: { Mode: 'OFF' },
            Target: {
                Arn: process.env.EVENTBRIDGE_TARGET_ARN,
                RoleArn: process.env.EVENTBRIDGE_ROLE_ARN,
                Input: JSON.stringify({ scheduleId, source: 'eventbridge' }),
                RetryPolicy: { MaximumEventAgeInSeconds: 86400, MaximumRetryAttempts: 10 }
            }
        }));
        
        if (response.ScheduleArn) {
            await pool.query(
                "UPDATE lme_agendamentos SET eventbridge_schedule_arn = ? WHERE id = ?",
                [response.ScheduleArn, scheduleId]
            );
        }
        console.log(\`✅ [EVENTBRIDGE] Schedule created: \${response.ScheduleArn}\`);
    } catch (err) {
        console.error('❌ [EVENTBRIDGE] Error creating schedule:', err.message);
    }
}
`;

if (!content.includes('async function syncEventBridgeSchedule')) {
    content += helperFunc;
}

fs.writeFileSync('server.js', content);
console.log('Modifications applied successfully!');
