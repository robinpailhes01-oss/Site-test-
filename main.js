import * as THREE from 'three';

const canvas = document.getElementById('bg-canvas');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a1a2e, 0.012);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);
camera.position.set(0, 6, 18);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x04111f, 1);

/* ---------- SKY GRADIENT ---------- */
const skyGeo = new THREE.SphereGeometry(800, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: {
    uProgress: { value: 0 }, // 0 = golden hour, 1 = night
    sunPos: { value: new THREE.Vector3(60, 20, -100) },
    // Day palette (golden hour)
    topDay: { value: new THREE.Color(0x1a3550) },
    midDay: { value: new THREE.Color(0xd97a3a) },
    botDay: { value: new THREE.Color(0xf4c47a) },
    // Night palette
    topNight: { value: new THREE.Color(0x010410) },
    midNight: { value: new THREE.Color(0x05132a) },
    botNight: { value: new THREE.Color(0x1a2540) },
  },
  vertexShader: `
    varying vec3 vWorld;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform float uProgress;
    uniform vec3 sunPos;
    uniform vec3 topDay, midDay, botDay;
    uniform vec3 topNight, midNight, botNight;
    varying vec3 vWorld;
    void main() {
      vec3 top = mix(topDay, topNight, uProgress);
      vec3 mid = mix(midDay, midNight, uProgress);
      vec3 bot = mix(botDay, botNight, uProgress);
      float h = normalize(vWorld).y;
      vec3 col = mix(bot, mid, smoothstep(-0.05, 0.3, h));
      col = mix(col, top, smoothstep(0.3, 0.9, h));
      // Sun glow fades as night falls
      vec3 dir = normalize(sunPos - vWorld);
      float sun = max(dot(normalize(vWorld), dir), 0.0);
      col += vec3(1.0, 0.7, 0.4) * pow(sun, 18.0) * (1.0 - uProgress) * 1.1;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

/* ---------- OCEAN ---------- */
const oceanGeo = new THREE.PlaneGeometry(1200, 1200, 220, 220);
const oceanMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uColorDeep: { value: new THREE.Color(0x031628) },
    uColorShallow: { value: new THREE.Color(0x1a4d6b) },
    uSun: { value: new THREE.Vector3(60, 20, -100).normalize() },
  },
  vertexShader: `
    uniform float uTime;
    varying float vElev;
    varying vec3 vNormal;
    varying vec3 vPos;

    float wave(vec2 p, vec2 dir, float amp, float freq, float speed) {
      return sin(dot(p, dir) * freq + uTime * speed) * amp;
    }

    void main() {
      vec3 pos = position;
      float e = 0.0;
      e += wave(pos.xy, vec2(1.0, 0.6), 0.35, 0.18, 0.9);
      e += wave(pos.xy, vec2(-0.7, 0.9), 0.22, 0.32, 1.4);
      e += wave(pos.xy, vec2(0.4, -1.0), 0.15, 0.55, 1.8);
      e += wave(pos.xy, vec2(0.9, -0.3), 0.08, 0.95, 2.5);
      pos.z += e;
      vElev = e;
      vPos = pos;

      // approximate normal via partial deriv
      float dx = wave(pos.xy + vec2(0.1,0.0), vec2(1.0, 0.6), 0.35, 0.18, 0.9)
               - wave(pos.xy - vec2(0.1,0.0), vec2(1.0, 0.6), 0.35, 0.18, 0.9);
      float dy = wave(pos.xy + vec2(0.0,0.1), vec2(-0.7, 0.9), 0.22, 0.32, 1.4)
               - wave(pos.xy - vec2(0.0,0.1), vec2(-0.7, 0.9), 0.22, 0.32, 1.4);
      vNormal = normalize(vec3(-dx, -dy, 0.4));

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColorDeep;
    uniform vec3 uColorShallow;
    uniform vec3 uSun;
    varying float vElev;
    varying vec3 vNormal;
    varying vec3 vPos;
    void main() {
      float t = smoothstep(-0.4, 0.6, vElev);
      vec3 base = mix(uColorDeep, uColorShallow, t);
      float sp = pow(max(dot(normalize(vNormal), normalize(uSun)), 0.0), 32.0);
      vec3 col = base + vec3(1.0, 0.85, 0.55) * sp * 0.7;
      // golden glints
      float glint = pow(max(dot(normalize(vNormal), vec3(0.0, 1.0, 0.2)), 0.0), 6.0);
      col += vec3(0.95, 0.75, 0.4) * glint * 0.08;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const ocean = new THREE.Mesh(oceanGeo, oceanMat);
ocean.rotation.x = -Math.PI / 2;
ocean.position.y = 0;
scene.add(ocean);

/* ---------- YACHT (procedural, detailed) ---------- */
const yacht = new THREE.Group();

const hullMat = new THREE.MeshStandardMaterial({
  color: 0xf6f2ea, roughness: 0.35, metalness: 0.2,
});
const hullDarkMat = new THREE.MeshStandardMaterial({
  color: 0x0e1820, roughness: 0.25, metalness: 0.55,
});
const teakMat = new THREE.MeshStandardMaterial({
  color: 0xb88a4a, roughness: 0.85, metalness: 0.05,
});
const goldMat = new THREE.MeshStandardMaterial({
  color: 0xc9a96a, roughness: 0.3, metalness: 0.85,
});
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x0c2236, roughness: 0.05, metalness: 0.9,
  transparent: true, opacity: 0.78,
});
const cushionMat = new THREE.MeshStandardMaterial({
  color: 0xece1cc, roughness: 0.9,
});

/* HULL — yacht footprint (top-view) with pointed bow */
const hullShape = new THREE.Shape();
hullShape.moveTo(-6.0, -1.55);
hullShape.lineTo(4.2, -1.55);
hullShape.bezierCurveTo(5.6, -1.55, 6.6, -1.05, 7.4, 0);
hullShape.bezierCurveTo(6.6, 1.05, 5.6, 1.55, 4.2, 1.55);
hullShape.lineTo(-6.0, 1.55);
hullShape.lineTo(-6.0, -1.55);

// Lower hull (dark, below waterline)
const lowerHullGeo = new THREE.ExtrudeGeometry(hullShape, {
  depth: 0.9, bevelEnabled: true,
  bevelThickness: 0.45, bevelSize: 0.45, bevelSegments: 6,
});
lowerHullGeo.rotateX(Math.PI / 2);
lowerHullGeo.translate(0, -1.0, 0);
const lowerHull = new THREE.Mesh(lowerHullGeo, hullDarkMat);
yacht.add(lowerHull);

// Upper hull (white, above waterline)
const upperHullGeo = new THREE.ExtrudeGeometry(hullShape, {
  depth: 1.1, bevelEnabled: true,
  bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2,
});
upperHullGeo.rotateX(Math.PI / 2);
upperHullGeo.translate(0, -0.05, 0);
const upperHull = new THREE.Mesh(upperHullGeo, hullMat);
yacht.add(upperHull);

// Gold waterline accent stripes
[-1.55, 1.55].forEach((z) => {
  const s = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.06, 0.05), goldMat);
  s.position.set(0.3, 0.05, z);
  yacht.add(s);
});

