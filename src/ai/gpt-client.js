// ============================================
/* eslint-disable no-empty, no-constant-condition, no-dupe-else-if, no-unused-vars */
// NOVA — AI Client
// Real AI integration with streaming support
// ============================================

import { createNovaCloudClient } from '../enterprise/cloud-client.js';
import { getRuntimeConfig } from '../config/runtime-config.js';
import { buildNodeCatalog } from './node-catalog.js';

const GPTClient = {
  MODEL: 'anthropic/claude-sonnet-4.5',
  MAX_TOKENS: 2048,
  TEMPERATURE: 0.7,

  // Free-tier proxy — when the user has no API key configured we POST to
  // Nova's own serverless API route, which forwards to Groq with a
  // server-side GROQ_API_KEY. Lets first-time visitors chat without signup.
  PROXY_URL: '/api/proxy/chat',
  // 8B-Instant has dramatically higher TPM than 70B on Groq's free tier and
  // is plenty for chat triage. The proxy will upgrade to a larger model for
  // code generation if/when the user message implies a build intent.
  PROXY_MODEL: 'llama-3.1-8b-instant',
  PROXY_MAX_TOKENS: 512,

  // ── PROVIDER REGISTRY ──
  // `format` selects the wire protocol: 'openai' is the chat-completions
  // shape (Bearer auth, {messages}, choices[].message.content) that most
  // providers speak — including Google's OpenAI-compatible Gemini endpoint.
  // 'anthropic' is Claude's native /v1/messages API, which differs in
  // headers, request body, and response shape; see the adapters below.
  PROVIDERS: {
    openai: {
      name: 'OpenAI',
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      keyPrefix: 'sk-',
      format: 'openai',
      models: [
        { id: 'gpt-5', name: 'GPT-5 (recommended)', free: false },
        { id: 'gpt-5-mini', name: 'GPT-5 Mini (faster, cheaper)', free: false },
        { id: 'gpt-5-nano', name: 'GPT-5 Nano (fastest, cheapest)', free: false },
        { id: 'gpt-4o', name: 'GPT-4o', free: false },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', free: false }
      ]
    },
    groq: {
      name: 'Groq (Free Tier)',
      apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
      keyPrefix: 'gsk_',
      format: 'openai',
      models: [
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (free, fast)', free: true },
        { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (free, fastest)', free: true },
        { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B (free)', free: true },
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (free, 32k ctx)', free: true }
      ]
    },
    gemini: {
      // Google exposes an OpenAI-compatible endpoint, so Gemini slots into the
      // standard chat-completions flow (Bearer auth, no custom adapter). Keys
      // come from Google AI Studio and start with "AIza".
      name: 'Google Gemini',
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      keyPrefix: 'AIza',
      format: 'openai',
      models: [
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (recommended, free tier)', free: true },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', free: true },
        { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite (fastest)', free: true },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', free: true }
      ]
    },
    anthropic: {
      // Claude's native messages API — used directly with an Anthropic key
      // (sk-ant-…) so users don't have to route through OpenRouter. Needs the
      // 'anthropic' format adapter (x-api-key header, system as a top-level
      // field, content[] response). Model ids are overridable in Settings.
      name: 'Anthropic (Claude)',
      apiUrl: 'https://api.anthropic.com/v1/messages',
      keyPrefix: 'sk-ant-',
      format: 'anthropic',
      models: [
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (recommended)', free: false },
        { id: 'claude-opus-4-8', name: 'Claude Opus 4.8 (most capable)', free: false },
        { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (fastest)', free: false }
      ]
    },
    openrouter: {
      name: 'OpenRouter',
      apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
      keyPrefix: 'sk-or-',
      format: 'openai',
      models: [
        { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6 ($3/M)', free: false },
        { id: 'openai/gpt-4o', name: 'GPT-4o ($2.50/M)', free: false },
        { id: 'openrouter/free', name: 'Auto-Select Free', free: true },
        { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (free)', free: true }
      ]
    }
  },

  getProvider() {
    return localStorage.getItem('nodeflow_provider') || 'openrouter';
  },
  setProvider(provider) {
    localStorage.setItem('nodeflow_provider', provider);
  },
  getApiKey() {
    var provider = this.getProvider();
    return localStorage.getItem('nodeflow_key_' + provider) || localStorage.getItem('nodeflow_openai_key') || '';
  },
  setApiKey(key) {
    var provider = this.getProvider();
    if (key && key.trim()) {
      localStorage.setItem('nodeflow_key_' + provider, key.trim());
      if (provider === 'openai') localStorage.setItem('nodeflow_openai_key', key.trim());
    } else {
      localStorage.removeItem('nodeflow_key_' + provider);
      if (provider === 'openai') localStorage.removeItem('nodeflow_openai_key');
    }
  },
  hasApiKey() {
    var k = this.getApiKey();
    return k && k.length > 10;
  },

  // Returns true when the assistant can actually attempt a request. BYOK and
  // enterprise modes always qualify; in proxy mode we optimistically allow
  // the call too — if the deployment hasn't configured GROQ_API_KEY the
  // proxy returns 503 and the chat surfaces a clear "owner needs to set
  // env var" message instead of being silently blocked at the door.
  canChat() {
    return this.hasApiKey() || this.isEnterpriseAiEnabled() || this.isProxyMode();
  },
  getModel() {
    return localStorage.getItem('nodeflow_openai_model') || this.MODEL;
  },
  setModel(model) {
    localStorage.setItem('nodeflow_openai_model', model);
  },
  getApiUrl(providerOverride) {
    var provider = providerOverride || this.getProvider();
    var prov = this.PROVIDERS[provider];
    if (!prov) return this.PROVIDERS.openai.apiUrl;
    return prov.apiUrl;
  },
  getExtraHeaders() {
    var provider = this.getProvider();
    if (provider === 'openrouter') {
      return { 'HTTP-Referer': typeof window !== 'undefined' ? window.location.href : '', 'X-Title': 'Nova' };
    }
    return {};
  },
  isProxyMode() {
    return !this.hasApiKey();
  },
  getEffectiveApiUrl() {
    return this.isProxyMode() ? this.PROXY_URL : this.getApiUrl();
  },
  getEffectiveModel() {
    return this.isProxyMode() ? this.PROXY_MODEL : this.getModel();
  },
  // Wire format for the active provider. Proxy mode always speaks OpenAI
  // (the proxy normalizes everything server-side). For BYOK it's whatever the
  // provider declares; unknown/legacy providers default to 'openai'.
  getProviderFormat(providerOverride) {
    if (!providerOverride && this.isProxyMode()) return 'openai';
    var prov = this.PROVIDERS[providerOverride || this.getProvider()];
    return (prov && prov.format) || 'openai';
  },

  // ── WIRE-FORMAT ADAPTERS ──
  // Pure functions (no DOM / no fetch) so they're unit-testable. Each branches
  // on `format`: 'openai' (chat-completions) vs 'anthropic' (/v1/messages).

  buildAuthHeaders(format, key, extraHeaders) {
    if (format === 'anthropic') {
      return {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        // Required to call the Anthropic API directly from a browser (opts
        // into CORS). Without it the request is rejected before reaching auth.
        'anthropic-dangerous-direct-browser-access': 'true'
      };
    }
    return Object.assign({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + key
    }, extraHeaders || {});
  },

  buildChatPayload(format, model, messages, maxTokens, temperature, stream) {
    if (format === 'anthropic') {
      // Anthropic carries the system prompt as a top-level field, not a
      // message role, and requires max_tokens. Fold any system messages into
      // one `system` string and pass the rest through unchanged.
      var system = '';
      var convo = [];
      for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        if (m.role === 'system') { system += (system ? '\n\n' : '') + m.content; continue; }
        convo.push({ role: m.role, content: m.content });
      }
      var payload = { model: model, max_tokens: maxTokens, temperature: temperature, messages: convo };
      if (system) payload.system = system;
      if (stream) payload.stream = true;
      return payload;
    }
    var openai = { model: model, messages: messages, max_tokens: maxTokens, temperature: temperature };
    if (stream) openai.stream = true;
    return openai;
  },

  extractMessageContent(format, data) {
    if (format === 'anthropic') {
      if (data && Array.isArray(data.content)) {
        return data.content
          .filter(function (b) { return b && b.type === 'text'; })
          .map(function (b) { return b.text; })
          .join('');
      }
      return '';
    }
    return (data && data.choices && data.choices[0] && data.choices[0].message)
      ? data.choices[0].message.content : '';
  },

  extractStreamDelta(format, json) {
    if (format === 'anthropic') {
      // Anthropic SSE emits typed events; only content_block_delta carries
      // text. message_start/_stop, ping, etc. produce no visible output.
      if (json && json.type === 'content_block_delta' && json.delta && typeof json.delta.text === 'string') {
        return json.delta.text;
      }
      return '';
    }
    var delta = json && json.choices && json.choices[0] && json.choices[0].delta;
    return (delta && delta.content) || '';
  },

  buildRequestHeaders() {
    if (this.isProxyMode()) return { 'Content-Type': 'application/json' };
    return this.buildAuthHeaders(this.getProviderFormat(), this.getApiKey(), this.getExtraHeaders());
  },
  detectProvider(key) {
    if (!key) return 'openai';
    // sk-or-/sk-ant- both start with "sk-", so match the specific prefixes
    // before the generic OpenAI fallthrough.
    if (key.startsWith('sk-or-')) return 'openrouter';
    if (key.startsWith('sk-ant-')) return 'anthropic';
    if (key.startsWith('gsk_')) return 'groq';
    if (key.startsWith('AIza')) return 'gemini';
    return 'openai';
  },
  isApiKeyValid(key) {
    return typeof key === 'string' && key.length > 10;
  },
  isEnterpriseAiEnabled() {
    const config = getRuntimeConfig();
    return !!(config.enterpriseAiEnabled && config.apiBaseUrl);
  },
  getEnterpriseClient() {
    if (!this._enterpriseClient) this._enterpriseClient = createNovaCloudClient();
    return this._enterpriseClient;
  },
  async ensureEnterpriseSession(client) {
    const config = getRuntimeConfig();
    if (client.isAuthenticated()) return;
    if (config.authProvider === 'dev') {
      await client.devLogin();
      return;
    }
    throw new Error('Nova Cloud sign-in required.');
  },

  // Lightweight prompt used for free-tier chitchat — greetings, clarifying
  // questions, design-direction discussions. The full Geo API reference
  // (~4-5k tokens) is intentionally left out so we don't burn the shared
  // free tier on small talk; the full prompt kicks in once the user clearly
  // wants to BUILD something.
  buildSlimSystemPrompt() {
    return `You are Nova's AI design assistant. Nova is a browser-based parametric design tool focused on ARCHITECTURE, GEOMETRY, and SPATIAL DESIGN. The user is here to design and build forms, not to take an app tour.

## How to greet a new user
ASK what kind of DESIGN PROJECT they want to work on. Offer concrete design directions like building, pavilion, facade, structure, surface, parametric form. NEVER offer options like "Get Started", "Tutorials", "Explore Templates", or "Ask Me Anything" — those are app-tour items, not design choices, and the user can't act on them productively.

## Option lists
When you offer choices, use this format with 2-4 items. Every option must be a CONCRETE design or project decision the user can pick to move the conversation forward:
[1] Option name — one-line description
[2] Option name — one-line description

Examples of good options:
  [1] Building — tower, residential, mixed-use
  [2] Pavilion — small organic shelter
  [3] Facade — exterior cladding pattern
  [4] Surface — NURBS canopy or shell

Examples of BAD options (never offer these):
  - "Ask me anything" / "Tutorials" / "Get Started" / "Help" — not actionable design choices
  - "Other" by itself with no specifics

## Code generation
When the user clearly asks to BUILD, CREATE, GENERATE, MAKE, DESIGN, DRAW, or MODEL something, write a brief explanation then a single \`\`\`python block using Nova's Geo API (Geo.Point3, Geo.createBox, Geo.loft, etc.). Do NOT use \`\`\`json. Never invent Geo methods you aren't sure exist.

Keep replies short and focused on the user's design intent.`;
  },

  // Heuristic — does this user message imply a code-generation request?
  // Used to decide between slim and full system prompts in proxy mode.
  hasBuildIntent(userMessage) {
    if (!userMessage) return false;
    const m = String(userMessage).toLowerCase();
    return /\b(build|create|generate|make|design|draw|model|show me a|show me an|i want a|i want an|add a|add an|let'?s build|let'?s make)\b/.test(m);
  },

  // The conversation has shifted into code mode once the assistant has
  // produced (or been asked to produce) Python. Sticky-upgrade to the
  // full Geo API prompt for every subsequent turn so option-clicks like
  // "Geodesic Dome" don't fall back to slim and trigger hallucinations
  // such as Geo.Edge / Geo.Mesh that the slim prompt's tiny method list
  // didn't warn against.
  historyHasCode(history) {
    if (!Array.isArray(history)) return false;
    for (let i = history.length - 1; i >= 0 && i >= history.length - 6; i--) {
      const msg = history[i];
      const text = (msg && (msg.text || msg.content)) || '';
      if (typeof text === 'string' && text.indexOf('```python') !== -1) return true;
    }
    return false;
  },

  // The assistant calls back here for code fix retries — those prompts
  // start with "The code you generated has a runtime error". We detect
  // them so the fix attempt always gets the full Geo API reference
  // instead of the slim prompt that almost certainly caused the bug.
  isFixPrompt(userMessage) {
    if (!userMessage) return false;
    const m = String(userMessage);
    return m.indexOf('runtime error') !== -1 && m.indexOf('Original code') !== -1;
  },

  buildSystemPrompt(existingCode) {
    let sys = `You are the AI for Nova, a visual node-based scripting tool with a 3D viewport (Three.js). You generate node graphs that become visual nodes on a canvas.

## RESPONSE FORMAT (PREFERRED — nova-plan)
For build/create requests, emit a brief 1-2 sentence explanation then a structured plan in a \`\`\`nova-plan fenced block. The plan declares params, ops, and the wires between them — the graph is built mechanically from this. Use ONLY nodes that appear in the catalog below.

Plan shape:
\`\`\`nova-plan
{
  "version": 1,
  "params": { "name": value, ... },
  "ops": [
    { "id": "<unique>", "node": "<Node.Type>", "controls": { ... }, "inputs": { "<portId>": "@otherOpId or $paramName" } }
  ]
}
\`\`\`

Reference syntax inside \`inputs\`:
- \`"@opId"\` — wires from another op's output
- \`"$paramName"\` — wires from a top-level param (becomes an Input node)

Rules:
1. Every \`node\` must be a real Nova node type from the catalog. NEVER invent node names.
2. Every input \`portId\` must be an actual input port on that node.
3. Every \`@\` reference must point to a declared op id; every \`$\` to a declared param.
4. Include exactly one \`Output.Watch\` (or similar Output.*) op so the result renders.
5. The graph must be a DAG — no cycles.
6. Each op's output should be consumed somewhere (no orphans).

## HOW TO COMPOSE NODES (read this BEFORE you consider refusing)

Most user requests do NOT have a single matching node. They are EXPRESSIBLE as a CHAIN of 3-7 existing nodes. Your job is to think compositionally: break the request into geometric primitives and figure out which nodes produce each piece.

**Decomposition checklist** — before you emit anything, ask:
1. What is the PRIMARY FORM the user wants? (tower, pavilion, surface, facade, dome...)
2. Does a Pattern.* / Surface.* / Solid.* node produce that form? Use it.
3. Does the request need a TRANSFORM on that form? (boolean, mirror, array, smooth) Chain it.
4. Does the request need a SKIN or DECORATION on that form? (panels, diagrid, voronoi) Chain another composite.
5. Does the request need MULTIPLE PIECES combined? Use Solid.BooleanUnion / Solid.CombineAll.
6. End with Output.Watch.

**COOKBOOK — common requests and their canonical node chains**

These are PROVEN compositions. Adapt them; don't invent new node names.

A) "A twisted tower" → 3 ops
   Pattern.TwistedEllipsePlates → Solid.ByLoft → Output.Watch

B) "A twisted tower with hex panels" → 4 ops (the panels are a SEPARATE chain reading the SAME profiles)
   Pattern.TwistedEllipsePlates → Solid.ByLoft → Output.Watch
   Pattern.TwistedEllipsePlates → Pattern.HexPanelGrid → (panels)
   (one Output.Watch on the tower OR on a combined list)

C) "An organic pavilion" → 3 ops
   Pattern.OrganicProfileStack → Solid.ByLoft → Output.Watch

D) "A wavy roof / canopy" → 2 ops
   Surface.WavyGrid → Output.Watch

E) "A geodesic dome" → 4 ops (sphere with bottom cut off, optionally subdivided)
   Point.Origin → Sphere.ByCenterRadius → Solid.BooleanSubtract (against a cutter box) → Output.Watch

F) "A diagrid facade" → 2 ops
   Pattern.DiagridFacade → Output.Watch

G) "A spiral staircase / helix" → 2 ops
   Pattern.HelicalCurve → Output.Watch
   (For treads, sweep the helix with a Solid.ByPipe.)

H) "A tower with a diagrid facade" → 5 ops (tower + facade pattern, both watched)
   Pattern.TwistedEllipsePlates → Solid.ByLoft → Output.Watch (tower)
   Pattern.DiagridFacade → (facade lines)

I) "Two intersecting boxes" → 4 ops
   Point.Origin → Box.ByCenterWidthDepthHeight × 2 (different centers) → Solid.BooleanIntersect → Output.Watch

J) "A box with a hole through it" → 4 ops
   Box.ByCenterWidthDepthHeight (the outer) → Cylinder.ByBaseRadiusHeight (the hole) → Solid.BooleanSubtract → Output.Watch

K) "A field of spheres on a Voronoi grid" → 3 ops
   Pattern.VoronoiMesh → list of points → (place spheres at each point — needs a per-point Sphere.ByCenterRadius)

L) "Stack of stacked profiles → loft → smooth" → 4 ops
   Pattern.TwistedEllipsePlates → Solid.ByLoft → Solid.Smooth → Output.Watch

**General composition rules**
- "X with Y on it" → ONE chain for X, ANOTHER chain for Y reading shared params/inputs
- "X with a hole" / "X minus Y" → Solid.BooleanSubtract
- "X combined with Y" → Solid.BooleanUnion or Solid.CombineAll
- "X arrayed N times" → Pattern.ArrayLinear / ArrayPolar / ArrayAlongCurve
- "X but smoother" / "X with rounded edges" → chain Solid.Smooth or Surface.Subdivide
- "Profile rings" or "stacked floors" → Pattern.TwistedEllipsePlates / OrganicProfileStack
- "Surface" or "shell" or "canopy" → Surface.WavyGrid / Surface.ByPatch
- "Panels" or "tiles" → Pattern.HexPanelGrid / DiagridFacade / VoronoiMesh
- "Twist" / "rotate per floor" → use the twistDeg parameter, not custom math

REFUSAL CONTRACT — refusal is the LAST RESORT, not the easy way out.

Before emitting a refusal, you MUST have:
1. Decomposed the request into geometric primitives
2. Mapped each primitive to a node from the catalog
3. Identified the EXACT missing capability — not "I don't know how" but "there is no node for X, and X cannot be built by chaining the nodes I have"

Only THEN return:
\`\`\`nova-plan
{ "version": 1, "refused": { "reason": "<one short sentence naming the SPECIFIC missing capability, not just 'too complex'>", "suggestions": ["<alternative 1>", "<alternative 2>"] } }
\`\`\`

DO NOT refuse because:
- The request has multiple parts (chain them)
- The request needs transformation (use boolean / array / smooth)
- The request needs decoration (use panel / diagrid / voronoi nodes)
- You can't think of a single node (look for chains in the COOKBOOK above)

DO refuse when:
- The request needs a specific composite that doesn't exist (e.g., "fractal Mandelbox" — no Pattern.Fractal in catalog)
- The request requires runtime data the system can't provide (e.g., real-time weather data)
- The request is genuinely outside parametric geometry (e.g., "generate a TikTok video")

Do NOT fall back to Python. Do NOT invent nodes. A specific refusal with a named missing composite is always better than a half-broken graph or a vague "too complex".

Concrete example — "a sphere with another sphere subtracted":
\`\`\`nova-plan
{
  "version": 1,
  "params": { "outer": 10, "inner": 7 },
  "ops": [
    { "id": "origin", "node": "Point.Origin" },
    { "id": "a",      "node": "Sphere.ByCenterRadius", "inputs": { "center": "@origin", "radius": "$outer" } },
    { "id": "b",      "node": "Sphere.ByCenterRadius", "inputs": { "center": "@origin", "radius": "$inner" } },
    { "id": "shell",  "node": "Solid.BooleanSubtract", "inputs": { "a": "@a", "b": "@b" } },
    { "id": "watch",  "node": "Output.Watch",          "inputs": { "value": "@shell" } }
  ]
}
\`\`\`

## STRICT MODE — nova-plan or refusal ONLY for build requests

For ANY request that involves building, creating, generating, modelling, or designing geometry, you MUST emit either a \`\`\`nova-plan block OR a refusal block. Free-form \`\`\`python is NOT acceptable for build requests and will be rejected by the system.

- If you can express the request with available nodes → emit a nova-plan
- If you cannot → emit a refusal:
  \`\`\`nova-plan
  { "version": 1, "refused": { "reason": "<one short sentence>", "suggestions": ["<alt 1>", "<alt 2>"] } }
  \`\`\`

Free-form Python is ONLY acceptable for:
- Questions (plain text, no fenced block)
- Explanations (plain text)
- NOT for building geometry

If you find yourself wanting to write Python for a build request, stop and emit a refusal instead. The refusal becomes a tracked feedback item; broken Python becomes a broken graph.

## CODE STYLE (CRITICAL — determines how nodes appear)
- Each assignment = one visual node. Decompose into single-line statements.
- Numeric params on their own line: \`radius = 5\` then use \`radius\` (becomes editable Number node)
- Each Geo call on its own line: \`center = Geo.Point3(0,0,0)\` then \`box = Geo.createBox(center,w,d,h)\`
- NEVER nest Geo calls: \`Geo.createBox(Geo.Point3(0,0,0),10,10,5)\` ← BAD (one ugly node)
- Use \`Geo.Point3(x,y,z)\` not bare tuples for geometry (tuples won't render in 3D)
- End with \`print(result)\` for a Watch node
- \`import math\` if needed
- For-loops group into one "Python" node — use only when generating arrays

## RUNTIME CONSTRAINTS (JS transpiler)
NO: .pop(), try/except, dict comprehensions, set(), f-strings, multiple assignment (a,b=1,2)
YES: .append(), range(), math.*, Geo.*, list(), simple for-loops
USE math.pow(a,b) INSTEAD OF a**b (the ** operator may not transpile correctly)
INLINE COMMENTS (#) are OK but keep them simple

## CLOSED PROFILES FOR LOFTING (CRITICAL)
When creating profiles for Geo.loft():
- Generate points around a FULL circle (0 to 2*pi) with HIGH resolution (48+ points)
- Do NOT append pts[0] at the end — the loft auto-closes rings
- Pass profiles as plain point arrays: profiles.append(pts)
- All profiles MUST have the SAME number of points
- Points at index 0 in every profile should be at the SAME angular position (vertex alignment)
- Apply twist by rotating XY coordinates AFTER generating the base ellipse/circle
Example pattern for clean lofted tower:
  for j in range(48):
      a = 2 * math.pi * j / 48
      x = width * math.cos(a)
      y = depth * math.sin(a)
      rx = x * cos_twist - y * sin_twist
      ry = x * sin_twist + y * cos_twist
      pts.append(Geo.Point3(rx, ry, z))
  profiles.append(pts)

**KEY RULES:**
1. Decompose into single-line assignments → each becomes a visual node
2. Only use for-loops when building arrays with .append() — the loop + list init merge into ONE Python block node
3. NEVER use standalone .append() lines outside a loop — use Geo.booleanUnion(a, b) or Geo.combineAll([a, b]) to merge objects
4. To combine two results: result = Geo.booleanUnion(wall, facade) — NOT elements = []; elements.append(wall); elements.append(facade)
5. If you MUST use a Python block, add a comment: # Python block: <reason>
6. The MORE single-line assignments you use, the MORE visual nodes appear on the canvas

\` + buildNodeCatalog() + \`

## ADDITIONAL Geo NAMESPACES (no direct node mapping — use sparingly)
**Boolean:** Geo.booleanUnion(a,b) | Geo.booleanIntersect(a,b) | Geo.booleanSubtract(a,b)
**Noise:** Geo.perlin2(x,y) | Geo.perlin3(x,y,z) | Geo.fbm(x,y,z,octaves) → float -1..1
**Attractors:** Geo.pointAttractor(pt,attractorPos,radius,falloff) → 0..1 | Geo.multiAttractor(pt,attractors[],r,falloff)
**Revit (browser only):** RevitBridge.getElements("Walls") | .getSheets() | .getLevels() | .getParam(el,"Mark") — NEVER use FilteredElementCollector/\\_\\_currentdoc\\_\\_ in browser code

## FEW-SHOT EXAMPLES

### Example 1: "Create a parametric pavilion"
This creates an organic pavilion by lofting circular profiles that vary in radius, creating a vase-like form.
\`\`\`python
import math
num_profiles = 10
base_radius = 10
max_height = 20
resolution = 48
profiles = []
for i in range(num_profiles):
    t = i / (num_profiles - 1)
    z = t * max_height
    r = base_radius * (0.3 + 0.7 * math.sin(t * math.pi))
    pts = []
    for j in range(resolution):
        a = 2 * math.pi * j / resolution
        pts.append(Geo.Point3(r * math.cos(a), r * math.sin(a), z))
    profiles.append(pts)
pavilion = Geo.loft(profiles)
print(pavilion)
\`\`\`

### Example 2: "Create a twisted tower"
This builds a twisted tower with elliptical floor plates that taper toward the top. Each profile is rotated by the twist angle.
\`\`\`python
import math
floors = 20
floor_height = 3.5
base_width = 18
base_depth = 12
twist_total = 30
taper = 0.15
resolution = 48
profiles = []
for i in range(floors):
    z = i * floor_height
    t = i / (floors - 1)
    angle = math.radians(twist_total * t)
    w = base_width * (1 - taper * t) / 2
    d = base_depth * (1 - taper * t) / 2
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    pts = []
    for j in range(resolution):
        a = 2 * math.pi * j / resolution
        x = w * math.cos(a)
        y = d * math.sin(a)
        rx = x * cos_a - y * sin_a
        ry = x * sin_a + y * cos_a
        pts.append(Geo.Point3(rx, ry, z))
    profiles.append(pts)
tower = Geo.loft(profiles)
print(tower)
\`\`\`

### Example 3: "Boolean subtract — box minus sphere"
This creates a box, places a sphere overlapping one corner, and subtracts it to create a carved form. Each parameter is a separate editable node.
\`\`\`python
center = Geo.Point3(0, 0, 0)
width = 10
depth = 10
height = 5
box = Geo.createBox(center, width, depth, height)
sphere_center = Geo.Point3(5, 0, 2.5)
sphere_radius = 4
sphere = Geo.createSphere(sphere_center, sphere_radius)
result = Geo.booleanSubtract(box, sphere)
print(result)
\`\`\`

## DESIGN PHILOSOPHY
Think like a parametric architect (Zaha Hadid, BIG, Foster). Every form driven by parameters — never hardcode numbers inline. Use NURBS degree 3+ for smooth forms, Perlin noise for organic variation, attractors for responsive facades. Combine large gestures (lofted shells) with fine detail (panels, pipes). Always use Geo.smooth() to soften angular lofts.

## DESIGN CONVERSATION PROTOCOL — CRITICAL
You are a design consultant, NOT a code generator. Your job is to UNDERSTAND what the user wants through conversation BEFORE writing any code.

**RULE: For any design request (building, pavilion, facade, structure, etc.), you MUST go through a multi-step clarification conversation. Do NOT generate code on the first message.**

### Step 1: Understand the Form
Ask about the overall shape/typology. Present options as [1] Label — description format:

**Building Form:**
[1] Twisted tower — rotating floor plates with taper
[2] Organic shell — NURBS lofted flowing form
[3] Orthogonal mass — stacked rectangular floors
[4] Freeform blob — noise-deformed smooth surface

Which form do you prefer, or describe your own?

### Step 2: Understand the Details
Based on their choice, ask about specifics:
- Dimensions (height, width, floors)
- Facade treatment (panels, voronoi, diagrid, screen)
- Structural expression (pipes, isolines, shell)
- Parameters they want to control

### Step 3: Confirm and Generate
Summarize the complete design brief, then ask: "Ready to generate? Or would you like to adjust anything?"

**ONLY generate code when:**
- The user says "go", "generate", "create it", "build it", "yes", "looks good", "decide the rest"
- The user explicitly provides ALL parameters in one message (e.g., "box 10x10x5 at origin")
- The user says "surprise me" or "you decide"

**When the user says "decide the rest" or "you choose":**
- Fill in remaining unknowns with sensible architectural defaults
- State what you chose: "I'll use 20 floors at 3.5m height, hexagonal profiles, and attractor panels."
- Then generate the code

### Conversation Examples
USER: "Create a parametric building"
YOU: Ask about form → facade → dimensions → confirm → generate

USER: "Make a box 10x10x5"
YOU: Just generate it (fully specified)

USER: "Parametric facade with varying panels"
YOU: Ask about panel type → attractor vs noise → dimensions → confirm → generate

### Option Format (MUST use this exact format for clickable buttons)
Each option MUST be on its own line starting with [number]:
[1] Option label — short description
[2] Option label — short description

End with a question asking the user to pick or describe their own.

## UNKNOWN METHODS PROTOCOL
If you are unsure whether a Geo method exists, DO NOT guess. Instead:
1. Check the GEO API section above
2. If the method is not listed, tell the user: "I don't see [method] in the available API. Here are similar alternatives: [list]. Which would you prefer?"
3. NEVER invent Geo methods that don't exist in the API reference`;

    if (existingCode) {
      sys += `\n\n### Current Code on Canvas\nThe user already has this code/graph. If they ask to modify it, update this code:\n\`\`\`python\n${existingCode}\n\`\`\``;
    }
    return sys;
  },

  _histories: { landing: [], workspace: [] },
  resetHistory(context) {
    this._histories[context] = [];
  },

  _rateLimited: false,
  _originalProvider: null,
  _originalModel: null,

  switchToFreeModel() {
    this._originalProvider = this.getProvider();
    this._originalModel = this.getModel();
    this._rateLimited = true;
    var groqKey = localStorage.getItem('nodeflow_key_groq');
    if (groqKey) {
      this.setProvider('groq');
      this.setModel('llama-3.3-70b-versatile');
      return 'groq';
    }
    var orKey = localStorage.getItem('nodeflow_key_openrouter');
    if (orKey) {
      this.setProvider('openrouter');
      this.setModel('openrouter/free');
      return 'openrouter';
    }
    return null;
  },

  getRateLimitMessage(switchedTo) {
    if (switchedTo) {
      var prov = this.PROVIDERS[switchedTo];
      return '⚠️ **Rate limit hit on OpenAI** — automatically switched to **' + prov.name + '** (' + this.getModel() + ').\n\nI\'ll continue working with this free model. You can switch back in Settings when your limit resets.';
    }
    return '⚠️ **Rate limit reached.** To keep working, add a free API key:\n\n• **Groq** (free) → [console.groq.com/keys](https://console.groq.com/keys)\n• **OpenRouter** (free) → [openrouter.ai/keys](https://openrouter.ai/keys)\n\nPaste the key in **Settings → Preferences** and select the provider. Free models like Llama 3.3 70B work great for parametric design!';
  },

  async call(userMessage, context, existingCode) {
    if (this.isEnterpriseAiEnabled()) {
      return this.callEnterprise(userMessage, context, existingCode);
    }
    const proxyMode = this.isProxyMode();
    const providerLabel = proxyMode ? 'proxy-groq' : this.getProvider();
    NFLogger.aiRequest(userMessage, providerLabel, this.getEffectiveModel());
    this._callStart = Date.now();
    const history = this._histories[context] || [];
    const stickyFull = this.historyHasCode(history) || this.isFixPrompt(userMessage);
    const useSlim = proxyMode && !this.hasBuildIntent(userMessage) && !stickyFull;
    const systemContent = useSlim ? this.buildSlimSystemPrompt() : this.buildSystemPrompt(existingCode);
    const historyDepth = proxyMode ? (useSlim ? 4 : 6) : 10;
    const maxTokens = proxyMode ? this.PROXY_MAX_TOKENS : this.MAX_TOKENS;
    const messages = [
      { role: 'system', content: systemContent },
      ...history.slice(-historyDepth),
      { role: 'user', content: userMessage }
    ];
    const format = this.getProviderFormat();
    const response = await fetch(this.getEffectiveApiUrl(), {
      method: 'POST',
      headers: this.buildRequestHeaders(),
      body: JSON.stringify(this.buildChatPayload(format, this.getEffectiveModel(), messages, maxTokens, this.TEMPERATURE, false))
    });
    if (response.status === 503 && proxyMode) {
      NFLogger.aiError('Proxy not configured', providerLabel);
      throw new Error('__PROXY_NOT_CONFIGURED__');
    }
    if (response.status === 429) {
      NFLogger.aiError('Rate limit 429', providerLabel);
      if (proxyMode) {
        throw new Error('__PROXY_RATE_LIMIT__');
      }
      var switched = this.switchToFreeModel();
      throw new Error(switched ? '__RATE_LIMIT_SWITCHED__' + switched : '__RATE_LIMIT_NO_FREE__');
    }
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      var errObj = {};
      try { errObj = JSON.parse(errBody); } catch(e) {}
      const msg = (errObj.error && errObj.error.message) || ('API error ' + response.status);
      NFLogger.aiError(msg, providerLabel);
      NFLogger.error('api', 'HTTP ' + response.status + ' from ' + this.getEffectiveApiUrl(), { status: response.status, body: errBody.substring(0, 500), provider: providerLabel, model: this.getEffectiveModel() });
      throw new Error(msg);
    }
    const data = await response.json();
    const reply = this.extractMessageContent(format, data);
    NFLogger.aiResponse(reply, Date.now() - this._callStart);
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: reply });
    this._histories[context] = history;
    return reply;
  },

  async callEnterprise(userMessage, context, existingCode) {
    const client = this.getEnterpriseClient();
    await this.ensureEnterpriseSession(client);
    NFLogger.aiRequest(userMessage, 'nova-cloud', this.getModel());
    this._callStart = Date.now();
    const history = this._histories[context] || [];
    const messages = [
      { role: 'system', content: this.buildSystemPrompt(existingCode) },
      ...history.slice(-10),
      { role: 'user', content: userMessage }
    ];
    const response = await client.chatWithAi({
      projectId: '',
      provider: this.getProvider(),
      model: this.getModel(),
      messages,
      metadata: { context }
    });
    const reply = response && response.message ? response.message.content : '';
    NFLogger.aiResponse(reply, Date.now() - this._callStart);
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: reply });
    this._histories[context] = history;
    return reply;
  },

  async callStream(userMessage, context, existingCode, onChunk, onDone, onError) {
    if (this.isEnterpriseAiEnabled()) {
      try {
        const reply = await this.callEnterprise(userMessage, context, existingCode);
        onChunk(reply, reply);
        onDone(reply);
      } catch (e) {
        NFLogger.aiError(e.message || 'Nova Cloud AI error', 'nova-cloud');
        onError(e.message || 'Nova Cloud AI error');
      }
      return;
    }
    const proxyMode = this.isProxyMode();
    const providerLabel = proxyMode ? 'proxy-groq' : this.getProvider();
    NFLogger.aiRequest(userMessage, providerLabel, this.getEffectiveModel());
    var _streamStart = Date.now();
    const history = this._histories[context] || [];
    const stickyFull = this.historyHasCode(history) || this.isFixPrompt(userMessage);
    const useSlim = proxyMode && !this.hasBuildIntent(userMessage) && !stickyFull;
    const systemContent = useSlim ? this.buildSlimSystemPrompt() : this.buildSystemPrompt(existingCode);
    const historyDepth = proxyMode ? (useSlim ? 4 : 6) : 10;
    const maxTokens = proxyMode ? this.PROXY_MAX_TOKENS : this.MAX_TOKENS;
    const messages = [
      { role: 'system', content: systemContent },
      ...history.slice(-historyDepth),
      { role: 'user', content: userMessage }
    ];
    const format = this.getProviderFormat();
    try {
      const response = await fetch(this.getEffectiveApiUrl(), {
        method: 'POST',
        headers: this.buildRequestHeaders(),
        body: JSON.stringify(this.buildChatPayload(format, this.getEffectiveModel(), messages, maxTokens, this.TEMPERATURE, true))
      });
      if (!response.ok) {
        if (response.status === 503 && proxyMode) {
          NFLogger.aiError('Proxy not configured', providerLabel);
          onError('__PROXY_NOT_CONFIGURED__');
          return;
        }
        if (response.status === 429) {
          if (proxyMode) {
            onError('__PROXY_RATE_LIMIT__');
          } else {
            var switched = this.switchToFreeModel();
            if (switched) { onError('__RATE_LIMIT_SWITCHED__' + switched); }
            else { onError('__RATE_LIMIT_NO_FREE__'); }
          }
          return;
        }
        const errBody = await response.text().catch(() => '');
        var errObj = {};
        try { errObj = JSON.parse(errBody); } catch(e) {}
        const msg = (errObj.error && errObj.error.message) || ('API error ' + response.status);
        NFLogger.error('api-stream', 'HTTP ' + response.status + ' from ' + this.getEffectiveApiUrl(), { status: response.status, body: errBody.substring(0, 500), provider: providerLabel, model: this.getEffectiveModel() });
        onError(msg);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const payload = trimmed.substring(6);
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const chunk = this.extractStreamDelta(format, json);
            if (chunk) {
              fullText += chunk;
              onChunk(chunk, fullText);
            }
          } catch (e) { /* skip */ }
        }
      }
      history.push({ role: 'user', content: userMessage });
      history.push({ role: 'assistant', content: fullText });
      this._histories[context] = history;
      NFLogger.aiResponse(fullText, Date.now() - _streamStart);
      onDone(fullText);
    } catch (e) {
      NFLogger.aiError(e.message || 'Network error', providerLabel);
      onError(e.message || 'Network error');
    }
  },

  parseResponse(text) {
    NFLogger.info('gpt-parse', 'Parsing GPT response', { length: text ? text.length : 0 });
    const codeBlockMatch = text.match(/```(?:python)?\s*\n([\s\S]*?)\n\s*```/);
    if (codeBlockMatch) {
      const code = codeBlockMatch[1].trim();
      const explanation = text.replace(/```[\s\S]*?```/g, '').trim();
      var result = { code: code, explanation: explanation || 'Generated code for your request.' };
      NFLogger.aiParsed(result);
      return result;
    }
    const jsonBlockMatch = text.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonBlockMatch) {
      try {
        const parsed = JSON.parse(jsonBlockMatch[1]);
        if (parsed.code) { NFLogger.aiParsed(parsed); return parsed; }
      } catch (e) { NFLogger.warn('gpt-parse', 'JSON parse failed', { error: String(e) }); }
    }
    NFLogger.info('gpt-parse', 'No code block found — conversational reply', null);
    return null;
  }
};

