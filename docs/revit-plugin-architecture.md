# Revit/Rhino Plugin Architecture for Nova

**Date Created:** May 18, 2026  
**Status:** Design document (pre-implementation)  
**Purpose:** Enable Nova to work as a plugin for Revit/Rhino with WebSocket-based real-time data sync

---

## Overview

This document outlines the architecture needed to transform Nova into a Revit/Rhino plugin that:
- Launches from within Revit and opens the browser
- Provides real-time access to Revit data (elements, parameters, geometry)
- Allows users to create and send geometries back to Revit
- Supports refreshing when Revit data changes

---

## System Architecture

```
┌─────────────┐  WebSocket  ┌──────────────┐  WebSocket  ┌──────────────┐
│ Revit Plugin│◄───────────►│ Node.js Server├────────────►│ Browser (Nova)│
│  (C#/.NET)  │             │              │             │              │
└─────────────┘             └──────────────┘             └──────────────┘
   - Export data              - Route messages             - UI/Graph editor
   - Import geometry          - Manage sessions           - Geometry creation
   - Listen for changes       - Coordinate sync           - Data visualization
```

### Three-Tier System

1. **Revit Plugin (C# External Event)** - Runs in Revit process
2. **Node.js WebSocket Server** - Coordination hub on localhost
3. **Browser Client (Nova)** - Visual editor in browser

---

## Component Responsibilities

### 1. Revit Plugin (C#/.NET)

**Role:** Bridge between Revit API and WebSocket protocol

**Key Functions:**
- Launch on ribbon button click
- Connect to WebSocket server
- Export initial data:
  - All element categories (Walls, Floors, Doors, Windows, etc.)
  - Element IDs, names, parameters
  - Active view information
  - Selected elements
  - 3D mesh geometry (lazy-loaded on demand)
- Listen for geometry creation requests
- Apply DirectShape objects to the model
- Detect Revit document changes (DocumentChanged event)
- Notify browser when data changes
- Handle connection loss and reconnection

**Technology Stack:**
- Revit API (RevitAPI.dll, RevitAPIUI.dll)
- WebSocket client library (WebSocketSharp or WebSocket4Net)
- C# / .NET Framework 4.8+

**Example Workflow:**
```csharp
// User clicks "Nova" button in Revit
// → External command creates WebSocketClient
// → Connects to ws://localhost:8765
// → Sends document data
// → Listens for geometry commands
// → Creates DirectShape from incoming JSON
```

### 2. Node.js WebSocket Server

**Role:** Message router and session coordinator

**Key Functions:**
- Accept Revit plugin connection
- Accept browser client connection
- Route messages between them
- Manage session state (which Revit project ↔ which browser tab)
- Buffer messages if one client disconnects
- Provide health checks and heartbeat

**Technology Stack:**
- Node.js 16+
- `ws` library (lightweight WebSocket)
- Express.js (optional, for future REST API)

**Server Port:** `8765` (default, configurable)

**Example Startup:**
```bash
node server.js --port 8765
```

### 3. Browser Client (Nova)

**Role:** Visual interface for graph editing and geometry creation

**Key Changes:**
- WebSocket client initialization on page load
- Replace mock `REVIT_DATA` with real-time data from server
- Handle messages from Revit plugin
- Serialize geometry for export
- Provide "Refresh" button to re-query Revit
- Display connection status

**Technology Stack:**
- Native WebSocket API (no external library needed)
- Existing Three.js for geometry
- Existing graph engine

---

## Message Protocol

All communication uses JSON over WebSocket.

### Message Types

#### 1. Connection Handshake

**Revit Plugin → Server:**
```json
{
  "type": "revit_connect",
  "source": "revit_plugin",
  "project": "My Office Building.rvt",
  "revit_version": "2023",
  "plugin_version": "1.0.0"
}
```

**Browser → Server:**
```json
{
  "type": "browser_connect",
  "source": "browser_client",
  "session_id": "generated_or_from_server"
}
```

**Server → Both:**
```json
{
  "type": "connection_established",
  "session_id": "abc123xyz",
  "peer_connected": true
}
```

#### 2. Data Export

**Browser → Server:**
```json
{
  "type": "get_elements",
  "category": "Walls",
  "session_id": "abc123xyz"
}
```

**Server → Revit Plugin:**
```json
{
  "type": "query_elements",
  "category": "Walls",
  "session_id": "abc123xyz"
}
```

**Revit Plugin → Server:**
```json
{
  "type": "elements_data",
  "category": "Walls",
  "session_id": "abc123xyz",
  "elements": [
    {
      "id": 123456,
      "name": "Basic Wall",
      "typeName": "Generic - 200mm",
      "levelName": "Level 1",
      "params": {
        "Length": "25.50",
        "Height": "3.50",
        "Mark": "W-01"
      }
    }
  ]
}
```

**Server → Browser:**
```json
{
  "type": "elements_data",
  "category": "Walls",
  "elements": [...]
}
```

#### 3. Geometry Creation

**Browser → Server:**
```json
{
  "type": "create_geometry",
  "session_id": "abc123xyz",
  "geometry": {
    "type": "mesh",
    "name": "Nova_Shape_001",
    "vertices": [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0]
    ],
    "faces": [
      [0, 1, 2],
      [0, 2, 3]
    ],
    "color": [200, 100, 50],
    "layer": "Nova_Shapes"
  }
}
```

**Server → Revit Plugin:**
```json
{
  "type": "create_geometry",
  "session_id": "abc123xyz",
  "geometry": {...}
}
```

**Revit Plugin → Server:**
```json
{
  "type": "geometry_created",
  "session_id": "abc123xyz",
  "geometry_id": "elem_789012",
  "success": true,
  "message": "DirectShape created successfully"
}
```

**Server → Browser:**
```json
{
  "type": "geometry_created",
  "geometry_id": "elem_789012",
  "success": true
}
```

#### 4. Data Change Notification

**Revit Plugin → Server:**
```json
{
  "type": "data_changed",
  "session_id": "abc123xyz",
  "reason": "elements_modified",
  "changed_categories": ["Walls", "Floors"],
  "timestamp": 1234567890
}
```

**Server → Browser:**
```json
{
  "type": "data_changed",
  "reason": "elements_modified",
  "changed_categories": ["Walls", "Floors"]
}
```

#### 5. Heartbeat / Keep-Alive

**Either direction (every 30 seconds):**
```json
{
  "type": "ping"
}
```

**Response:**
```json
{
  "type": "pong"
}
```

---

## User Workflow

### Step 1: Launch from Revit

1. User opens Revit with an active document
2. User clicks "Nova" button in custom ribbon tab
3. C# External Command executes
4. Plugin connects to `ws://localhost:8765`
5. Plugin exports project metadata and initial data

### Step 2: Browser Launches and Connects

1. Nova server detects Revit plugin connection
2. Browser automatically opens (or user manually navigates to `http://localhost:8080`)
3. Browser detects server is running
4. Browser connects via WebSocket to same server
5. Server links Revit ↔ Browser session
6. Landing page shows **actual project name** (e.g., "My Office Building")

### Step 3: New Project in Nova

1. User clicks "New Project" or selects a template
2. Workspace opens with Revit nodes available
3. Available Revit nodes:
   - `revit-collect-category` → Fetch all Walls, Floors, etc.
   - `revit-collect-type` → Filter by family type
   - `revit-all-levels` → Get project levels
   - `revit-all-sheets` → Get sheets
   - `revit-get-param` → Read parameter value
   - `revit-filter-param` → Filter elements by parameter
   - `revit-for-each` → Loop operations
   - `revit-export-data` → Serialize geometry

### Step 4: Data Collection

1. User drags "revit-collect-category" node onto canvas
2. Configures it to collect "Walls"
3. Executes graph (Ctrl+Enter or Run button)
4. Graph sends WebSocket message to browser client
5. Browser client forwards to server
6. Server routes to Revit plugin
7. Revit plugin queries RevitAPI
8. Data returned through same chain
9. Node displays walls in data inspector

### Step 5: Geometry Creation

1. User builds graph to create geometry (Sphere, Surface, Transform, etc.)
2. Connects output to "revit-export-data" node
3. Executes graph
4. Geometry serialized to JSON
5. Sent via WebSocket to Revit plugin
6. Plugin creates DirectShape from vertices/faces
7. Shape appears in Revit 3D view
8. Shape is on layer "Nova_Shapes" (non-destructive)

### Step 6: Refresh on Changes

1. User modifies walls in Revit (change height, delete wall, etc.)
2. Revit DocumentChanged event fires
3. Plugin detects change
4. Plugin sends `data_changed` notification to browser
5. Browser shows indicator: "Data has changed - Click Run to refresh"
6. User clicks "Run"
7. Graph re-executes
8. Fresh data from Revit flows through nodes
9. Updated results displayed

---

## Implementation Phases

### Phase 1: Foundation (2-3 hours)
- [ ] Create `server.js` with basic WebSocket routing
- [ ] Create Revit plugin stub (connects, logs messages)
- [ ] Add WebSocket client to browser
- [ ] Test connection handshake

**Deliverable:** Revit plugin ↔ Browser can exchange messages

### Phase 2: Data Flow (3-4 hours)
- [ ] Implement element export from Revit plugin
- [ ] Implement element query handler in server
- [ ] Update browser to display real `REVIT_DATA`
- [ ] Remove mock data, use real data
- [ ] Implement "Refresh" button

**Deliverable:** Browser receives and displays real Revit data

### Phase 3: Geometry Creation (4-5 hours)
- [ ] Define geometry JSON schema
- [ ] Implement geometry serialization in browser
- [ ] Implement DirectShape creation in Revit plugin
- [ ] Create "revit-export-data" node
- [ ] Test end-to-end geometry creation

**Deliverable:** User can create geometry in Nova and see it in Revit

### Phase 4: Change Detection (2-3 hours)
- [ ] Add DocumentChanged event listener to Revit plugin
- [ ] Implement data_changed notification
- [ ] Add UI indicator in browser
- [ ] Test refresh workflow

**Deliverable:** Data stays in sync when Revit changes

### Phase 5: Polish & Optimization (3-4 hours)
- [ ] Error handling and logging
- [ ] Reconnection logic
- [ ] Connection status UI
- [ ] Lazy-load geometry (don't export all meshes on connect)
- [ ] Performance optimization (pagination, caching)
- [ ] User documentation

**Deliverable:** Production-ready prototype

---

## Technical Decisions

| Decision | Options | Chosen | Rationale |
|----------|---------|--------|-----------|
| **WebSocket Library** | ws, socket.io, uWebSockets | `ws` | Lightweight, no dependencies, native performance |
| **Revit Integration** | RevitAPI directly, pyRevit, Dynamo | RevitAPI + C# | Most control, direct access to API, no abstraction layer |
| **Geometry Format** | Babylon.js, glTF, custom JSON | Custom JSON | Simpler, minimal parsing, works with our existing geometry kernel |
| **Hosting** | Electron, cloud, localhost | localhost | Local plugin use case, no internet required, simpler deployment |
| **Authentication** | None, token-based, OAuth | None (initially) | Single-machine use, plugin runs locally only |
| **Server Port** | 8765 (default) | 8765 | Unique, not conflicting with common ports |

---

## Key Technical Considerations

### 1. Revit External Event Pattern
The plugin must use `IExternalEventHandler` because UI changes in Revit can only happen on the main thread. WebSocket messages on background threads must queue updates to the external event.

```csharp
// Bad (will crash):
RevitBridge.GetWalls(); // ← on WebSocket thread

// Good:
externalEventHandler.Queue(() => RevitBridge.GetWalls()); // ← on UI thread
```

### 2. Geometry Scale & Coordinate Systems
Revit uses feet (US) or mm (metric). Browser uses arbitrary units. Must establish conversion:
- Document unit on Revit side
- Scale factor in message header
- Consistent transformation on both sides

### 3. Session Isolation
Multiple Revit projects might connect. Each needs isolated session:
```
Server maintains:
- session_123 ↔ Revit A (My Building.rvt)
- session_456 ↔ Browser A (connected to Revit A)
- session_789 ↔ Revit B (My Home.rvt)
```

### 4. Memory & Performance
- Don't export all geometry on connect (lazy-load)
- Paginate large element lists
- Cache REVIT_DATA locally until "refresh" is clicked
- Compress mesh data for transfer

### 5. Error Recovery
- Connection drops → Revit plugin auto-reconnects every 5 seconds
- Browser page reload → Server maintains Revit connection
- Revit crashes → Browser shows "Revit disconnected"

---

## File Structure (After Implementation)

```
nova/
├── server.js                          ← NEW: WebSocket server
├── revit-plugin/                      ← NEW: Revit C# plugin
│   ├── NovaPlugin.cs                  ← Main external command
│   ├── WebSocketClient.cs             ← WebSocket handler
│   ├── RevitDataExporter.cs           ← Element/geometry export
│   ├── RevitGeometryImporter.cs       ← DirectShape creation
│   └── NovaPlugin.addin               ← Revit addon manifest
├── src/
│   ├── revit-client.js                ← NEW: Browser WebSocket client
│   └── (existing files)
├── docs/
│   └── revit-plugin-architecture.md   ← THIS FILE
└── (other files)
```

---

## Commands & Setup

### Start the Server
```bash
node server.js
# Listens on ws://localhost:8765
```

### Install Revit Plugin
1. Build C# project
2. Place DLL + .addin file in Revit addins folder
3. Restart Revit
4. "Nova" ribbon button appears

### Connect
1. Ensure server is running
2. Click "Nova" in Revit ribbon
3. Browser opens automatically (or visit http://localhost:8080)
4. Landing page shows project name
5. Ready to use!

---

## Testing Checklist

- [ ] WebSocket server starts cleanly
- [ ] Revit plugin connects and disconnects gracefully
- [ ] Browser receives real element data
- [ ] Element parameters display correctly
- [ ] User can execute graphs with Revit nodes
- [ ] Geometry exports and appears in Revit
- [ ] Data refresh works correctly
- [ ] Connection recovery on network drop
- [ ] Multiple graphs can run simultaneously
- [ ] Performance is acceptable with 1000+ elements

---

## Future Enhancements

1. **Rhino Support** - Extend to Rhino.Inside via same WebSocket protocol
2. **Cloud Sync** - Save graphs to cloud, share with team
3. **Version Control** - Git integration for graph versions
4. **Batch Operations** - Process multiple Revit projects
5. **Custom Parameters** - Create/edit custom Revit parameters from Nova
6. **Parametric Engine** - Live update geometry as parameters change
7. **Analytics** - Track what operations users perform most

---

## References

- Revit API: https://www.revitapidocs.com/
- WebSocket Protocol: https://tools.ietf.org/html/rfc6455
- Node.js ws library: https://github.com/websockets/ws
- Three.js Geometry: https://threejs.org/docs/#api/en/core/Geometry

---

**Next Steps:** Review this architecture with team. Once approved, begin Phase 1 implementation.
