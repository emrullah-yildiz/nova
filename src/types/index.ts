export interface PortDefinition {
  id: string
  name: string
  type: string
}

export interface ControlDefinition {
  id: string
  type: 'number' | 'text' | 'dropdown' | 'formula' | 'range'
  default: string | number
  label: string
  options?: string[]
}

export interface NodeDefinition {
  type: string
  name: string
  icon: string
  inputs: PortDefinition[]
  outputs: PortDefinition[]
  controls: ControlDefinition[]
  preview: boolean
  categoryId?: string
  categoryColor?: string
}

export interface NodeCategory {
  id: string
  name: string
  color: string
  icon: string
  nodes: NodeDefinition[]
}

export interface Wire {
  fromNode: string
  fromPort: string
  toNode: string
  toPort: string
}

export interface NodeInstance {
  id: string
  type: string
  x: number
  y: number
  zIndex: number
  def: NodeDefinition
  controlValues: Record<string, string | number | boolean>
}

export interface RevitElementData {
  id: number
  name: string
  category: string
  typeName: string
  levelName: string
  params: Record<string, string | number>
}