// Teak deck floor
const deckGeo = new THREE.BoxGeometry(11.6, 0.06, 2.95);
const deck = new THREE.Mesh(deckGeo, teakMat);
deck.position.set(0.2, 1.07, 0);
yacht.add(deck);

/* MAIN DECK CABIN */
const cabinGeo = new THREE.BoxGeometry(7.0, 1.4, 2.55);
const cabin = new THREE.Mesh(cabinGeo, hullMat);
cabin.position.set(-1.5, 1.78, 0);
yacht.add(cabin);

// Continuous strip windows on cabin
const cabinWinGeo = new THREE.BoxGeometry(6.6, 0.55, 2.62);
const cabinWin = new THREE.Mesh(cabinWinGeo, glassMat);
cabinWin.position.set(-1.5, 1.92, 0);
yacht.add(cabinWin);

// Cabin window dividers (gold posts every meter)
for (let i = -3; i <= 3; i++) {
  const div = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 2.65), hullMat);
  div.position.set(-1.5 + i * 1.0, 1.92, 0);
  yacht.add(div);
}

/* UPPER DECK */
const upperDeckGeo = new THREE.BoxGeometry(5.4, 1.0, 2.2);
const upperDeck = new THREE.Mesh(upperDeckGeo, hullMat);
upperDeck.position.set(-2.2, 2.98, 0);
yacht.add(upperDeck);

// Wraparound upper windows
const upperWinGeo = new THREE.BoxGeometry(5.0, 0.42, 2.27);
const upperWin = new THREE.Mesh(upperWinGeo, glassMat);
upperWin.position.set(-2.2, 3.05, 0);
yacht.add(upperWin);

/* FLYBRIDGE windshield (slanted forward) */
const fbShape = new THREE.Shape();
fbShape.moveTo(0, 0);
fbShape.lineTo(1.4, 0);
fbShape.lineTo(1.0, 0.85);
fbShape.lineTo(0, 0.85);
fbShape.lineTo(0, 0);
const fbGeo = new THREE.ExtrudeGeometry(fbShape, {
  depth: 2.2, bevelEnabled: false,
});
fbGeo.translate(-0.7, 0, -1.1);
const flybridge = new THREE.Mesh(fbGeo, glassMat);
flybridge.position.set(0.1, 3.5, 0);
yacht.add(flybridge);

