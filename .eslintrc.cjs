module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true
  },
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  globals: {
    app: 'readonly',
    Geo: 'readonly',
    THREE: 'readonly',
    NFLogger: 'readonly',
    SettingsDialog: 'readonly',
    GPTClient: 'readonly',
    FormulaEval: 'readonly',
    CodeParser: 'readonly',
    NODE_LIBRARY: 'readonly',
    NODE_META: 'readonly',
    NODE_TYPE_MAP: 'readonly',
    Viewer3D: 'readonly',
    TYPE_COLORS: 'readonly',
    AIEngine: 'readonly',
    RevitBridge: 'readonly',
    REVIT_DATA: 'readonly',
    REVIT_MESHES: 'readonly',
    PythonRunner: 'readonly',
    showPortSuggest: 'readonly',
    html2canvas: 'readonly',
    ActiveXObject: 'readonly',
    window: 'readonly',
    document: 'readonly',
    describe: 'readonly',
    it: 'readonly',
    expect: 'readonly',
    beforeAll: 'readonly',
    beforeEach: 'readonly',
    afterAll: 'readonly',
    afterEach: 'readonly'
  },
  rules: {
    'no-console': 'off',
    'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
    'no-undef': 'error'
  },
  ignorePatterns: ['node_modules/', 'dist/', 'build/', 'coverage/', 'tests/fixtures/'],
  overrides: [
    {
      files: ['**/*.js'],
      excludedFiles: ['src/**', 'tests/**', '*.config.js'],
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'script'
      },
      rules: {
        'no-redeclare': 'off',
        'no-inner-declarations': 'off',
        'no-empty': 'off',
        'no-dupe-else-if': 'off',
        'no-constant-condition': 'off',
        'no-unused-vars': 'off'
      }
    },
    {
      files: ['*.config.js'],
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module'
      }
    }
  ]
}
