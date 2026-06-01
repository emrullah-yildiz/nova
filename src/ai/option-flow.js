export function parseOptionGroups(fullText) {
  if (!fullText || typeof fullText !== 'string') return [];

  const groups = [];
  const lines = fullText.split('\n');
  let current = null;
  let lastNum = 0;

  function ensureGroup(title) {
    if (!current) {
      current = { title: title || 'Options', options: [] };
      groups.push(current);
      lastNum = 0;
    } else if (title) {
      if (current.options.length > 0 && current.title !== title) {
        current = { title, options: [] };
        groups.push(current);
        lastNum = 0;
        return current;
      }
      current.title = title;
    }
    return current;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const groupMatch = line.match(/^\*\*([^*]+)\*\*\s*:?\s*$/);
    if (groupMatch) {
      ensureGroup(groupMatch[1].replace(/:$/, '').trim());
      continue;
    }

    const m = line.match(/^\[(\d)\]\s*\*?\*?([^\u2014\u2013\-\n]+?)(?:\*?\*?)(?:\s*[\u2014\u2013-]\s*(.+))?$/);
    if (!m || !m[2]) continue;

    const num = Number(m[1]);
    const label = m[2].replace(/\*\*/g, '').trim();
    const desc = m[3] ? m[3].trim() : '';
    if (label.length < 2 || label.length >= 100) continue;

    if (current && current.options.length > 0 && num <= lastNum) {
      current = { title: 'Options', options: [] };
      groups.push(current);
    }

    ensureGroup();
    current.options.push({ num: String(num), label, desc, group: current.title });
    lastNum = num;
  }

  return groups.filter(group => group.options.length >= 2);
}

export function firstOptionGroup(fullText) {
  return parseOptionGroups(fullText)[0] || null;
}

export function buildOptionReply(groupTitle, option) {
  const prefix = groupTitle && groupTitle !== 'Options' ? groupTitle + ': ' : '';
  return prefix + option.num + '. ' + option.label;
}

export function buildDecideYourselfReply(groupTitle) {
  const suffix = groupTitle && groupTitle !== 'Options' ? ' for "' + groupTitle + '"' : '';
  return 'Decide yourself: choose this answer and fill the remaining design parameters with sensible architectural defaults' + suffix + '.';
}

export function buildOtherReply(groupTitle) {
  const suffix = groupTitle && groupTitle !== 'Options' ? ' for "' + groupTitle + '"' : '';
  return 'Other: I want to specify a different answer' + suffix + '. Ask me for the required parameters one question at a time.';
}
