/**
 * NeuralWorld — 3D visual metaphor of the RULE-BASED adaptive controller (Three.js).
 *
 * This is NOT a neural network. Nodes are the controller's real inputs, analyses and
 * outputs; edges are tagged with the rules (R1–R6) that actually read one quantity to set
 * another (see app/sonar/adaptation.py). Activity is event-driven only:
 *   - an adaptation event from the backend lights that rule's pathway and sends packets
 *     from its inputs to the setting it changed;
 *   - each real transmission blinks the Transmission node; the echo outcome colours the
 *     feedback edge;
 *   - new measurements tick the input nodes.
 * With no events the network rests in a dim "monitoring" state. Rendering is on demand.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

export type NodeId =
  | 'temperature'
  | 'salinity'
  | 'depth'
  | 'soundspeed'
  | 'range'
  | 'echo'
  | 'interval'
  | 'frequency'
  | 'search'
  | 'pulse'
  | 'waveform'
  | 'tx'

export const NODES: { id: NodeId; label: string; group: 'input' | 'analysis' | 'setting' | 'output'; pos: [number, number, number] }[] = [
  { id: 'temperature', label: 'Temperature', group: 'input', pos: [-42, 14, -4] },
  { id: 'salinity', label: 'Salinity', group: 'input', pos: [-42, 0, 4] },
  { id: 'depth', label: 'Pressure / depth', group: 'input', pos: [-42, -14, -2] },
  { id: 'soundspeed', label: 'Sound speed', group: 'analysis', pos: [-18, 12, 2] },
  { id: 'range', label: 'Target range', group: 'analysis', pos: [-18, -2, -6] },
  { id: 'echo', label: 'Echo detection', group: 'analysis', pos: [-18, -18, 6] },
  { id: 'interval', label: 'Transmission interval', group: 'setting', pos: [8, 14, -4] },
  { id: 'frequency', label: 'Frequency', group: 'setting', pos: [8, 0, 6] },
  { id: 'search', label: 'Search plan', group: 'analysis', pos: [8, -18, -2] },
  { id: 'pulse', label: 'Pulse duration', group: 'setting', pos: [30, 6, 0] },
  { id: 'waveform', label: 'Waveform (CW/LFM)', group: 'setting', pos: [30, -12, 4] },
  { id: 'tx', label: 'Transmission', group: 'output', pos: [50, -2, 0] },
]

export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'TX'

/** Data pathways actually used by each rule (inputs → the setting it changes). */
export const EDGES: { from: NodeId; to: NodeId; rule: RuleId }[] = [
  { from: 'temperature', to: 'soundspeed', rule: 'R1' },
  { from: 'salinity', to: 'soundspeed', rule: 'R1' },
  { from: 'depth', to: 'soundspeed', rule: 'R1' },
  { from: 'soundspeed', to: 'interval', rule: 'R2' },
  { from: 'range', to: 'interval', rule: 'R2' },
  { from: 'echo', to: 'search', rule: 'R6' },
  { from: 'search', to: 'interval', rule: 'R6' },
  { from: 'temperature', to: 'frequency', rule: 'R3' },
  { from: 'salinity', to: 'frequency', rule: 'R3' },
  { from: 'depth', to: 'frequency', rule: 'R3' },
  { from: 'range', to: 'frequency', rule: 'R3' },
  { from: 'echo', to: 'frequency', rule: 'R3' },
  { from: 'echo', to: 'pulse', rule: 'R4' },
  { from: 'range', to: 'pulse', rule: 'R4' },
  { from: 'interval', to: 'pulse', rule: 'R4' },
  { from: 'frequency', to: 'pulse', rule: 'R4' },
  { from: 'pulse', to: 'waveform', rule: 'R5' },
  { from: 'frequency', to: 'tx', rule: 'TX' },
  { from: 'pulse', to: 'tx', rule: 'TX' },
  { from: 'waveform', to: 'tx', rule: 'TX' },
  { from: 'interval', to: 'tx', rule: 'TX' },
  { from: 'tx', to: 'echo', rule: 'TX' },
]

