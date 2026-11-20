/**
 * OceanWorld — WebGL digital twin of the simulated water column (Three.js).
 *
 * Mapping (stated on screen): horizontal = range/bearing from the vehicle, scaled so the
 * display range fills the volume; vertical = depth, scaled independently (the vertical
 * exaggeration factor is reported). Bearing 000° points along -Z.
 *
 * Data sources (snapshot from the backend):
 *   targets_truth      → target positions (simulated ground truth, in the vehicle's horizontal plane:
 *                        the model is range/bearing only, so targets share the vehicle depth)
 *   comparison.systems[adaptive].recent_pings → pulse emission times, outcome, echo travel time
 *   environment.sound_speed_m_s → wavefront speed (radius = c · (t − t_ping))
 *   history (depth, sound speed) → observed sound-speed layers (only depths actually visited)
 *   sonar.beam_bearing_deg / beamwidth_deg → scanning receive beam
 * Illustrative only (labelled): seabed relief, surface, light shafts, particles.
 *
 * One render loop, capped per quality profile, paused when hidden. Scene objects are built
 * once; data updates only change transforms, colours and uniforms.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { HistorySample, RecentPing, Snapshot } from '../../features/sim/types'
import { QUALITY_PROFILES, type Quality } from '../../lib/quality'

export type ViewPreset = 'orbit' | 'top' | 'side' | 'follow'

export interface TargetHover {
  id: string
  x: number
  y: number
}

const RW = 60 // world radius (units) for the display range
const HW = 34 // world height (units) for the depth scale
const TOP = HW / 2
const C_ACOUSTIC = new THREE.Color('#46e0ff')
const C_ENV = new THREE.Color('#3fe0b5')
const C_INTEL = new THREE.Color('#a493ff')
const C_WARN = new THREE.Color('#f2b54d')
const C_DANGER = new THREE.Color('#f26b6b')
const C_REF = new THREE.Color('#ff9a5c')
const C_SILVER = new THREE.Color('#cfdbe7')

const NICE = [200, 250, 500, 750, 1000, 1500, 2000]

function label(text: string, cls = 'ocean-label'): CSS2DObject {
  const el = document.createElement('div')
  el.className = cls
  el.textContent = text
  return new CSS2DObject(el)
}

const shellVert = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`
const shellFrag = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float rim = pow(1.0 - abs(dot(vN, vV)), 2.2);
    gl_FragColor = vec4(uColor, (rim * 0.9 + 0.03) * uOpacity);
  }`

const particleVert = /* glsl */ `
  uniform float uTime; uniform float uPx; uniform float uHeight;
  attribute float aSeed;
  varying float vA;
  void main() {
    vec3 p = position;
    p.y = mod(p.y + uTime * (0.15 + aSeed * 0.35) + uHeight * 0.5, uHeight) - uHeight * 0.5;
    p.x += sin(uTime * 0.2 + aSeed * 31.0) * 0.6;
    p.z += cos(uTime * 0.17 + aSeed * 17.0) * 0.6;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (1.0 + aSeed * 2.2) * uPx * (60.0 / -mv.z);
    vA = 0.25 + aSeed * 0.45;
    gl_Position = projectionMatrix * mv;
  }`
const particleFrag = /* glsl */ `
  varying float vA;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(0.62, 0.86, 0.95, vA * smoothstep(0.5, 0.0, d) * 0.5);
  }`

interface Wave {
  mesh: THREE.Mesh
  mat: THREE.ShaderMaterial
  ping: RecentPing | null
}

interface EchoFx {
  dot: THREE.Mesh
  shell: THREE.Mesh
  shellMat: THREE.ShaderMaterial
  ping: RecentPing | null
}

export class OceanWorld {
  private renderer: THREE.WebGLRenderer
  private labels: CSS2DRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private container: HTMLElement
  private raf = 0
  private lastFrame = 0
  private visible = true
  private io: IntersectionObserver
  private ro: ResizeObserver
  private quality: Quality
  private reduced: boolean

  private snap: Snapshot | null = null
  private history: HistorySample[] = []
  private simNow: () => number

