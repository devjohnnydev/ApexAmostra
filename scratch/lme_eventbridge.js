const { SchedulerClient, CreateScheduleCommand, DeleteScheduleCommand } = require('@aws-sdk/client-scheduler');
const crypto = require('crypto');

// This logic goes in initDatabase():
/*
    await pool.query(`CREATE TABLE IF NOT EXISTS lme_agendamentos (
        id VARCHAR(36) PRIMARY KEY,
        horario_agendado VARCHAR(5) NOT NULL,
        dias_semana VARCHAR(50) NOT NULL,
        status ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
        eventbridge_schedule_arn VARCHAR(512),
        timezone VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',
        processing_started_at DATETIME NULL,
        sent_at DATETIME NULL,
        last_error TEXT NULL,
        attempts INT NOT NULL DEFAULT 0,
        resend_message_id VARCHAR(255) NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
*/

// Function to sync schedule with AWS
async function syncEventBridgeSchedule(horario, diasAtivos, ativo) {
    if (!process.env.EVENTBRIDGE_ROLE_ARN || !process.env.EVENTBRIDGE_TARGET_URL) {
        console.warn('⚠️ [EVENTBRIDGE] Credentials or ARN not configured. Skipping AWS schedule creation.');
        return;
    }
    
    const client = new SchedulerClient({ 
        region: process.env.AWS_REGION || 'us-east-1' 
        // credentials will be picked up from env or instance profile
    });
    
    const scheduleName = 'LME_Daily_Report_Schedule';
    
    try {
        // Try to delete existing first (simpler than update for handling active/inactive toggles)
        await client.send(new DeleteScheduleCommand({ Name: scheduleName })).catch(() => {});
        
        if (ativo !== 'true') return;

        const [h, m] = horario.split(':');
        
        // Convert array of JS days (0=Sun, 1=Mon, ..., 6=Sat) to EventBridge DOW
        const dayMap = { 0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT' };
        const ebDays = diasAtivos.map(d => dayMap[d]).join(',');
        
        // Generate new idempotency ID
        const scheduleId = crypto.randomUUID();
        
        // Save to DB
        if (dbAvailable) {
            // Cancel old pending schedules
            await pool.query("UPDATE lme_agendamentos SET status = 'CANCELLED' WHERE status = 'PENDING'");
            // Create new
            await pool.query(
                `INSERT INTO lme_agendamentos (id, horario_agendado, dias_semana) VALUES (?, ?, ?)`,
                [scheduleId, horario, diasAtivos.join(',')]
            );
        }
        
        // Create in AWS
        const response = await client.send(new CreateScheduleCommand({
            Name: scheduleName,
            ScheduleExpression: `cron(${m} ${h} ? * ${ebDays} *)`,
            ScheduleExpressionTimezone: 'America/Sao_Paulo',
            FlexibleTimeWindow: { Mode: 'OFF' },
            Target: {
                Arn: process.env.EVENTBRIDGE_TARGET_ARN, // Could be an API Destination or Lambda
                RoleArn: process.env.EVENTBRIDGE_ROLE_ARN,
                Input: JSON.stringify({ scheduleId, source: 'eventbridge', secret: process.env.CRON_SECRET }),
                RetryPolicy: {
                    MaximumEventAgeInSeconds: 3600,
                    MaximumRetryAttempts: 10
                }
            }
        }));
        
        if (dbAvailable && response.ScheduleArn) {
            await pool.query(
                `UPDATE lme_agendamentos SET eventbridge_schedule_arn = ? WHERE id = ?`,
                [response.ScheduleArn, scheduleId]
            );
        }
        
        console.log(`✅ [EVENTBRIDGE] Schedule created: ${response.ScheduleArn}`);
    } catch (err) {
        console.error('❌ [EVENTBRIDGE] Error creating schedule:', err);
    }
}
