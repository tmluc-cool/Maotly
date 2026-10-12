/**
 * Small steps for .github/workflows/deploy-server.yml. Never prints secret values.
 *
 *   tsx scripts/deploy-helper.ts d1-id <name>                < wrangler d1 list --json
 *   tsx scripts/deploy-helper.ts secrets <out.json>          < wrangler secret list --format json
 *   tsx scripts/deploy-helper.ts url                         < output of wrangler deploy
 *   tsx scripts/deploy-helper.ts config <serverUrl> [clientId]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyNetworkConfig, d1DatabaseId, secretNames, serverSecrets, workerUrl } from './lib/deploy';

const stdin = () => {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
};

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'd1-id') {
  process.stdout.write(d1DatabaseId(stdin(), args[0] ?? 'moatly') ?? '');
} else if (cmd === 'secrets') {
  const env = process.env;
  const secrets = serverSecrets(secretNames(stdin()), {
    ADMIN_SECRET: env.ADMIN_SECRET,
    ADMIN_GITHUB_ID: env.ADMIN_GITHUB_ID,
    ADMIN_OAUTH_CLIENT_ID: env.ADMIN_OAUTH_CLIENT_ID,
    ADMIN_OAUTH_CLIENT_SECRET: env.ADMIN_OAUTH_CLIENT_SECRET,
  });
  writeFileSync(args[0], JSON.stringify(secrets), { mode: 0o600 });
  console.log(`Secrets to upload: ${Object.keys(secrets).join(', ') || 'none'}`);
} else if (cmd === 'url') {
  process.stdout.write(workerUrl(stdin()) ?? '');
} else if (cmd === 'config') {
  const file = join(process.cwd(), 'src', 'main', 'config.ts');
  writeFileSync(file, applyNetworkConfig(readFileSync(file, 'utf8'), { serverUrl: args[0], clientId: args[1] }));
} else {
  console.error('Usage: deploy-helper.ts d1-id|secrets|url|config …');
  process.exit(1);
}
