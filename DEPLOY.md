# Deployment Guide

## OpenClaw Deployment

### 1. Setup Environment Variables

Create a `.env` file in the project directory:

```bash
cd linear-ticket-tracker
cp .env.example .env
# Edit .env with your actual credentials
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Test Manual Run

```bash
npm start
```

This will:
- Initialize the database schema
- Fetch current Linear issues
- Store baseline snapshot
- Send first report to Telegram

### 4. Schedule with OpenClaw Cron

```bash
openclaw cron add \
  --name linear-tracker \
  --schedule "30 4 * * *" \
  --command "cd $(pwd) && npm start" \
  --env-file $(pwd)/.env \
  --thinking low
```

**Schedule Explanation:**
- `30 4 * * *` = 4:30 UTC daily
- 4:30 UTC = 10:00 AM IST (UTC+5:30)

### 5. Verify Cron Job

```bash
openclaw cron list
```

### 6. Monitor Logs

```bash
openclaw cron logs linear-tracker
```

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `LINEAR_API_KEY` | Linear API key from Settings → API | `lin_api_xxxxx` |
| `LINEAR_USER_EMAIL` | Email of user to track | `user@example.com` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | `123456789:ABC...` |
| `TELEGRAM_CHAT_ID` | Telegram chat/group ID (get from @userinfobot) | `-1001234567890` |
| `PG_CONNECTION_STRING` | PostgreSQL connection URL | `postgresql://user:pass@host:5432/db` |

## Getting Credentials

### Linear API Key

1. Go to Linear Settings → API
2. Click "Create new API key"
3. Copy the key (starts with `lin_api_`)

### Telegram Bot Token

1. Message @BotFather on Telegram
2. Send `/newbot` and follow prompts
3. Copy the bot token

### Telegram Chat ID

**For personal chat:**
1. Message @userinfobot on Telegram
2. Copy your user ID

**For group chat:**
1. Add @userinfobot to the group
2. Copy the group ID (starts with `-`)

### PostgreSQL Database

You need a PostgreSQL database. Options:

**Local:**
```bash
docker run -d \
  --name linear-tracker-db \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=linear_tracker \
  -p 5432:5432 \
  postgres:15
```

Connection string: `postgresql://postgres:yourpassword@localhost:5432/linear_tracker`

**Cloud:**
- [Supabase](https://supabase.com) (free tier available)
- [Neon](https://neon.tech) (free tier available)
- [Railway](https://railway.app) (free tier available)

## Troubleshooting

### Missing Environment Variables

If you see: `❌ Missing required environment variables`

Check that all variables are set:
```bash
env | grep -E "LINEAR_|TELEGRAM_|PG_"
```

### Database Connection Failed

Test connection:
```bash
psql "$PG_CONNECTION_STRING" -c "SELECT NOW();"
```

### Telegram Message Failed

Test bot token:
```bash
curl -X GET "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
```

### Linear API Failed

Test API key:
```bash
curl -X POST "https://api.linear.app/graphql" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ viewer { id name email } }"}'
```

## Manual Testing

### Test Database Schema

```bash
node -e "
import pg from 'pg';
const pool = new pg.Pool({connectionString: process.env.PG_CONNECTION_STRING});
pool.query('SELECT * FROM linear_ticket_snapshots LIMIT 1')
  .then(() => console.log('✅ Schema exists'))
  .catch(() => console.log('ℹ️  Schema will be created on first run'))
  .finally(() => pool.end());
"
```

### Test Linear Connection

```bash
node -e "
import { LinearClient } from '@linear/sdk';
const client = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
client.viewer.then(viewer => console.log('✅ Connected as:', viewer.name));
"
```

## Updating the Schedule

To change the schedule (e.g., to 9:00 AM IST = 3:30 UTC):

```bash
openclaw cron update linear-tracker --schedule "30 3 * * *"
```

To run twice daily (9:00 AM and 5:00 PM IST):

```bash
openclaw cron update linear-tracker --schedule "30 3,11 * * *"
```

## Backup & Recovery

### Backup Database

```bash
pg_dump "$PG_CONNECTION_STRING" -t linear_ticket_snapshots > backup.sql
```

### Restore Database

```bash
psql "$PG_CONNECTION_STRING" < backup.sql
```

## Uninstall

```bash
# Remove cron job
openclaw cron remove linear-tracker

# Remove database table (if desired)
psql "$PG_CONNECTION_STRING" -c "DROP TABLE IF EXISTS linear_ticket_snapshots;"

# Remove project
cd ..
rm -rf linear-ticket-tracker
```
