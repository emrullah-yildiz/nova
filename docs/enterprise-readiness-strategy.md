# Nova: Enterprise-Ready Tool Strategy & Roadmap

**Date:** May 18, 2026  
**Version:** 1.0  
**Status:** Strategic Planning Document

**Repository validation update (May 18, 2026):** The repo has advanced beyond parts of this original roadmap. `npm test` passes with 37 tests across 10 files, `npm run build` produces `dist/`, `.github/workflows/ci.yml` exists, and CI gates lint, unit tests, Playwright browser workflow tests, build, and `npm audit --audit-level=moderate`. Snyk runs as a strict gate when `SNYK_TOKEN` is configured. The Vite boot path now uses explicit `src/` module imports without `src/legacy-loader.js` raw-script injection, while temporary `window.*` compatibility bridges remain for inline handlers and browser integrations. The remaining enterprise blockers are deeper workflow coverage, real deployment, and production hardening.

---

## Executive Summary

Nova is currently a **feature-complete prototype** with functional proof-of-concept code (graph engine, 3D geometry, AI integration, Revit integration). However, it requires significant work in **infrastructure, testing, documentation, and deployment** to be production-ready for enterprise use.

### Current Assessment: **Phase 2.5/3 (60% Complete)**

- ✅ Core functionality working
- ✅ Build toolchain established (Vite)
- ✅ Initial testing framework in place
- ✅ Module structure defined
- ✅ Raw legacy-loader module migration complete
- ❌ CI/CD pipeline missing
- ❌ Enterprise-grade testing incomplete
- ❌ Deployment strategy undefined
- ❌ WebSocket server for plugin integration not yet built

### Timeline to Enterprise Readiness
- **IMMEDIATE (Week 1):** Make CI strict, preserve quiet lint output, and verify the browser runtime
- **SHORT-TERM (Weeks 2-3):** Complete module migration, reach 70% test coverage
- **MEDIUM-TERM (Weeks 4-6):** Production hardening, logging, security
- **LONG-TERM (Weeks 7-12):** TypeScript migration, deployment infrastructure, plugin systems

**Estimated total effort:** 12-16 weeks for full enterprise readiness

---

## Part 1: Current State Assessment

### What's Working

| Component | Status | Quality |
|-----------|--------|---------|
| **Graph Engine** | ✅ Functional | Good (core logic sound) |
| **Node System** | ✅ Functional | Good (extensible) |
| **3D Viewport** | ✅ Functional | Fair (Three.js integration works) |
| **Geometry Kernel** | ✅ Functional | Good (NURBS math implemented) |
| **AI Integration** | ✅ Functional | Fair (basic GPT integration) |
| **Revit Bridge** | ✅ Mock data loads | Incomplete (no real data yet) |
| **Build System** | ✅ Vite configured | Good (modern bundler) |
| **Testing Framework** | ✅ Vitest configured | Fair (minimal coverage) |
| **Linting/Formatting** | ✅ ESLint + Prettier | Good (standards enforced) |

### Critical Gaps for Enterprise

| Gap | Impact | Severity |
|-----|--------|----------|
| **Module migration incomplete** | app.js, engine.js still legacy globals | 🔴 HIGH |
| **No CI/CD pipeline** | No automated testing on commits | 🔴 HIGH |
| **<50% test coverage** | Risk of regressions in production | 🔴 HIGH |
| **No error monitoring** | Can't debug issues in production | 🟠 MEDIUM |
| **No performance tracking** | Don't know if optimizations work | 🟠 MEDIUM |
| **No security scanning** | Vulnerable dependencies not detected | 🟠 MEDIUM |
| **No deployment docs** | Unclear how to ship to production | 🟠 MEDIUM |
| **API documentation missing** | Hard to maintain or extend | 🟡 LOW |
| **No accessibility testing** | May not meet compliance standards | 🟡 LOW |

Current corrections to the gap table:

- `No CI/CD pipeline` should now be read as `CI/CD exists and enforces core gates`: lint and npm audit now fail the workflow when they fail; Snyk is strict when `SNYK_TOKEN` is configured.
- `<50% test coverage` is no longer accurate for extracted modules: the current measured baseline is 81.54% statements / 87.32% lines, but legacy UI/runtime workflow coverage is still incomplete.
- `No security scanning` should now be read as `security scanning is partially configured`: npm audit blocks the workflow; Snyk requires a configured token.
- `No deployment docs` should now be read as `deployment remains placeholder-only`: the CI deploy jobs describe intent but do not ship to a real target.

