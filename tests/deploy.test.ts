import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyNetworkConfig, d1DatabaseId, secretNames, serverSecrets, workerUrl } from '../scripts/lib/deploy';

describe('server deploy helpers', () => {
  it('creates missing secrets once and never replaces existing ones', () => {
    let n = 0;
    const random = () => `random-${++n}`;
    expect(serverSecrets([], { ADMIN_GITHUB_ID: '200737688' }, random)).toEqual({
      ADMIN_GITHUB_ID: '200737688',
      ADMIN_SECRET: 'random-1',
      SESSION_SECRET: 'random-2',
    });
    // Second deploy: the Worker has them already.
    expect(serverSecrets(['ADMIN_SECRET', 'SESSION_SECRET'], { ADMIN_GITHUB_ID: '1', ADMIN_OAUTH_CLIENT_ID: ' ' }, random)).toEqual({
      ADMIN_GITHUB_ID: '1',
    });
    // A value from the repository secrets always wins.
    expect(serverSecrets(['ADMIN_SECRET'], { ADMIN_SECRET: 'mine' }, random)).toMatchObject({ ADMIN_SECRET: 'mine' });
  });

  it('reads wrangler output', () => {
    expect(secretNames('[{"name":"ADMIN_SECRET","type":"secret_text"}]')).toEqual(['ADMIN_SECRET']);
    expect(secretNames('✘ [ERROR] This Worker does not exist')).toEqual([]);
    const list = 'Note: something\n[{"uuid":"0f2b8f4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b","name":"moatly"},{"uuid":"x","name":"other"}]';
    expect(d1DatabaseId(list, 'moatly')).toBe('0f2b8f4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b');
    expect(d1DatabaseId(list, 'missing')).toBeNull();
    expect(workerUrl('Uploaded moatly (3.1 sec)\nDeployed moatly triggers\n  https://moatly.tmluc.workers.dev\n  schedule: 17 3 * * *')).toBe(
      'https://moatly.tmluc.workers.dev',
    );
  });

  it('writes the server address and Client ID into the app config', () => {
    const source = readFileSync('src/main/config.ts', 'utf8');
    const out = applyNetworkConfig(source, { serverUrl: 'https://moatly.tmluc.workers.dev', clientId: 'Ov23liAbCdEf12345678' });
    expect(out).toContain("serverUrl: 'https://moatly.tmluc.workers.dev'");
    expect(out).toContain("oauthClientId: 'Ov23liAbCdEf12345678'");
    expect(applyNetworkConfig(source, {})).toBe(source);
    expect(() => applyNetworkConfig(source, { serverUrl: "https://x.dev'; evil()" })).toThrow();
    expect(() => applyNetworkConfig(source, { clientId: "a'b" })).toThrow();
  });
});
