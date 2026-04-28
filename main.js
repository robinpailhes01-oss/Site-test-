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
    topColor: { value: new THREE.Color(0x031021) },
    midColor: { value: new THREE.Color(0x0d2742) },
    bottomColor: { value: new THREE.Color(0xc9a96a) },
    sunPos: { value: new THREE.Vector3(60, 20, -100) },
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
    uniform vec3 topColor;
    uniform vec3 midColor;
    uniform vec3 bottomColor;
    uniform vec3 sunPos;
    varying vec3 vWorld;
    void main() {
      float h = normalize(vWorld).y;
      vec3 col = mix(bottomColor, midColor, smoothstep(-0.05, 0.25, h));
      col = mix(col, topColor, smoothstep(0.25, 0.9, h));
      vec3 dir = normalize(sunPos - vWorld);
      float sun = max(dot(normalize(vWorld), dir), 0.0);
      col += vec3(1.0, 0.75, 0.45) * pow(sun, 24.0) * 0.9;
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

/* ---------- YACHT (procedural) ---------- */
const yacht = new THREE.Group();

const hullMat = new THREE.MeshStandardMaterial({
  color: 0xf4f1ea,
  roughness: 0.4,
  metalness: 0.15,
});
const darkMat = new THREE.MeshStandardMaterial({
  color: 0x141a22,
  roughness: 0.3,
  metalness: 0.4,
});
const goldMat = new THREE.MeshStandardMaterial({
  color: 0xc9a96a,
  roughness: 0.35,
  metalness: 0.7,
});
const glassMat = new THREE.MeshStandardMaterial({
  color: 0x1a3d5c,
  roughness: 0.1,
  metalness: 0.6,
  transparent: true,
  opacity: 0.85,
});

// Hull (bottom) - tapered shape
const hullShape = new THREE.Shape();
hullShape.moveTo(-5, -0.6);
hullShape.lineTo(5, -0.6);
hullShape.lineTo(6.5, 0);
hullShape.lineTo(5, 0.8);
hullShape.lineTo(-5, 0.8);
hullShape.lineTo(-5, -0.6);
const hullExtrude = new THREE.ExtrudeGeometry(hullShape, {
  depth: 2.6,
  bevelEnabled: true,
  bevelThickness: 0.15,
  bevelSize: 0.15,
  bevelSegments: 4,
});
hullExtrude.translate(0, 0, -1.3);
const hull = new THREE.Mesh(hullExtrude, hullMat);
hull.rotation.y = Math.PI / 2;
yacht.add(hull);

// Dark waterline stripe
const stripeGeo = new THREE.BoxGeometry(0.15, 0.18, 11.5);
const stripe = new THREE.Mesh(stripeGeo, darkMat);
stripe.position.set(1.32, 0.35, 0);
yacht.add(stripe);
const stripe2 = stripe.clone();
stripe2.position.x = -1.32;
yacht.add(stripe2);

// Main deck cabin
const cabinGeo = new THREE.BoxGeometry(2.2, 1.3, 6);
const cabin = new THREE.Mesh(cabinGeo, hullMat);
cabin.position.set(0, 1.45, -0.2);
yacht.add(cabin);

// Windows on cabin
const winGeo = new THREE.BoxGeometry(2.32, 0.5, 5.4);
const windows = new THREE.Mesh(winGeo, glassMat);
windows.position.set(0, 1.55, -0.2);
yacht.add(windows);

// Upper deck
const upperGeo = new THREE.BoxGeometry(1.7, 0.9, 4);
const upper = new THREE.Mesh(upperGeo, hullMat);
upper.position.set(0, 2.55, -0.7);
yacht.add(upper);

// Bridge windshield (slanted)
const bridgeGeo = new THREE.BoxGeometry(1.78, 0.7, 1.5);
const bridge = new THREE.Mesh(bridgeGeo, glassMat);
bridge.position.set(0, 2.6, 1.3);
bridge.rotation.x = -0.25;
yacht.add(bridge);

// Antenna mast
const mastGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8);
const mast = new THREE.Mesh(mastGeo, darkMat);
mast.position.set(0, 4.1, -1.2);
yacht.add(mast);

// Radar dome
const radarGeo = new THREE.SphereGeometry(0.22, 12, 8);
const radar = new THREE.Mesh(radarGeo, hullMat);
radar.position.set(0, 3.3, -1.2);
yacht.add(radar);

// Bow railing (gold accents)
for (let i = -4; i <= 4; i++) {
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6),
    goldMat
  );
  post.position.set(i * 0.8, 1.05, 2.6);
  yacht.add(post);
}
const railTop = new THREE.Mesh(
  new THREE.CylinderGeometry(0.04, 0.04, 7.2, 8),
  goldMat
);
railTop.rotation.z = Math.PI / 2;
railTop.position.set(0, 1.3, 2.6);
yacht.add(railTop);