  private rangeScale = 1000
  private rangeTarget = 1000
  private depthScale = 700
  private vehicle = new THREE.Group()
  private vehicleY = 0
  private rings = new THREE.Group()
  private ringLabels: CSS2DObject[] = []
  private beam: THREE.Mesh
  private layers: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; lab: CSS2DObject; depth: number }[] = []
  private thermo: { line: THREE.LineLoop; lab: CSS2DObject }
  private targets = new Map<
    string,
    { group: THREE.Group; core: THREE.Mesh; coreMat: THREE.MeshBasicMaterial; halo: THREE.Sprite; haloMat: THREE.SpriteMaterial; drop: THREE.Line; lab: CSS2DObject }
  >()
  private estMarker: THREE.Mesh
  private waves: Wave[] = []
  private echoes: EchoFx[] = []
  private seenPings = new Set<number>()
  private particles: THREE.Points | null = null
  private particleMat: THREE.ShaderMaterial | null = null
  private shafts = new THREE.Group()
  private exaggerationLabel: CSS2DObject
  private ray = new THREE.Raycaster()
  private pointer = new THREE.Vector2(9, 9)
  private hoverId: string | null = null
  private focus: { target: THREE.Vector3; pos: THREE.Vector3 } | null = null
  private selectedId: string | null = null
  private flash = 0
  private flashColor = C_ACOUSTIC.clone()
  private vehicleGlow: THREE.Sprite
  private glowTex: THREE.Texture

  onHover: (h: TargetHover | null) => void = () => {}
  onSelect: (id: string | null) => void = () => {}
  onEcho: (p: RecentPing) => void = () => {}

  constructor(container: HTMLElement, opts: { quality: Quality; reducedMotion: boolean; simNow: () => number; view?: ViewPreset }) {
    this.container = container
    this.quality = opts.quality
    this.reduced = opts.reducedMotion
    this.simNow = opts.simNow
    const prof = QUALITY_PROFILES[this.quality]

    this.renderer = new THREE.WebGLRenderer({ antialias: prof.antialias, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prof.maxDpr))
    this.renderer.setClearColor('#02070f')
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'

    this.labels = new CSS2DRenderer()
    this.labels.domElement.className = 'ocean-labels'
    container.appendChild(this.labels.domElement)

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = !this.reduced
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 20
    this.controls.maxDistance = 260
    this.controls.maxPolarAngle = Math.PI * 0.92
    this.controls.addEventListener('start', () => (this.focus = null))

    this.scene.fog = new THREE.FogExp2('#02070f', 0.0048)
    this.scene.add(new THREE.HemisphereLight('#7fd7ff', '#02060c', 0.9))
    const sun = new THREE.DirectionalLight('#a8e9ff', 0.8)
    sun.position.set(30, 80, 20)
    this.scene.add(sun)

    this.glowTex = this.makeGlowTexture()
    this.buildVolume()
    this.buildSeabed()
    this.buildRings()
    this.beam = this.buildBeam()
    this.buildVehicle()
    this.vehicleGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glowTex, color: C_ACOUSTIC, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }),
    )
    this.vehicleGlow.scale.setScalar(7)
    this.vehicle.add(this.vehicleGlow)
    this.thermo = this.buildThermocline()
    this.buildLayers()
    this.estMarker = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.08, 6, 40),
      new THREE.MeshBasicMaterial({ color: C_ACOUSTIC, transparent: true, opacity: 0.9 }),
    )
    this.estMarker.rotation.x = Math.PI / 2
    this.scene.add(this.estMarker)
    this.buildWavePool()
    this.applyQuality(this.quality, true)

    this.exaggerationLabel = label('', 'ocean-label ocean-label--meta')
    this.exaggerationLabel.position.set(-RW, -TOP - 1.5, RW * 0.98)
    this.scene.add(this.exaggerationLabel)
    const seabedLab = label('Seabed relief: illustrative only (not modelled)', 'ocean-label ocean-label--meta')
    seabedLab.position.set(RW * 0.55, -TOP + 1, RW * 0.7)
    this.scene.add(seabedLab)

    this.setView(opts.view ?? 'orbit', true)

    // interaction
    const el = this.renderer.domElement
    el.addEventListener('pointermove', this.handleMove)
    el.addEventListener('pointerleave', this.handleLeave)
    el.addEventListener('click', this.handleClick)

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.io = new IntersectionObserver((e) => (this.visible = e.some((x) => x.isIntersecting)))
    this.io.observe(container)
    this.resize()
    this.raf = requestAnimationFrame(this.loop)
  }

  // ------------------------------------------------------------------ build
  private makeGlowTexture(): THREE.Texture {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grd.addColorStop(0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.25, 'rgba(255,255,255,0.45)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 64, 64)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }

  private buildVolume() {
    const mat = new THREE.LineBasicMaterial({ color: '#3a86b5', transparent: true, opacity: 0.7 })
    const circle = (y: number) => {
      const pts = []
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.sin(a) * RW, y, -Math.cos(a) * RW))
      }
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat)
    }
    this.scene.add(circle(TOP), circle(-TOP))
    const verts: THREE.Vector3[] = []
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      verts.push(new THREE.Vector3(Math.sin(a) * RW, TOP, -Math.cos(a) * RW), new THREE.Vector3(Math.sin(a) * RW, -TOP, -Math.cos(a) * RW))
    }
    this.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(verts), mat))
    // translucent walls with a fresnel rim
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(RW, RW, HW, 96, 1, true),
      new THREE.ShaderMaterial({
        vertexShader: shellVert,
        fragmentShader: shellFrag,
        uniforms: { uColor: { value: new THREE.Color('#2a9fd0') }, uOpacity: { value: 0.6 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.scene.add(wall)
    // sea surface
    const surf = new THREE.Mesh(
      new THREE.CircleGeometry(RW, 96),
      new THREE.MeshBasicMaterial({ color: '#2aa8d8', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    )
    surf.rotation.x = -Math.PI / 2
    surf.position.y = TOP
    this.scene.add(surf)
    const surfLab = label('Sea surface · 0 m', 'ocean-label ocean-label--env')
    surfLab.position.set(-RW * 0.72, TOP + 1.2, -RW * 0.72)
    this.scene.add(surfLab)
  }

  private buildSeabed() {
    const seg = this.quality === 'high' ? 140 : this.quality === 'balanced' ? 90 : 48
    const geo = new THREE.CircleGeometry(RW, seg * 2)
    // Replace with a displaced grid for relief.
    const plane = new THREE.PlaneGeometry(RW * 2, RW * 2, seg, seg)
    plane.rotateX(-Math.PI / 2)
    const pos = plane.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const deep = new THREE.Color('#0a3450')
    const high = new THREE.Color('#2a9aa8')
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const r = Math.hypot(x, z)
      const n =
        Math.sin(x * 0.09) * Math.cos(z * 0.07) * 1.6 +
        Math.sin(x * 0.23 + z * 0.17) * 0.6 +
        Math.cos(z * 0.31 - x * 0.05) * 0.35
      const ridge = Math.exp(-((x + 22) ** 2) / 260) * 3.2
      const h = n + ridge
      pos.setY(i, -TOP + 1.2 + h - Math.max(0, r - RW) * 2)
      const c = deep.clone().lerp(high, Math.min(1, Math.max(0, (h + 2) / 6)))
      colors.set([c.r, c.g, c.b], i * 3)
    }
    plane.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    plane.computeVertexNormals()
    geo.dispose()
    const bed = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }))
    // clip to the cylinder footprint via alpha-less trick: hide outside radius by lowering it (done above)
    this.scene.add(bed)
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.PlaneGeometry(RW * 2, RW * 2, Math.floor(seg / 3), Math.floor(seg / 3)).rotateX(-Math.PI / 2)),
      new THREE.LineBasicMaterial({ color: '#2fd2ff', transparent: true, opacity: 0.09 }),
    )
    wire.position.y = -TOP + 4.4
    wire.visible = this.quality !== 'performance'
    this.scene.add(wire)
  }

  private buildRings() {
    const mat = new THREE.LineBasicMaterial({ color: '#46c8f0', transparent: true, opacity: 0.6 })
    for (let k = 1; k <= 4; k++) {
      const pts = []
      for (let i = 0; i <= 160; i++) {
        const a = (i / 160) * Math.PI * 2
        pts.push(new THREE.Vector3(Math.sin(a) * (RW * k) / 4, 0, -Math.cos(a) * (RW * k) / 4))
      }
      this.rings.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat))
      const lab = label('', 'ocean-label ocean-label--range')
      lab.position.set(RW * (k / 4) * 0.71, 0.4, -RW * (k / 4) * 0.71)
      this.rings.add(lab)
      this.ringLabels.push(lab)
    }
    const ticks: THREE.Vector3[] = []
    for (let b = 0; b < 360; b += 30) {
      const a = (b * Math.PI) / 180
      ticks.push(new THREE.Vector3(Math.sin(a) * RW * 0.96, 0, -Math.cos(a) * RW * 0.96), new THREE.Vector3(Math.sin(a) * RW, 0, -Math.cos(a) * RW))
      const lab = label(String(b).padStart(3, '0'), 'ocean-label ocean-label--bearing')
      lab.position.set(Math.sin(a) * RW * 1.06, 0, -Math.cos(a) * RW * 1.06)
      this.rings.add(lab)
    }
    this.rings.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), mat))
    this.scene.add(this.rings)
  }

  private buildBeam(): THREE.Mesh {
    const geo = new THREE.CircleGeometry(RW, 32, 0, 1)
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: C_ACOUSTIC, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    mesh.rotation.x = -Math.PI / 2
    this.scene.add(mesh)
    return mesh
  }

  private buildVehicle() {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.55, 3.2, 6, 12),
      new THREE.MeshStandardMaterial({ color: '#cfdbe7', emissive: '#0d3a4f', roughness: 0.4, metalness: 0.6 }),
    )
    body.rotation.x = Math.PI / 2
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.9), body.material)
    fin.position.set(0, 0.55, 1.6)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshBasicMaterial({ color: C_ACOUSTIC }))
    head.position.z = -2.1
    this.vehicle.add(body, fin, head)
    const lab = label('AUV · transducer (Tx/Rx)', 'ocean-label ocean-label--acoustic')
    lab.position.set(0, 2.4, 0)
    this.vehicle.add(lab)
    this.scene.add(this.vehicle)
  }

  private buildThermocline() {
    const pts = []
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.sin(a) * RW, 0, -Math.cos(a) * RW))
    }
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: C_ENV, dashSize: 1.4, gapSize: 1.2, transparent: true, opacity: 0.8 }),
    )
    line.computeLineDistances()
    const lab = label('Thermocline (assumed profile)', 'ocean-label ocean-label--env')
    lab.position.set(RW * 0.98, 0, 0)
    line.add(lab)
    this.scene.add(line)
    return { line, lab }
  }

  private buildLayers() {
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: C_ENV, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false })
      const mesh = new THREE.Mesh(new THREE.RingGeometry(RW * 0.995, RW, 128), mat)
      mesh.rotation.x = -Math.PI / 2
      const disc = new THREE.Mesh(new THREE.CircleGeometry(RW, 96), mat)
      mesh.add(disc)
      disc.position.z = 0.001
      const lab = label('', 'ocean-label ocean-label--depth')
      lab.position.set(-RW * 1.02, 0, 0)
      mesh.add(lab)
      this.scene.add(mesh)
      this.layers.push({ mesh, mat, lab, depth: 0 })
    }
  }

  private buildWavePool() {
    const geo = new THREE.SphereGeometry(1, 48, 24)
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: shellVert,
        fragmentShader: shellFrag,
        uniforms: { uColor: { value: C_ACOUSTIC.clone() }, uOpacity: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.visible = false
      this.scene.add(mesh)
      this.waves.push({ mesh, mat, ping: null })
    }
    const dotGeo = new THREE.SphereGeometry(0.5, 12, 8)
    const shellGeo = new THREE.SphereGeometry(1, 32, 16)
    for (let i = 0; i < 6; i++) {
      const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: C_ACOUSTIC, transparent: true }))
      const shellMat = new THREE.ShaderMaterial({
        vertexShader: shellVert,
        fragmentShader: shellFrag,
        uniforms: { uColor: { value: C_ACOUSTIC.clone() }, uOpacity: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const shell = new THREE.Mesh(shellGeo, shellMat)
      dot.visible = shell.visible = false
      this.scene.add(dot, shell)
      this.echoes.push({ dot, shell, shellMat, ping: null })
    }
  }

  private buildParticles(count: number) {
    if (this.particles) {
      this.scene.remove(this.particles)
      this.particles.geometry.dispose()
      this.particleMat?.dispose()
      this.particles = null
    }
    if (count <= 0) return
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const r = Math.sqrt(Math.random()) * RW
      const a = Math.random() * Math.PI * 2
      pos.set([Math.sin(a) * r, (Math.random() - 0.5) * HW, -Math.cos(a) * r], i * 3)
      seed[i] = Math.random()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    this.particleMat = new THREE.ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      uniforms: { uTime: { value: 0 }, uPx: { value: this.renderer.getPixelRatio() }, uHeight: { value: HW } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.particles = new THREE.Points(geo, this.particleMat)
    this.particles.frustumCulled = false
    this.scene.add(this.particles)
  }

  private buildShafts(on: boolean) {
    this.shafts.children.forEach((c) => {
      const m = c as THREE.Mesh
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    })
    this.shafts.clear()
    if (!on) return
    const c = document.createElement('canvas')
    c.width = 8
    c.height = 128
    const g = c.getContext('2d')!
    const grd = g.createLinearGradient(0, 0, 0, 128)
    grd.addColorStop(0, 'rgba(150,230,255,0.55)')
    grd.addColorStop(1, 'rgba(150,230,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 8, 128)
    const tex = new THREE.CanvasTexture(c)
    for (let i = 0; i < 7; i++) {
      const w = 3 + Math.random() * 5
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, HW * 0.75),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.06 + Math.random() * 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      )
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * RW * 0.8
      m.position.set(Math.sin(a) * r, TOP - HW * 0.375, -Math.cos(a) * r)
      m.rotation.set(0, Math.random() * Math.PI, 0.12)
      this.shafts.add(m)
    }
    if (!this.shafts.parent) this.scene.add(this.shafts)
  }

  // ------------------------------------------------------------------ data
  setData(snap: Snapshot, history: HistorySample[]) {
    this.snap = snap
    this.history = history
    const primary = snap.primary.target
    const window = snap.transmission.derived.max_unambiguous_range_m
    const need = Math.max(primary.range_m * 1.18, Math.min(window, primary.range_m * 2.2), 150)
    this.rangeTarget = NICE.find((r) => r >= need) ?? NICE[NICE.length - 1]
    const deepest = Math.max(snap.environment.truth.depth_m, ...history.map((h) => h.depth_m), 100)
    this.depthScale = Math.max(700, Math.ceil((deepest * 1.25) / 100) * 100)

    // targets (created lazily, then only updated)
    for (const t of snap.sonar.targets_truth) {
      if (!this.targets.has(t.id)) this.createTarget(t.id, t.primary)
    }
    // new pings → schedule wavefronts
    const sys = snap.comparison.systems.find((s) => s.id === 'adaptive')
    for (const p of sys?.recent_pings ?? []) {
      const key = Math.round(p.t * 1000)
      if (this.seenPings.has(key)) continue
      this.seenPings.add(key)
      const wave = this.waves.reduce((a, b) => ((a.ping?.t ?? -1e9) < (b.ping?.t ?? -1e9) ? a : b))
      wave.ping = p
      const echo = this.echoes.reduce((a, b) => ((a.ping?.t ?? -1e9) < (b.ping?.t ?? -1e9) ? a : b))
      echo.ping = p
    }
    if (this.seenPings.size > 400) this.seenPings = new Set([...this.seenPings].slice(-200))
  }

  /** Called after a reset so old pings are not replayed. */
  clearPings() {
    this.seenPings.clear()
    this.waves.forEach((w) => (w.ping = null))
    this.echoes.forEach((e) => (e.ping = null))
  }

  private createTarget(id: string, primary: boolean) {
    const group = new THREE.Group()
    const coreMat = new THREE.MeshBasicMaterial({ color: primary ? C_ACOUSTIC : C_SILVER, transparent: true, opacity: 0.95 })
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(primary ? 1.6 : 1.2, 0), coreMat)
    core.userData.targetId = id
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.OctahedronGeometry(primary ? 2.4 : 1.8, 0)),
      new THREE.LineBasicMaterial({ color: primary ? C_ACOUSTIC : C_SILVER, transparent: true, opacity: 0.6 }),
    )
    const haloMat = new THREE.SpriteMaterial({ map: this.glowTex, color: primary ? C_ACOUSTIC : C_SILVER, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 })
    const halo = new THREE.Sprite(haloMat)
    halo.scale.setScalar(primary ? 10 : 7)
    const drop = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]),
      new THREE.LineDashedMaterial({ color: '#3b6d8f', dashSize: 0.6, gapSize: 0.6, transparent: true, opacity: 0.6 }),
    )
    const lab = label(id, primary ? 'ocean-label ocean-label--target-primary' : 'ocean-label ocean-label--target')
    lab.position.set(0, 2.6, 0)
    group.add(core, wire, halo, drop, lab)
    this.scene.add(group)
    this.targets.set(id, { group, core, coreMat, halo, haloMat, drop, lab })
  }

  // ------------------------------------------------------------------ mapping
  private xz(bearing: number, range: number): [number, number] {
    const a = (bearing * Math.PI) / 180
    const r = (range / this.rangeScale) * RW
    return [Math.sin(a) * r, -Math.cos(a) * r]
  }

  private yOf(depth: number) {
    return TOP - (depth / this.depthScale) * HW
  }

  // ------------------------------------------------------------------ frame
  private frames = 0
  private fpsT0 = 0
  /** Measured frames per second over the last second, and renderer counters. */
  perf = { fps: 0, calls: 0, triangles: 0 }

  private loop = (t: number) => {
    this.raf = requestAnimationFrame(this.loop)
    if (!this.visible || document.hidden) return
    const cap = QUALITY_PROFILES[this.quality].fpsCap
    if (t - this.lastFrame < 1000 / cap - 2) return
    const dt = Math.min(0.1, (t - this.lastFrame) / 1000)
    this.lastFrame = t
    this.frame(t / 1000, dt)
    this.frames++
    if (t - this.fpsT0 >= 1000) {
      const i = this.renderer.info.render
      this.perf = { fps: Math.round((this.frames * 1000) / (t - this.fpsT0)), calls: i.calls, triangles: i.triangles }
      this.frames = 0
      this.fpsT0 = t
    }
  }

  private frame(time: number, dt: number) {
    const snap = this.snap
    // smooth scale transitions
    this.rangeScale += (this.rangeTarget - this.rangeScale) * Math.min(1, dt * 2.5)
    if (snap) this.updateWorld(snap, dt)
    if (this.particleMat && !this.reduced) this.particleMat.uniforms.uTime.value = time
    if (this.focus) {
      this.controls.target.lerp(this.focus.target, this.reduced ? 1 : 0.08)
      this.camera.position.lerp(this.focus.pos, this.reduced ? 1 : 0.06)
      if (this.camera.position.distanceTo(this.focus.pos) < 0.2) this.focus = null
    }
    this.controls.update()
    this.pick()
    this.renderer.render(this.scene, this.camera)
    this.labels.render(this.scene, this.camera)
  }

  private updateWorld(snap: Snapshot, dt: number) {
    const env = snap.environment
    const now = this.simNow()
    const c = env.sound_speed_m_s
    this.vehicleY += (this.yOf(env.truth.depth_m) - this.vehicleY) * Math.min(1, dt * 4)
    this.vehicle.position.y = this.vehicleY
    this.rings.position.y = this.vehicleY
    this.beam.position.y = this.vehicleY + 0.02
    this.ringLabels.forEach((l, i) => (l.element.textContent = `${Math.round((this.rangeScale * (i + 1)) / 4)} m`))
    // world units per metre: vertical / horizontal
    const ex = HW / this.depthScale / (RW / this.rangeScale)
    this.exaggerationLabel.element.textContent = `Horizontal radius ${Math.round(this.rangeScale)} m · depth 0–${this.depthScale} m · vertical scale ×${ex.toFixed(2)} of horizontal`

    // receive beam
    const bw = (snap.sonar.beamwidth_deg * Math.PI) / 180
    const brg = (snap.sonar.beam_bearing_deg * Math.PI) / 180
    const geo = this.beam.geometry as THREE.CircleGeometry
    if (Math.abs(geo.parameters.thetaLength - bw) > 1e-3) {
      geo.dispose()
      this.beam.geometry = new THREE.CircleGeometry(RW, 32, 0, bw)
    }
    // CircleGeometry starts at +X and sweeps CCW in its plane; after rotating to XZ, angle a maps to bearing 90°−a.
    this.beam.rotation.z = Math.PI / 2 - brg - bw / 2

    // thermocline
    this.thermo.line.position.y = this.yOf(env.thermocline_depth_m)
    this.thermo.lab.element.textContent = `Thermocline ~${Math.round(env.thermocline_depth_m)} m (assumed profile)`

    // observed sound-speed layers (binned from this run's history)
    const step = this.depthScale / 7
    this.layers.forEach((L, i) => {
      const d = step * (i + 0.5)
      L.depth = d
      L.mesh.position.y = this.yOf(d)
      const near = this.history.filter((h) => Math.abs(h.depth_m - d) < step / 2)
      if (near.length) {
        const cm = near.reduce((a, h) => a + h.sound_speed_m_s, 0) / near.length
        const tm = near.reduce((a, h) => a + h.temperature_c, 0) / near.length
        // colour from cold (blue) to warm (teal-green), opacity stays low
        const k = Math.min(1, Math.max(0, (cm - 1470) / 60))
        L.mat.color.setRGB(0.1 + k * 0.15, 0.45 + k * 0.4, 0.75 - k * 0.2)
        L.mat.opacity = 0.035
        L.lab.element.textContent = `${Math.round(d)} m · ${cm.toFixed(1)} m/s · ${tm.toFixed(1)} °C (observed)`
        L.lab.element.dataset.state = 'observed'
      } else {
        L.mat.opacity = 0.012
        L.mat.color.set('#2a4a66')
        L.lab.element.textContent = ''
        L.lab.element.dataset.state = 'none'
      }
    })

    // targets
    const contacts = new Map(snap.sonar.contacts.map((ct) => [ct.target_id, ct]))
    const pp = snap.primary.last_ping
    for (const t of snap.sonar.targets_truth) {
      const o = this.targets.get(t.id)
      if (!o) continue
      const [x, z] = this.xz(t.bearing_deg, t.range_m)
      const inView = t.range_m <= this.rangeScale * 1.02
      o.group.visible = inView
      o.group.position.set(x, this.vehicleY, z)
      const bedY = -TOP + 1.5
      const pos = (o.drop.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute
      pos.setXYZ(1, 0, bedY - this.vehicleY, 0)
      pos.needsUpdate = true
      o.drop.computeLineDistances()
      let col = C_SILVER
      let strength = 0.35
      let state = 'not yet scanned'
      if (t.primary && pp) {
        state = pp.status
        col = pp.status === 'detected' ? C_ACOUSTIC : pp.status === 'ambiguous' ? C_INTEL : pp.status === 'blind_zone' ? C_DANGER : C_WARN
        strength = pp.status === 'detected' ? 1 : 0.6
      } else {
        const ct = contacts.get(t.id)
        if (ct) {
          const age = snap.status.sim_time_s - ct.sim_time_s
          const fade = Math.max(0.2, 1 - age / 60)
          state = ct.status
          col = ct.status === 'detected' ? C_REF : C_WARN
          strength = (ct.status === 'detected' ? 0.9 : 0.4) * fade
        }
      }
      const isSel = this.selectedId === t.id
      const isHover = this.hoverId === t.id
      o.coreMat.color.copy(col)
      o.haloMat.color.copy(col)
      o.haloMat.opacity = Math.min(1, strength * (isSel || isHover ? 1.3 : 0.8))
      o.core.rotation.y += dt * (t.primary ? 0.8 : 0.4)
      o.group.scale.setScalar(isSel ? 1.35 : isHover ? 1.15 : 1)
      o.lab.element.textContent = `${t.id} · ${Math.round(t.range_m)} m · ${Math.round(t.bearing_deg)}°`
      o.lab.element.dataset.state = state
    }
    // estimated (measured) primary range marker
    if (pp && pp.status === 'detected' && pp.estimated_range_m != null) {
      const [x, z] = this.xz(snap.primary.target.bearing_deg, pp.estimated_range_m)
      this.estMarker.visible = true
      this.estMarker.position.set(x, this.vehicleY, z)
    } else this.estMarker.visible = false

    // wavefronts: radius = c · (now − t_ping), in metres → anisotropic world scale
    const sx = RW / this.rangeScale
    const sy = HW / this.depthScale
    const primary = snap.primary.target
    const [px, pz] = this.xz(primary.bearing_deg, primary.range_m)
    const prim = new THREE.Vector3(px, this.vehicleY, pz)
    for (const w of this.waves) {
      if (!w.ping) {
        w.mesh.visible = false
        continue
      }
      const age = now - w.ping.t
      const r = c * age
      const maxR = this.rangeScale * 1.05
      if (age < 0 || r > maxR) {
        w.mesh.visible = false
        continue
      }
      w.mesh.visible = true
      w.mesh.position.set(0, this.vehicleY, 0)
      w.mesh.scale.set(Math.max(0.01, r * sx), Math.max(0.01, r * sy), Math.max(0.01, r * sx))
      w.mat.uniforms.uOpacity.value = 0.9 * (1 - r / maxR)
    }
    // echoes: leave the target when the outgoing front arrives, reach the vehicle after the true
    // two-way time; colour = actual ping outcome. Missed echoes (below threshold) are drawn faint.
    for (const e of this.echoes) {
      const p = e.ping
      const T = p ? p.true_echo_time_ms / 1000 : 0
      const age = p ? now - p.t : -1
      const inRange = primary.range_m <= this.rangeScale * 1.02
      if (!p || !inRange || age < T / 2 || age > T + 0.3) {
        e.dot.visible = e.shell.visible = false
        continue
      }
      const col = p.status === 'detected' ? C_ACOUSTIC : p.status === 'ambiguous' ? C_INTEL : p.status === 'blind_zone' ? C_DANGER : C_WARN
      const faint = p.status === 'below_threshold'
      const f = Math.min(1, (age - T / 2) / (T / 2))
      const dotMat = e.dot.material as THREE.MeshBasicMaterial
      e.dot.visible = true
      e.dot.position.lerpVectors(prim, new THREE.Vector3(0, this.vehicleY, 0), f)
      dotMat.color.copy(col)
      dotMat.opacity = faint ? 0.35 : 1
      e.shell.visible = true
      e.shell.position.copy(prim)
      const rr = c * (age - T / 2)
      e.shell.scale.set(Math.max(0.01, rr * sx), Math.max(0.01, rr * sy), Math.max(0.01, rr * sx))
      e.shellMat.uniforms.uColor.value.copy(col)
      e.shellMat.uniforms.uOpacity.value = (faint ? 0.25 : 0.6) * (1 - f)
      if (age >= T && e.dot.userData.fired !== p.t) {
        e.dot.userData.fired = p.t
        this.flash = faint ? 0.35 : 1
        this.flashColor.copy(col)
        this.onEcho(p)
      }
    }
    // reception flash at the transducer
    this.flash = Math.max(0, this.flash - dt * 1.6)
    ;(this.vehicleGlow.material as THREE.SpriteMaterial).color.copy(C_ACOUSTIC).lerp(this.flashColor, this.flash)
    this.vehicleGlow.scale.setScalar(7 + this.flash * 9)
  }

  // ------------------------------------------------------------------ interaction
  private handleMove = (e: PointerEvent) => {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.lastPointer = { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  private lastPointer = { x: 0, y: 0 }
  private handleLeave = () => {
    this.pointer.set(9, 9)
    if (this.hoverId) {
      this.hoverId = null
      this.onHover(null)
    }
  }
  private handleClick = () => {
    this.onSelect(this.hoverId)
  }
  private pick() {
    if (this.pointer.x > 2) return
    this.ray.setFromCamera(this.pointer, this.camera)
    const cores = [...this.targets.values()].filter((t) => t.group.visible).map((t) => t.core)
    const hit = this.ray.intersectObjects(cores, false)[0]
    const id = (hit?.object.userData.targetId as string | undefined) ?? null
    if (id !== this.hoverId) {
      this.hoverId = id
      this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
    }
    this.onHover(id ? { id, ...this.lastPointer } : null)
  }

  // ------------------------------------------------------------------ public controls
  selectTarget(id: string | null) {
    this.selectedId = id
    if (!id) return
    const o = this.targets.get(id)
    if (!o) return
    const p = o.group.position.clone()
    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    this.focus = { target: p, pos: p.clone().add(dir.multiplyScalar(34)) }
  }

  setView(v: ViewPreset, instant = false) {
    const y = this.vehicleY
    const presets: Record<ViewPreset, { pos: THREE.Vector3; target: THREE.Vector3 }> = {
      orbit: { pos: new THREE.Vector3(70, 42, 84), target: new THREE.Vector3(0, -3, 0) },
      top: { pos: new THREE.Vector3(0.01, 150, 0.01), target: new THREE.Vector3(0, y, 0) },
      side: { pos: new THREE.Vector3(18, 26, 128), target: new THREE.Vector3(0, -2, 0) },
      follow: { pos: new THREE.Vector3(0, y + 10, 26), target: new THREE.Vector3(0, y, -10) },
    }
    const p = presets[v]
    if (instant || this.reduced) {
      this.camera.position.copy(p.pos)
      this.controls.target.copy(p.target)
      this.focus = null
    } else this.focus = { target: p.target, pos: p.pos }
  }

  applyQuality(q: Quality, initial = false) {
    this.quality = q
    const prof = QUALITY_PROFILES[q]
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, prof.maxDpr))
    this.buildParticles(this.reduced ? Math.min(prof.particles, 400) : prof.particles)
    this.buildShafts(prof.lightShafts)
    if (this.particleMat) this.particleMat.uniforms.uPx.value = this.renderer.getPixelRatio()
    if (!initial) this.resize()
  }

  private resize() {
    const r = this.container.getBoundingClientRect()
    const w = Math.max(1, r.width)
    const h = Math.max(1, r.height)
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.labels.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** Renderer statistics for the performance readout. */
  stats() {
    const i = this.renderer.info
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures }
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.io.disconnect()
    const el = this.renderer.domElement
    el.removeEventListener('pointermove', this.handleMove)
    el.removeEventListener('pointerleave', this.handleLeave)
    el.removeEventListener('click', this.handleClick)
    this.controls.dispose()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose?.()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else mat?.dispose?.()
    })
    this.glowTex.dispose()
    this.renderer.dispose()
    el.remove()
    this.labels.domElement.remove()
  }
}
