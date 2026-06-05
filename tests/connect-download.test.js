// @vitest-environment jsdom
//
// The Connect panel must offer a "Download Nova Connect" button that points at
// the served installer MSI and states the Revit 2027 requirement.

import { describe, it, expect } from 'vitest';
import {
  novaConnectDownloadMarkup,
  REVIT_TARGET_VERSION,
  NOVA_CONNECT_DOWNLOAD_URL
} from '../src/integrations/connect/connect-panel.js';

describe('Nova Connect download section', () => {
  it('targets Revit 2027 and the served installer MSI', () => {
    expect(REVIT_TARGET_VERSION).toBe('2027');
    expect(NOVA_CONNECT_DOWNLOAD_URL).toBe('/downloads/NovaConnect-Setup.msi');
  });

  it('renders a download button wired to the installer MSI', () => {
    document.body.innerHTML = novaConnectDownloadMarkup();
    const btn = document.querySelector('a.ncp-download-btn');
    expect(btn).not.toBeNull();
    // Links to the served installer, and is a real download.
    expect(btn.getAttribute('href')).toBe('/downloads/NovaConnect-Setup.msi');
    expect(btn.hasAttribute('download')).toBe(true);
    expect(btn.textContent).toContain('Download Nova Connect');
  });

  it('states the Revit 2027 + Windows requirement', () => {
    document.body.innerHTML = novaConnectDownloadMarkup();
    const text = document.querySelector('.ncp-download').textContent;
    expect(text).toContain('Revit 2027');
    expect(text).toContain('Windows');
    // And a hint that the installer adds the plug-in automatically.
    expect(text).toMatch(/adds the plug-in/i);
  });

  it('reflects a custom version when passed one', () => {
    document.body.innerHTML = novaConnectDownloadMarkup('2026');
    expect(document.querySelector('.ncp-download-note').textContent).toContain('Revit 2026');
  });
});