// ── SETTINGS DIALOG ──
const SettingsDialog = {
  isOpen: false,

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    const overlay = document.createElement('div');
    overlay.id = 'settings-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) this.close(); };
    const currentProvider = GPTClient.getProvider();
    const currentKey = GPTClient.getApiKey();
    const maskedKey = currentKey ? currentKey.substring(0, 7) + '...' + currentKey.substring(currentKey.length - 4) : '';
    const currentModel = GPTClient.getModel();
    overlay.innerHTML = `
      <div class="settings-dialog">
        <div class="settings-header">
          <h2>⚙ Settings</h2>
          <button class="settings-close-btn" onclick="SettingsDialog.close()">✕</button>
        </div>
        <div class="settings-body">
          <div class="settings-section">
            <h3>🤖 AI Configuration</h3>
            <p class="settings-desc">Choose a provider and model. **Groq** and **OpenRouter** offer free models — perfect when you hit OpenAI rate limits!</p>
            <label class="settings-label">Provider</label>
            <select id="settings-provider" class="settings-input" onchange="SettingsDialog.onProviderChange()">
              ${Object.keys(GPTClient.PROVIDERS).map(function(pid) { var p = GPTClient.PROVIDERS[pid]; var sel = pid === currentProvider ? 'selected' : ''; var ft = p.models.some(function(m){return m.free;}) ? ' 🟢' : ''; return '<option value="' + pid + '" ' + sel + '>' + p.name + ft + '</option>'; }).join('')}
            </select>
            <label class="settings-label" style="margin-top:12px">API Key</label>
            <div class="settings-key-row">
              <input type="password" id="settings-api-key" class="settings-input" placeholder="${maskedKey || 'sk-...'}" value="${currentKey}" autocomplete="off" />
              <button class="settings-toggle-btn" onclick="SettingsDialog.toggleKeyVisibility()" title="Show/Hide">👁</button>
            </div>
            <p class="settings-hint" id="settings-key-hint">${currentProvider === 'groq' ? '🟢 Free! Get key at <a href="https://console.groq.com/keys" target="_blank" style="color:var(--accent-green)">console.groq.com/keys</a>' : currentProvider === 'openrouter' ? '🟢 Free models! Get key at <a href="https://openrouter.ai/keys" target="_blank" style="color:var(--accent-green)">openrouter.ai/keys</a>' : 'Get key from <a href="https://platform.openai.com/api-keys" target="_blank" style="color:var(--accent-blue)">platform.openai.com/api-keys</a>'}</p>
            <label class="settings-label" style="margin-top:16px">Model</label>
            <select id="settings-model" class="settings-input">
              ${(GPTClient.PROVIDERS[currentProvider] || GPTClient.PROVIDERS.openai).models.map(function(m) { var sel = m.id === currentModel ? 'selected' : ''; var ft = m.free ? ' 🟢 FREE' : ''; return '<option value="' + m.id + '" ' + sel + '>' + m.name + ft + '</option>'; }).join('')}
            </select>
            <div class="settings-status" id="settings-status">
              ${currentKey
                ? '<span style="color:var(--accent-green)">✓ Using your ' + (GPTClient.PROVIDERS[currentProvider] && GPTClient.PROVIDERS[currentProvider].name || currentProvider) + ' key</span>'
                : '<span style="color:var(--accent-blue)">🆓 No key — using free shared model (Groq Llama 3.3 70B). Bring your own key above for unlimited use.</span>'}
            </div>
            <button class="settings-test-btn" id="settings-test-btn" onclick="SettingsDialog.testConnection()">Test Connection</button>
          </div>
          <div class="settings-section">
            <h3>🎨 Wire Display</h3>
            <p class="settings-desc">Control visual effects on wires between nodes.</p>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0">
              <div><div style="font-size:13px;font-weight:600;color:var(--text-primary)">Wire Portals</div><div style="font-size:11px;color:var(--text-muted)">Show 3D portal rings where wires cross</div></div>
              <label class="nf-toggle"><input type="checkbox" id="settings-wire-portals" ${localStorage.getItem('nodeflow_wire_portals') !== 'false' ? 'checked' : ''} /><span class="nf-toggle-slider"></span></label>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0">
              <div><div style="font-size:13px;font-weight:600;color:var(--text-primary)">Wire Animations</div><div style="font-size:11px;color:var(--text-muted)">Animated data flow dots on wires after Run</div></div>
              <label class="nf-toggle"><input type="checkbox" id="settings-wire-animations" ${localStorage.getItem('nodeflow_wire_animations') !== 'false' ? 'checked' : ''} /><span class="nf-toggle-slider"></span></label>
            </div>
          </div>
          <div class="settings-section">
            <h3>ℹ About</h3>
            <p class="settings-desc"><strong>Nova</strong> — Visual scripting with AI-powered code generation.<br>
            Built with OkPy. Supports OpenAI, Groq, and OpenRouter.</p>
          </div>
        </div>
        <div class="settings-footer">
          <button class="settings-save-btn" onclick="SettingsDialog.save()">Save & Close</button>
          <button class="settings-cancel-btn" onclick="SettingsDialog.close()">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if (!currentKey) {
      setTimeout(() => {
        const inp = document.getElementById('settings-api-key');
        if (inp) inp.focus();
      }, 100);
    }
  },

  close() {
    this.isOpen = false;
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.remove();
  },

  onProviderChange() {
    var provSelect = document.getElementById('settings-provider');
    if (!provSelect) return;
    var pid = provSelect.value;
    GPTClient.setProvider(pid);
    var modelSelect = document.getElementById('settings-model');
    var prov = GPTClient.PROVIDERS[pid];
    if (modelSelect && prov) {
      modelSelect.innerHTML = prov.models.map(function(m) {
        var ft = m.free ? ' 🟢 FREE' : '';
        return '<option value="' + m.id + '">' + m.name + ft + '</option>';
      }).join('');
    }
    var keyInput = document.getElementById('settings-api-key');
    var storedKey = localStorage.getItem('nodeflow_key_' + pid) || '';
    if (keyInput) { keyInput.value = storedKey; keyInput.placeholder = prov ? prov.keyPrefix + '...' : 'Enter API key...'; }
    var hint = document.getElementById('settings-key-hint');
    if (hint) {
      if (pid === 'openrouter') hint.innerHTML = '⭐ Access Claude Sonnet, GPT-4o + free models! Get key at <a href="https://openrouter.ai/keys" target="_blank" style="color:#cba6f7">openrouter.ai/keys</a>';
      else if (pid === 'groq') hint.innerHTML = '🟢 Free! Get key at <a href="https://console.groq.com/keys" target="_blank" style="color:var(--accent-green)">console.groq.com/keys</a>';
      else if (pid === 'gemini') hint.innerHTML = '🟢 Free tier! Get key at <a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--accent-green)">aistudio.google.com/apikey</a>';
      else if (pid === 'anthropic') hint.innerHTML = '⭐ Use Claude directly. Get key at <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color:#cba6f7">console.anthropic.com</a>';
      else hint.innerHTML = 'Get key from <a href="https://platform.openai.com/api-keys" target="_blank" style="color:var(--accent-blue)">platform.openai.com/api-keys</a>';
    }
  },

  save() {
    const provSelect = document.getElementById('settings-provider');
    const keyInput = document.getElementById('settings-api-key');
    const modelSelect = document.getElementById('settings-model');
    if (provSelect) GPTClient.setProvider(provSelect.value);
    if (keyInput) GPTClient.setApiKey(keyInput.value);
    if (modelSelect) GPTClient.setModel(modelSelect.value);
    var wpCb = document.getElementById('settings-wire-portals');
    var waCb = document.getElementById('settings-wire-animations');
    if (wpCb) localStorage.setItem('nodeflow_wire_portals', wpCb.checked ? 'true' : 'false');
    if (waCb) localStorage.setItem('nodeflow_wire_animations', waCb.checked ? 'true' : 'false');
    this.close();
    setTimeout(function(){ if(typeof app!=='undefined'&&app.renderWires)app.renderWires();},50);
    if (GPTClient.hasApiKey()) {
      var prov = GPTClient.PROVIDERS[GPTClient.getProvider()];
      var provName = prov ? prov.name : 'AI';
      document.querySelectorAll('.chat-header-text p').forEach(el => {
        el.innerHTML = '● Online — <strong>' + provName + '</strong>';
        el.style.color = 'var(--accent-green)';
      });
    }
  },

  toggleKeyVisibility() {
    const inp = document.getElementById('settings-api-key');
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  },

  async testConnection() {
    const keyInput = document.getElementById('settings-api-key');
    const status = document.getElementById('settings-status');
    const btn = document.getElementById('settings-test-btn');
    const key = keyInput ? keyInput.value.trim() : '';
    if (!key) {
      status.innerHTML = '<span style="color:var(--accent-red)">✕ Enter an API key first</span>';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Testing...';
    var provider = GPTClient.getProvider();
    var provName = (GPTClient.PROVIDERS[provider] && GPTClient.PROVIDERS[provider].name) || 'provider';
    status.innerHTML = '<span style="color:var(--text-muted)">⟳ Connecting to ' + provName + '...</span>';
    try {
      const modelSelect = document.getElementById('settings-model');
      const model = modelSelect ? modelSelect.value : 'gpt-4o';
      var format = GPTClient.getProviderFormat(provider);
      var headers = GPTClient.buildAuthHeaders(format, key, GPTClient.getExtraHeaders());
      const response = await fetch(GPTClient.getApiUrl(), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(GPTClient.buildChatPayload(format, model, [{ role: 'user', content: 'Reply with just: OK' }], 16, 0, false))
      });
      if (response.ok) {
        const data = await response.json();
        status.innerHTML = '<span style="color:var(--accent-green)">✓ Connected! Model: <strong>' + model + '</strong></span>';
        if (typeof NFLogger !== 'undefined') NFLogger.info('settings', 'Connection test passed', { provider: GPTClient.getProvider(), model: model });
      } else {
        const errBody = await response.text().catch(() => '');
        var errObj = {};
        try { errObj = JSON.parse(errBody); } catch(e2) {}
        const msg = (errObj.error && errObj.error.message) || ('Error ' + response.status);
        status.innerHTML = '<span style="color:var(--accent-red)">✕ ' + msg + '</span>';
        if (typeof NFLogger !== 'undefined') NFLogger.error('settings', 'Connection test failed: ' + msg, { status: response.status, body: errBody.substring(0, 500), provider: GPTClient.getProvider(), model: model, url: GPTClient.getApiUrl() });
      }
    } catch (e) {
      status.innerHTML = '<span style="color:var(--accent-red)">✕ Network error: ' + e.message + '</span>';
      if (typeof NFLogger !== 'undefined') NFLogger.error('settings', 'Connection test network error: ' + e.message, { provider: GPTClient.getProvider(), url: GPTClient.getApiUrl() });
    }
    btn.disabled = false;
    btn.textContent = 'Test Connection';
  }
};

if (typeof window !== 'undefined') {
  window.GPTClient = GPTClient;
  window.SettingsDialog = SettingsDialog;
}

export { GPTClient, SettingsDialog };