---

## Part 2: Detailed Roadmap

### IMMEDIATE (Week 1): Fix Critical Issues

#### 1.1 Complete Vite Integration ✅ **MOSTLY DONE**
- [x] Vite dev server runs (`npm run dev` → http://localhost:8080)
- [x] vite.config.js configured
- [ ] Verify app loads without errors in browser
- [ ] Test that hot module reloading works
- [ ] Verify build output works with `npm run build`

**Action:** Test the dev server in browser:
```bash
npm run dev
# Browser opens http://localhost:8080
# Verify landing page loads
# Verify "New Project" button works
```

#### 1.2 Set Up GitHub Actions CI/CD
Create `.github/workflows/ci.yml`:
```yaml
name: CI/CD

on: [push, pull_request]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run lint:all
      - run: npm run test
      - run: npm run build
      
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm audit --audit-level=moderate
```

**Deliverable:** Every commit is validated

#### 1.3 Establish Code Coverage Baseline
```bash
npm test -- --coverage
```

Capture baseline metrics:
- Current coverage: ~30%
- Target for Phase 2: 70%
- Target for enterprise: 85%+

**Deliverable:** Coverage dashboard in GitHub Actions

---

### SHORT-TERM (Weeks 2-3): Complete Module Migration

#### 2.1 Migrate `app.js` to `src/core/app.js`

**Current:** Global `const app = { ... }`  
**Target:** ES module with proper exports

```javascript
// Before (app.js - legacy)
const app = { init() {...}, newProject() {...} };
document.addEventListener('DOMContentLoaded', () => app.init());

// After (src/core/app.js - module)
export class AppController {
  constructor() { this.currentPage = 'landing'; }
  init() { ... }
  newProject() { ... }
}

// src/main.js - new entrypoint
import { AppController } from './core/app.js';
const app = new AppController();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
window.app = app; // Expose for inline handlers (temporary)
```

**Subtasks:**
- [ ] Create `src/core/app.js`
- [ ] Extract AppController class
- [ ] Update `src/main.js` bootstrap
- [ ] Add unit tests for AppController
- [ ] Keep compatibility shim in `app.js` during transition
- [ ] Verify no regression in browser

**Effort:** 3-4 hours  
**Blocker for:** Phase 3 completion

#### 2.2 Migrate `engine.js` to `src/core/engine.js`

**Current:** Global `ENGINE` object with graph execution  
**Target:** ES module with clean API

```javascript
// src/core/engine.js
export class GraphEngine {
  constructor(nodes, wires) { this.nodes = nodes; this.wires = wires; }
  executeGraph() { ... }
  computeNode(nodeId) { ... }
}

// src/main.js
import { GraphEngine } from './core/engine.js';
window.ENGINE = new GraphEngine([], []);
```

**Subtasks:**
- [ ] Create `src/core/engine.js`
- [ ] Extract GraphEngine class
- [ ] Add comprehensive tests
- [ ] Verify graph execution still works
- [ ] Profile performance (no regressions)

**Effort:** 4-5 hours  
**Blocker for:** AI integration testing

#### 2.3 Migrate `gpt-client.js` to `src/ai/gpt-client.js`

**Current:** Global `GPTClient` object with API calls  
**Target:** Proper module with error handling

```javascript
// src/ai/gpt-client.js
export class GPTClient {
  constructor(apiKey, provider = 'openai') { ... }
  async query(prompt) { ... }
  async streamCompletion(prompt, onChunk) { ... }
}

// src/main.js
import { GPTClient } from './ai/gpt-client.js';
window.gptClient = new GPTClient(process.env.VITE_GPT_API_KEY);
```

**Subtasks:**
- [ ] Create `src/ai/gpt-client.js`
- [ ] Add error handling & retry logic
- [ ] Add unit tests with mocks
- [ ] Environment variable support
- [ ] Test with real API key (optional)

**Effort:** 3-4 hours  
**Blocker for:** AI features

#### 2.4 Migrate `node-library.js` & `node-renderer.js` to `src/ui/`

**Current:** Global functions in node-library.js  
**Target:** Modular UI components

```javascript
// src/ui/node-library.js
export class NodeLibrary {
  constructor(nodeDefinitions) { this.definitions = nodeDefinitions; }
  getNodesForCategory(category) { ... }
  renderLibraryPanel(container) { ... }
}

// src/ui/node-renderer.js
export class NodeRenderer {
  renderNode(node, container) { ... }
  updateNodeDisplay(nodeId, data) { ... }
}
```

**Subtasks:**
- [ ] Extract NodeLibrary class
- [ ] Extract NodeRenderer class
- [ ] Add UI component tests
- [ ] Verify node library still loads
- [ ] Verify nodes render correctly

**Effort:** 5-6 hours  
**Blocker for:** UI testing

#### 2.5 Increase Test Coverage to 70%

**Current coverage:** ~30%  
**Target:** 70%  
**Gap:** ~40% of code needs tests

**What to test:**
- ✅ Graph execution (mostly done)
- ❌ Node creation/deletion
- ❌ Wire connections/disconnection
- ❌ File save/load
- ❌ Parameter validation
- ❌ Error cases & edge cases
- ❌ UI interactions
- ❌ AI prompt generation

**Test writing effort:** 20-25 hours (distributed over the sprint)

**Deliverable:** `npm test` with 70%+ coverage report

---

### MEDIUM-TERM (Weeks 4-6): Production Hardening

#### 3.1 Add Structured Logging

**Current:** `console.log()` scattered throughout code  
**Target:** Structured logging with levels, context, timestamps

```javascript
// src/core/logger.js
export class Logger {
  log(level, message, context = {}) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context
    }));
  }
}

// Usage
logger.info('Graph executed', { nodes: graph.nodes.length, time: 125 });
logger.error('Computation failed', { nodeId: 42, reason: 'Division by zero' });
```

**Deliverables:**
- [ ] Logger class with levels (debug, info, warn, error, fatal)
- [ ] Context enrichment (user, session, app version)
- [ ] JSON output for log aggregation
- [ ] Integration with Sentry (optional, for error tracking)

**Effort:** 4-5 hours

#### 3.2 Security Hardening

**1. Dependency Audit**
```bash
npm audit
npm audit fix
```

**2. Input Validation**
```javascript
// Every user input needs validation
function validateNodeParameter(param, value) {
  if (param.type === 'number') {
    const num = parseFloat(value);
    if (isNaN(num)) throw new Error('Invalid number');
    if (num < param.min || num > param.max) throw new Error('Out of range');
    return num;
  }
  // ... other types
}
```

**3. XSS Protection**
- Don't use `innerHTML` for user data
- Sanitize node names, parameter values
- Use `textContent` or safe templating

**4. Content Security Policy**
```javascript
// In vite.config.js
export default {
  server: {
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    }
  }
}
```

**Deliverables:**
- [ ] All dependencies audited and updated
- [ ] Input validation on all node parameters
- [ ] XSS protection implemented
- [ ] CSP headers configured
- [ ] Security test cases added

**Effort:** 6-8 hours

#### 3.3 Performance Optimization

**1. Code Splitting**
```javascript
// vite.config.js
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'geometry': ['./src/core/geometry-lib.js'],
          'ai': ['./src/ai/gpt-client.js']
        }
      }
    }
  }
}
```

**2. Lazy Loading**
```javascript
// Don't load 3D viewer until needed
const Viewer3D = await import('./viewer3d.js');
const viewer = new Viewer3D.Viewer3D(container);
```

**3. Bundle Analysis**
```bash
npm install -D rollup-plugin-visualizer
# Then analyze build size
```

**4. Caching Strategies**
```javascript
// Cache REVIT_DATA for 5 minutes
const CACHE_TTL = 5 * 60 * 1000;
let cachedData = null;
let cacheTime = 0;

function getRevitData() {
  if (Date.now() - cacheTime < CACHE_TTL) {
    return cachedData;
  }
  // Fetch fresh data
  cachedData = await revitBridge.getData();
  cacheTime = Date.now();
  return cachedData;
}
```

**Deliverables:**
- [ ] Code splitting reduces initial bundle
- [ ] Bundle size <500KB (gzipped)
- [ ] Lazy loading for heavy features
- [ ] LCP < 2s, FCP < 1s (Core Web Vitals)

**Effort:** 8-10 hours

#### 3.4 Production Deployment Guide

**Create `docs/deployment.md`:**

```markdown
# Production Deployment

## Prerequisites
- Node.js 18+
- npm or yarn

## Build
\`\`\`bash
npm run build
# Creates dist/ directory
\`\`\`

## Deployment Options

### Docker
\`\`\`dockerfile
FROM node:18-alpine
WORKDIR /app
COPY dist /app
EXPOSE 3000
CMD ["npx", "serve", "-s", ".", "-l", "3000"]
\`\`\`

### Static Hosting (Netlify, Vercel, GitHub Pages)
1. Connect repository
2. Build command: `npm run build`
3. Publish directory: `dist`

### Self-hosted
1. Build: `npm run build`
2. Serve: `npx serve -s dist -l 3000`
3. Add reverse proxy (nginx) for SSL/caching
```

**Deliverables:**
- [ ] Deployment documentation
- [ ] Docker image
- [ ] Environment variable template
- [ ] SSL/certificate setup
- [ ] Monitoring & alerting setup

**Effort:** 4-6 hours

---

### LONG-TERM (Weeks 7-12): Enterprise Scale

#### 4.1 TypeScript Migration (Weeks 7-8)

**Phase 1: Core modules**
```bash
npm install -D typescript ts-loader
# Convert src/core/, src/ai/ to .ts
```

**Phase 2: UI layer**
```bash
# Convert src/ui/ to .ts
```

**Phase 3: Legacy bridge (optional)**
```bash
# Define types for app.js, engine.js for type checking
```

**Deliverable:** `npm test` passes with strict mode, `npm run build` produces typed output

**Effort:** 12-16 hours (10-12% of total work)

#### 4.2 Advanced Testing

**E2E Tests (Playwright)**
```javascript
// tests/e2e/graph-execution.spec.js
import { test, expect } from '@playwright/test';

test('graph execution flow', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await page.click('button:has-text("New Project")');
  await expect(page.locator('.node-canvas')).toBeVisible();
  
  // Create number-input node
  await page.click('[data-node="number-input"]');
  // Connect to math-add node
  // Execute graph
  // Verify output
});
```

**Load Testing (k6)**
```javascript
// tests/load/graph-execution.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  vus: 100,
  duration: '30s'
};

export default function() {
  let res = http.post('http://localhost:8080/api/graph/execute', {...});
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200
  });
}
```

**Deliverable:** 
- [ ] 50+ E2E test cases
- [ ] Load test baseline established
- [ ] Browser compatibility verified (Chrome, Firefox, Safari, Edge)

**Effort:** 20-24 hours

#### 4.3 TypeScript + Full Type Safety

**Deliverable:**
- [ ] All modules typed (src/, tests/)
- [ ] JSDoc removed in favor of TS interfaces
- [ ] `npm run build` produces .d.ts files
- [ ] IDE autocomplete for all APIs

**Effort:** 8-10 hours (after TS migration)

#### 4.4 Revit/Rhino Plugin Infrastructure (Weeks 10-12)

See `docs/revit-plugin-architecture.md` for detailed plan.

**Phases:**
1. **WebSocket Server** (`server.js`) — 4-6 hours
2. **Browser WebSocket Client** — 2-3 hours
3. **C# Revit Plugin Stub** — 6-8 hours
4. **Message Router & Session Manager** — 4-5 hours
5. **Geometry Serialization** — 5-6 hours
6. **Integration Testing** — 4-5 hours

**Total effort:** 25-33 hours

**Deliverable:** Working prototype of Revit → Browser data flow

---

## Part 3: Infrastructure & DevOps

### 3.1 CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run lint:all
      
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test -- --coverage
      - uses: codecov/codecov-action@v3
        
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm audit --audit-level=moderate
      - uses: github/super-linter@v4
      
  build:
    runs-on: ubuntu-latest
    needs: [lint, test, security]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - uses: actions/upload-artifact@v3
        with:
          name: dist
          path: dist/
          
  deploy:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/download-artifact@v3
        with:
          name: dist
      - uses: netlify/actions/cli@master
        env:
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
        with:
          args: deploy --prod --dir=dist
```

### 3.2 Monitoring & Observability

**Error Tracking (Sentry)**
```javascript
// src/core/logger.js
import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1
});

