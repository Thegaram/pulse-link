import fs from 'node:fs';
import { execSync } from 'node:child_process';

const ENV_PATH = '.env';
const OUT_PATH = 'config.local.json';

function parseEnv(contents) {
  const env = {};
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const index = line.indexOf('=');
    if (index <= 0) {
      continue;
    }

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }
  return env;
}

function pick(env, key, fallback = '') {
  return env[key] ?? process.env[key] ?? fallback;
}

function detectGitShortSha() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return sha || 'local';
  } catch {
    return 'local';
  }
}

let fileEnv = {};
if (fs.existsSync(ENV_PATH)) {
  fileEnv = parseEnv(fs.readFileSync(ENV_PATH, 'utf8'));
}

const mergedEnv = { ...fileEnv };
const appVersion = pick(mergedEnv, 'APP_VERSION', '') || detectGitShortSha();

const output = {
  TRANSPORT_MODE: pick(mergedEnv, 'TRANSPORT_MODE', 'pubsub'),
  SIGNALING_BACKEND: pick(mergedEnv, 'SIGNALING_BACKEND', 'ably'),
  SUPABASE_CONFIG: {
    url: pick(mergedEnv, 'SUPABASE_URL', ''),
    anonKey: pick(mergedEnv, 'SUPABASE_ANON_KEY', '')
  },
  ABLY_CONFIG: {
    key: pick(mergedEnv, 'ABLY_KEY', ''),
    token: pick(mergedEnv, 'ABLY_TOKEN', ''),
    clientId: pick(mergedEnv, 'ABLY_CLIENT_ID', '')
  },
  APP_VERSION: appVersion
};

fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${OUT_PATH}`);
