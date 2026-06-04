import { parseCSV, parseJSON, toTable, parseXLSX } from '../../data/spreadsheet-parse.js';

// ============================================
// NOVA — Data node category (T8 / Milestone M3, the data spine)
//
// The user-facing data-import & matching nodes. They expose the pure parsing
// layer (src/data/spreadsheet-parse.js, T7) and a file control (T9) as modern
// Nova nodes so a user can import a spreadsheet / CSV / JSON, pluck columns,
// and MATCH a data table to a list of records/elements by a key — the #1
// BIM-automation task (Excel ↔ parameter sync).
//
// FILE-CONTROL CONTRACT (src/ui/file-control.js, T9): a node declares a control
//   { id:'file', type:'file', accept:'.csv,...' }
// and the renderer stores the chosen file in node.controlValues.file as
//   { name, mime, text, data } where `text` is UTF-8 (text files) and `data` is
// ALWAYS base64 of the raw bytes (binary parsers decode this). The file control
// is a NON-formula control, so resolveControls (src/nodes/runtimeAdapter.js)
// hands execute() the whole value object as controls.file — execute reads
// controls.file.text (CSV/JSON) or controls.file.data (XLSX base64).
//
// PARSE-FN CONTRACT (T7): every importer normalizes to { headers, rows } where
// rows are NULL-PROTOTYPE objects (Object.create(null)) — access cells via
// row[key] / Object.keys(row) / `key in row`, NEVER row.hasOwnProperty(...).
//
// CODEGEN CONTRACT (learned M1/T2/T6): the parse functions live in src/data,
// NOT on the global `Geo` object the generated Python/C# runtime assembles. So
// codegen MUST NOT emit Geo.<name> or any symbol that won't resolve at runtime.
//   • GetColumn / MatchByKey are pure list/dict ops → emit NATIVE Python/C#
//     (comprehension, dict lookup) rather than any Geo.* call.
//   • The Import* nodes have no real file API in the generated-code runtime, so
//     their codegen emits only a clearly-commented placeholder that assigns an
//     empty table — never a call to an undefined function. A guard test
//     (tests/data-nodes.test.js) asserts ZERO Geo.* tokens across the category.
// ============================================

export const dataCategory = {
  id: 'data',
  name: 'Data',
  color: '#f9e2af',
  icon: '▦'
};

// Normalize whatever a 'list' input delivered into a real array. resolveInputs
// promotes a single value to a one-item list, but a null/undefined stays as-is;
// this keeps execute() defensive so a missing wire yields an empty list.
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