/* FLYBRIDGE seating area (open top) */
// Helm console
const helm = new THREE.Mesh(
  new THREE.BoxGeometry(1.2, 0.55, 1.0),
  hullDarkMat
);
helm.position.set(-0.3, 3.78, 0);
yacht.add(helm);

// Captain's chair
const chair = new THREE.Mesh(
  new THREE.BoxGeometry(0.35, 0.4, 0.35),
  hullDarkMat
);
chair.position.set(-1.0, 3.78, 0);
yacht.add(chair);

// Flybridge teak floor
const fbFloor = new THREE.Mesh(
  new THREE.BoxGeometry(5.4, 0.05, 2.2),
  teakMat
);
fbFloor.position.set(-2.2, 3.51, 0);
yacht.add(fbFloor);

// Bimini (awning) over flybridge
const bimini = new THREE.Mesh(
  new THREE.BoxGeometry(3.6, 0.08, 2.1),
  new THREE.MeshStandardMaterial({ color: 0x1a2733, roughness: 0.7 })
);
bimini.position.set(-2.8, 4.55, 0);
yacht.add(bimini);

// Bimini support poles
[[-4.4, 1.0], [-4.4, -1.0], [-1.2, 1.0], [-1.2, -1.0]].forEach(([x, z]) => {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8),
    goldMat
  );
  pole.position.set(x, 4.04, z);
  yacht.add(pole);
});

/* MAST with antennas + radar */
const mastBase = new THREE.Mesh(
  new THREE.CylinderGeometry(0.08, 0.12, 2.4, 10),
  hullDarkMat
);
mastBase.position.set(-4.6, 5.7, 0);
yacht.add(mastBase);

const radarDome = new THREE.Mesh(
  new THREE.CylinderGeometry(0.45, 0.45, 0.18, 16),
  hullMat
);
radarDome.position.set(-4.6, 5.0, 0);
yacht.add(radarDome);

// Antennas
[[-4.6, 0.45], [-4.6, -0.45]].forEach(([x, z]) => {
  const a = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 1.4, 6),
    hullDarkMat
  );
  a.position.set(x, 6.2, z);
  yacht.add(a);
});

// Masthead light
const navLight = new THREE.PointLight(0xfff2c8, 0.6, 8);
navLight.position.set(-4.6, 6.95, 0);
yacht.add(navLight);
const navBulb = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xfff2c8 })
);
navBulb.position.copy(navLight.position);
yacht.add(navBulb);

/* BOW — anchor pulpit + sundeck cushions */
const pulpit = new THREE.Mesh(
  new THREE.BoxGeometry(1.4, 0.06, 1.6),
  teakMat
);
pulpit.position.set(6.2, 1.1, 0);
yacht.add(pulpit);

// Anchor (gold)
const anchor = new THREE.Mesh(
  new THREE.BoxGeometry(0.35, 0.12, 0.18),
  goldMat
);
anchor.position.set(6.95, 0.95, 0);
yacht.add(anchor);

// Bow sundeck cushions (3 pads)
[-0.7, 0, 0.7].forEach((z) => {
  const c = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.18, 0.6), cushionMat);
  c.position.set(5.4, 1.22, z);
  yacht.add(c);
});

/* STERN — bathing platform + steps */
const sternPlatform = new THREE.Mesh(
  new THREE.BoxGeometry(1.6, 0.1, 2.6),
  teakMat
);
sternPlatform.position.set(-6.7, 0.45, 0);
yacht.add(sternPlatform);

// Stern lounge cushions
[-0.65, 0.65].forEach((z) => {
  const c = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 1.0), cushionMat);
  c.position.set(-4.8, 1.22, z);
  yacht.add(c);
});

/* RAILINGS — posts + 3 horizontal cables along both sides */
function makeRailing(zSide) {
  for (let i = -5; i <= 5; i++) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6),
      goldMat
    );
    post.position.set(i * 0.95, 1.45, zSide);
    yacht.add(post);
  }
  // 3 horizontal cables
  [0.45, 0.7, 0.95].forEach((y) => {
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 10.5, 6),
      goldMat
    );
    cable.rotation.z = Math.PI / 2;
    cable.position.set(0, 1.1 + y * 0.5, zSide);
    yacht.add(cable);
  });
}
makeRailing(1.45);
makeRailing(-1.45);

