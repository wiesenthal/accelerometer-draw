// Entry point
import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'https://unpkg.com/three@0.161.0/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'https://unpkg.com/three@0.161.0/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'https://unpkg.com/three@0.161.0/examples/jsm/lines/LineMaterial.js';

const ui = {
  permissionButtons: [document.getElementById('btn-permission'), document.getElementById('overlay-permission')],
  desktopButtons: [document.getElementById('btn-desktop'), document.getElementById('overlay-desktop')],
  overlay: document.getElementById('overlay'),
  permStatus: document.getElementById('perm-status'),
  drawBtn: document.getElementById('btn-draw'),
  clearBtn: document.getElementById('btn-clear'),
  recenterBtn: document.getElementById('btn-recenter'),
  color: document.getElementById('color'),
  width: document.getElementById('width'),
  speed: document.getElementById('speed'),
  distance: document.getElementById('distance')
};

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d10);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 200);
camera.position.set(0, 1.2, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 0.5;
controls.maxDistance = 30;

// Lights and helpers
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(3, 5, 2);
scene.add(dir);

const grid = new THREE.GridHelper(100, 100, 0x304057, 0x222a36);
grid.material.opacity = 0.6;
grid.material.transparent = true;
scene.add(grid);

const axes = new THREE.AxesHelper(0.5);
axes.position.set(0, 0.001, 0);
scene.add(axes);

// Reticle to show current pen position
const penGeo = new THREE.SphereGeometry(0.02, 16, 16);
const penMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222 });
const pen = new THREE.Mesh(penGeo, penMat);
scene.add(pen);

// State
let isDrawing = false;
let strokes = [];
let currentStroke = null;

let worldPosition = new THREE.Vector3(0, 1.0, 0); // start about 1m above ground
let worldVelocity = new THREE.Vector3();
let worldAcceleration = new THREE.Vector3();

let gravityWorld = new THREE.Vector3(0, -9.81, 0);
let accelThresholdMs2 = 0.2; // deadband
let velocityDamping = 0.995; // per frame
let stableStartMs = null;
const stableAccel = 0.12;
const stableRot = 5; // deg/s
const stableTimeMs = 300;

// Orientation state
let deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
let screenOrientationRad = 0;
let qDeviceToWorld = new THREE.Quaternion();
let euler = new THREE.Euler();
const zee = new THREE.Vector3(0, 0, 1);
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2); // -PI/2 around X

function updateQuaternionFromOrientation() {
  const alpha = THREE.MathUtils.degToRad(deviceOrientation.alpha || 0);
  const beta = THREE.MathUtils.degToRad(deviceOrientation.beta || 0);
  const gamma = THREE.MathUtils.degToRad(deviceOrientation.gamma || 0);
  const orient = screenOrientationRad;
  euler.set(beta, alpha, -gamma, 'YXZ');
  qDeviceToWorld.setFromEuler(euler);
  qDeviceToWorld.multiply(q1);
  qDeviceToWorld.multiply(q0.setFromAxisAngle(zee, -orient));
}

function onScreenOrientationChange() {
  const orientation = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  screenOrientationRad = THREE.MathUtils.degToRad(orientation || 0);
  updateQuaternionFromOrientation();
}

window.addEventListener('orientationchange', onScreenOrientationChange);
if (screen.orientation) screen.orientation.addEventListener('change', onScreenOrientationChange);
onScreenOrientationChange();

// Drawing helpers
function beginStroke(color, widthPx) {
  const geometry = new LineGeometry();
  geometry.setPositions([worldPosition.x, worldPosition.y, worldPosition.z, worldPosition.x, worldPosition.y, worldPosition.z]);

  const material = new LineMaterial({
    color: new THREE.Color(color).getHex(),
    linewidth: widthPx, // in pixels
    dashed: false,
    transparent: true,
    opacity: 1.0,
  });
  material.resolution.set(renderer.domElement.width, renderer.domElement.height);

  const line = new Line2(geometry, material);
  line.computeLineDistances();
  scene.add(line);

  currentStroke = { line, geometry, material, points: [worldPosition.clone()] };
  strokes.push(currentStroke);
}