// Sun deck (front pad)
const padGeo = new THREE.BoxGeometry(1.8, 0.1, 1.6);
const pad = new THREE.Mesh(padGeo, new THREE.MeshStandardMaterial({
  color: 0xe8dcc4, roughness: 0.8,
}));
pad.position.set(0, 0.85, 2);
yacht.add(pad);

yacht.position.set(0, 0.2, 0);
yacht.scale.set(0.9, 0.9, 0.9);
scene.add(yacht);

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

/* ---------- LIGHTS ---------- */
const sun = new THREE.DirectionalLight(0xffe5b4, 1.6);
sun.position.set(60, 30, -100);
scene.add(sun);

const ambient = new THREE.AmbientLight(0x4a6680, 0.45);
scene.add(ambient);

const rim = new THREE.DirectionalLight(0xc9a96a, 0.4);
rim.position.set(-30, 10, 40);
scene.add(rim);

/* ---------- SCROLL-DRIVEN CAMERA ---------- */
// 5 keyframes — one per section
const camKeyframes = [
  // Hero — wide cinematic shot from front-right
  { pos: new THREE.Vector3(14, 5, 18), look: new THREE.Vector3(0, 2, 0) },
  // Fleet — close-up bow
  { pos: new THREE.Vector3(7, 3.2, 8), look: new THREE.Vector3(0, 2, 1) },
  // Experience — top-down sweep
  { pos: new THREE.Vector3(-9, 9, 4), look: new THREE.Vector3(0, 1.5, -0.5) },
  // Destinations — pulled back, horizon
  { pos: new THREE.Vector3(-22, 6, -10), look: new THREE.Vector3(0, 2, -8) },
  // Contact — far cinematic, sun setting
  { pos: new THREE.Vector3(0, 4, 30), look: new THREE.Vector3(0, 2.5, 0) },
];

const yachtKeyframes = [
  { rotY: 0.25, posY: 0.2 },
  { rotY: 0.15, posY: 0.25 },
  { rotY: -0.1, posY: 0.2 },
  { rotY: -0.6, posY: 0.18 },
  { rotY: -1.2, posY: 0.22 },
];

let scrollProgress = 0;
let targetScroll = 0;

function updateScroll() {
  const max = document.body.scrollHeight - window.innerHeight;
  targetScroll = Math.max(0, Math.min(1, window.scrollY / max));
}
window.addEventListener('scroll', updateScroll, { passive: true });

function lerpKeyframes(t) {
  const segments = camKeyframes.length - 1;
  const scaled = t * segments;
  const i = Math.min(Math.floor(scaled), segments - 1);
  const localT = scaled - i;
  // ease in-out
  const e = localT < 0.5
    ? 2 * localT * localT
    : 1 - Math.pow(-2 * localT + 2, 2) / 2;

  const a = camKeyframes[i];
  const b = camKeyframes[i + 1];
  const pos = a.pos.clone().lerp(b.pos, e);
  const look = a.look.clone().lerp(b.look, e);

  const ya = yachtKeyframes[i];
  const yb = yachtKeyframes[i + 1];
  const yRot = ya.rotY + (yb.rotY - ya.rotY) * e;
  const yPosY = ya.posY + (yb.posY - ya.posY) * e;

  return { pos, look, yRot, yPosY };
}

/* ---------- RESIZE ---------- */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------- ANIMATE ---------- */
const clock = new THREE.Clock();
const lookTarget = new THREE.Vector3();

function animate() {
  const t = clock.getElapsedTime();

  // smooth scroll interpolation
  scrollProgress += (targetScroll - scrollProgress) * 0.06;

  oceanMat.uniforms.uTime.value = t;

  const { pos, look, yRot, yPosY } = lerpKeyframes(scrollProgress);

  // gentle camera bobbing
  pos.y += Math.sin(t * 0.6) * 0.18;

  camera.position.lerp(pos, 0.08);
  lookTarget.lerp(look, 0.08);
  camera.lookAt(lookTarget);

  // yacht bobs on waves & rotates per scroll
  yacht.position.y = yPosY + Math.sin(t * 1.2) * 0.12;
  yacht.rotation.y = yRot;
  yacht.rotation.z = Math.sin(t * 0.8) * 0.025;
  yacht.rotation.x = Math.sin(t * 1.0 + 0.5) * 0.02;

  // birds
  birds.forEach((b) => {
    b.position.x += Math.cos(t * b.userData.speed + b.userData.offset) * 0.04;
    b.position.z += b.userData.speed * 0.6;
    if (b.position.z > 30) b.position.z = -120;
    b.rotation.z = Math.sin(t * 6 + b.userData.offset) * 0.4;
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

updateScroll();
animate();
