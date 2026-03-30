#!/usr/bin/env node

/**
 * Linear Ticket Tracker
 * Tracks Linear ticket status changes and sends daily digest via Telegram
 * Requires: PG_CONNECTION_STRING, LINEAR_API_KEY, LINEAR_USER_EMAIL, TELEGRAM_CHAT_ID
 */

const https = require('https');
const { Client } = require('pg');

// Configuration from environment variables
const CONFIG = {
  pgConnectionString: process.env.PG_CONNECTION_STRING,
  linearApiKey: process.env.LINEAR_API_KEY,
  linearUserEmail: process.env.LINEAR_USER_EMAIL,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || extractTelegramToken()
};

// Extract Telegram token from OpenClaw plugins config
function extractTelegramToken() {
  try {
    const fs = require('fs');
    const configPath = process.env.HOME + '/.openclaw/plugins.json';
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.entries?.telegram?.config?.token) {
        return config.entries.telegram.config.token;
      }
    }
  } catch (err) {
    console.error('Could not extract Telegram token:', err.message);
  }
  return null;
}

// Validate required environment variables
function validateConfig() {
  const missing = [];
  if (!CONFIG.pgConnectionString) missing.push('PG_CONNECTION_STRING');
  if (!CONFIG.linearApiKey) missing.push('LINEAR_API_KEY');
  if (!CONFIG.linearUserEmail) missing.push('LINEAR_USER_EMAIL');
  if (!CONFIG.telegramChatId) missing.push('TELEGRAM_CHAT_ID');
  if (!CONFIG.telegramBotToken) missing.push('TELEGRAM_BOT_TOKEN (in plugins.json or env)');
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Linear GraphQL API client
async function linearQuery(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, variables });
    
    const options = {
      hostname: 'api.linear.app',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': CONFIG.linearApiKey,
        'Content-Length': data.length
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.errors) {
            reject(new Error(`Linear API error: ${JSON.stringify(json.errors)}`));
          } else {
            resolve(json.data);
          }
        } catch (err) {
          reject(err);
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Send message via Telegram
async function sendTelegram(message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      chat_id: CONFIG.telegramChatId,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
    
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${CONFIG.telegramBotToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (!json.ok) {
            reject(new Error(`Telegram API error: ${json.description}`));
          } else {
            resolve(json.result);
          }
        } catch (err) {
          reject(err);
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Initialize database schema
async function initDatabase(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS linear_ticket_snapshots (
      id SERIAL PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      ticket_identifier TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      state_name TEXT NOT NULL,
      assignee TEXT,
      priority INTEGER,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      snapshot_at TIMESTAMPTZ DEFAULT NOW(),
      url TEXT NOT NULL,
      UNIQUE(ticket_id, snapshot_at)
    );
    
    CREATE INDEX IF NOT EXISTS idx_ticket_id ON linear_ticket_snapshots(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_snapshot_at ON linear_ticket_snapshots(snapshot_at);
  `);
}

// Fetch current user's Linear tickets
async function fetchLinearTickets() {
  const query = `
    query($userEmail: String!) {
      user(email: $userEmail) {
        id
        name
        assignedIssues(first: 100, filter: {
          state: { type: { nin: ["completed", "canceled"] }}
        }) {
          nodes {
            id
            identifier
            title
            state {
              name
              type
            }
            priority
            assignee {
              name
              email
            }
            createdAt
            updatedAt
            url
          }
        }
      }
    }
  `;
  
  const data = await linearQuery(query, { userEmail: CONFIG.linearUserEmail });
  
  if (!data.user) {
    throw new Error(`User not found: ${CONFIG.linearUserEmail}`);
  }
  
  return data.user.assignedIssues.nodes.map(issue => ({
    ticket_id: issue.id,
    ticket_identifier: issue.identifier,
    title: issue.title,
    status: issue.state.type,
    state_name: issue.state.name,
    assignee: issue.assignee?.name || null,
    priority: issue.priority,
    created_at: issue.createdAt,
    updated_at: issue.updatedAt,
    url: issue.url
  }));
}

// Store current snapshot and detect changes
async function trackChanges(client, currentTickets) {
  const changes = {
    new: [],
    statusChanged: [],
    updated: []
  };
  
  for (const ticket of currentTickets) {
    // Get the most recent snapshot for this ticket
    const result = await client.query(
      `SELECT * FROM linear_ticket_snapshots 
       WHERE ticket_id = $1 
       ORDER BY snapshot_at DESC 
       LIMIT 1`,
      [ticket.ticket_id]
    );
    
    if (result.rows.length === 0) {
      // New ticket
      changes.new.push(ticket);
    } else {
      const previous = result.rows[0];
      
      // Check for status change
      if (previous.state_name !== ticket.state_name) {
        changes.statusChanged.push({
          ...ticket,
          previousStatus: previous.state_name
        });
      } else if (previous.updated_at !== ticket.updated_at) {
        // Ticket was updated but status didn't change
        changes.updated.push(ticket);
      }
    }
    
    // Store current snapshot
    await client.query(
      `INSERT INTO linear_ticket_snapshots 
       (ticket_id, ticket_identifier, title, status, state_name, assignee, priority, created_at, updated_at, url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        ticket.ticket_id,
        ticket.ticket_identifier,
        ticket.title,
        ticket.status,
        ticket.state_name,
        ticket.assignee,
        ticket.priority,
        ticket.created_at,
        ticket.updated_at,
        ticket.url
      ]
    );
  }
  
  return changes;
}

// Format priority emoji
function priorityEmoji(priority) {
  switch (priority) {
    case 1: return '🔴'; // Urgent
    case 2: return '🟠'; // High
    case 3: return '🟡'; // Medium
    case 4: return '🔵'; // Low
    default: return '⚪'; // None
  }
}

// Generate Telegram digest message
function formatDigest(tickets, changes) {
  const lines = [];
  
  lines.push('📊 <b>Linear Ticket Daily Digest</b>');
  lines.push(`⏰ ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' })}`);
  lines.push('');
  
  // Summary
  lines.push(`📝 Active tickets: ${tickets.length}`);
  if (changes.new.length > 0) lines.push(`✨ New: ${changes.new.length}`);
  if (changes.statusChanged.length > 0) lines.push(`🔄 Status changed: ${changes.statusChanged.length}`);
  if (changes.updated.length > 0) lines.push(`📝 Updated: ${changes.updated.length}`);
  lines.push('');
  
  // Status changes (most important)
  if (changes.statusChanged.length > 0) {
    lines.push('🔄 <b>Status Changes</b>');
    for (const ticket of changes.statusChanged) {
      lines.push(`${priorityEmoji(ticket.priority)} <a href="${ticket.url}">${ticket.ticket_identifier}</a>: ${ticket.title}`);
      lines.push(`   ${ticket.previousStatus} → <b>${ticket.state_name}</b>`);
    }
    lines.push('');
  }
  
  // New tickets
  if (changes.new.length > 0) {
    lines.push('✨ <b>New Tickets</b>');
    for (const ticket of changes.new) {
      lines.push(`${priorityEmoji(ticket.priority)} <a href="${ticket.url}">${ticket.ticket_identifier}</a>: ${ticket.title}`);
      lines.push(`   Status: ${ticket.state_name}`);
    }
    lines.push('');
  }
  
  // Active tickets summary
  if (tickets.length > 0) {
    lines.push('📋 <b>Active Tickets Summary</b>');
    
    // Group by status
    const byStatus = {};
    for (const ticket of tickets) {
      if (!byStatus[ticket.state_name]) {
        byStatus[ticket.state_name] = [];
      }
      byStatus[ticket.state_name].push(ticket);
    }
    
    for (const [status, statusTickets] of Object.entries(byStatus)) {
      lines.push(`\n<b>${status}</b> (${statusTickets.length})`);
      for (const ticket of statusTickets) {
        lines.push(`${priorityEmoji(ticket.priority)} <a href="${ticket.url}">${ticket.ticket_identifier}</a>: ${ticket.title}`);
      }
    }
  }
  
  return lines.join('\n');
}

// Main execution
async function main() {
  console.log('🚀 Linear Ticket Tracker starting...');
  
  try {
    validateConfig();
    console.log('✅ Configuration validated');
    
    // Connect to database
    const client = new Client({ connectionString: CONFIG.pgConnectionString });
    await client.connect();
    console.log('✅ Database connected');
    
    try {
      // Initialize database schema
      await initDatabase(client);
      console.log('✅ Database schema initialized');
      
      // Fetch current tickets from Linear
      console.log('🔍 Fetching tickets from Linear...');
      const tickets = await fetchLinearTickets();
      console.log(`✅ Found ${tickets.length} active tickets`);
      
      // Track changes
      console.log('🔍 Detecting changes...');
      const changes = await trackChanges(client, tickets);
      console.log(`✅ Changes detected: ${changes.new.length} new, ${changes.statusChanged.length} status changed, ${changes.updated.length} updated`);
      
      // Generate and send digest
      const message = formatDigest(tickets, changes);
      console.log('📤 Sending Telegram digest...');
      await sendTelegram(message);
      console.log('✅ Digest sent successfully');
      
    } finally {
      await client.end();
    }
    
    console.log('✅ Linear Ticket Tracker completed successfully');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main };