export const RULE_TARGET: Record<Exclude<RuleId, 'TX'>, NodeId> = {
  R1: 'soundspeed',
  R2: 'interval',
  R3: 'frequency',
  R4: 'pulse',
  R5: 'waveform',
  R6: 'interval',
}

export const RULE_COLOR: Record<string, string> = {
  physics: '#3fe0b5',
  constraint: '#66aaff',
  heuristic: '#f2b54d',
  'physics + heuristic': '#a493ff',
}

const GROUP_COLOR = { input: '#3fe0b5', analysis: '#46e0ff', setting: '#a493ff', output: '#cfdbe7' }

interface EdgeObj {
  rule: RuleId
  from: NodeId
  to: NodeId
  curve: THREE.QuadraticBezierCurve3
  line: THREE.Line
  mat: THREE.LineBasicMaterial
  glow: number
  glowColor: THREE.Color
}

interface Packet {
  mesh: THREE.Mesh
  edge: EdgeObj | null
  t: number
  speed: number
}

interface NodeObj {
  core: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  halo: THREE.Sprite
  haloMat: THREE.SpriteMaterial
  ring: THREE.Mesh
  lab: CSS2DObject
  value: HTMLSpanElement
  pulse: number
  pulseColor: THREE.Color
  base: THREE.Color
}

export class NeuralWorld {
  private renderer: THREE.WebGLRenderer
  private labels = new CSS2DRenderer()
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(38, 1, 1, 500)
  private controls: OrbitControls
  private nodes = new Map<NodeId, NodeObj>()
  private edges: EdgeObj[] = []
  private packets: Packet[] = []
  private raf = 0
  private needsRender = true
  private animating = 0
  private last = 0
  private ro: ResizeObserver
  private highlightRule: RuleId | null = null
  private highlightColor = new THREE.Color('#a493ff')
  private selected: NodeId | null = null
  private ray = new THREE.Raycaster()
  private pointer = new THREE.Vector2(9, 9)
  private hover: NodeId | null = null
  private tex: THREE.Texture
  onSelect: (id: NodeId | null) => void = () => {}

  private container: HTMLElement

