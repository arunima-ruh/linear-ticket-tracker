# Deployment Guide

## OpenClaw Cron Deployment

### Step 1: Prepare Environment Variables

Create a secure location for your environment variables:

```bash
# Option 1: Use OpenClaw secrets (recommended)
openclaw secrets set LINEAR_API_KEY "lin_api_xxxxxxxxxxxxx"
openclaw secrets set LINEAR_USER_EMAIL "you@example.com"
openclaw secrets set PG_CONNECTION_STRING "postgresql://user:pass@host:5432/db"
openclaw secrets set TELEGRAM_CHAT_ID "-1001234567890"

# Option 2: Use .env file in workspace
cp .env.example .env
# Edit .env with your actual credentials
```

### Step 2: Install Dependencies

```bash
cd /home/node/.openclaw/workspace-deployer/output/linear-ticket-tracker
npm install
```

### Step 3: Test Run

```bash
# Test with environment variables
export PG_CONNECTION_STRING="postgresql://..."
export LINEAR_API_KEY="lin_api_..."
export LINEAR_USER_EMAIL="you@example.com"
export TELEGRAM_CHAT_ID="-1001234567890"

node tracker.js
```

### Step 4: Schedule with Cron

**Daily at 10:00 AM IST (4:30 AM UTC):**

```bash
openclaw cron add \
  --name "linear-ticket-tracker" \
  --schedule "30 4 * * *" \
  --timezone "UTC" \
  --command "cd /home/node/.openclaw/workspace-deployer/output/linear-ticket-tracker && node tracker.js" \
  --env PG_CONNECTION_STRING="postgresql://..." \
  --env LINEAR_API_KEY="lin_api_..." \
  --env LINEAR_USER_EMAIL="you@example.com" \
  --env TELEGRAM_CHAT_ID="-1001234567890"
```

**Alternative schedules:**

```bash
# Every weekday at 10:00 AM IST
openclaw cron add \
  --name "linear-ticket-tracker-weekday" \
  --schedule "30 4 * * 1-5" \
  ...

# Twice daily (10 AM and 6 PM IST)
openclaw cron add \
  --name "linear-ticket-tracker-morning" \
  --schedule "30 4 * * *" \
  ...

openclaw cron add \
  --name "linear-ticket-tracker-evening" \
  --schedule "30 12 * * *" \
  ...
```

### Step 5: Verify Cron Job

```bash
# List all cron jobs
openclaw cron list

# View logs
openclaw cron logs linear-ticket-tracker

# Trigger manually
openclaw cron trigger linear-ticket-tracker
```

## Alternative Deployment Methods

### System Cron (Linux/macOS)

```bash
# Edit crontab
crontab -e

# Add line (10:00 AM IST = 4:30 AM UTC)
30 4 * * * cd /path/to/linear-ticket-tracker && /usr/bin/node tracker.js >> /tmp/linear-tracker.log 2>&1
```

### Docker with Cron

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  tracker:
    build: .
    environment:
      - PG_CONNECTION_STRING=${PG_CONNECTION_STRING}
      - LINEAR_API_KEY=${LINEAR_API_KEY}
      - LINEAR_USER_EMAIL=${LINEAR_USER_EMAIL}
      - TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
    restart: unless-stopped
    # Use external cron to trigger
    # docker-compose run --rm tracker
```

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: linear-ticket-tracker
spec:
  schedule: "30 4 * * *"  # 10:00 AM IST
  timeZone: "UTC"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: tracker
            image: linear-ticket-tracker:latest
            env:
            - name: PG_CONNECTION_STRING
              valueFrom:
                secretKeyRef:
                  name: linear-tracker-secrets
                  key: pg-connection-string
            - name: LINEAR_API_KEY
              valueFrom:
                secretKeyRef:
                  name: linear-tracker-secrets
                  key: linear-api-key
            - name: LINEAR_USER_EMAIL
              value: "you@example.com"
            - name: TELEGRAM_CHAT_ID
              value: "-1001234567890"
          restartPolicy: OnFailure
```

## Database Setup

### PostgreSQL Installation

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# macOS
brew install postgresql

# Start service
sudo systemctl start postgresql  # Linux
brew services start postgresql   # macOS
```

### Create Database

```bash
# Connect as postgres user
sudo -u postgres psql

# Create database and user
CREATE DATABASE linear_tracker;
CREATE USER tracker_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE linear_tracker TO tracker_user;
\q
```

### Connection String

Format: `postgresql://[user]:[password]@[host]:[port]/[database]`

