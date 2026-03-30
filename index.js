#!/usr/bin/env node
import { LinearClient } from '@linear/sdk';
import pg from 'pg';
import fetch from 'node-fetch';

const { Pool } = pg;

// Configuration
const CONFIG = {
  linearApiKey: process.env.LINEAR_API_KEY,
  linearUserEmail: process.env.LINEAR_USER_EMAIL,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  pgConnectionString: process.env.PG_CONNECTION_STRING,
};

// Validate environment variables
function validateConfig() {
  const missing = [];
  if (!CONFIG.linearApiKey) missing.push('LINEAR_API_KEY');
  if (!CONFIG.linearUserEmail) missing.push('LINEAR_USER_EMAIL');
  if (!CONFIG.telegramChatId) missing.push('TELEGRAM_CHAT_ID');
  if (!CONFIG.telegramBotToken) missing.push('TELEGRAM_BOT_TOKEN');
  if (!CONFIG.pgConnectionString) missing.push('PG_CONNECTION_STRING');
  
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// Initialize database
async function initDatabase(pool) {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS linear_ticket_snapshots (
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
      )
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ticket_id ON linear_ticket_snapshots(ticket_id);
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_snapshot_time ON linear_ticket_snapshots(snapshot_time);
    `);
    
    console.log('✅ Database initialized');
  } finally {
    client.release();
  }
}

// Fetch user's Linear issues
async function fetchLinearIssues(linearClient, userEmail) {
  try {
    // Get user by email
    const users = await linearClient.users();
    const user = users.nodes.find(u => u.email === userEmail);
    
    if (!user) {
      throw new Error(`User with email ${userEmail} not found`);
    }
    
    console.log(`📋 Fetching issues for user: ${user.name} (${user.email})`);
    
    // Get all issues assigned to the user
    const issues = await linearClient.issues({
      filter: {
        assignee: { id: { eq: user.id } }
      },
      orderBy: 'updatedAt'
    });
    
    return issues.nodes.map(issue => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      status: issue.state?.name || 'Unknown',
      priority: issue.priority,
      assigneeName: user.name,
      createdAt: new Date(issue.createdAt),
      updatedAt: new Date(issue.updatedAt),
      url: issue.url
    }));
  } catch (error) {
    console.error('❌ Error fetching Linear issues:', error);
    throw error;
  }
}

// Store current snapshot
async function storeSnapshot(pool, issues) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    for (const issue of issues) {
      await client.query(`
        INSERT INTO linear_ticket_snapshots 
          (ticket_id, ticket_identifier, title, status, priority, assignee_name, created_at, updated_at, url)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (ticket_id, snapshot_time) DO NOTHING
      `, [
        issue.id,
        issue.identifier,
        issue.title,
        issue.status,
        issue.priority,
        issue.assigneeName,
        issue.createdAt,
        issue.updatedAt,
        issue.url
      ]);
    }
    
    await client.query('COMMIT');
    console.log(`✅ Stored snapshot for ${issues.length} issues`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Detect changes since last snapshot
async function detectChanges(pool, currentIssues) {
  const client = await pool.connect();
  try {
    // Get the most recent snapshot time
    const lastSnapshotResult = await client.query(`
      SELECT MAX(snapshot_time) as last_snapshot
      FROM linear_ticket_snapshots
    `);
    
    const lastSnapshotTime = lastSnapshotResult.rows[0]?.last_snapshot;
    
    if (!lastSnapshotTime) {
      console.log('ℹ️  No previous snapshot found - this is the first run');
      return {
        newIssues: currentIssues,
        statusChanges: [],
        isFirstRun: true
      };
    }
    
    // Get previous snapshot
    const previousSnapshot = await client.query(`
      SELECT DISTINCT ON (ticket_id) *
      FROM linear_ticket_snapshots
      WHERE snapshot_time = $1
      ORDER BY ticket_id, snapshot_time DESC
    `, [lastSnapshotTime]);
    
    const previousMap = new Map(
      previousSnapshot.rows.map(row => [row.ticket_id, row])
    );
    
    const currentMap = new Map(
      currentIssues.map(issue => [issue.id, issue])
    );
    
    // Find new issues
    const newIssues = currentIssues.filter(issue => !previousMap.has(issue.id));
    
    // Find status changes
    const statusChanges = [];
    for (const [ticketId, current] of currentMap) {
      const previous = previousMap.get(ticketId);
      if (previous && previous.status !== current.status) {
        statusChanges.push({
          identifier: current.identifier,
          title: current.title,
          oldStatus: previous.status,
          newStatus: current.status,
          url: current.url
        });
      }
    }
    
    console.log(`📊 Changes detected: ${newIssues.length} new, ${statusChanges.length} status changes`);
    
    return { newIssues, statusChanges, isFirstRun: false };
  } finally {
    client.release();
  }
}

// Send Telegram message
async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${CONFIG.telegramBotToken}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CONFIG.telegramChatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Telegram API error: ${error}`);
    }
    
    console.log('✅ Telegram message sent');
  } catch (error) {
    console.error('❌ Error sending Telegram message:', error);
    throw error;
  }
}