function appendPointToStroke() {
  if (!currentStroke) return;
  const lastPoint = currentStroke.points[currentStroke.points.length - 1];
  if (lastPoint.distanceToSquared(worldPosition) < 0.0004) return; // ~2cm
  currentStroke.points.push(worldPosition.clone());
  const flat = [];
  for (const p of currentStroke.points) { flat.push(p.x, p.y, p.z); }
  currentStroke.geometry.setPositions(flat);
  currentStroke.line.computeLineDistances();
}

function endStroke() {
  currentStroke = null;
}

function clearStrokes() {
  for (const s of strokes) {
    scene.remove(s.line);
    s.geometry.dispose();
    s.material.dispose();
  }
  strokes = [];
  currentStroke = null;
}

// UI wiring
function setDrawActive(active) {
  isDrawing = active;
  ui.drawBtn.textContent = `Draw: ${isDrawing ? 'ON' : 'OFF'}`;
  ui.drawBtn.classList.toggle('active', isDrawing);
  if (isDrawing) {
    beginStroke(ui.color.value, Number(ui.width.value));
  } else {
    endStroke();
  }
}

ui.drawBtn.addEventListener('click', () => setDrawActive(!isDrawing));
ui.clearBtn.addEventListener('click', () => clearStrokes());
ui.recenterBtn.addEventListener('click', () => {
  worldPosition.set(0, 1.0, 0);
  worldVelocity.set(0, 0, 0);
});

// Permission flow
async function requestMotionPermission() {
  try {
    logPerm('Requesting permission...');
    const dm = window.DeviceMotionEvent;
    const doEvt = window.DeviceOrientationEvent;

    let grantedCount = 0;

    if (dm && typeof dm.requestPermission === 'function') {
      try {
        const res1 = await dm.requestPermission();
        logPerm(`DeviceMotion: ${res1}`);
        if (res1 === 'granted') grantedCount++;
      } catch (e) {
        logPerm('DeviceMotion request failed.');
      }
    }

    if (doEvt && typeof doEvt.requestPermission === 'function') {
      try {
        const res2 = await doEvt.requestPermission();
        logPerm(`DeviceOrientation: ${res2}`);
        if (res2 === 'granted') grantedCount++;
      } catch (e) {
        logPerm('DeviceOrientation request failed.');
      }
    }

    // Fallback: some browsers expose events without requestPermission
    if (!dm || typeof dm.requestPermission !== 'function') {
      logPerm('No requestPermission API for DeviceMotion; enabling sensors directly.');
      grantedCount++;
    }
    if (!doEvt || typeof doEvt.requestPermission !== 'function') {
      logPerm('No requestPermission API for DeviceOrientation; enabling sensors directly.');
      grantedCount++;
    }

    if (grantedCount > 0) {
      enableSensors();
      hideOverlay();
    } else {
      logPerm('Permission not granted. Try again, or use Desktop Simulation.');
      alert('Motion permission was not granted. You can use Desktop Simulation.');
    }
  } catch (err) {
    console.error(err);
    logPerm('Unexpected error requesting permission.');
    alert('Motion permission error. You can use Desktop Simulation instead.');
  }
}

function hideOverlay() { ui.overlay.style.display = 'none'; }

function logPerm(msg) {
  console.log('[perm]', msg);
  if (ui.permStatus) ui.permStatus.textContent = msg;
}

for (const b of ui.permissionButtons) b.addEventListener('click', requestMotionPermission);

// Desktop simulation
let desktopMode = false;
let desktopVelocity = new THREE.Vector3();
let desktopSpeed = 1.5; // m/s
const keys = new Set();
for (const b of ui.desktopButtons) b.addEventListener('click', () => {
  desktopMode = true;
  hideOverlay();
});

