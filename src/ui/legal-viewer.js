// Legal viewer: a compact, safe markdown→HTML renderer plus the modal's doc
// registry. Kept dependency-free on purpose — the app has no markdown library,
// and the legal docs only use a small, known subset of Markdown/GFM.
//
// Safety model: ALL text is HTML-escaped before any markup is emitted, so doc
// content can never inject HTML (we treat even our own docs as untrusted).
// The only HTML we produce is from the structural rules below; inline content
// is escaped first, then a fixed set of inline patterns are turned into tags.
//
// Supported constructs (exactly what docs/legal/*.md use):
//   # / ## / ###      headings
//   paragraphs        blank-line separated
//   **bold** *italic* `code`
//   [text](href)      links (internal doc links switch the modal; http(s) → new tab)
//   - / 1.            unordered / ordered lists
//   | a | b |         GFM tables (with the |---|---| separator row)
//   > quote           blockquotes
//   ---               horizontal rule

// The 5 user-facing docs, in nav order. `md` is filled in by the app (it owns
// the `?raw` imports); this module only needs slug/title/filename metadata so
// it can resolve internal links like `(data-handling.md)` to a slug.
export const LEGAL_DOCS = [
  { slug: 'privacy', title: 'Privacy Policy', file: 'privacy-policy.md' },
  { slug: 'terms', title: 'Terms of Service', file: 'terms-of-service.md' },
  { slug: 'data', title: 'Data Handling', file: 'data-handling.md' },
  { slug: 'ip', title: 'IP & Ownership', file: 'ip-and-ownership.md' },
  { slug: 'cookies', title: 'Cookies', file: 'cookie-notice.md' }
];

const FILE_TO_SLUG = LEGAL_DOCS.reduce((m, d) => { m[d.file] = d.slug; return m; }, {});

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Render inline markup inside one line of already-trusted *structure*. The text
// is escaped FIRST, then a fixed set of inline patterns are applied to the
// escaped string. Because escaping ran first, any `<`/`>`/`&` from the doc is
// inert; the only tags in the output are the ones we add here.
function renderInline(text) {
  let s = escapeHtml(text);
  // Inline code first so its contents aren't re-interpreted as bold/italic/links.
  // Placeholder out the code spans, process the rest, then splice them back.
  const codeSpans = [];
  s = s.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return 'NOVACODESPAN' + (codeSpans.length - 1) + 'ENDCODESPAN';
  });
  // Links: [label](href). label/href are already escaped. Internal doc links
  // (a known *.md filename, optionally with #anchor) switch the modal's doc;
  // external http(s) links open in a new tab; anything else is rendered as
  // plain (escaped) text — we never emit javascript:/data: hrefs.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const h = href.trim();
    const fileMatch = h.match(/^([a-z0-9-]+\.md)(#.*)?$/i);
    if (fileMatch && FILE_TO_SLUG[fileMatch[1]]) {
      const slug = FILE_TO_SLUG[fileMatch[1]];
      return '<a href="#" data-legal-slug="' + slug + '">' + label + '</a>';
    }
    if (/^https?:\/\//i.test(h)) {
      return '<a href="' + h + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    }
    return label;
  });
  // Bold, then italic (bold first so **x** isn't eaten by the italic rule).
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Restore code spans.
  s = s.replace(/NOVACODESPAN(\d+)ENDCODESPAN/g, (_, i) => '<code>' + codeSpans[Number(i)] + '</code>');
  return s;
}

function isTableSeparator(line) {
  // | --- | :---: | etc. — cells of only dashes/colons/spaces, at least one dash.
  return /^\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line) && line.includes('-');
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

function renderTable(headerLine, bodyLines) {
  const headers = splitRow(headerLine);
  const head = '<thead><tr>' + headers.map(h => '<th>' + renderInline(h) + '</th>').join('') + '</tr></thead>';
  const rows = bodyLines.map(l => {
    const cells = splitRow(l);
    return '<tr>' + cells.map(c => '<td>' + renderInline(c) + '</td>').join('') + '</tr>';
  }).join('');
  return '<table>' + head + '<tbody>' + rows + '</tbody></table>';
}

/**
 * Render a Markdown string to a safe HTML string.
 * @param {string} md
 * @returns {string} HTML (all text escaped; only our structural tags present)
 */
export function renderMarkdown(md) {
  const lines = String(md == null ? '' : md).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let para = [];

  const flushPara = () => {
    if (para.length) {
      out.push('<p>' + renderInline(para.join(' ')) + '</p>');
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line ends a paragraph.
    if (trimmed === '') { flushPara(); i++; continue; }

    // Horizontal rule.
    if (/^(---|\*\*\*|___)$/.test(trimmed)) { flushPara(); out.push('<hr>'); i++; continue; }

    // Headings.
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      const level = Math.min(heading[1].length, 6);
      out.push('<h' + level + '>' + renderInline(heading[2]) + '</h' + level + '>');
      i++;
      continue;
    }

    // GFM table: a header row followed by a |---| separator row.
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1].trim())) {
      flushPara();
      const headerLine = trimmed;
      i += 2; // skip header + separator
      const body = [];
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim() !== '') {
        body.push(lines[i].trim());
        i++;
      }
      out.push(renderTable(headerLine, body));
      continue;
    }

    // Blockquote (one or more consecutive `>` lines).
    if (trimmed.startsWith('>')) {
      flushPara();
      const quote = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push('<blockquote>' + renderInline(quote.join(' ')) + '</blockquote>');
      continue;
    }

    // Unordered list.
    if (/^[-*]\s+/.test(trimmed)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const item = [lines[i].trim().replace(/^[-*]\s+/, '')];
        i++;
        // Continuation lines (indented, not a new list item / blank / block).
        while (i < lines.length && /^\s+\S/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i])) {
          item.push(lines[i].trim());
          i++;
        }
        items.push('<li>' + renderInline(item.join(' ')) + '</li>');
      }
      out.push('<ul>' + items.join('') + '</ul>');
      continue;
    }

    // Ordered list.
    if (/^\d+\.\s+/.test(trimmed)) {
      flushPara();
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const item = [lines[i].trim().replace(/^\d+\.\s+/, '')];
        i++;
        while (i < lines.length && /^\s+\S/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
          item.push(lines[i].trim());
          i++;
        }
        items.push('<li>' + renderInline(item.join(' ')) + '</li>');
      }
      out.push('<ol>' + items.join('') + '</ol>');
      continue;
    }

    // Default: accumulate into a paragraph.
    para.push(trimmed);
    i++;
  }
  flushPara();
  return out.join('\n');
}