// Bow railing (curved approximation: small posts on the pulpit edge)
for (let i = 0; i < 5; i++) {
  const angle = (i / 4) * Math.PI - Math.PI / 2;
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6),
    goldMat
  );
  post.position.set(6.2 + Math.cos(angle) * 0.7, 1.4, Math.sin(angle) * 0.7);
  yacht.add(post);
}

yacht.position.set(0, 0.15, 0);
yacht.scale.set(0.85, 0.85, 0.85);
scene.add(yacht);

// Aliases for legacy refs further in file
const darkMat = hullDarkMat;

/* ---------- SECONDARY YACHTS (distant) ---------- */
function makeDistantYacht(x, z, scale, rot) {
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.BoxGeometry(6, 0.7, 1.8), hullMat);
  const c = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.9, 1.4), hullMat);
  c.position.y = 0.8;
  const u = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.6, 1.1), hullMat);
  u.position.y = 1.5;
  g.add(h, c, u);
  g.position.set(x, 0.4, z);
  g.scale.setScalar(scale);
  g.rotation.y = rot;
  return g;
}
scene.add(makeDistantYacht(-90, -120, 1.6, 0.8));
scene.add(makeDistantYacht(110, -180, 2.0, -0.4));
scene.add(makeDistantYacht(60, -340, 2.4, 1.2));

/* ---------- COASTLINE / ISLANDS ---------- */
function makeIsland(x, z, radius) {
  const geo = new THREE.ConeGeometry(radius, radius * 0.8, 12);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2d3a2a, roughness: 1, flatShading: true,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, radius * 0.4 - 1, z);
  return m;
}
scene.add(makeIsland(-180, -250, 26));
scene.add(makeIsland(160, -400, 38));
scene.add(makeIsland(-80, -520, 32));

/* ---------- BIRDS ---------- */
const birds = [];
const birdGeo = new THREE.ConeGeometry(0.15, 0.6, 4);
const birdMat = new THREE.MeshBasicMaterial({ color: 0xf4f1ea });
for (let i = 0; i < 8; i++) {
  const b = new THREE.Mesh(birdGeo, birdMat);
  b.position.set(
    (Math.random() - 0.5) * 80,
    8 + Math.random() * 12,
    -20 - Math.random() * 80
  );
  b.userData.speed = 0.02 + Math.random() * 0.03;
  b.userData.offset = Math.random() * Math.PI * 2;
  scene.add(b);
  birds.push(b);
}

/* ---------- STARS (visible at night) ---------- */
const starGeo = new THREE.BufferGeometry();
const starCount = 1200;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  // Spherical distribution, only upper hemisphere
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(Math.random() * 0.9 + 0.05);
  const r = 600;
  starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
  starPos[i * 3 + 1] = r * Math.cos(phi);
  starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 1.6,
  transparent: true,
  opacity: 0,
  sizeAttenuation: false,
});
const stars = new THREE.Points(starGeo, starMat);
scene.add(stars);

