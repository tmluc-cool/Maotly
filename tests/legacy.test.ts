import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adoptLegacyUserData } from '../src/main/legacy';

describe('data of the old name (GratisStatt)', () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), 'moatly-legacy-'));
    const legacy = join(root, 'GratisStatt');
    const current = join(root, 'Moatly');
    mkdirSync(legacy);
    writeFileSync(join(legacy, 'gratisstatt.db'), 'db');
    writeFileSync(join(legacy, 'settings.json'), '{"language":"de"}');
    writeFileSync(join(legacy, 'session.bin'), 'secret');
    return { legacy, current };
  };

  it('is copied once into the new folder', () => {
    const { legacy, current } = setup();
    expect(adoptLegacyUserData(current, legacy)).toBe(true);
    expect(readFileSync(join(current, 'moatly.db'), 'utf8')).toBe('db');
    expect(readFileSync(join(current, 'settings.json'), 'utf8')).toBe('{"language":"de"}');
    expect(existsSync(join(current, 'session.bin'))).toBe(true);
    expect(existsSync(join(legacy, 'gratisstatt.db'))).toBe(true);
    // Second start: nothing happens any more.
    expect(adoptLegacyUserData(current, legacy)).toBe(false);
  });

  it('never overwrites data of the new name', () => {
    const { legacy, current } = setup();
    mkdirSync(current);
    writeFileSync(join(current, 'moatly.db'), 'new');
    expect(adoptLegacyUserData(current, legacy)).toBe(false);
    expect(readFileSync(join(current, 'moatly.db'), 'utf8')).toBe('new');
  });
});
