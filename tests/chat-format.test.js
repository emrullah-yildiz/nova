import { app } from '../src/app/app.js';

describe('chat formatting', () => {
  it('escapes untrusted HTML before applying lightweight markdown', () => {
    const html = app.fmt('Hello **Nova** <img src=x onerror=alert(1)>\n<script>alert(2)</script>\n• item');

    expect(html).toContain('Hello <strong>Nova</strong>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(html).toContain('<br>');
    expect(html).toContain('&bull; item');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
  });
});