/* ---------- WAKE (foam trail behind yacht) ---------- */
const wakeGeo = new THREE.PlaneGeometry(40, 6, 60, 12);
const wakeMat = new THREE.ShaderMaterial({
  transparent: true,
  uniforms: {
    uTime: { value: 0 },
    uOpacity: { value: 0.55 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uOpacity;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      float a = hash(i), b = hash(i + vec2(1,0));
      float c = hash(i + vec2(0,1)), d = hash(i + vec2(1,1));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    void main() {
      // V-shape wake mask
      float center = abs(vUv.y - 0.5) * 2.0;
      float length = 1.0 - vUv.x;
      float vshape = smoothstep(length * 0.6 + 0.05, length * 0.6 - 0.1, center);
      float foam = noise(vec2(vUv.x * 18.0 - uTime * 0.6, vUv.y * 8.0));
      foam = smoothstep(0.4, 0.9, foam);
      float alpha = vshape * foam * length * uOpacity;
      gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
    }
  `,
});
const wake = new THREE.Mesh(wakeGeo, wakeMat);
wake.rotation.x = -Math.PI / 2;
wake.position.set(-20, 0.05, 0);
scene.add(wake);

/* ---------- LIGHTS ---------- */
const sun = new THREE.DirectionalLight(0xffe5b4, 1.6);
sun.position.set(60, 30, -100);
scene.add(sun);

const ambient = new THREE.AmbientLight(0x4a6680, 0.45);
scene.add(ambient);

const rim = new THREE.DirectionalLight(0xc9a96a, 0.4);
rim.position.set(-30, 10, 40);
scene.add(rim);

/* ---------- SCROLL-DRIVEN CAMERA (Catmull-Rom curves) ---------- */
const camCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(16, 4.5, 19),    // hero
  new THREE.Vector3(11, 3.0, 12),    // fleet entrance
  new THREE.Vector3(6, 3.0, 9),      // fleet — close to bow
  new THREE.Vector3(-5, 7.5, 6),     // experience — top-down sweep
  new THREE.Vector3(-15, 5.0, -2),   // destinations transition
  new THREE.Vector3(-22, 4.5, -12),  // destinations — horizon
  new THREE.Vector3(-6, 4.5, 22),    // contact transition
  new THREE.Vector3(0, 5.0, 32),     // contact — wide cinematic
], false, 'catmullrom', 0.5);

const lookCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 2.0, 0),
  new THREE.Vector3(0, 2.2, 0.5),
  new THREE.Vector3(0, 2.0, 1.0),
  new THREE.Vector3(0, 1.5, -0.5),
  new THREE.Vector3(0, 2.0, -4),
  new THREE.Vector3(0, 2.0, -8),
  new THREE.Vector3(0, 2.5, 0),
  new THREE.Vector3(0, 2.5, 0),
], false, 'catmullrom', 0.5);

// Yacht slow heading shift across the journey
function yachtRotY(t) {
  return 0.3 - t * 1.6;
}

let scrollProgress = 0;
let targetScroll = 0;

function updateScroll() {
  const max = document.body.scrollHeight - window.innerHeight;
  targetScroll = Math.max(0, Math.min(1, window.scrollY / max));
  // Update CSS scroll progress bar
  const bar = document.getElementById('scroll-progress');
  if (bar) bar.style.transform = `scaleX(${targetScroll})`;
}
window.addEventListener('scroll', updateScroll, { passive: true });

/* ---------- RESIZE ---------- */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------- ANIMATE ---------- */
const clock = new THREE.Clock();
const lookTarget = new THREE.Vector3();
const tmpPos = new THREE.Vector3();
const tmpLook = new THREE.Vector3();

function easeInOut(x) {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function animate() {
  const t = clock.getElapsedTime();

  // Smooth scroll interpolation
  scrollProgress += (targetScroll - scrollProgress) * 0.05;
  const eased = easeInOut(scrollProgress);

  // Sky transition (golden hour → night) starts mid-page
  const skyT = Math.max(0, Math.min(1, (scrollProgress - 0.45) / 0.45));
  skyMat.uniforms.uProgress.value = skyT;
  starMat.opacity = skyT * 0.95;
  ambient.intensity = 0.45 - skyT * 0.15;
  sun.intensity = 1.6 - skyT * 1.3;

  // Ocean colors shift with time of day
  oceanMat.uniforms.uTime.value = t;
  oceanMat.uniforms.uColorShallow.value.setRGB(
    0.10 + (1 - skyT) * 0.18,
    0.30 - skyT * 0.18,
    0.42 - skyT * 0.20
  );

  // Camera follows the curve
  camCurve.getPointAt(eased, tmpPos);
  lookCurve.getPointAt(eased, tmpLook);
  // Gentle bobbing on Y
  tmpPos.y += Math.sin(t * 0.6) * 0.15;

  camera.position.lerp(tmpPos, 0.08);
  lookTarget.lerp(tmpLook, 0.08);
  camera.lookAt(lookTarget);

  // Yacht bobs on waves & rotates per scroll
  yacht.position.y = 0.18 + Math.sin(t * 1.2) * 0.10;
  yacht.rotation.y = yachtRotY(eased);
  yacht.rotation.z = Math.sin(t * 0.8) * 0.022;
  yacht.rotation.x = Math.sin(t * 1.0 + 0.5) * 0.018;

  // Wake follows yacht heading
  wake.rotation.z = -yacht.rotation.y;
  const stern = new THREE.Vector3(-22, 0.05, 0).applyEuler(
    new THREE.Euler(0, yacht.rotation.y, 0)
  );
  wake.position.set(stern.x, 0.05, stern.z);
  wakeMat.uniforms.uTime.value = t;
  wakeMat.uniforms.uOpacity.value = 0.55 - skyT * 0.35;

  // Birds disappear at night
  birds.forEach((b) => {
    b.position.x += Math.cos(t * b.userData.speed + b.userData.offset) * 0.04;
    b.position.z += b.userData.speed * 0.6;
    if (b.position.z > 30) b.position.z = -120;
    b.rotation.z = Math.sin(t * 6 + b.userData.offset) * 0.4;
    b.visible = skyT < 0.6;
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

updateScroll();
animate();

/* ---------- SECTION REVEALS ---------- */
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.15 }
);
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
