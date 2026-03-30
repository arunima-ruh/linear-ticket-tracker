# Quick Start Guide

Get the Linear Ticket Tracker running in 5 minutes.

## Prerequisites

- Node.js 18+
- PostgreSQL database (local or cloud)
- Linear account with API access
- Telegram bot

## Step 1: Clone & Install

```bash
git clone https://github.com/arunima-ruh/linear-ticket-tracker.git
cd linear-ticket-tracker
npm install
```

## Step 2: Get Credentials

### Linear API Key
1. Go to https://linear.app/settings/api
2. Create new personal API key
3. Copy the key (starts with `lin_api_`)

### Telegram Bot
1. Message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Follow prompts, copy token

### Telegram Chat ID
1. Message [@userinfobot](https://t.me/userinfobot)
2. Copy your user ID
3. Or add bot to group and use [@userinfobot](https://t.me/userinfobot) there

### PostgreSQL
Quick local setup:
```bash
docker run -d \
  --name linear-db \
  -e POSTGRES_PASSWORD=mypassword \
  -e POSTGRES_DB=linear_tracker \
  -p 5432:5432 \
  postgres:15
```

Or use free cloud: [Supabase](https://supabase.com) | [Neon](https://neon.tech)

## Step 3: Configure

```bash
cp .env.example .env
```

Edit `.env`:
```bash
LINEAR_API_KEY=lin_api_xxxxxxxxxxxxx
LINEAR_USER_EMAIL=your.email@example.com
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=123456789
PG_CONNECTION_STRING=postgresql://postgres:mypassword@localhost:5432/linear_tracker
```

## Step 4: Test Run

```bash
npm start
```

You should see:
```
🚀 Starting Linear Ticket Tracker...
✅ Database initialized
📋 Fetching issues for user: Your Name (your.email@example.com)
✅ Stored snapshot for X issues
✅ Telegram message sent
✅ Linear Ticket Tracker completed successfully
```

Check Telegram for your first report! 📱

## Step 5: Schedule (OpenClaw)

```bash
openclaw cron add \
  --name linear-tracker \
  --schedule "30 4 * * *" \
  --command "cd $(pwd) && npm start" \
  --env-file $(pwd)/.env
```

That's it! Daily reports at 10:00 AM IST. 🎉

## Verify

```bash
# Check cron job
openclaw cron list

# View logs
openclaw cron logs linear-tracker

# Check database
psql "$PG_CONNECTION_STRING" -c "SELECT COUNT(*) FROM linear_ticket_snapshots;"
```

## Troubleshooting

**No Telegram message?**
- Verify bot token with: `curl https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`
- Check chat ID is correct
- Make sure bot can send messages to you/group

**Database error?**
- Test connection: `psql "$PG_CONNECTION_STRING" -c "SELECT NOW();"`
- Check credentials in `.env`

**Linear API error?**
- Verify email matches your Linear account
- Check API key has not expired
- Test: `curl -H "Authorization: $LINEAR_API_KEY" https://api.linear.app/graphql -d '{"query":"{viewer{name}}"}'`

## What's Next?

- Read [README.md](README.md) for full documentation
- See [DEPLOY.md](DEPLOY.md) for deployment details
- Check [SYSTEM_SUMMARY.md](SYSTEM_SUMMARY.md) for architecture

## Need Help?

Open an issue at: https://github.com/arunima-ruh/linear-ticket-tracker/issues

---

**Time to first report**: ~5 minutes ⏱️  
**Daily automation**: One command 🚀
