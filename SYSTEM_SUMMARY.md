# Linear Ticket Tracker - System Summary

## Overview

A production-ready Linear ticket tracking system that monitors assigned issues, detects status changes, and delivers daily reports via Telegram.

## Repository

**GitHub**: https://github.com/arunima-ruh/linear-ticket-tracker

## Core Functionality

### 1. Issue Tracking
- Fetches all Linear issues assigned to a specific user
- Stores snapshots in PostgreSQL for historical comparison
- Automatic database schema initialization

### 2. Change Detection
- Identifies new issues since last run
- Detects status changes between snapshots
- First-run baseline handling

### 3. Telegram Reporting
- Daily formatted report with:
  - Summary statistics (total, new, changed)
  - Status change details (old → new)
  - New issue listings
  - Complete breakdown by current status
- Markdown formatting with clickable issue links
- Error notifications on failure

## Technical Architecture

### Components

```
┌─────────────────┐
│  OpenClaw Cron  │ (10:00 AM IST daily)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Node.js App   │
│   (index.js)    │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐  ┌───────────┐
│ Linear │  │PostgreSQL │
│  API   │  │ Database  │
└────────┘  └───────────┘
    │
    ▼
┌──────────────┐
│  Telegram    │
│     Bot      │
└──────────────┘
```

### Database Schema

```sql
linear_ticket_snapshots (
  id SERIAL PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  ticket_identifier TEXT NOT NULL,  -- e.g., "ENG-123"
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER,
  assignee_name TEXT,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  snapshot_time TIMESTAMP DEFAULT NOW(),
  url TEXT,
  UNIQUE(ticket_id, snapshot_time)
)
```

### Dependencies

- `@linear/sdk` - Official Linear API client
- `pg` - PostgreSQL client
- `node-fetch` - HTTP client for Telegram API

## Environment Configuration

Required variables:

| Variable | Purpose | Example |
|----------|---------|---------|
| `LINEAR_API_KEY` | Linear API authentication | `lin_api_xxxxx` |
| `LINEAR_USER_EMAIL` | User to track issues for | `user@example.com` |
| `TELEGRAM_BOT_TOKEN` | Bot authentication | `123456789:ABC...` |
| `TELEGRAM_CHAT_ID` | Delivery destination | `-1001234567890` |
| `PG_CONNECTION_STRING` | Database connection | `postgresql://user:pass@host/db` |

## Deployment

### OpenClaw Cron Schedule

```bash
openclaw cron add \
  --name linear-tracker \
  --schedule "30 4 * * *" \
  --command "cd /path/to/linear-ticket-tracker && npm start" \
  --env-file .env
```

**Schedule**: 4:30 UTC = 10:00 AM IST (daily)

### Manual Execution

```bash
npm install
npm start
```

## Report Format Example

```
📊 Linear Ticket Tracker Report
Monday, March 30, 2026 at 10:00 AM

Summary:
• Total assigned issues: 12
• New issues: 2
• Status changes: 3

🔄 Status Changes:

[ENG-123](https://linear.app/...)
Implement user authentication
In Progress → Done

[ENG-124](https://linear.app/...)
Fix login bug
Todo → In Progress

✨ New Issues:

[ENG-125](https://linear.app/...)
Add password reset flow
Status: Todo

📋 All Issues by Status:

Done (5):
• [ENG-123](https://linear.app/...) - Implement user authentication
• [ENG-120](https://linear.app/...) - Setup CI/CD pipeline
...

In Progress (4):
• [ENG-124](https://linear.app/...) - Fix login bug
...

Todo (3):
• [ENG-125](https://linear.app/...) - Add password reset flow
...
```

## Error Handling

1. **Validation**: Checks all required environment variables on startup
2. **Graceful Failures**: Sends error notifications via Telegram
3. **Non-Zero Exit**: Ensures monitoring systems detect failures
4. **Database Transactions**: Atomic snapshot storage with rollback on errors

## First Run Behavior

On initial execution:
1. Creates database schema if missing
2. Stores baseline snapshot of all current issues
3. Sends full report (no changes detected)
4. Subsequent runs will detect deltas

## Monitoring

### Health Checks

```bash
# View cron logs
openclaw cron logs linear-tracker

# Check database
psql "$PG_CONNECTION_STRING" -c "SELECT COUNT(*) FROM linear_ticket_snapshots;"

# Test Telegram delivery
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}&text=Test"
```

### Success Indicators

- ✅ Telegram reports delivered daily at 10:00 AM IST
- ✅ Database snapshots incrementing (one per run)
- ✅ Status changes detected when issues move
- ✅ No error notifications in Telegram

## Maintenance

### Database Cleanup

Snapshots accumulate over time. To keep last 90 days:

```sql
DELETE FROM linear_ticket_snapshots 
WHERE snapshot_time < NOW() - INTERVAL '90 days';
```

Consider adding this to a monthly maintenance script.

### Credential Rotation

When rotating credentials:
1. Update `.env` file
2. Restart cron job: `openclaw cron restart linear-tracker`
3. Verify next run with: `openclaw cron logs linear-tracker`

## Extension Ideas

Future enhancements:
- Priority change detection
- Assignee change tracking
- Custom status transition alerts
- Weekly/monthly digest mode
- Multi-user support
- Issue age tracking
- SLA violation warnings

## Files Structure

```
linear-ticket-tracker/
├── index.js              # Main application logic
├── package.json          # Dependencies and scripts
├── README.md             # User-facing documentation
├── DEPLOY.md             # Deployment instructions
├── SYSTEM_SUMMARY.md     # This file (technical overview)
├── .env.example          # Environment template
└── .gitignore            # Git exclusions
```

## Support & Troubleshooting

See `DEPLOY.md` for:
- Detailed setup instructions
- Credential acquisition guides
- Common issues and solutions
- Testing procedures

## License

MIT

---

**Created**: March 30, 2026  
**System**: OpenClaw Deployer  
**Status**: Production Ready ✅
