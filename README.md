# Linear Ticket Tracker

Daily Linear ticket tracker with status change detection and Telegram delivery.

## Features

- 📋 Fetches all Linear issues assigned to a specific user
- 🔄 Detects status changes between runs
- ✨ Identifies new issues since last check
- 📊 Groups issues by status
- 📱 Sends daily summary via Telegram
- 💾 Stores snapshots in PostgreSQL for change detection

## Requirements

- Node.js 18+
- PostgreSQL database
- Linear API key
- Telegram bot token and chat ID

## Environment Variables

```bash
# Linear Configuration
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxx
LINEAR_USER_EMAIL=your.email@example.com

# Telegram Configuration
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=-1001234567890

# Database Configuration
PG_CONNECTION_STRING=postgresql://user:password@host:5432/database
```

## Installation

```bash
npm install
```

## Usage

### Manual Run

```bash
npm start
```

### Scheduled Run (OpenClaw)

The system is designed to run daily at 10:00 AM IST via OpenClaw cron:

```bash
openclaw cron add \
  --name linear-tracker \
  --schedule "30 4 * * *" \
  --command "cd /path/to/linear-ticket-tracker && npm start" \
  --env-file .env
```

Note: 4:30 UTC = 10:00 IST

## Database Schema

The tracker creates a `linear_ticket_snapshots` table to store historical data:

```sql
CREATE TABLE linear_ticket_snapshots (
  id SERIAL PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  ticket_identifier TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER,
  assignee_name TEXT,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  snapshot_time TIMESTAMP DEFAULT NOW(),
  url TEXT,
  UNIQUE(ticket_id, snapshot_time)
);
```

## Report Format

The Telegram report includes:

1. **Summary**: Total issues, new issues, status changes
2. **Status Changes**: Issues that changed status since last run
3. **New Issues**: Issues assigned since last run
4. **All Issues by Status**: Complete breakdown of current state

## How It Works

1. **Fetch**: Retrieves all Linear issues assigned to the configured user
2. **Compare**: Compares current state with last snapshot from database
3. **Detect**: Identifies new issues and status changes
4. **Store**: Saves current snapshot to database
5. **Report**: Formats and sends comprehensive report via Telegram

## First Run

On the first run, the system will:
- Initialize the database schema
- Store the current snapshot
- Report all current issues as baseline (no changes detected)

## Error Handling

- Validates all required environment variables on startup
- Sends error notifications via Telegram if the tracker fails
- Exits with non-zero code on failure for monitoring

## Development

### Test Database Connection

```bash
node -e "import pg from 'pg'; const pool = new pg.Pool({connectionString: process.env.PG_CONNECTION_STRING}); pool.query('SELECT NOW()').then(() => console.log('✅ Connected')).catch(console.error);"
```

### Test Telegram Bot

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"${TELEGRAM_CHAT_ID}\", \"text\": \"Test message\"}"
```

## License

MIT