// Format report message
function formatReport(issues, changes) {
  const { newIssues, statusChanges, isFirstRun } = changes;
  
  let message = `📊 *Linear Ticket Tracker Report*\n`;
  message += `_${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' })}_\n\n`;
  
  // Summary
  message += `*Summary:*\n`;
  message += `• Total assigned issues: ${issues.length}\n`;
  if (!isFirstRun) {
    message += `• New issues: ${newIssues.length}\n`;
    message += `• Status changes: ${statusChanges.length}\n`;
  }
  message += `\n`;
  
  // Status changes
  if (statusChanges.length > 0) {
    message += `*🔄 Status Changes:*\n`;
    for (const change of statusChanges) {
      message += `\n[${change.identifier}](${change.url})\n`;
      message += `${change.title}\n`;
      message += `${change.oldStatus} → ${change.newStatus}\n`;
    }
    message += `\n`;
  }
  
  // New issues
  if (newIssues.length > 0) {
    message += `*✨ New Issues:*\n`;
    for (const issue of newIssues) {
      message += `\n[${issue.identifier}](${issue.url})\n`;
      message += `${issue.title}\n`;
      message += `Status: ${issue.status}\n`;
    }
    message += `\n`;
  }
  
  // Group by status
  const byStatus = {};
  for (const issue of issues) {
    if (!byStatus[issue.status]) {
      byStatus[issue.status] = [];
    }
    byStatus[issue.status].push(issue);
  }
  
  message += `*📋 All Issues by Status:*\n`;
  for (const [status, statusIssues] of Object.entries(byStatus)) {
    message += `\n*${status}* (${statusIssues.length}):\n`;
    for (const issue of statusIssues) {
      message += `• [${issue.identifier}](${issue.url}) - ${issue.title}\n`;
    }
  }
  
  return message;
}

// Main function
async function main() {
  console.log('🚀 Starting Linear Ticket Tracker...');
  
  validateConfig();
  
  const pool = new Pool({ connectionString: CONFIG.pgConnectionString });
  const linearClient = new LinearClient({ apiKey: CONFIG.linearApiKey });
  
  try {
    // Initialize database
    await initDatabase(pool);
    
    // Fetch current issues
    const currentIssues = await fetchLinearIssues(linearClient, CONFIG.linearUserEmail);
    
    // Detect changes
    const changes = await detectChanges(pool, currentIssues);
    
    // Store current snapshot
    await storeSnapshot(pool, currentIssues);
    
    // Format and send report
    const report = formatReport(currentIssues, changes);
    await sendTelegramMessage(report);
    
    console.log('✅ Linear Ticket Tracker completed successfully');
  } catch (error) {
    console.error('❌ Error in main process:', error);
    
    // Send error notification
    try {
      await sendTelegramMessage(`❌ *Linear Ticket Tracker Error*\n\n\`${error.message}\``);
    } catch (telegramError) {
      console.error('❌ Could not send error notification:', telegramError);
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run
main();
