# Quick Start Guide

Get up and running in 5 minutes.

## Prerequisites Checklist

- [ ] PostgreSQL database (local or remote)
- [ ] Linear account with API access
- [ ] Telegram bot created via @BotFather
- [ ] Bot added to target chat/channel

## 1. Install Dependencies

```bash
cd output/linear-ticket-tracker
npm install
```

## 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
PG_CONNECTION_STRING=postgresql://user:password@localhost:5432/linear_tracker
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxx
LINEAR_USER_EMAIL=you@example.com
TELEGRAM_CHAT_ID=-1001234567890
```

### Where to get each value:

| Variable | Where to get it |
|----------|-----------------|
| `PG_CONNECTION_STRING` | Your PostgreSQL server |
| `LINEAR_API_KEY` | [linear.app/settings/api](https://linear.app/settings/api) |
| `LINEAR_USER_EMAIL` | Your Linear login email |
| `TELEGRAM_CHAT_ID` | Message [@userinfobot](https://t.me/userinfobot) |

## 3. Test Run

```bash
# Load environment variables
export $(cat .env | xargs)

# Run tracker
node tracker.js
```

Expected output:
```
🚀 Linear Ticket Tracker starting...
✅ Configuration validated
✅ Database connected
✅ Database schema initialized
🔍 Fetching tickets from Linear...
✅ Found X active tickets
🔍 Detecting changes...
✅ Changes detected: X new, X status changed, X updated
📤 Sending Telegram digest...
✅ Digest sent successfully
✅ Linear Ticket Tracker completed successfully
```

## 4. Schedule Daily Runs

### OpenClaw Cron

```bash
openclaw cron add \
  --name "linear-ticket-tracker" \
  --schedule "30 4 * * *" \
  --timezone "UTC" \
  --command "cd $(pwd) && node tracker.js" \
  --env PG_CONNECTION_STRING="$(echo $PG_CONNECTION_STRING)" \
  --env LINEAR_API_KEY="$(echo $LINEAR_API_KEY)" \
  --env LINEAR_USER_EMAIL="$(echo $LINEAR_USER_EMAIL)" \
  --env TELEGRAM_CHAT_ID="$(echo $TELEGRAM_CHAT_ID)"
```

### System Cron

```bash
crontab -e

# Add line (replace /full/path/to):
30 4 * * * cd /full/path/to/linear-ticket-tracker && /usr/bin/node tracker.js >> /tmp/tracker.log 2>&1
```

## 5. Verify

```bash
# Check database
psql $PG_CONNECTION_STRING -c "SELECT COUNT(*) FROM linear_ticket_snapshots;"

# Trigger manually
openclaw cron trigger linear-ticket-tracker

# View logs
openclaw cron logs linear-ticket-tracker
```

## Troubleshooting

### "Missing required environment variables"
→ Check `.env` file exists and all variables are set

### "User not found"
→ Verify `LINEAR_USER_EMAIL` matches your Linear account exactly

### "Telegram API error"
→ Verify bot is added to the chat/channel. For channels, bot must be admin.

### "Connection refused" (database)
→ Check PostgreSQL is running: `systemctl status postgresql`

## Next Steps

- Read `README.md` for full documentation
- Review `DEPLOYMENT.md` for production setup
- Check `SYSTEM_SUMMARY.md` for architecture details

## Schedule Reference

| Time (IST) | Cron (UTC) | Description |
|------------|------------|-------------|
| 10:00 AM   | `30 4 * * *` | Daily morning digest |
| 6:00 PM    | `30 12 * * *` | Daily evening digest |
| 10:00 AM (weekdays) | `30 4 * * 1-5` | Weekday mornings only |

**Remember**: IST = UTC + 5:30, so 10:00 AM IST = 4:30 AM UTC

---

Need help? Check the troubleshooting section in `README.md` or `DEPLOYMENT.md`.