export function captureException(err, context = {}) {
  Sentry.captureException(err, { contexts: { app: context } });
}
```

**Performance Monitoring**
```javascript
// Track Core Web Vitals
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

### 3.3 Container & Kubernetes

**Dockerfile**
```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Kubernetes Deployment**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nova
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nova
  template:
    metadata:
      labels:
        app: nova
    spec:
      containers:
      - name: nova
        image: nova:1.0.0
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

---

## Part 4: Effort Estimation & Timeline

### Total Effort Breakdown

| Phase | Focus | Hours | Weeks |
|-------|-------|-------|-------|
| **Week 1** | Critical fixes + CI/CD | 20 | 1 |
| **Weeks 2-3** | Module migration + tests | 60 | 2 |
| **Weeks 4-6** | Hardening + optimization | 50 | 3 |
| **Weeks 7-9** | TypeScript + advanced tests | 50 | 3 |
| **Weeks 10-12** | Plugin infrastructure | 40 | 3 |
| **Weeks 13-16** | Polish + documentation | 60 | 4 |
| **TOTAL** | | **280 hours** | **16 weeks** |

### Staffing Model

- **1 Senior Dev (full-time):** Leads architecture, reviews code, handles complex modules
- **1-2 Mid-level Devs:** Module migration, testing, feature work
- **1 DevOps Engineer (part-time):** CI/CD, monitoring, deployment

### Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Vite integration issues | Medium | High | Week 1: extensive testing |
| Module migration breaks UI | High | High | Keep compatibility shims; extensive testing |
| Test coverage plateau | Medium | High | Pair programming; test-driven development |
| Performance regressions | Medium | Medium | Baseline benchmarks before optimization |
| Dependency conflicts | Low | High | Regular audits; update strategy |

---

## Part 5: Specific Recommendations

### Immediate Next Steps (This Week)

1. **✅ Verify Vite dev server works**
   ```bash
   npm run dev
   # Verify http://localhost:8080 loads without errors
   # Test "New Project" workflow
   ```

2. **Create GitHub Actions workflow**
   - [ ] Copy CI/CD YAML from above
   - [ ] Add to `.github/workflows/ci.yml`
   - [ ] Test on a branch

3. **Establish test coverage baseline**
   ```bash
   npm test -- --coverage
   # Record current coverage percentage
   ```

4. **Create enterprise roadmap issue**
   - [ ] Link this document
   - [ ] Break into weekly milestones
   - [ ] Assign owners

### Current Immediate Next Steps

1. Configure `SNYK_TOKEN` in GitHub so the existing Snyk step runs as a strict high-severity gate.
2. Keep `npm run lint:all`, `npm test`, and `npm run build` as required local and CI gates.
3. Extend browser workflow verification beyond the new smoke suite into drag/drop wiring, file import/export, 3D viewport behavior, and settings flows.
4. Continue reducing temporary `window.*` compatibility bridges and inline event handlers now that raw-script injection has been removed.
5. Convert placeholder deploy jobs into a real staging or static-hosting deployment target.

### What NOT to Do

❌ **Don't** rewrite the entire codebase at once  
❌ **Don't** add TypeScript without modularizing first  
❌ **Don't** skip testing to ship faster  
❌ **Don't** delay CI/CD setup ("we'll add it later")  
❌ **Don't** merge to main without PR review  

### What TO Prioritize

✅ **DO** get CI/CD running first  
✅ **DO** maintain >70% test coverage  
✅ **DO** document decisions (ADRs)  
✅ **DO** do code reviews religiously  
✅ **DO** refactor early, not late  

---

## Appendix: Resources & References

### Tools & Libraries (Already Selected)
- **Build:** Vite 5.4
- **Testing:** Vitest 1.4
- **Linting:** ESLint 8.57
- **Formatting:** Prettier 3.0
- **CI/CD:** GitHub Actions

### Recommended Additions
- **Error Tracking:** Sentry (free tier includes 5k events/month)
- **Monitoring:** Datadog or New Relic (startup pricing available)
- **APM:** PostHog or Segment (open-source alternatives exist)
- **Security Scanning:** Snyk (free for GitHub)
- **Load Testing:** k6 (open-source)

### Documentation Standards
- Use Markdown for all docs
- Link decisions with Architecture Decision Records (ADRs)
- Keep README and quick-start guides updated
- Document CLI commands and environment variables

---

## Sign-Off

**Document Owner:** Technical Lead  
**Review Date:** May 25, 2026  
**Next Update:** July 1, 2026  

**Status:** Ready for implementation. Start Week 1 items immediately.
