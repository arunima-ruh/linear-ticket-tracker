# Linear Ticket Tracker - System Summary

## Overview

A production-ready cron-scheduled system that tracks Linear tickets assigned to a user, detects status changes, and delivers daily digests via Telegram.

## Key Features

✅ **Status Change Detection** - Compares current tickets against historical snapshots to detect:
- New tickets assigned
- Status/state changes
- General updates

✅ **PostgreSQL Persistence** - Stores ticket snapshots with full history:
- Automatic schema creation
- Indexed for performance
- Tracks all ticket metadata

✅ **Formatted Telegram Digests** - Rich HTML notifications with:
- Summary statistics
- Priority emoji indicators (🔴🟠🟡🔵)
- Clickable ticket links
- Grouped by status

✅ **Linear GraphQL Integration** - Fetches tickets via official API:
- Filters for active tickets only (not completed/canceled)
- Full ticket metadata (title, status, priority, assignee, dates)
- User-specific assignment filtering

✅ **Production Ready** - Includes:
- Error handling and validation
- Environment variable configuration
- Docker support
- Comprehensive documentation
- Security best practices

## Architecture

```
┌─────────────────┐
│   Cron Trigger  │  Daily at 10:00 AM IST
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  tracker.js     │  Main application
└────────┬────────┘
         │
         ├──────────────────────┐
         │                      │
         ▼                      ▼
┌─────────────────┐   ┌──────────────────┐
│  Linear API     │   │  PostgreSQL DB   │
│  (GraphQL)      │   │  (Snapshots)     │
└────────┬────────┘   └────────┬─────────┘
         │                      │
         │   Compare & Detect   │
         └──────────┬───────────┘
                    │
                    ▼
           ┌─────────────────┐
           │  Telegram Bot   │
           │  (Send Digest)  │
           └─────────────────┘
```

## Files Delivered

```
output/linear-ticket-tracker/
├── tracker.js           # Main application (executable)
├── package.json         # Node.js dependencies
├── README.md            # User documentation
├── DEPLOYMENT.md        # Deployment guide
├── SYSTEM_SUMMARY.md    # This file
├── .env.example         # Environment variable template
├── .gitignore           # Git ignore rules
└── Dockerfile           # Container build file
```

## Configuration Requirements

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PG_CONNECTION_STRING` | PostgreSQL connection URL | `postgresql://user:pass@host:5432/db` |
| `LINEAR_API_KEY` | Linear API key | `lin_api_xxxxxxxxxxxxx` |
| `LINEAR_USER_EMAIL` | User's Linear email | `you@example.com` |
| `TELEGRAM_CHAT_ID` | Telegram chat/channel ID | `-1001234567890` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (optional*) | Auto-detected from OpenClaw |

*Token auto-detected from `~/.openclaw/plugins.json` when running in OpenClaw environment.

## Database Schema

```sql
CREATE TABLE linear_ticket_snapshots (
  id SERIAL PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  ticket_identifier TEXT NOT NULL,      -- e.g., "ENG-123"
  title TEXT NOT NULL,
  status TEXT NOT NULL,                 -- e.g., "backlog", "in_progress"
  state_name TEXT NOT NULL,             -- e.g., "In Progress"
  assignee TEXT,
  priority INTEGER,                     -- 1=urgent, 2=high, 3=medium, 4=low
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  url TEXT NOT NULL,
  UNIQUE(ticket_id, snapshot_at)
);
```

## Deployment Options

### 1. OpenClaw Cron (Recommended)

```bash
openclaw cron add \
  --name "linear-ticket-tracker" \
  --schedule "30 4 * * *" \
  --timezone "UTC" \
  --command "cd /path/to/output/linear-ticket-tracker && node tracker.js" \
  --env PG_CONNECTION_STRING="..." \
  --env LINEAR_API_KEY="..." \
  --env LINEAR_USER_EMAIL="..." \
  --env TELEGRAM_CHAT_ID="..."
```

### 2. System Cron

```bash
# crontab -e
30 4 * * * cd /path/to/tracker && node tracker.js >> /tmp/tracker.log 2>&1
```

### 3. Docker

