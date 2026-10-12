'use strict';
/** Loyiha ildizidagi .env faylini o'qiydi (qo'shimcha paketsiz). Mavjud muhit o'zgaruvchilarini bosmaydi. */
const fs = require('fs');
const path = require('path');

function loadEnv(file = path.join(__dirname, '..', '..', '.env')) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (_) {
    return;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

module.exports = { loadEnv };