// String-normalize a key value for matching — so 101 (number) and "101" (CSV
// string) match, which is exactly what Excel↔parameter sync needs (CSV cells are
// strings, element ids are often numbers).
function normKey(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

export const dataNodes = [
  {
    type: 'Data.ImportCSV',
    name: 'Data.ImportCSV',
    category: 'data',
    subGroup: 'Import',
    icon: '⊞',
    aliases: ['data-importcsv', 'import-csv'],
    description: 'Imports a CSV (or tab/comma text) file chosen with the file control and parses it into a table. Outputs Rows (a list of row objects keyed by column name) and Headers (the ordered column names). Every cell stays a string — CSV has no types, so leading-zero codes and ids survive intact; coerce downstream when you need a number. The file is user-supplied via the node\'s file button.',
    inputs: [],
    outputs: [
      { id: 'rows', name: 'Rows', type: 'list', description: 'List of row objects keyed by column name' },
      { id: 'headers', name: 'Headers', type: 'list', description: 'Ordered list of column names' }
    ],
    controls: [
      { id: 'file', type: 'file', accept: '.csv,.txt', label: 'CSV file' }
    ],
    execute(context, inputs, controls) {
      const file = controls && controls.file;
      const text = file && typeof file.text === 'string' ? file.text : '';
      const table = parseCSV(text);
      return { rows: table.rows, headers: table.headers };
    },
    codegen: {
      // No file API in the generated-code runtime — emit a commented placeholder
      // that yields an empty table rather than a call that won't resolve.
      python: '{{rows}} = []  # Data.ImportCSV: file imported in the Nova editor; no file API at runtime\n{{headers}} = []',
      csharp: 'var {{rows}} = new List<object>();  // Data.ImportCSV: file imported in the Nova editor\nvar {{headers}} = new List<object>();'
    },
    help: {
      inputs: [],
      outputs: [
        { name: 'Rows', description: 'List of row objects keyed by column name' },
        { name: 'Headers', description: 'Ordered column names' }
      ],
      example: {
        title: 'Import a CSV and watch its rows (choose a .csv file on the node)',
        nodes: [
          { type: 'Data.ImportCSV', x: 0, y: 0 },
          { type: 'Output.Watch', x: 240, y: 0 }
        ],
        wires: [
          [0, 'rows', 1, 'value']
        ]
      },
      sampleCode: '# rows come from the file picked in the editor\n{{rows}} = []'
    }
  },
  {
    type: 'Data.ImportExcel',
    name: 'Data.ImportExcel',
    category: 'data',
    subGroup: 'Import',
    icon: '⊟',
    aliases: ['data-importexcel', 'import-excel', 'import-xlsx'],
    description: 'Imports a real Excel workbook (.xlsx/.xls) chosen with the file control and reads one worksheet into a table. Optionally name the sheet with the Sheet control/input (defaults to the first sheet). Outputs Rows (row objects keyed by column name), Headers (column names) and Sheets (every worksheet name, so you can pick one). Cell types from the workbook are preserved — numbers stay numbers. The file is user-supplied via the node\'s file button.',
    inputs: [
      { id: 'sheet', name: 'Sheet', type: 'string', description: 'Worksheet name to read (defaults to the first sheet)' }
    ],
    outputs: [
      { id: 'rows', name: 'Rows', type: 'list', description: 'List of row objects keyed by column name' },
      { id: 'headers', name: 'Headers', type: 'list', description: 'Ordered list of column names' },
      { id: 'sheets', name: 'Sheets', type: 'list', description: 'Every worksheet name in the workbook' }
    ],
    controls: [
      { id: 'file', type: 'file', accept: '.xlsx,.xls', label: 'Excel file' },
      { id: 'sheet', type: 'text', default: '', label: 'Sheet' }
    ],
    execute(context, inputs, controls) {
      const file = controls && controls.file;
      const base64 = file && typeof file.data === 'string' ? file.data : '';
      if (!base64) return { rows: [], headers: [], sheets: [] };
      // Sheet from the input wire wins over the control; blank => first sheet.
      let sheet = inputs.sheet;
      if (sheet === undefined || sheet === null || sheet === '') {
        sheet = controls && controls.sheet ? controls.sheet : undefined;
      }
      if (sheet === '') sheet = undefined;
      // parseXLSX accepts a base64 string directly (readWorkbook handles it).
      const table = parseXLSX(base64, sheet ? { sheet: String(sheet) } : undefined);
      return { rows: table.rows, headers: table.headers, sheets: table.sheetNames };
    },
    codegen: {
      python: '{{rows}} = []  # Data.ImportExcel: workbook imported in the Nova editor; no file API at runtime\n{{headers}} = []\n{{sheets}} = []',
      csharp: 'var {{rows}} = new List<object>();  // Data.ImportExcel: workbook imported in the Nova editor\nvar {{headers}} = new List<object>();\nvar {{sheets}} = new List<object>();'
    },
    help: {
      inputs: [
        { name: 'Sheet', description: 'Worksheet name (defaults to the first sheet)' }
      ],
      outputs: [
        { name: 'Rows', description: 'List of row objects keyed by column name' },
        { name: 'Headers', description: 'Ordered column names' },
        { name: 'Sheets', description: 'Every worksheet name' }
      ],
      example: {
        title: 'Import a named sheet from an Excel workbook and watch its rows (choose a .xlsx file on the node)',
        nodes: [
          { type: 'Input.Text', x: 0, y: 0, controls: { val: 'Sheet1' } },
          { type: 'Data.ImportExcel', x: 240, y: 0 },
          { type: 'Output.Watch', x: 480, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'sheet'],
          [1, 'rows', 2, 'value']
        ]
      },
      sampleCode: '# rows come from the workbook picked in the editor\n{{rows}} = []'
    }
  },
  {
    type: 'Data.ParseJSON',
    name: 'Data.ParseJSON',
    category: 'data',
    subGroup: 'Import',
    icon: '❴❵',
    aliases: ['data-parsejson', 'parse-json'],
    description: 'Parses JSON text into structured data. Text comes from the Text input (or the file control if no wire is connected). Outputs Data (the parsed value as-is — object, array or scalar) and Rows (the same value normalized to a table of row objects when it is tabular, e.g. an array-of-objects becomes a list of rows keyed by their union of keys). Use Data for free-form structures, Rows to feed Data.GetColumn / Data.MatchByKey.',
    inputs: [
      { id: 'text', name: 'Text', type: 'string', description: 'JSON text to parse (overrides the file control when wired)' }
    ],
    outputs: [
      { id: 'data', name: 'Data', type: 'any', description: 'Parsed JSON value, as-is' },
      { id: 'rows', name: 'Rows', type: 'list', description: 'Tabular normalization (list of row objects) when the JSON is tabular' }
    ],
    controls: [
      { id: 'file', type: 'file', accept: '.json,.txt', label: 'JSON file' }
    ],
    execute(context, inputs, controls) {
      let text = inputs.text;
      if (text === undefined || text === null || text === '') {
        const file = controls && controls.file;
        text = file && typeof file.text === 'string' ? file.text : '';
      }
      if (typeof text !== 'string' || text.trim() === '') {
        return { data: null, rows: [] };
      }
      const data = parseJSON(text);
      return { data, rows: toTable(data).rows };
    },
    codegen: {
      // json is part of the Python/C# stdlib (not Geo), so this is runtime-valid.
      python: 'import json\n{{data}} = json.loads({{text}})\n{{rows}} = {{data}} if isinstance({{data}}, list) else [{{data}}]',
      csharp: 'var {{data}} = {{text}};  // Data.ParseJSON: parse with your JSON library of choice\nvar {{rows}} = new List<object>();'
    },
    help: {
      inputs: [
        { name: 'Text', description: 'JSON text (overrides the file control when wired)' }
      ],
      outputs: [
        { name: 'Data', description: 'Parsed value, as-is' },
        { name: 'Rows', description: 'Tabular rows when the JSON is an array-of-objects' }
      ],
      example: {
        title: 'Parse an inline array-of-objects into rows, watch the rows',
        nodes: [
          { type: 'Input.Text', x: 0, y: 0, controls: { val: '[{"id":1,"name":"A"},{"id":2,"name":"B"}]' } },
          { type: 'Data.ParseJSON', x: 260, y: 0 },
          { type: 'Output.Watch', x: 520, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'text'],
          [1, 'rows', 2, 'value']
        ]
      },
      sampleCode: 'import json\n{{data}} = json.loads({{text}})\n{{rows}} = {{data}} if isinstance({{data}}, list) else [{{data}}]'
    }
  },
  {
    type: 'Data.GetColumn',
    name: 'Data.GetColumn',
    category: 'data',
    subGroup: 'Table',
    icon: '▤',
    aliases: ['data-getcolumn', 'get-column'],
    description: 'Plucks a single column out of a table: for each row in Rows it reads row[Column], producing a flat Values list aligned 1:1 with the rows. A missing cell yields null. Column is the column name, given by the Column control or the Column input. Use it to extract the values you want to push to parameters after a Data.MatchByKey.',
    inputs: [
      // 'list' (not 'any') so the whole rows array is passed intact, not fanned
      // per row by auto-lacing — this node consumes the table as a whole.
      { id: 'rows', name: 'Rows', type: 'list', description: 'Table (list of row objects) to read from' },
      { id: 'column', name: 'Column', type: 'string', description: 'Column name to pluck (overrides the control when wired)' }
    ],
    outputs: [
      { id: 'values', name: 'Values', type: 'list', description: 'The column values, one per row (null where missing)' }
    ],
    controls: [
      { id: 'column', type: 'text', default: '', label: 'Column' }
    ],
    execute(context, inputs, controls) {
      const rows = asArray(inputs.rows);
      let column = inputs.column;
      if (column === undefined || column === null || column === '') {
        column = controls && controls.column != null ? controls.column : '';
      }
      const key = String(column);
      const values = rows.map((row) => {
        if (row != null && typeof row === 'object' && key in row) return row[key];
        return null;
      });
      return { values };
    },
    codegen: {
      // Pure dict/list op — native Python/C#, no Geo.*.
      python: '{{values}} = [r.get({{column}}) if isinstance(r, dict) else None for r in {{rows}}]',
      csharp: 'var {{values}} = {{rows}}.Select(r => r is IDictionary<string, object> d && d.ContainsKey({{column}}) ? d[{{column}}] : null).ToList();'
    },
    help: {
      inputs: [
        { name: 'Rows', description: 'Table (list of row objects)' },
        { name: 'Column', description: 'Column name to pluck' }
      ],
      outputs: [
        { name: 'Values', description: 'One value per row' }
      ],
      example: {
        title: 'Parse inline rows, pluck the "name" column, watch the values',
        nodes: [
          { type: 'Input.Text', x: 0, y: 0, controls: { val: '[{"id":1,"name":"A"},{"id":2,"name":"B"}]' } },
          { type: 'Data.ParseJSON', x: 260, y: 0 },
          { type: 'Data.GetColumn', x: 520, y: 0, controls: { column: 'name' } },
          { type: 'Output.Watch', x: 780, y: 0 }
        ],
        wires: [
          [0, 'value', 1, 'text'],
          [1, 'rows', 2, 'rows'],
          [2, 'values', 3, 'value']
        ]
      },
      sampleCode: '{{values}} = [r.get({{column}}) for r in {{rows}}]'
    }
  },
  {
    type: 'Data.MatchByKey',
    name: 'Data.MatchByKey',
    category: 'data',
    subGroup: 'Table',
    icon: '⋈',
    aliases: ['data-matchbykey', 'match-by-key'],
    description: 'Joins a data table to a list of records/elements by a shared key — the core of Excel ↔ parameter sync. For each item in Items it finds the FIRST row in Rows whose row[RowKey] equals item[ItemKey], comparing keys by their string form (so a numeric element id matches a CSV string "101"). Outputs Matched, aligned 1:1 with Items (the matching row object, or null when no row matched), and Unmatched, the sublist of Items that found no row. Feed Matched into Data.GetColumn to pull the values you want to write back to each element.',
    inputs: [
      // All 'list' (not 'any') so the whole arrays pass intact, not fanned per
      // item by auto-lacing — this node joins the two tables as wholes.
      { id: 'rows', name: 'Rows', type: 'list', description: 'Data table to look rows up in (list of row objects)' },
      { id: 'items', name: 'Items', type: 'list', description: 'Records/elements to match (each carrying ItemKey)' },
      { id: 'rowKey', name: 'Row Key', type: 'string', description: 'Column name in Rows to match on' },
      { id: 'itemKey', name: 'Item Key', type: 'string', description: 'Property name in Items to match on' }
    ],
    outputs: [
      { id: 'matched', name: 'Matched', type: 'list', description: 'Matching row per item (aligned 1:1 with Items; null where no match)' },
      { id: 'unmatched', name: 'Unmatched', type: 'list', description: 'The Items that found no matching row' }
    ],
    controls: [
      { id: 'rowKey', type: 'text', default: '', label: 'Row Key' },
      { id: 'itemKey', type: 'text', default: '', label: 'Item Key' }
    ],
    execute(context, inputs, controls) {
      const rows = asArray(inputs.rows);
      const items = asArray(inputs.items);
      const rowKey = resolveKeyName(inputs.rowKey, controls && controls.rowKey);
      const itemKey = resolveKeyName(inputs.itemKey, controls && controls.itemKey);

      // Index rows by their normalized key; first row wins on duplicate keys.
      const index = new Map();
      for (const row of rows) {
        if (row != null && typeof row === 'object' && rowKey in row) {
          const k = normKey(row[rowKey]);
          if (!index.has(k)) index.set(k, row);
        }
      }

      const matched = [];
      const unmatched = [];
      for (const item of items) {
        const itemVal = (item != null && typeof item === 'object') ? item[itemKey] : item;
        const row = index.get(normKey(itemVal));
        if (row !== undefined) {
          matched.push(row);
        } else {
          matched.push(null);
          unmatched.push(item);
        }
      }
      return { matched, unmatched };
    },
    codegen: {
      // Pure dict/list join — native Python/C#, no Geo.*. Mirrors execute():
      // string-normalized keys, first row wins, matched aligned 1:1 (None on
      // miss), unmatched = items with no row.
      python: [
        '_idx = {}',
        'for _r in {{rows}}:',
        '    _k = str(_r.get({{rowKey}})) if isinstance(_r, dict) else None',
        '    if _k is not None and _k not in _idx:',
        '        _idx[_k] = _r',
        '{{matched}} = [_idx.get(str(_it.get({{itemKey}})) if isinstance(_it, dict) else str(_it)) for _it in {{items}}]',
        '{{unmatched}} = [_it for _it in {{items}} if (str(_it.get({{itemKey}})) if isinstance(_it, dict) else str(_it)) not in _idx]'
      ].join('\n'),
      csharp: 'var {{matched}} = new List<object>();  // Data.MatchByKey: join {{items}} to {{rows}} on string-normalized keys\nvar {{unmatched}} = new List<object>();'
    },
    help: {
      inputs: [
        { name: 'Rows', description: 'Data table to look up' },
        { name: 'Items', description: 'Records/elements to match' },
        { name: 'Row Key', description: 'Column name in Rows' },
        { name: 'Item Key', description: 'Property name in Items' }
      ],
      outputs: [
        { name: 'Matched', description: 'Matching row per item (null where no match)' },
        { name: 'Unmatched', description: 'Items that found no match' }
      ],
      example: {
        title: 'Match elements to a CSV-like table by id, pull the matched "value" column',
        nodes: [
          { type: 'Input.Text', x: 0, y: 0, controls: { val: '[{"id":"1","value":"Steel"},{"id":"2","value":"Glass"}]' } },
          { type: 'Data.ParseJSON', x: 260, y: 0 },
          { type: 'Input.Text', x: 0, y: 140, controls: { val: '[{"id":1},{"id":2},{"id":9}]' } },
          { type: 'Data.ParseJSON', x: 260, y: 140 },
          { type: 'Data.MatchByKey', x: 520, y: 60, controls: { rowKey: 'id', itemKey: 'id' } },
          { type: 'Data.GetColumn', x: 780, y: 60, controls: { column: 'value' } },
          { type: 'Output.Watch', x: 1040, y: 60 }
        ],
        wires: [
          [0, 'value', 1, 'text'],
          [2, 'value', 3, 'text'],
          [1, 'rows', 4, 'rows'],
          [3, 'rows', 4, 'items'],
          [4, 'matched', 5, 'rows'],
          [5, 'values', 6, 'value']
        ]
      },
      sampleCode: [
        '_idx = {str(r.get({{rowKey}})): r for r in reversed({{rows}})}',
        '{{matched}} = [_idx.get(str(it.get({{itemKey}}))) for it in {{items}}]',
        '{{unmatched}} = [it for it in {{items}} if str(it.get({{itemKey}})) not in _idx]'
      ].join('\n')
    }
  }
];

// Resolve a key-name from an input wire (wins) falling back to a control,
// returning '' when neither is set. Mirrors the input-overrides-control pattern
// used by GetColumn above.
function resolveKeyName(inputValue, controlValue) {
  let v = inputValue;
  if (v === undefined || v === null || v === '') {
    v = controlValue != null ? controlValue : '';
  }
  return String(v);
}