```bash
docker build -t linear-ticket-tracker .
docker run --rm \
  -e PG_CONNECTION_STRING="..." \
  -e LINEAR_API_KEY="..." \
  -e LINEAR_USER_EMAIL="..." \
  -e TELEGRAM_CHAT_ID="..." \
  linear-ticket-tracker
```

### 4. Kubernetes CronJob

See `DEPLOYMENT.md` for full K8s manifest.

## Sample Output

```
📊 Linear Ticket Daily Digest
⏰ Monday, March 30, 2026 at 10:00 AM

📝 Active tickets: 8
🔄 Status changed: 2
✨ New: 1

🔄 Status Changes
🔴 ENG-456: Fix critical auth bug
   In Progress → Ready for Review

🟠 ENG-789: Implement new dashboard
   Todo → In Progress

✨ New Tickets
🟡 ENG-101: Refactor API layer
   Status: Todo

📋 Active Tickets Summary

In Progress (3)
🔴 ENG-456: Fix critical auth bug
🟠 ENG-789: Implement new dashboard
🟡 ENG-234: Update documentation

Todo (4)
🟡 ENG-101: Refactor API layer
🔵 ENG-567: Add unit tests
...
```

## Testing

```bash
# Install dependencies
cd output/linear-ticket-tracker
npm install

# Set environment variables
export PG_CONNECTION_STRING="postgresql://..."
export LINEAR_API_KEY="lin_api_..."
export LINEAR_USER_EMAIL="you@example.com"
export TELEGRAM_CHAT_ID="-1001234567890"

# Run tracker
npm start
```

## Monitoring

### Success Indicators
- ✅ Telegram message received daily at scheduled time
- ✅ New snapshots in database after each run
- ✅ No error logs in cron output

### Health Checks

```bash
# Check last snapshot time
psql $PG_CONNECTION_STRING -c "SELECT MAX(snapshot_at) FROM linear_ticket_snapshots;"

# View recent changes
psql $PG_CONNECTION_STRING -c "
  SELECT ticket_identifier, state_name, snapshot_at 
  FROM linear_ticket_snapshots 
  ORDER BY snapshot_at DESC 
  LIMIT 20;
"

# Check cron logs
openclaw cron logs linear-ticket-tracker
```

## Security Considerations

✅ **API Keys** - Never commit to git; use secrets management
✅ **Database** - Use restricted user with minimal permissions
✅ **Telegram** - Bot token should be environment-specific
✅ **HTTPS** - All API calls use secure connections
✅ **No data leakage** - Snapshots stored locally in PostgreSQL

## Dependencies

- **Runtime**: Node.js >= 18.0.0
- **Database**: PostgreSQL (any recent version)
- **NPM Package**: `pg` (PostgreSQL client)
- **External APIs**: 
  - Linear GraphQL API (https://api.linear.app/graphql)
  - Telegram Bot API (https://api.telegram.org)

## Error Handling

The system includes comprehensive error handling:

- ✅ Environment variable validation on startup
- ✅ Database connection error handling
- ✅ Linear API error detection and reporting
- ✅ Telegram delivery error handling
- ✅ Exit code 1 on any failure (for cron monitoring)

## Limitations

- Only tracks tickets assigned to the configured user
- Does not track completed or canceled tickets
- Snapshots stored indefinitely (consider cleanup cron for old data)
- Rate limited by Linear API (100 requests/hour for most plans)
- Maximum 100 tickets per fetch (can be increased if needed)

## Future Enhancements

Potential improvements (not implemented):

- Multi-user support
- Webhook-based real-time updates
- Custom notification templates
- Slack/Discord integration
- Historical trend analysis
- Ticket age tracking
- SLA monitoring
- Custom filters (labels, teams, projects)

## Support

For issues or questions:

1. Check README.md for usage documentation
2. Review DEPLOYMENT.md for setup guidance
3. Inspect application logs: `openclaw cron logs linear-ticket-tracker`
4. Test database connection and Linear API access
5. Verify Telegram bot configuration

## License

MIT License - See package.json

---

**Status**: ✅ Production Ready
**Last Updated**: 2026-03-30
**Version**: 1.0.0