Examples:
- Local: `postgresql://tracker_user:secure_password@localhost:5432/linear_tracker`
- Remote: `postgresql://user:pass@db.example.com:5432/linear_tracker`
- SSL: `postgresql://user:pass@host:5432/db?sslmode=require`

## Telegram Setup

### 1. Create Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`
3. Follow prompts to create bot
4. Save the bot token (format: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Get Chat ID

**For private messages:**
1. Message [@userinfobot](https://t.me/userinfobot)
2. It will reply with your chat ID

**For groups/channels:**
1. Add bot to group/channel
2. Send a message in the group
3. Visit: `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
4. Find `"chat":{"id":-1001234567890,...}` in the response
5. Use that ID

**For channels (admin messages):**
1. Add bot as channel admin
2. Chat ID format: `-100` + channel ID

## Linear API Setup

1. Go to [Linear Settings → API](https://linear.app/settings/api)
2. Click "Create new API key"
3. Give it a name (e.g., "Ticket Tracker")
4. Copy the key (starts with `lin_api_`)
5. Keep it secure - treat it like a password

### API Permissions Required

- Read access to issues
- Read access to users
- Read access to workflow states

## Security Best Practices

### Environment Variables

**DO NOT** commit real credentials to git. Use:

1. **OpenClaw secrets** (recommended for OpenClaw deployments)
2. **Environment variables** (for system cron)
3. **Docker secrets** (for Docker deployments)
4. **Kubernetes secrets** (for K8s deployments)
5. **.env file** (for local development only - add to .gitignore)

### API Key Rotation

Rotate API keys regularly:

```bash
# Generate new Linear API key
# Update in OpenClaw secrets or environment
openclaw secrets set LINEAR_API_KEY "new_key_here"

# Update cron job
openclaw cron update linear-ticket-tracker --env LINEAR_API_KEY="new_key_here"

# Revoke old key in Linear settings
```

### Database Security

- Use strong passwords
- Limit database user permissions to required tables only
- Use SSL for remote database connections
- Keep PostgreSQL updated

## Monitoring

### Check Logs

```bash
# OpenClaw cron logs
openclaw cron logs linear-ticket-tracker --follow

# System cron logs
grep CRON /var/log/syslog  # Ubuntu/Debian
grep cron /var/log/system.log  # macOS

# Application logs
tail -f /tmp/linear-tracker.log
```

### Verify Execution

```bash
# Check database snapshots
psql $PG_CONNECTION_STRING -c "SELECT COUNT(*), MAX(snapshot_at) FROM linear_ticket_snapshots;"

# Manual trigger for testing
openclaw cron trigger linear-ticket-tracker
```

### Health Checks

Add to your monitoring system:

```bash
# Check last successful run
psql $PG_CONNECTION_STRING -c "
  SELECT MAX(snapshot_at) as last_run,
         NOW() - MAX(snapshot_at) as time_since_last_run
  FROM linear_ticket_snapshots;
"

# Alert if last run > 25 hours ago (missed a daily run)
```

## Troubleshooting

### Cron job not running

```bash
# Check cron service status
systemctl status cron  # Linux
launchctl list | grep cron  # macOS

# Verify cron job exists
crontab -l

# Check permissions
ls -la /path/to/tracker.js
which node
```

### Database connection fails

```bash
# Test connection
psql $PG_CONNECTION_STRING -c "SELECT version();"

# Check PostgreSQL service
systemctl status postgresql

# Verify network access
telnet db.host.com 5432
```

### No Telegram messages

```bash
# Test bot token
curl "https://api.telegram.org/bot<BOT_TOKEN>/getMe"

# Test sending message
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/sendMessage" \
  -d "chat_id=<CHAT_ID>" \
  -d "text=Test message"

# Verify bot is in chat/channel
# For channels: bot must be admin
```

### Linear API errors

```bash
# Test API key
curl https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ viewer { id name email } }"}'

# Verify user email
# Check API key permissions
```

## Backup and Recovery

### Database Backup

```bash
# Backup snapshots table
pg_dump -t linear_ticket_snapshots $PG_CONNECTION_STRING > backup.sql

# Restore
psql $PG_CONNECTION_STRING < backup.sql
```

### Configuration Backup

```bash
# Backup cron configuration
openclaw cron list > cron-backup.txt

# Backup environment variables (encrypted)
openclaw secrets export > secrets-backup.enc
```

## Upgrading

```bash
# Pull latest code
cd /path/to/linear-ticket-tracker
git pull

# Update dependencies
npm install

# Test
node tracker.js

# Restart cron job (if needed)
openclaw cron restart linear-ticket-tracker
```
