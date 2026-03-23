const fs = require('fs');
const config = `window.AQ_CONFIG = {
  SB_URL: '${process.env.SUPABASE_URL || ''}',
  SB_KEY: '${process.env.SUPABASE_ANON_KEY || ''}',
  TG_TOKEN: '${process.env.TELEGRAM_BOT_TOKEN || ''}',
  TG_CHAT_ID: '${process.env.TELEGRAM_CHAT_ID || ''}',
  SENTRY_DSN: '${process.env.SENTRY_DSN || ''}'
};`;
if (!fs.existsSync('config')) fs.mkdirSync('config');
fs.writeFileSync('config/config.js', config);
console.log('config.js generado');
