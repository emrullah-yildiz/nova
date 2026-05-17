import { events } from './EventBus'

let currentPage: 'landing' | 'workspace' = 'landing'

export function renderApp(): void {
  const root = document.getElementById('app')
  if (!root) return

  root.innerHTML = `
    <div class="menu-bar">
      <div class="menu-brand" id="btn-home">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
        Nova
      </div>
      <div class="menu-spacer"></div>
      <div class="menu-right">
        <div class="ws-status disconnected" id="ws-status">
          <span class="dot"></span>
          <span id="ws-label">Disconnected</span>
        </div>
        <button class="menu-item" id="btn-run" style="font-weight:600;color:var(--accent-green);">Run</button>
      </div>
    </div>

    <div id="landing-page" class="landing-page">
      <div class="landing-center">
        <h1>Welcome to <span class="brand-gradient">Nova</span></h1>
        <p>Visual scripting workspace for Revit</p>
        <button class="btn-new-project" id="btn-new">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          New Project
        </button>
      </div>
    </div>

    <div id="workspace-page" class="workspace-page">
      <div class="node-library">
        <div class="node-library-header"><h3>Nodes</h3></div>
        <div class="node-categories" id="node-categories"></div>
      </div>
      <div class="canvas-area" id="canvas-area">
        <svg class="canvas-grid-svg" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <defs>
            <pattern id="smallGrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(69,71,90,0.4)" stroke-width="0.5"/>
            </pattern>
            <pattern id="bigGrid" width="120" height="120" patternUnits="userSpaceOnUse">
              <rect width="120" height="120" fill="url(#smallGrid)"/>
              <path d="M 120 0 L 0 0 0 120" fill="none" stroke="rgba(69,71,90,0.9)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="200%" height="200%" x="-50%" y="-50%" fill="url(#bigGrid)"/>
        </svg>
        <div id="node-canvas" class="node-canvas"></div>
        <svg id="wire-svg" class="wire-layer"></svg>
        <div class="canvas-zoom" id="zoom-indicator">100%</div>
      </div>
    </div>
  `

  document.getElementById('btn-new')?.addEventListener('click', () => switchPage('workspace'))
  document.getElementById('btn-home')?.addEventListener('click', () => switchPage('landing'))
  document.getElementById('btn-run')?.addEventListener('click', () => events.emit('graph:run'))
}

function switchPage(page: 'landing' | 'workspace'): void {
  currentPage = page
  const landing = document.getElementById('landing-page')
  const workspace = document.getElementById('workspace-page')

  if (landing) landing.style.display = page === 'landing' ? 'flex' : 'none'
  if (workspace) workspace.style.display = page === 'workspace' ? 'block' : 'none'

  events.emit('page:changed', page)
}

export function getCurrentPage(): string {
  return currentPage
}