  constructor(container: HTMLElement, opts: { maxDpr: number; reduced: boolean }) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr))
    this.renderer.setClearColor(0x000000, 0)
    container.appendChild(this.renderer.domElement)
    this.labels.domElement.className = 'ocean-labels'
    container.appendChild(this.labels.domElement)
    this.camera.position.set(8, 8, 96)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = !opts.reduced
    this.controls.target.set(4, -2, 0)
    this.controls.minDistance = 50
    this.controls.maxDistance = 200
    this.controls.addEventListener('change', () => (this.needsRender = true))
    this.tex = this.glow()

    for (const n of NODES) this.addNode(n)
    for (const e of EDGES) this.addEdge(e)
    const pg = new THREE.SphereGeometry(0.55, 10, 8)
    for (let i = 0; i < 48; i++) {
      const mesh = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
      mesh.visible = false
      this.scene.add(mesh)
      this.packets.push({ mesh, edge: null, t: 0, speed: 1 })
    }

    const el = this.renderer.domElement
    el.addEventListener('pointermove', this.onMove)
    el.addEventListener('pointerleave', this.onLeave)
    el.addEventListener('click', this.onClick)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()
    this.raf = requestAnimationFrame(this.loop)
  }

  private glow() {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grd.addColorStop(0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.3, 'rgba(255,255,255,0.35)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  }

  private addNode(n: (typeof NODES)[number]) {
    const base = new THREE.Color(GROUP_COLOR[n.group])
    const mat = new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(0.55) })
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(n.group === 'output' ? 2.6 : 2, 1), mat)
    core.position.set(...n.pos)
    core.userData.node = n.id
    const haloMat = new THREE.SpriteMaterial({ map: this.tex, color: base, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending })
    const halo = new THREE.Sprite(haloMat)
    halo.scale.setScalar(11)
    core.add(halo)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.06, 6, 48),
      new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.35 }),
    )
    core.add(ring)
    const el = document.createElement('div')
    el.className = 'neural-label'
    const title = document.createElement('span')
    title.className = 'neural-label__title'
    title.textContent = n.label
    const value = document.createElement('span')
    value.className = 'neural-label__value'
    el.append(title, value)
    const lab = new CSS2DObject(el)
    lab.position.set(0, -4.4, 0)
    core.add(lab)
    this.scene.add(core)
    this.nodes.set(n.id, { core, mat, halo, haloMat, ring, lab, value, pulse: 0, pulseColor: base.clone(), base })
  }

  private addEdge(e: (typeof EDGES)[number]) {
    const a = new THREE.Vector3(...NODES.find((n) => n.id === e.from)!.pos)
    const b = new THREE.Vector3(...NODES.find((n) => n.id === e.to)!.pos)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    if (e.from === 'tx' && e.to === 'echo') mid.set(16, -36, 10) // feedback loop arcs underneath
    else mid.add(new THREE.Vector3(0, (b.y - a.y) * 0.15 + 3, 6))
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b)
    const mat = new THREE.LineBasicMaterial({ color: '#2a4f72', transparent: true, opacity: 0.5 })
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), mat)
    this.scene.add(line)
    this.edges.push({ rule: e.rule, from: e.from, to: e.to, curve, line, mat, glow: 0, glowColor: new THREE.Color('#a493ff') })
  }

  // ------------------------------------------------------------------ public API
  setValues(values: Partial<Record<NodeId, string>>) {
    for (const [id, v] of Object.entries(values)) {
      const n = this.nodes.get(id as NodeId)
      if (n && n.value.textContent !== v) n.value.textContent = v ?? ''
    }
    this.needsRender = true
  }

  /** A real measurement update arrived: brief tick on the input nodes. */
  tickInputs() {
    for (const id of ['temperature', 'salinity', 'depth'] as NodeId[]) this.pulseNode(id, this.nodes.get(id)!.base, 0.35)
  }

  /** A real transmission happened; `color` reflects the echo outcome. */
  transmit(color: string) {
    this.pulseNode('tx', new THREE.Color('#cfdbe7'), 0.8)
    for (const e of this.edges) if (e.from === 'tx' && e.to === 'echo') this.launch(e, new THREE.Color(color), 0.9)
  }

  /** A real adaptation rule fired. */
  fire(rule: Exclude<RuleId, 'TX'>, ruleClass: string) {
    const color = new THREE.Color(RULE_COLOR[ruleClass] ?? '#a493ff')
    for (const e of this.edges) {
      if (e.rule !== rule) continue
      e.glow = 1
      e.glowColor.copy(color)
      this.launch(e, color, 0.75)
    }
    this.pulseNode(RULE_TARGET[rule], color, 1)
    if (rule === 'R2' || rule === 'R6' || rule === 'R3' || rule === 'R4' || rule === 'R5') {
      // the changed setting is then used by the next transmission
      for (const e of this.edges) if (e.from === RULE_TARGET[rule] && e.to === 'tx') this.launch(e, color, 0.6, 0.9)
    }
  }

  /** Persistently highlight one rule's pathway (selected event), or clear. */
  highlight(rule: RuleId | null, ruleClass?: string) {
    this.highlightRule = rule
    if (ruleClass) this.highlightColor.set(RULE_COLOR[ruleClass] ?? '#a493ff')
    this.needsRender = true
  }

  selectNode(id: NodeId | null) {
    this.selected = id
    this.needsRender = true
  }

  // ------------------------------------------------------------------ internals
  private pulseNode(id: NodeId, color: THREE.Color, amount: number) {
    const n = this.nodes.get(id)
    if (!n) return
    n.pulse = Math.max(n.pulse, amount)
    n.pulseColor.copy(color)
    this.animating = Math.max(this.animating, 1.6)
  }

  private launch(edge: EdgeObj, color: THREE.Color, speed: number, delay = 0) {
    const p = this.packets.find((x) => !x.edge) ?? this.packets[0]
    p.edge = edge
    p.t = -delay
    p.speed = speed
    ;(p.mesh.material as THREE.MeshBasicMaterial).color.copy(color)
    this.animating = Math.max(this.animating, 2.2 + delay)
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0)
    this.last = now
    this.controls.update()
    if (this.animating <= 0 && !this.needsRender) return
    this.animating = Math.max(0, this.animating - dt)
    this.step(dt)
    this.pick()
    this.renderer.render(this.scene, this.camera)
    this.labels.render(this.scene, this.camera)
    this.needsRender = false
  }

  private step(dt: number) {
    for (const p of this.packets) {
      if (!p.edge) {
        p.mesh.visible = false
        continue
      }
      p.t += dt * p.speed
      if (p.t < 0) {
        p.mesh.visible = false
        continue
      }
      if (p.t >= 1) {
        const arrived = p.edge.to
        const col = (p.mesh.material as THREE.MeshBasicMaterial).color
        this.pulseNode(arrived, col, 0.6)
        p.edge = null
        p.mesh.visible = false
        continue
      }
      p.mesh.visible = true
      p.mesh.position.copy(p.edge.curve.getPoint(p.t))
    }
    for (const e of this.edges) {
      e.glow = Math.max(0, e.glow - dt * 0.5)
      const hl = this.highlightRule && e.rule === this.highlightRule
      const sel = this.selected && (e.from === this.selected || e.to === this.selected)
      const base = new THREE.Color('#2a4f72')
      if (hl) {
        e.mat.color.copy(this.highlightColor)
        e.mat.opacity = 0.95
      } else if (e.glow > 0) {
        e.mat.color.copy(base).lerp(e.glowColor, e.glow)
        e.mat.opacity = 0.5 + e.glow * 0.5
      } else {
        e.mat.color.copy(base).lerp(new THREE.Color('#46e0ff'), sel ? 0.6 : 0)
        e.mat.opacity = sel ? 0.8 : 0.42
      }
    }
    for (const [id, n] of this.nodes) {
      n.pulse = Math.max(0, n.pulse - dt * 0.9)
      const active = this.selected === id || this.hover === id
      const hl = this.highlightRule && this.highlightRule !== 'TX' && RULE_TARGET[this.highlightRule as Exclude<RuleId, 'TX'>] === id
      const c = n.base.clone().multiplyScalar(active || hl ? 1 : 0.55).lerp(n.pulseColor, n.pulse)
      n.mat.color.copy(c)
      n.haloMat.color.copy(hl ? this.highlightColor : n.pulse > 0 ? n.pulseColor : n.base)
      n.haloMat.opacity = 0.18 + n.pulse * 0.7 + (active || hl ? 0.3 : 0)
      n.core.scale.setScalar(1 + n.pulse * 0.35 + (active ? 0.12 : 0))
      n.ring.rotation.x += dt * 0.6 * (n.pulse > 0 ? 3 : 0)
      n.lab.element.dataset.active = active || hl ? '1' : '0'
    }
  }

  private onMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.needsRender = true
  }
  private onLeave = () => {
    this.pointer.set(9, 9)
    this.hover = null
    this.needsRender = true
  }
  private onClick = () => this.onSelect(this.hover)
  private pick() {
    if (this.pointer.x > 2) return
    this.ray.setFromCamera(this.pointer, this.camera)
    const hit = this.ray.intersectObjects([...this.nodes.values()].map((n) => n.core), false)[0]
    const id = (hit?.object.userData.node as NodeId | undefined) ?? null
    if (id !== this.hover) {
      this.hover = id
      this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
      this.needsRender = true
    }
  }

  private resize() {
    const r = this.container.getBoundingClientRect()
    this.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.labels.setSize(r.width, r.height)
    this.camera.aspect = r.width / Math.max(1, r.height)
    // keep the whole network in view on narrow screens
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3(4, 10, this.camera.aspect < 1.2 ? 150 : 96))
    this.camera.updateProjectionMatrix()
    this.needsRender = true
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    const el = this.renderer.domElement
    el.removeEventListener('pointermove', this.onMove)
    el.removeEventListener('pointerleave', this.onLeave)
    el.removeEventListener('click', this.onClick)
    this.controls.dispose()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose?.()
      const mat = m.material as THREE.Material | undefined
      mat?.dispose?.()
    })
    this.tex.dispose()
    this.renderer.dispose()
    el.remove()
    this.labels.domElement.remove()
  }
}
