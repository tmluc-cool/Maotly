import { describe, expect, it } from 'vitest';
import { pickWindowsAsset } from '../src/shared/assets';

const a = (name: string, size = 50_000_000) => ({ name, size, url: `https://github.com/o/r/releases/download/v1/${name}` });

describe('pickWindowsAsset', () => {
  it('returns null without a Windows installer', () => {
    expect(pickWindowsAsset(null)).toBeNull();
    expect(pickWindowsAsset([])).toBeNull();
    expect(pickWindowsAsset([a('app.dmg'), a('app.AppImage'), a('source.zip'), a('app.tar.gz')])).toBeNull();
  });

  it('prefers x64 over 32-bit and ARM', () => {
    const assets = [a('App-1.0-win32-ia32.exe'), a('App-1.0-arm64.exe'), a('App-1.0-x64.exe')];
    expect(pickWindowsAsset(assets)?.name).toBe('App-1.0-x64.exe');
  });

  it('accepts .msi and never ARM-only builds', () => {
    expect(pickWindowsAsset([a('app-aarch64.msi'), a('app_x86_64.msi')])?.name).toBe('app_x86_64.msi');
    expect(pickWindowsAsset([a('app-arm64.exe')])).toBeNull();
  });

  it('prefers setup over portable', () => {
    const assets = [a('Tool-portable-x64.exe'), a('Tool-setup-x64.exe')];
    expect(pickWindowsAsset(assets)?.name).toBe('Tool-setup-x64.exe');
  });

  it('ignores signatures, blockmaps and tiny helpers', () => {
    const assets = [a('App.exe.blockmap'), a('App.exe.sig'), a('helper.exe', 10_000), a('App Setup 2.0.exe')];
    expect(pickWindowsAsset(assets)?.name).toBe('App Setup 2.0.exe');
  });

  it('handles realistic release lists', () => {
    const obs = [a('OBS-Studio-31.0-Full-Installer-x64.exe'), a('OBS-Studio-31.0-macOS-Apple.dmg'), a('OBS-Studio-31.0-Windows-x64.zip')];
    expect(pickWindowsAsset(obs)?.name).toBe('OBS-Studio-31.0-Full-Installer-x64.exe');
    const keepass = [a('KeePassXC-2.7.9-Win64.msi'), a('KeePassXC-2.7.9-Win64-LegacyWindows.msi'), a('KeePassXC-2.7.9-src.tar.xz')];
    expect(pickWindowsAsset(keepass)?.name).toMatch(/Win64/);
  });
});