window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === 'd') setDrawActive(!isDrawing);
  if (e.key.toLowerCase() === 'c') clearStrokes();
  if (e.key.toLowerCase() === 'x') {
    worldPosition.set(0, 1.0, 0);
    worldVelocity.set(0, 0, 0);
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

// Sensors
let latestAccelIncludingGravity = new THREE.Vector3(); // device frame
let latestRotationRate = { alpha: 0, beta: 0, gamma: 0 };

function enableSensors() {
  window.addEventListener('deviceorientation', (e) => {
    deviceOrientation = { alpha: e.alpha || 0, beta: e.beta || 0, gamma: e.gamma || 0 };
    updateQuaternionFromOrientation();
  }, true);

  window.addEventListener('devicemotion', (e) => {
    if (e.accelerationIncludingGravity) {
      latestAccelIncludingGravity.set(
        e.accelerationIncludingGravity.x || 0,
        e.accelerationIncludingGravity.y || 0,
        e.accelerationIncludingGravity.z || 0
      );
    }
    if (e.rotationRate) {
      latestRotationRate = {
        alpha: Math.abs(e.rotationRate.alpha || 0),
        beta: Math.abs(e.rotationRate.beta || 0),
        gamma: Math.abs(e.rotationRate.gamma || 0),
      };
    }
  }, true);
}

// Integration loop
let lastTs = performance.now();
function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min((now - lastTs) / 1000, 0.05); // cap to 50ms
  lastTs = now;

  // Update material resolution for Line2
  for (const s of strokes) {
    s.material.resolution.set(renderer.domElement.width, renderer.domElement.height);
  }

  if (desktopMode) {
    const accel = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0);
    if (keys.has('arrowup') || keys.has('w')) accel.add(forward);
    if (keys.has('arrowdown') || keys.has('s')) accel.add(forward.clone().multiplyScalar(-1));
    if (keys.has('arrowleft') || keys.has('a')) accel.add(right.clone().multiplyScalar(-1));
    if (keys.has('arrowright') || keys.has('d')) accel.add(right);
    if (keys.has('r')) accel.add(up);
    if (keys.has('f')) accel.add(up.clone().multiplyScalar(-1));
    const speed = (keys.has('shift') ? 3.0 : 1.5) * desktopSpeed;
    if (accel.lengthSq() > 0) accel.normalize().multiplyScalar(speed);
    desktopVelocity.lerp(accel, 0.2);
    worldPosition.addScaledVector(desktopVelocity, dt);
  } else {
    // Convert device-frame accelerationIncludingGravity to world frame
    const accWorld = latestAccelIncludingGravity.clone().applyQuaternion(qDeviceToWorld);
    // Subtract gravity
    accWorld.sub(gravityWorld);
    // Deadband
    if (accWorld.length() < accelThresholdMs2) accWorld.set(0, 0, 0);

    // Zero-velocity detection (device stable)
    const rotMag = Math.max(latestRotationRate.alpha, latestRotationRate.beta, latestRotationRate.gamma);
    if (accWorld.length() < stableAccel && rotMag < stableRot) {
      if (stableStartMs == null) stableStartMs = now;
      if (now - stableStartMs > stableTimeMs) {
        worldVelocity.set(0, 0, 0);
      }
    } else {
      stableStartMs = null;
    }

    // Integrate
    worldVelocity.addScaledVector(accWorld, dt);
    worldVelocity.multiplyScalar(velocityDamping);
    worldPosition.addScaledVector(worldVelocity, dt);
  }

  // Pen
  pen.position.copy(worldPosition);

  // Drawing
  if (isDrawing && currentStroke) appendPointToStroke();

  // HUD stats
  const speedMs = worldVelocity.length();
  const distanceM = worldPosition.length();
  ui.speed.textContent = `Speed: ${speedMs.toFixed(2)} m/s`;
  ui.distance.textContent = `Distance: ${distanceM.toFixed(2)} m`;

  controls.update();
  renderer.render(scene, camera);
}

animate();

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

