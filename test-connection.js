#!/usr/bin/env node

/**
 * Connection Test Script
 * Tests all required connections before running the tracker
 */

const https = require('https');
const { Client } = require('pg');

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
};

function log(emoji, message, color = colors.reset) {
  console.log(`${emoji} ${color}${message}${colors.reset}`);
}

function success(message) {
  log('✅', message, colors.green);
}

function error(message) {
  log('❌', message, colors.red);
}

function info(message) {
  log('ℹ️ ', message, colors.blue);
}

function warn(message) {
  log('⚠️ ', message, colors.yellow);
}

// Check environment variables
function checkEnvVars() {
  info('Checking environment variables...');
  
  const required = [
    'PG_CONNECTION_STRING',
    'LINEAR_API_KEY',
    'LINEAR_USER_EMAIL',
    'TELEGRAM_CHAT_ID'
  ];
  
  const missing = [];
  const found = [];
  
  for (const varName of required) {
    if (process.env[varName]) {
      found.push(varName);
    } else {
      missing.push(varName);
    }
  }
  
  if (missing.length === 0) {
    success('All required environment variables are set');
    return true;
  } else {
    error(`Missing environment variables: ${missing.join(', ')}`);
    warn('Set them in .env or export them in your shell');
    return false;
  }
}

// Test PostgreSQL connection
async function testPostgres() {
  info('Testing PostgreSQL connection...');
  
  const client = new Client({ 
    connectionString: process.env.PG_CONNECTION_STRING 
  });
  
  try {
    await client.connect();
    const result = await client.query('SELECT version()');
    success(`Connected to PostgreSQL: ${result.rows[0].version.split(' ')[0]}`);
    
    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'linear_ticket_snapshots'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      const countResult = await client.query('SELECT COUNT(*) FROM linear_ticket_snapshots');
      info(`Found existing snapshots table with ${countResult.rows[0].count} records`);
    } else {
      info('Snapshots table does not exist yet (will be created on first run)');
    }
    
    await client.end();
    return true;
  } catch (err) {
    error(`PostgreSQL connection failed: ${err.message}`);
    warn('Check your PG_CONNECTION_STRING and ensure PostgreSQL is running');
    return false;
  }
}

// Test Linear API
async function testLinear() {
  info('Testing Linear API connection...');
  
  return new Promise((resolve) => {
    const query = `
      query {
        viewer {
          id
          name
          email
        }
      }
    `;
    
    const data = JSON.stringify({ query });
    
    const options = {
      hostname: 'api.linear.app',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.LINEAR_API_KEY,
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
            error(`Linear API error: ${JSON.stringify(json.errors)}`);
            warn('Check your LINEAR_API_KEY is valid');
            resolve(false);
          } else if (json.data?.viewer) {
            success(`Connected to Linear as: ${json.data.viewer.name} (${json.data.viewer.email})`);
            
            if (json.data.viewer.email !== process.env.LINEAR_USER_EMAIL) {
              warn(`API key user (${json.data.viewer.email}) differs from LINEAR_USER_EMAIL (${process.env.LINEAR_USER_EMAIL})`);
              warn('Tickets will be fetched for LINEAR_USER_EMAIL, not the API key owner');
            }
            
            resolve(true);
          } else {
            error('Unexpected Linear API response');
            resolve(false);
          }
        } catch (err) {
          error(`Linear API error: ${err.message}`);
          resolve(false);
        }
      });
    });
    
    req.on('error', (err) => {
      error(`Linear API request failed: ${err.message}`);
      resolve(false);
    });
    
    req.write(data);
    req.end();
  });
}

// Test Telegram bot
async function testTelegram() {
  info('Testing Telegram bot connection...');
  
  // Get bot token
  let botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    // Try to extract from OpenClaw config
    try {
      const fs = require('fs');
      const configPath = process.env.HOME + '/.openclaw/plugins.json';
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.entries?.telegram?.config?.token) {
          botToken = config.entries.telegram.config.token;
          info('Using Telegram token from OpenClaw config');
        }
      }
    } catch (err) {
      // Ignore
    }
  }
  
  if (!botToken) {
    error('TELEGRAM_BOT_TOKEN not found in environment or OpenClaw config');
    return false;
  }
  
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/getMe`,
      method: 'GET'
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          
          if (!json.ok) {
            error(`Telegram API error: ${json.description}`);
            warn('Check your TELEGRAM_BOT_TOKEN is valid');
            resolve(false);
          } else {
            success(`Connected to Telegram bot: @${json.result.username}`);
            
            // Test sending a message
            testTelegramMessage(botToken).then(resolve);
          }
        } catch (err) {
          error(`Telegram API error: ${err.message}`);
          resolve(false);
        }
      });
    });
    
    req.on('error', (err) => {
      error(`Telegram API request failed: ${err.message}`);
      resolve(false);
    });
    
    req.end();
  });
}

// Test sending a Telegram message
async function testTelegramMessage(botToken) {
  info('Testing message delivery...');
  
  return new Promise((resolve) => {
    const data = JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: '🧪 Test message from Linear Ticket Tracker\n\nIf you see this, the connection is working!',
      parse_mode: 'HTML'
    });
    
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${botToken}/sendMessage`,
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
            error(`Telegram message delivery failed: ${json.description}`);
            warn('Check that:');
            warn('  1. Bot is added to the chat/channel');
            warn('  2. TELEGRAM_CHAT_ID is correct');
            warn('  3. For channels: bot must be admin');
            resolve(false);
          } else {
            success('Test message delivered successfully!');
            resolve(true);
          }
        } catch (err) {
          error(`Telegram error: ${err.message}`);
          resolve(false);
        }
      });
    });
    
    req.on('error', (err) => {
      error(`Telegram request failed: ${err.message}`);
      resolve(false);
    });
    
    req.write(data);
    req.end();
  });
}

// Main test runner
async function runTests() {
  console.log('\n' + colors.bold + '🧪 Linear Ticket Tracker - Connection Test' + colors.reset + '\n');
  
  let allPassed = true;
  
  // Check environment variables
  if (!checkEnvVars()) {
    allPassed = false;
    console.log('\n' + colors.red + '❌ Environment variable check failed' + colors.reset);
    console.log(colors.yellow + '\nQuick fix:\n  cp .env.example .env\n  # Edit .env with your credentials\n  export $(cat .env | xargs)' + colors.reset + '\n');
    process.exit(1);
  }
  
  console.log('');
  
  // Test PostgreSQL
  if (!await testPostgres()) {
    allPassed = false;
  }
  
  console.log('');
  
  // Test Linear API
  if (!await testLinear()) {
    allPassed = false;
  }
  
  console.log('');
  
  // Test Telegram
  if (!await testTelegram()) {
    allPassed = false;
  }
  
  console.log('\n' + colors.bold + '━'.repeat(60) + colors.reset + '\n');
  
  if (allPassed) {
    success('All tests passed! 🎉');
    info('You can now run: node tracker.js');
  } else {
    error('Some tests failed. Please fix the issues above.');
    process.exit(1);
  }
  
  console.log('');
}

// Run tests
runTests().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
