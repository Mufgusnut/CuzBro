import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, Html, Stars, Text, useGLTF } from '@react-three/drei';
import { XR, createXRStore } from '@react-three/xr';
import { ChevronLeft, X } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Body, Equator, Horizon, Observer } from 'astronomy-engine';
import { useHolodeckPresence } from '../lib/holodeckPresence.js';

const xrStore = createXRStore();

// Runtime-only foreground blockers used by browser-image overlays. Drei Html lives
// above the WebGL canvas, so mission images need a manual camera-to-image test
// for crew bodies in addition to the center control prism.
const HOLODECK_AVATAR_BLOCKERS = new Map();


const SECTION_PRESETS = {
  missions: { position: [-4.45, 1.72, -1.2], lookAt: [-7.75, 2.18, -1.2] },
  sky: { position: [0, 1.5, 1.45], lookAt: [0, 5.15, 0] },
  comms: { position: [0.95, 1.72, 4.15], lookAt: [3.35, 2.2, 0.25] },
  systems: { position: [3.45, 1.72, 0.95], lookAt: [6.55, 2.28, 3.85] },
};

const SECTION_COLORS = {
  missions: '#2bc6ef',
  sky: '#8f78ff',
  comms: '#39f2b2',
  systems: '#ffb75c',
};

const CREW_SPAWNS = {
  dave: [-2.7, 1.72, 4.0],
  justin: [2.7, 1.72, 4.0],
  chappy: [0, 1.72, -4.15],
  unknown: [0, 1.72, 8.6],
};

function getCrewSpawn(crewKey) {
  return CREW_SPAWNS[crewKey] || CREW_SPAWNS.unknown;
}

const HOLODECK_FUTURE_TARGETS = [
  { title: 'Pillars of Creation', shortTitle: 'M16', objectType: 'Emission Nebula', ra: 18.313, dec: -13.781 },
  { title: 'Cat’s Eye Nebula', shortTitle: 'NGC 6543', objectType: 'Planetary Nebula', ra: 17.972, dec: 66.633 },
  { title: 'North America Nebula', shortTitle: 'NGC 7000', objectType: 'Emission Nebula', ra: 20.973, dec: 44.317 },
  { title: 'Veil Nebula', shortTitle: 'Veil', objectType: 'Supernova Remnant', ra: 20.755, dec: 30.75 },
  { title: 'M31 Andromeda Galaxy', shortTitle: 'M31', objectType: 'Galaxy', ra: 0.712, dec: 41.269 },
  { title: 'Double Cluster', shortTitle: 'Double Cluster', objectType: 'Open Cluster', ra: 2.333, dec: 57.133 },
];

const SKY_FALLBACK_COORDS = {
  'M13': { ra: 16.6949, dec: 36.4602 },
  'M51': { ra: 13.497, dec: 47.195 },
  'Whirlpool Galaxy': { ra: 13.497, dec: 47.195 },
  'M57': { ra: 18.893, dec: 33.03 },
  'Ring Nebula': { ra: 18.893, dec: 33.03 },
  'M27': { ra: 19.997, dec: 22.721 },
  'Dumbbell Nebula': { ra: 19.997, dec: 22.721 },
  'Albireo': { ra: 19.512, dec: 27.96 },
  'Moon': { ra: 8.0, dec: 12.0 },
};

function getSkyCoords(target) {
  if (!target) return null;
  const rawRa = Number(target.ra);
  const rawDec = Number(target.dec);
  if (Number.isFinite(rawRa) && Number.isFinite(rawDec)) {
    return { ra: rawRa, dec: rawDec };
  }
  return SKY_FALLBACK_COORDS[target.title] || SKY_FALLBACK_COORDS[target.shortTitle] || null;
}

function projectSkyPoint(ra, dec, radius = 7.2) {
  const safeRa = Number.isFinite(ra) ? ra : 0;
  const safeDec = Number.isFinite(dec) ? dec : 0;
  const angle = (safeRa / 24) * Math.PI * 2 - Math.PI / 2;
  const radial = THREE.MathUtils.clamp((90 - safeDec) / 180, 0.08, 0.96) * radius;
  return { x: Math.cos(angle) * radial, z: Math.sin(angle) * radial };
}

function createCeilingPath(points, y = -0.018) {
  const values = [];
  points.forEach((point) => values.push(point[0], y, point[1]));
  return new Float32Array(values);
}

const ELIOT_OBSERVER = new Observer(43.1531, -70.7828, 25);

const CURRENT_SKY_BODIES = [
  ['MERCURY', Body.Mercury, '#d6c7a8'],
  ['VENUS', Body.Venus, '#fff0b4'],
  ['MARS', Body.Mars, '#ff8b63'],
  ['JUPITER', Body.Jupiter, '#ffd0a0'],
  ['SATURN', Body.Saturn, '#f4dfa4'],
  ['URANUS', Body.Uranus, '#8ee8ff'],
  ['NEPTUNE', Body.Neptune, '#7898ff'],
  ['MOON', Body.Moon, '#e9f7ff'],
];

const CEILING_STAR_CATALOG = [
  { id: 'polaris', name: 'Polaris', ra: 2.5303, dec: 89.2641, major: true },
  { id: 'deneb', name: 'Deneb', ra: 20.6905, dec: 45.2803, major: true },
  { id: 'sadr', name: 'Sadr', ra: 20.3705, dec: 40.2567, major: false },
  { id: 'albireo', name: 'Albireo', ra: 19.512, dec: 27.96, major: false },
  { id: 'vega', name: 'Vega', ra: 18.6156, dec: 38.7837, major: true },
  { id: 'altair', name: 'Altair', ra: 19.8464, dec: 8.8683, major: true },
  { id: 'caph', name: 'Caph', ra: 0.1529, dec: 59.1498, major: false },
  { id: 'schedar', name: 'Schedar', ra: 0.6751, dec: 56.5373, major: false },
  { id: 'navi', name: 'Navi', ra: 0.9451, dec: 60.7167, major: false },
  { id: 'ruchbah', name: 'Ruchbah', ra: 1.4303, dec: 60.2353, major: false },
];

const CEILING_CONSTELLATION_SEGMENTS = [
  ['deneb', 'sadr'],
  ['sadr', 'albireo'],
  ['vega', 'deneb'],
  ['altair', 'vega'],
  ['altair', 'deneb'],
  ['caph', 'schedar'],
  ['schedar', 'navi'],
  ['navi', 'ruchbah'],
];

function projectAltAzPoint(azimuth, altitude, radius = 7.1) {
  const safeAlt = Number.isFinite(altitude) ? altitude : -90;
  const safeAz = Number.isFinite(azimuth) ? azimuth : 0;
  const radial = THREE.MathUtils.clamp((90 - safeAlt) / 90, 0.02, 1.04) * radius;
  const angle = THREE.MathUtils.degToRad(safeAz);
  return {
    x: Math.sin(angle) * radial,
    z: -Math.cos(angle) * radial,
    visible: safeAlt > 0,
  };
}

function getHorizontalProjection(date, ra, dec, radius = 7.0) {
  try {
    const horizon = Horizon(date, ELIOT_OBSERVER, ra, dec, 'normal');
    return {
      ra,
      dec,
      azimuth: horizon.azimuth,
      altitude: horizon.altitude,
      ...projectAltAzPoint(horizon.azimuth, horizon.altitude, radius),
    };
  } catch (error) {
    return null;
  }
}

function buildProjectedPathFromRaDec(date, sampler, steps = 48, radius = 7.0, minAltitude = -4) {
  const values = [];
  for (let index = 0; index <= steps; index += 1) {
    const { ra, dec } = sampler(index / steps);
    const projection = getHorizontalProjection(date, ra, dec, radius);
    if (!projection || projection.altitude < minAltitude) continue;
    values.push(projection.x, -0.016, projection.z);
  }
  return new Float32Array(values);
}

function getCurrentSkyBodies(date) {
  return CURRENT_SKY_BODIES.map(([name, body, color]) => {
    try {
      const equator = Equator(body, date, ELIOT_OBSERVER, true, true);
      const projection = getHorizontalProjection(date, equator.ra, equator.dec, 7.0);
      if (!projection || projection.altitude <= 0) return null;
      return { name, color, body, ...projection };
    } catch (error) {
      console.debug(`Holodeck sky position unavailable for ${name}:`, error);
      return null;
    }
  }).filter(Boolean);
}

function formatSkySnapshotLabel(date) {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).toUpperCase();
}

function getMissionImage(mission) {
  return mission?.image || mission?.stackedImage || mission?.rawImage || '';
}

function getImageUrl(image) {
  if (!image) return '';
  if (/^(https?:|blob:|data:)/.test(image)) return image;
  return `${import.meta.env.BASE_URL}${String(image).replace(/^\/+/, '')}`;
}

function FloatingLabel({ position = [0, 0, 0], fontSize = 0.06, color = '#f4ffff', anchorX = 'center', anchorY = 'middle', maxWidth, children }) {
  return (
    <Billboard follow position={position}>
      <Text fontSize={fontSize} color={color} anchorX={anchorX} anchorY={anchorY} maxWidth={maxWidth}>
        {children}
      </Text>
    </Billboard>
  );
}

function PillarOccludedHtml({ position, distanceFactor, children, style = {} }) {
  const anchorRef = useRef();
  const { camera } = useThree();
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  const targetWorld = useRef(new THREE.Vector3());

  useFrame(() => {
    if (!anchorRef.current) return;

    anchorRef.current.getWorldPosition(targetWorld.current);
    const target = targetWorld.current;
    const camX = camera.position.x;
    const camY = camera.position.y;
    const camZ = camera.position.z;
    const dx = target.x - camX;
    const dy = target.y - camY;
    const dz = target.z - camZ;
    const horizontalLengthSq = dx * dx + dz * dz;

    let blocked = false;
    if (horizontalLengthSq > 0.0001) {
      const rawT = -((camX * dx) + (camZ * dz)) / horizontalLengthSq;
      const t = THREE.MathUtils.clamp(rawT, 0, 1);
      const closestX = camX + dx * t;
      const closestZ = camZ + dz * t;
      const closestY = camY + dy * t;
      const distanceFromPillar = Math.hypot(closestX, closestZ);

      blocked = rawT > 0.02
        && rawT < 0.98
        && distanceFromPillar < 1.34
        && closestY > 0.12
        && closestY < 3.38;

      if (!blocked) {
        for (const blocker of HOLODECK_AVATAR_BLOCKERS.values()) {
          const bx = Number(blocker?.x) || 0;
          const bz = Number(blocker?.z) || 0;
          const radius = Number(blocker?.radius) || 0.52;
          const minY = Number(blocker?.minY) || 0.38;
          const maxY = Number(blocker?.maxY) || 2.55;
          const blockerT = (((bx - camX) * dx) + ((bz - camZ) * dz)) / horizontalLengthSq;

          if (blockerT <= 0.02 || blockerT >= 0.98) continue;

          const lineX = camX + dx * blockerT;
          const lineZ = camZ + dz * blockerT;
          const lineY = camY + dy * blockerT;
          const horizontalDistance = Math.hypot(lineX - bx, lineZ - bz);

          if (horizontalDistance < radius && lineY > minY && lineY < maxY) {
            blocked = true;
            break;
          }
        }
      }
    }

    if (blocked !== hiddenRef.current) {
      hiddenRef.current = blocked;
      setHidden(blocked);
    }
  });

  return (
    <group ref={anchorRef} position={position}>
      <Html
        transform
        distanceFactor={distanceFactor}
        occlude={false}
        style={{
          ...style,
          pointerEvents: 'none',
          visibility: hidden ? 'hidden' : 'visible',
        }}
      >
        {children}
      </Html>
    </group>
  );
}

function CameraRig({ enabled, focusRequest, onFocusComplete, initialPosition, onPose, viewMode, localPoseRef }) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set());
  const yaw = useRef(0);
  const pitch = useRef(-0.02);
  const dragging = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  const activeFocus = useRef(null);
  const focusProgress = useRef(0);
  const startPosition = useRef(new THREE.Vector3());
  const startQuaternion = useRef(new THREE.Quaternion());
  const targetQuaternion = useRef(new THREE.Quaternion());
  const playerPosition = useRef(new THREE.Vector3());
  const lastPoseEmitAt = useRef(0);
  const initialized = useRef(false);
  const previousViewMode = useRef(viewMode);

  useEffect(() => {
    const spawn = initialPosition || [0, 1.72, 8.6];
    playerPosition.current.set(spawn[0], 0, spawn[2]);
    camera.position.set(spawn[0], spawn[1], spawn[2]);
    initialized.current = true;

    const dom = gl.domElement;
    const onKeyDown = (event) => keys.current.add(event.code);
    const onKeyUp = (event) => keys.current.delete(event.code);
    const onPointerDown = (event) => {
      if (!enabled || event.button !== 0) return;
      dragging.current = true;
      activeFocus.current = null;
      lastPoint.current = { x: event.clientX, y: event.clientY };
    };
    const onPointerMove = (event) => {
      if (!dragging.current || !enabled) return;
      const dx = event.clientX - lastPoint.current.x;
      const dy = event.clientY - lastPoint.current.y;
      lastPoint.current = { x: event.clientX, y: event.clientY };
      yaw.current -= dx * 0.004;
      pitch.current = THREE.MathUtils.clamp(pitch.current - dy * 0.003, -0.78, 0.72);
    };
    const onPointerUp = () => { dragging.current = false; };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
    };
  }, [camera, enabled, gl, initialPosition]);

  useEffect(() => {
    if (!focusRequest?.key || !focusRequest?.preset) return;
    activeFocus.current = focusRequest.key;
    focusProgress.current = 0;
    startPosition.current.copy(camera.position);
    startQuaternion.current.copy(camera.quaternion);
    const targetCamera = camera.clone();
    targetCamera.position.copy(new THREE.Vector3(...focusRequest.preset.position));
    targetCamera.lookAt(new THREE.Vector3(...focusRequest.preset.lookAt));
    targetQuaternion.current.copy(targetCamera.quaternion);
  }, [camera, focusRequest]);

  useFrame((state, delta) => {
    if (!enabled || !initialized.current) return;

    if (previousViewMode.current !== viewMode) {
      previousViewMode.current = viewMode;
      activeFocus.current = null;
    }

    if (activeFocus.current && focusRequest?.preset) {
      focusProgress.current = Math.min(1, focusProgress.current + delta / 0.72);
      const eased = 1 - Math.pow(1 - focusProgress.current, 3);
      camera.position.lerpVectors(startPosition.current, new THREE.Vector3(...focusRequest.preset.position), eased);
      camera.quaternion.slerpQuaternions(startQuaternion.current, targetQuaternion.current, eased);
      if (focusProgress.current >= 1) {
        const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        yaw.current = euler.y;
        pitch.current = euler.x;
        playerPosition.current.set(camera.position.x, 0, camera.position.z);
        activeFocus.current = null;
        onFocusComplete?.();
      }
      return;
    }

    const flatForward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current)).normalize();
    const right = new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current)).normalize();
    const speed = 4.25 * delta;

    const moving =
      keys.current.has('KeyW') || keys.current.has('ArrowUp') ||
      keys.current.has('KeyS') || keys.current.has('ArrowDown') ||
      keys.current.has('KeyA') || keys.current.has('ArrowLeft') ||
      keys.current.has('KeyD') || keys.current.has('ArrowRight');
    if (moving) activeFocus.current = null;

    const movement = new THREE.Vector3();
    if (keys.current.has('KeyW') || keys.current.has('ArrowUp')) movement.addScaledVector(flatForward, speed);
    if (keys.current.has('KeyS') || keys.current.has('ArrowDown')) movement.addScaledVector(flatForward, -speed);
    if (keys.current.has('KeyA') || keys.current.has('ArrowLeft')) movement.addScaledVector(right, -speed);
    if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) movement.addScaledVector(right, speed);

    if (movement.lengthSq() > 0) {
      const next = playerPosition.current.clone().add(movement);
      const centerDistance = Math.hypot(next.x, next.z);
      const controlBoundary = 1.28;
      if (centerDistance < controlBoundary) {
        const normal = new THREE.Vector2(next.x || playerPosition.current.x || 1, next.z || playerPosition.current.z);
        normal.normalize().multiplyScalar(controlBoundary);
        next.x = normal.x;
        next.z = normal.y;
      }
      next.x = THREE.MathUtils.clamp(next.x, -8.5, 8.5);
      next.z = THREE.MathUtils.clamp(next.z, -8.5, 8.5);
      playerPosition.current.copy(next);
    }

    camera.rotation.order = 'YXZ';
    if (viewMode === 'third') {
      const target = new THREE.Vector3(playerPosition.current.x, 1.35, playerPosition.current.z);
      const horizontalDistance = 3.25;
      const cameraHeight = 1.25 + Math.sin(pitch.current) * 1.65;
      const desired = target.clone()
        .addScaledVector(flatForward, -horizontalDistance * Math.cos(pitch.current))
        .add(new THREE.Vector3(0, cameraHeight, 0));
      camera.position.lerp(desired, 1 - Math.exp(-delta * 12));
      camera.lookAt(target.clone().addScaledVector(flatForward, 0.65));
    } else {
      camera.position.set(playerPosition.current.x, 1.72, playerPosition.current.z);
      camera.rotation.y = yaw.current;
      camera.rotation.x = pitch.current;
    }

    const pose = {
      position: { x: playerPosition.current.x, y: 0, z: playerPosition.current.z },
      rotation: { yaw: yaw.current, pitch: pitch.current },
      moving,
      viewMode,
    };
    if (localPoseRef) localPoseRef.current = pose;

    if (state.clock.elapsedTime - lastPoseEmitAt.current >= 0.08) {
      lastPoseEmitAt.current = state.clock.elapsedTime;
      onPose?.({
        position: { x: playerPosition.current.x, y: 1.72, z: playerPosition.current.z },
        rotation: { yaw: yaw.current, pitch: pitch.current },
      });
    }
  });

  return null;
}

function RingLight({ radius, y = 0.03, opacity = 0.32, color = '#61dff4' }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <ringGeometry args={[radius - 0.025, radius + 0.025, 96]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
}

function LcarsRoundedBlock({ width = 0.7, height = 0.14, color = '#7fbbe8', opacity = 1 }) {
  const bodyWidth = Math.max(width - height, 0.02);
  const radius = height / 2;
  return (
    <group>
      <mesh position={[-bodyWidth / 2, 0, 0]}>
        <circleGeometry args={[radius, 28]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
      <mesh position={[bodyWidth / 2, 0, 0]}>
        <circleGeometry args={[radius, 28]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
      <mesh>
        <planeGeometry args={[bodyWidth, height]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
    </group>
  );
}

function LcarsButton({ label, color, selected, width = 0.86, height = 0.15, position = [0, 0, 0], onClick }) {
  const fill = selected ? '#efe3b6' : color;
  const labelColor = selected ? '#151312' : '#101214';
  return (
    <group
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      <LcarsRoundedBlock width={width} height={height} color={fill} opacity={1} />
      <mesh position={[0, 0, 0.004]}>
        <planeGeometry args={[Math.max(width - 0.14, 0.12), Math.max(height - 0.05, 0.03)]} />
        <meshBasicMaterial color={selected ? '#fff6da' : '#f3dfc6'} transparent opacity={selected ? 0.16 : 0.08} depthWrite={false} />
      </mesh>
      <Text position={[0, 0, 0.01]} fontSize={height * 0.34} color={labelColor} anchorX="center" anchorY="middle" letterSpacing={0.06}>
        {label}
      </Text>
    </group>
  );
}

function LcarsMiniButton({ label, color, selected, width = 0.36, position = [0, 0, 0], onClick }) {
  return (
    <LcarsButton
      label={label}
      color={color}
      selected={selected}
      width={width}
      height={0.11}
      position={position}
      onClick={onClick}
    />
  );
}

function LcarsReadout({ label, value, position = [0, 0, 0], width = 0.96, color = '#6ca1d8' }) {
  return (
    <group position={position}>
      <LcarsRoundedBlock width={width} height={0.12} color={color} opacity={0.96} />
      <Text position={[-width * 0.34, 0, 0.008]} fontSize={0.04} color="#121314" anchorX="left" anchorY="middle" letterSpacing={0.05}>
        {label}
      </Text>
      <Text position={[width * 0.36, 0, 0.008]} fontSize={0.04} color="#121314" anchorX="right" anchorY="middle" letterSpacing={0.05}>
        {value}
      </Text>
    </group>
  );
}

function ControlPillar({ openFace, activeSection, selectedMission, skySnapshot, activeCrewKey, onFaceToggle, onSectionSelect, onSkyTimeChange }) {
  const crewAccent = {
    dave: '#87cfff',
    justin: '#ffb75c',
    chappy: '#ba92ff',
  }[activeCrewKey] || '#87cfff';

  const currentCrewLabel = activeCrewKey ? activeCrewKey.toUpperCase() : 'CREW';
  const skyControls = [
    { label: 'MID', action: 'midnight', color: '#c5b647' },
    { label: '-1H', action: '-1h', color: '#7bc7ea' },
    { label: 'NOW', action: 'now', color: '#e87513' },
    { label: '+1H', action: '+1h', color: '#4b87ee' },
  ];
  const skyTimeLabel = useMemo(() => formatSkySnapshotLabel(skySnapshot), [skySnapshot]);
  const missionLabel = selectedMission?.shortTitle || selectedMission?.title || 'NONE';
  const sectionLabel = {
    missions: 'MISSIONS',
    sky: 'SKY MAP',
    comms: 'CREW COMMS',
    systems: 'LIVE SYSTEMS',
  }[activeSection] || 'MISSIONS';

  return (
    <group>
      <mesh position={[0, 0.11, 0]}>
        <cylinderGeometry args={[0.7, 0.8, 0.16, 32]} />
        <meshStandardMaterial color="#0f1117" metalness={0.55} roughness={0.5} emissive="#253448" emissiveIntensity={0.32} />
      </mesh>
      <mesh position={[0, 0.74, 0]}>
        <boxGeometry args={[0.42, 1.12, 0.42]} />
        <meshStandardMaterial color="#1b1e27" metalness={0.7} roughness={0.28} emissive="#304153" emissiveIntensity={0.24} />
      </mesh>
      <mesh position={[0, 1.12, 0.36]} rotation={[-0.28, 0, 0]}>
        <boxGeometry args={[2.35, 3.05, 0.14]} />
        <meshStandardMaterial color="#10121a" metalness={0.78} roughness={0.2} emissive="#1d2d3f" emissiveIntensity={0.34} />
      </mesh>
      <mesh position={[0, 1.12, 0.44]} rotation={[-0.28, 0, 0]}>
        <planeGeometry args={[2.18, 2.88]} />
        <meshBasicMaterial color="#06090f" transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <mesh position={[0, 2.28, 0.46]} rotation={[-0.28, 0, 0]}>
        <planeGeometry args={[2.06, 0.18]} />
        <meshBasicMaterial color="#2d3954" transparent opacity={0.88} depthWrite={false} />
      </mesh>
      <mesh position={[-0.82, 1.1, 0.465]} rotation={[-0.28, 0, 0]}>
        <planeGeometry args={[0.14, 2.66]} />
        <meshBasicMaterial color="#4c85e8" transparent opacity={0.96} depthWrite={false} />
      </mesh>
      <mesh position={[0.89, 1.1, 0.465]} rotation={[-0.28, 0, 0]}>
        <planeGeometry args={[0.11, 2.66]} />
        <meshBasicMaterial color="#accbe2" transparent opacity={0.9} depthWrite={false} />
      </mesh>

      <group position={[0, 1.12, 0.485]} rotation={[-0.28, 0, 0]}>
        <LcarsButton label="HOLODECK CONTROL" color="#4b87ee" selected width={1.14} height={0.16} position={[-0.38, 1.16, 0]} />
        <LcarsButton label={`CREW // ${currentCrewLabel}`} color={crewAccent} width={0.82} height={0.16} position={[0.67, 1.16, 0]} />

        <mesh position={[-0.48, 0.91, 0]}>
          <planeGeometry args={[1.24, 0.26]} />
          <meshBasicMaterial color="#120f18" transparent opacity={0.96} />
        </mesh>
        <Text position={[-0.99, 0.97, 0.01]} fontSize={0.045} color="#79b8ff" anchorX="left" anchorY="middle" letterSpacing={0.04}>
          TACTICAL ARRAY
        </Text>
        <Text position={[-0.99, 0.86, 0.01]} fontSize={0.07} color="#ffcf68" anchorX="left" anchorY="middle" letterSpacing={0.08}>
          {missionLabel}
        </Text>
        <Text position={[-0.1, 0.86, 0.01]} fontSize={0.038} color="#79b8ff" anchorX="right" anchorY="middle" letterSpacing={0.04}>
          ACTIVE TARGET
        </Text>

        <LcarsReadout label="SECTION" value={sectionLabel} position={[0.53, 0.9, 0]} width={0.96} color="#7cc7ec" />
        <LcarsReadout label="TIME" value={skyTimeLabel} position={[0.53, 0.72, 0]} width={0.96} color="#5f8ecf" />

        <LcarsButton label="MISSIONS" color="#7cc7ec" selected={activeSection === 'missions'} width={1.1} position={[-0.45, 0.55, 0]} onClick={() => onSectionSelect('missions')} />
        <LcarsButton label="SKY MAP" color="#4b87ee" selected={activeSection === 'sky'} width={1.1} position={[-0.45, 0.34, 0]} onClick={() => onSectionSelect('sky')} />
        <LcarsButton label="CREW COMMS" color="#accbe2" selected={activeSection === 'comms'} width={1.1} position={[-0.45, 0.13, 0]} onClick={() => onSectionSelect('comms')} />
        <LcarsButton label="LIVE SYSTEMS" color="#e87513" selected={activeSection === 'systems'} width={1.1} position={[-0.45, -0.08, 0]} onClick={() => onSectionSelect('systems')} />

        <LcarsReadout label="OBS SITE" value="ELIOT, ME" position={[0.49, 0.44, 0]} width={1.03} color="#b1a43d" />
        <LcarsReadout label="STATUS" value="ONLINE" position={[0.49, 0.26, 0]} width={1.03} color="#677f8f" />
        <LcarsReadout label="HOLODECK" value="READY" position={[0.49, 0.08, 0]} width={1.03} color="#4b87ee" />
        <LcarsReadout label="FOCUS" value={sectionLabel} position={[0.49, -0.1, 0]} width={1.03} color="#7cc7ec" />

        <LcarsButton label="SELECT MODE" color="#e7d39f" width={0.56} height={0.14} position={[-0.72, -0.38, 0]} />
        <LcarsButton label="INITIATE" color="#e87513" width={0.48} height={0.14} position={[-0.05, -0.38, 0]} />
        <LcarsButton label="LCARS" color="#4b87ee" width={0.33} height={0.14} position={[0.52, -0.38, 0]} />
        <LcarsButton label="OPS" color="#b1a43d" width={0.28} height={0.14} position={[0.89, -0.38, 0]} />

        {activeSection === 'sky' && (
          <>
            <Text position={[-0.98, -0.61, 0.01]} fontSize={0.04} color="#79b8ff" anchorX="left" anchorY="middle" letterSpacing={0.05}>
              SKY SNAPSHOT CONTROLS
            </Text>
            {skyControls.map((control, index) => (
              <LcarsMiniButton
                key={control.action}
                label={control.label}
                color={control.color}
                selected={control.action === 'now'}
                width={index === 0 ? 0.36 : 0.28}
                position={[-0.74 + index * 0.36, -0.79, 0]}
                onClick={() => onSkyTimeChange(control.action)}
              />
            ))}
            <LcarsReadout label="SNAPSHOT" value={skyTimeLabel} position={[0.45, -0.79, 0]} width={1.1} color="#7cc7ec" />
          </>
        )}
      </group>

      <pointLight position={[0, 2.15, 1.1]} color={crewAccent} intensity={4.2} distance={6.8} />
      <pointLight position={[0, 1.65, 1.1]} color="#87cfff" intensity={2.4} distance={4.6} />
      {selectedMission && (
        <FloatingLabel position={[0, 3.36, 0]} fontSize={0.11} color="#8feaff">
          {selectedMission.title}
        </FloatingLabel>
      )}
    </group>
  );
}

function MissionWall({ gallery, selectedMission, onMissionSelect, onOpenCapture, captureOpen, previewUrl }) {
  const missions = gallery.slice(0, 8);
  return (
    <group position={[-7.75, 2.18, -1.2]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[6.9, 4.9, 0.18]} />
        <meshStandardMaterial color="#07131c" emissive="#082634" emissiveIntensity={0.65} metalness={0.48} roughness={0.42} />
      </mesh>
      <Text position={[0, 2.03, 0]} fontSize={0.27} color="#ffb75c">MISSION ARCHIVE</Text>
      <Text position={[0, 1.7, 0]} fontSize={0.095} color="#70bfd2">SELECT A RECORD // PROJECT ARCHIVED IMAGE</Text>
      {missions.map((mission, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const x = col === 0 ? -1.62 : 1.62;
        const y = 1.13 - row * 0.76;
        const active = selectedMission?.id === mission.id;
        return (
          <group key={mission.id || mission.title} position={[x, y, 0.03]} onClick={(event) => { event.stopPropagation(); onMissionSelect(mission); }}>
            <mesh>
              <planeGeometry args={[2.82, 0.56]} />
              <meshBasicMaterial color={active ? '#164c61' : '#0d2430'} transparent opacity={0.94} />
            </mesh>
            <Text position={[-1.16, 0.08, 0.02]} fontSize={0.15} color="#e9fbff" anchorX="left">{mission.title || 'UNTITLED'}</Text>
            <Text position={[-1.16, -0.14, 0.02]} fontSize={0.075} color="#79cfe5" anchorX="left">{mission.objectType || mission.category || 'MISSION CAPTURE'}</Text>
            {active && <mesh position={[1.17, 0, 0.025]}><circleGeometry args={[0.055, 24]} /><meshBasicMaterial color="#ffb75c" /></mesh>}
          </group>
        );
      })}

      {selectedMission && (
        <group position={[0, -1.92, 0.035]} onClick={(event) => { event.stopPropagation(); onOpenCapture(); }}>
          <mesh>
            <planeGeometry args={[2.75, 0.48]} />
            <meshStandardMaterial color={captureOpen ? '#3d2e10' : '#123a4a'} emissive={captureOpen ? '#ffb75c' : '#46ddff'} emissiveIntensity={0.85} />
          </mesh>
          <Text position={[0, 0, 0.025]} fontSize={0.11} color="#f4ffff" anchorX="center">
            {captureOpen ? 'CLOSE ARCHIVED CAPTURE' : 'OPEN ARCHIVED CAPTURE'}
          </Text>
        </group>
      )}

      {selectedMission && previewUrl && (
        <PillarOccludedHtml position={[0, -0.35, 0.08]} distanceFactor={1.15}>
          <div style={{ width: '300px', height: '170px', border: '1px solid rgba(132,223,241,.26)', background: 'rgba(2,7,13,.92)', boxShadow: '0 0 25px rgba(70,221,255,.12)', overflow: 'hidden' }}>
            <img src={previewUrl} alt={selectedMission?.title || 'Mission preview'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        </PillarOccludedHtml>
      )}
    </group>
  );
}

function MissionDetailPanel({ mission, gallery, captureOpen, activeSection, previewUrl, onOpenCapture, onMissionSelect }) {
  if (!mission || activeSection !== 'missions') return null;
  const lines = [
    mission.objectType || mission.category || 'MISSION CAPTURE',
    mission.date ? `CAPTURED // ${mission.date}` : 'CUZBRO MISSION ARCHIVE',
    mission.equipment || mission.telescope || 'CPC 800 // PRIMARY OBSERVATION PLATFORM',
  ];
  const missions = gallery || [];
  const currentIndex = Math.max(0, missions.findIndex((item) => item.id === mission.id || item.title === mission.title));
  const cycleMission = (direction) => {
    if (!missions.length) return;
    const nextIndex = (currentIndex + direction + missions.length) % missions.length;
    onMissionSelect?.(missions[nextIndex]);
  };
  return (
    <group position={[-4.95, 1.95, -7.92]}>
      <mesh>
        <planeGeometry args={[3.8, 2.35]} />
        <meshBasicMaterial color="#06131c" transparent opacity={0.92} />
      </mesh>
      <group position={[-1.68, 0.76, 0.03]} onClick={(event) => { event.stopPropagation(); cycleMission(-1); }}>
        <mesh>
          <circleGeometry args={[0.18, 36]} />
          <meshStandardMaterial color="#0d2631" emissive="#46ddff" emissiveIntensity={0.6} metalness={0.55} roughness={0.25} />
        </mesh>
        <Text position={[0, 0, 0.015]} fontSize={0.17} color="#eaffff" anchorX="center" anchorY="middle">‹</Text>
      </group>
      <Text position={[-1.28, 0.75, 0.02]} fontSize={0.22} color="#eaffff" anchorX="left" maxWidth={2.25}>{mission.title || 'MISSION CAPTURE'}</Text>
      <group position={[1.58, 0.76, 0.03]} onClick={(event) => { event.stopPropagation(); cycleMission(1); }}>
        <mesh>
          <circleGeometry args={[0.18, 36]} />
          <meshStandardMaterial color="#0d2631" emissive="#46ddff" emissiveIntensity={0.6} metalness={0.55} roughness={0.25} />
        </mesh>
        <Text position={[0, 0, 0.015]} fontSize={0.17} color="#eaffff" anchorX="center" anchorY="middle">›</Text>
      </group>
      <Text position={[1.46, 0.48, 0.02]} fontSize={0.065} color="#6f9aa5" anchorX="right">{currentIndex + 1} / {missions.length}</Text>
      {lines.map((line, index) => (
        <Text key={`${line}-${index}`} position={[-1.55, 0.34 - index * 0.34, 0.02]} fontSize={0.105} color={index === 0 ? '#63dff5' : '#90b9c3'} anchorX="left">
          {String(line).toUpperCase()}
        </Text>
      ))}
      <Text position={[-1.55, -0.93, 0.02]} fontSize={0.09} color={captureOpen ? '#ffb75c' : '#6f9aa5'} anchorX="left">
        {captureOpen ? 'ARCHIVED CAPTURE PROJECTED // DEEP SKY WINDOW' : 'ARCHIVE RECORD SELECTED // CAPTURE CLOSED'}
      </Text>
      <group position={[0.75, -0.64, 0.02]} onClick={(event) => { event.stopPropagation(); onOpenCapture(); }}>
        <mesh>
          <planeGeometry args={[1.25, 0.32]} />
          <meshBasicMaterial color={captureOpen ? '#50340d' : '#113645'} />
        </mesh>
        <Text position={[0, 0, 0.01]} fontSize={0.075} color="#f4ffff" anchorX="center" anchorY="middle">
          {captureOpen ? 'CLOSE CAPTURE' : 'OPEN CAPTURE'}
        </Text>
      </group>
      {previewUrl && (
        <PillarOccludedHtml position={[0.72, 0.28, 0.03]} distanceFactor={1.2}>
          <div style={{ width: '170px', height: '110px', border: '1px solid rgba(132,223,241,.24)', background: 'rgba(2,7,13,.92)', overflow: 'hidden' }}>
            <img src={previewUrl} alt={mission?.title || 'Mission preview'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        </PillarOccludedHtml>
      )}
    </group>
  );
}

function DeepSkyWindow({ gallery, selectedMission, captureOpen, activeSection, onMissionSelect }) {
  const imageUrl = getImageUrl(getMissionImage(selectedMission));
  const missions = gallery || [];
  const currentIndex = Math.max(0, missions.findIndex((item) => item.id === selectedMission?.id || item.title === selectedMission?.title));
  const cycleMission = (direction) => {
    if (!missions.length) return;
    const nextIndex = (currentIndex + direction + missions.length) % missions.length;
    onMissionSelect?.(missions[nextIndex]);
  };

  return (
    <group position={[0, 3.8, -8.42]}>
      <mesh position={[0, 0, -0.05]}>
        <planeGeometry args={[9, 4.8]} />
        <meshBasicMaterial color="#08131d" />
      </mesh>
      <mesh>
        <planeGeometry args={[8.6, 4.4]} />
        <meshBasicMaterial color="#02070d" />
      </mesh>

      {(captureOpen || activeSection === 'missions') && missions.length > 1 && (
        <>
          <group position={[-4.95, 0, 0.08]} onClick={(event) => { event.stopPropagation(); cycleMission(-1); }}>
            <mesh>
              <circleGeometry args={[0.24, 40]} />
              <meshStandardMaterial color="#0d2631" emissive="#46ddff" emissiveIntensity={0.68} metalness={0.55} roughness={0.25} />
            </mesh>
            <Text position={[0, 0, 0.02]} fontSize={0.22} color="#eaffff" anchorX="center" anchorY="middle">‹</Text>
          </group>
          <group position={[4.95, 0, 0.08]} onClick={(event) => { event.stopPropagation(); cycleMission(1); }}>
            <mesh>
              <circleGeometry args={[0.24, 40]} />
              <meshStandardMaterial color="#0d2631" emissive="#46ddff" emissiveIntensity={0.68} metalness={0.55} roughness={0.25} />
            </mesh>
            <Text position={[0, 0, 0.02]} fontSize={0.22} color="#eaffff" anchorX="center" anchorY="middle">›</Text>
          </group>
          <Text position={[0, 2.28, 0.06]} fontSize={0.09} color="#6f9aa5" anchorX="center">{currentIndex + 1} / {missions.length}</Text>
        </>
      )}

      {captureOpen && imageUrl && (
        <PillarOccludedHtml position={[0, 0, 0.04]} distanceFactor={1}>
          <div style={{ width: '860px', height: '440px', overflow: 'hidden', background: '#02070d', border: '1px solid rgba(132,223,241,.28)', boxShadow: '0 0 45px rgba(70,221,255,.16)' }}>
            <img src={imageUrl} alt={selectedMission?.title || 'Archived mission capture'} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#02070d' }} />
          </div>
        </PillarOccludedHtml>
      )}

      {captureOpen && !imageUrl && (
        <Text position={[0, 0, 0.03]} fontSize={0.16} color="#ffb75c" anchorX="center">
          NO ARCHIVED IMAGE AVAILABLE FOR THIS MISSION
        </Text>
      )}

      {!captureOpen && activeSection === 'missions' && (
        <Text position={[0, 0, 0.03]} fontSize={0.18} color="#315766" anchorX="center">
          PROJECTION STANDBY
        </Text>
      )}
    </group>
  );
}


function lerpAngle(current, target, factor) {
  let delta = (target - current + Math.PI) % (Math.PI * 2) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * factor;
}




function GusGLBModel({ accent = '#8feaff', sleeping = false }) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/gus-v3.glb`);
  const model = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = true;
      if (child.name === 'Gus_Rim') child.visible = false;
      if (child.material) {
        child.material = child.material.clone();
        child.material.roughness = 0.82;
        child.material.metalness = 0.02;
      }
    });
  }, [model]);

  return (
    <group rotation={[0, 1.08, 0]} scale={[1.08, 1.0, 1.28]}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(`${import.meta.env.BASE_URL}models/gus-v3.glb`);

function BeauGLBModel({ accent = '#ff9a3d', sleeping = false }) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/beau.glb`);
  const model = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    model.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = true;

      if (child.material.name === 'Holodeck_Orange_Rim') {
        child.material = child.material.clone();
        child.material.color = new THREE.Color(accent);
        child.material.emissive = new THREE.Color(accent);
        child.material.emissiveIntensity = sleeping ? 0.55 : 1.25;
        child.material.opacity = sleeping ? 0.16 : 0.34;
        child.material.transparent = true;
        child.material.depthWrite = false;
        child.material.roughness = 0.08;
        child.material.metalness = 0.0;
        child.material.side = THREE.BackSide;
      }
    });
  }, [model, accent, sleeping]);

  return <primitive object={model} />;
}

useGLTF.preload(`${import.meta.env.BASE_URL}models/beau.glb`);

function EchoGLBModel({ accent = '#9d7cff', sleeping = false }) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/echo.glb`);
  const model = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    model.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = true;

      if (child.material.name === 'Holodeck_Purple_Rim') {
        child.material = child.material.clone();
        child.material.emissive = new THREE.Color(accent);
        child.material.emissiveIntensity = sleeping ? 0.4 : 0.9;
        child.material.opacity = sleeping ? 0.1 : 0.17;
        child.material.transparent = true;
        child.material.depthWrite = false;
      }
    });
  }, [model, accent, sleeping]);

  return <primitive object={model} />;
}

useGLTF.preload(`${import.meta.env.BASE_URL}models/echo.glb`);

function CrewCompanion({ crewKey, accent = '#8feaff', sleeping = false, viewMode = 'third', isLocal = false }) {
  const rootRef = useRef();

  useFrame((state) => {
    if (!rootRef.current) return;
    const t = state.clock.elapsedTime;

    let bobSpeed = 2.0;
    let bobAmount = 0.018;
    let swayAmount = 0.04;
    let hoverY = sleeping ? 1.08 : 0.28;

    if (crewKey === 'dave') {
      bobSpeed = 1.45;
      bobAmount = 0.014;
      swayAmount = 0.018;
      hoverY = sleeping ? 0.9 : 0.06;
    } else if (crewKey === 'justin') {
      bobSpeed = 2.55;
      bobAmount = 0.012;
      swayAmount = 0.05;
    } else if (crewKey === 'chappy') {
      bobSpeed = 2.8;
      bobAmount = 0.02;
      swayAmount = 0.045;
    }

    if (sleeping) {
      bobSpeed *= 0.45;
      bobAmount *= 0.45;
      swayAmount *= 0.35;
    }

    const baseRotationY = crewKey === 'dave' ? (isLocal && viewMode === 'first' ? 0.35 : 0.52) : 0;
    rootRef.current.position.y = hoverY + Math.sin(t * bobSpeed + crewKey.length) * bobAmount;
    rootRef.current.rotation.y = baseRotationY + Math.sin(t * bobSpeed * 0.6 + crewKey.length) * swayAmount;
  });

  if (crewKey === 'dave') {
    return (
      <group ref={rootRef} position={isLocal && viewMode === 'first' ? [0.9, sleeping ? 0.92 : 0.06, -0.74] : [1.02, sleeping ? 0.92 : 0.06, -0.96]} rotation={[0, isLocal && viewMode === 'first' ? 0.35 : 0.52, 0]} scale={sleeping ? 0.42 : isLocal && viewMode === 'first' ? 0.4 : 0.46}>
        <GusGLBModel accent={accent} sleeping={sleeping} />
        <pointLight position={[0.14, 1.16, 0.22]} color={accent} intensity={sleeping ? 0.42 : 0.9} distance={2.1} />
        <pointLight position={[-0.18, 0.9, -0.22]} color={'#ffffff'} intensity={sleeping ? 0.0 : 0.22} distance={1.6} />
      </group>
    );
  }

  if (crewKey === 'justin') {
    return (
      <group ref={rootRef} position={[0.86, sleeping ? 1.08 : 0.28, -0.8]} scale={0.46}>
        <BeauGLBModel accent={accent} sleeping={sleeping} />
        <pointLight position={[0.15, 0.72, 0]} color={accent} intensity={sleeping ? 0.38 : 0.72} distance={1.25} />
      </group>
    );
  }

  return (
    <group ref={rootRef} position={[0.88, sleeping ? 1.08 : 0.28, -0.86]} scale={0.52}>
      <EchoGLBModel accent={accent} sleeping={sleeping} />
      <pointLight position={[0.12, 0.9, 0]} color={accent} intensity={sleeping ? 0.42 : 0.78} distance={1.3} />
    </group>
  );
}

function LocalCrewAvatar({ crewKey, callSign, role, viewMode, poseRef }) {
  const rootRef = useRef();
  const leftArmRef = useRef();
  const rightArmRef = useRef();
  const leftLegRef = useRef();
  const rightLegRef = useRef();
  const walkPhase = useRef(0);
  const accent = crewKey === 'justin' ? '#ff9a3d' : crewKey === 'chappy' ? '#9d7cff' : '#43d4ff';

  useFrame((state, delta) => {
    if (!rootRef.current || !poseRef?.current) return;
    const pose = poseRef.current;
    rootRef.current.position.set(Number(pose.position?.x) || 0, 0, Number(pose.position?.z) || 0);
    rootRef.current.rotation.y = Number(pose.rotation?.yaw) || 0;

    if (pose.moving) walkPhase.current += delta * 7.2;
    const stride = pose.moving ? Math.sin(walkPhase.current) * 0.42 : 0;
    if (leftArmRef.current) leftArmRef.current.rotation.x = stride * 0.75;
    if (rightArmRef.current) rightArmRef.current.rotation.x = -stride * 0.75;
    if (leftLegRef.current) leftLegRef.current.rotation.x = -stride;
    if (rightLegRef.current) rightLegRef.current.rotation.x = stride;
    rootRef.current.position.y = Math.sin(state.clock.elapsedTime * 2.2) * 0.014;

    HOLODECK_AVATAR_BLOCKERS.set('local-player', {
      x: rootRef.current.position.x,
      z: rootRef.current.position.z,
      radius: viewMode === 'third' ? 0.74 : 0.48,
      minY: 0.18,
      maxY: 2.82,
    });
  });

  useEffect(() => () => HOLODECK_AVATAR_BLOCKERS.delete('local-player'), []);

  return (
    <group ref={rootRef}>
      {viewMode === 'third' && (
        <>
          <group position={[0, 0.92, 0]}>
            <mesh position={[0, 0.22, 0]}>
              <boxGeometry args={[0.48, 0.68, 0.28]} />
              <meshStandardMaterial color="#08131b" emissive={accent} emissiveIntensity={0.46} metalness={0.62} roughness={0.28} transparent opacity={0.9} />
            </mesh>
            <mesh position={[0, 0.58, 0]}>
              <sphereGeometry args={[0.21, 28, 20]} />
              <meshStandardMaterial color="#0a1720" emissive={accent} emissiveIntensity={0.42} metalness={0.72} roughness={0.22} transparent opacity={0.92} />
            </mesh>
            <mesh position={[0, 0.59, -0.19]}><boxGeometry args={[0.29, 0.105, 0.035]} /><meshBasicMaterial color={accent} /></mesh>
            <mesh position={[0, 0.22, -0.17]}><circleGeometry args={[0.07, 24]} /><meshBasicMaterial color={accent} /></mesh>
            <group ref={leftArmRef} position={[-0.32, 0.44, 0]}><mesh position={[0, -0.25, 0]}><cylinderGeometry args={[0.075, 0.065, 0.5, 16]} /><meshStandardMaterial color="#0a1720" emissive={accent} emissiveIntensity={0.25} /></mesh></group>
            <group ref={rightArmRef} position={[0.32, 0.44, 0]}><mesh position={[0, -0.25, 0]}><cylinderGeometry args={[0.075, 0.065, 0.5, 16]} /><meshStandardMaterial color="#0a1720" emissive={accent} emissiveIntensity={0.25} /></mesh></group>
            <group ref={leftLegRef} position={[-0.14, -0.12, 0]}><mesh position={[0, -0.36, 0]}><cylinderGeometry args={[0.085, 0.072, 0.72, 16]} /><meshStandardMaterial color="#071018" emissive={accent} emissiveIntensity={0.2} /></mesh></group>
            <group ref={rightLegRef} position={[0.14, -0.12, 0]}><mesh position={[0, -0.36, 0]}><cylinderGeometry args={[0.085, 0.072, 0.72, 16]} /><meshStandardMaterial color="#071018" emissive={accent} emissiveIntensity={0.2} /></mesh></group>
          </group>
          <Billboard follow position={[0, 2.05, 0]}>
            <Text fontSize={0.12} color={accent} anchorX="center">{callSign}</Text>
            <Text position={[0, -0.18, 0]} fontSize={0.055} color="#b8d8df" anchorX="center">{String(role || 'CREW').toUpperCase()}</Text>
          </Billboard>
        </>
      )}
      <CrewCompanion crewKey={crewKey} accent={accent} viewMode={viewMode} isLocal />
      <pointLight position={[0, 1.2, 0]} color={accent} intensity={viewMode === 'third' ? 2.6 : 1.7} distance={2.4} />
    </group>
  );
}

function RemoteCrewAvatar({ member }) {
  const rootRef = useRef();
  const leftArmRef = useRef();
  const rightArmRef = useRef();
  const leftLegRef = useRef();
  const rightLegRef = useRef();
  const targetPosition = useRef(new THREE.Vector3());
  const lastPosition = useRef(new THREE.Vector3());
  const walkPhase = useRef(0);
  const accent = member.color || '#8feaff';

  useEffect(() => {
    targetPosition.current.set(
      Number(member.position?.x) || 0,
      0,
      Number(member.position?.z) || 0,
    );

    if (rootRef.current && rootRef.current.position.lengthSq() === 0) {
      rootRef.current.position.copy(targetPosition.current);
      lastPosition.current.copy(targetPosition.current);
    }
  }, [member.position?.x, member.position?.z]);

  useFrame((state, delta) => {
    if (!rootRef.current) return;

    const before = rootRef.current.position.clone();
    rootRef.current.position.lerp(targetPosition.current, 1 - Math.exp(-delta * 8.5));
    rootRef.current.rotation.y = lerpAngle(
      rootRef.current.rotation.y,
      Number(member.rotation?.yaw) || 0,
      1 - Math.exp(-delta * 10),
    );

    const speed = rootRef.current.position.distanceTo(before) / Math.max(delta, 0.001);
    const walking = speed > 0.08;
    if (walking) walkPhase.current += delta * Math.min(9, 4 + speed * 1.7);

    const stride = walking ? Math.sin(walkPhase.current) * 0.42 : 0;
    const armStride = stride * 0.75;
    if (leftArmRef.current) leftArmRef.current.rotation.x = armStride;
    if (rightArmRef.current) rightArmRef.current.rotation.x = -armStride;
    if (leftLegRef.current) leftLegRef.current.rotation.x = -stride;
    if (rightLegRef.current) rightLegRef.current.rotation.x = stride;

    const idleBob = Math.sin(state.clock.elapsedTime * 2.2 + member.callSign.length) * 0.018;
    rootRef.current.position.y = idleBob;
    HOLODECK_AVATAR_BLOCKERS.set(`live-${member.userId}`, {
      x: rootRef.current.position.x,
      z: rootRef.current.position.z,
      radius: 0.74,
      minY: 0.18,
      maxY: 2.82,
    });
    lastPosition.current.copy(rootRef.current.position);
  });

  useEffect(() => () => {
    HOLODECK_AVATAR_BLOCKERS.delete(`live-${member.userId}`);
  }, [member.userId]);

  return (
    <group ref={rootRef}>
      <group position={[0, 0.92, 0]}>
        <mesh position={[0, 0.22, 0]}>
          <boxGeometry args={[0.48, 0.68, 0.28]} />
          <meshStandardMaterial color="#08131b" emissive={accent} emissiveIntensity={0.46} metalness={0.62} roughness={0.28} transparent opacity={0.9} />
        </mesh>
        <mesh position={[0, 0.58, 0]}>
          <sphereGeometry args={[0.21, 28, 20]} />
          <meshStandardMaterial color="#0a1720" emissive={accent} emissiveIntensity={0.42} metalness={0.72} roughness={0.22} transparent opacity={0.92} />
        </mesh>
        <mesh position={[0, 0.59, -0.19]}>
          <boxGeometry args={[0.29, 0.105, 0.035]} />
          <meshBasicMaterial color={accent} transparent opacity={0.96} />
        </mesh>
        <mesh position={[0, 0.52, -0.205]}>
          <planeGeometry args={[0.18, 0.016]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.62} />
        </mesh>
        <mesh position={[0, 0.22, -0.17]}>
          <circleGeometry args={[0.07, 24]} />
          <meshBasicMaterial color={accent} transparent opacity={0.92} />
        </mesh>

        <group ref={leftArmRef} position={[-0.32, 0.44, 0]}>
          <mesh position={[0, -0.25, 0]}>
            <cylinderGeometry args={[0.075, 0.065, 0.5, 16]} />
            <meshStandardMaterial color="#0a1720" emissive={accent} emissiveIntensity={0.25} transparent opacity={0.88} />
          </mesh>
        </group>
        <group ref={rightArmRef} position={[0.32, 0.44, 0]}>
          <mesh position={[0, -0.25, 0]}>
            <cylinderGeometry args={[0.075, 0.065, 0.5, 16]} />
            <meshStandardMaterial color="#0a1720" emissive={accent} emissiveIntensity={0.25} transparent opacity={0.88} />
          </mesh>
        </group>

        <group ref={leftLegRef} position={[-0.14, -0.12, 0]}>
          <mesh position={[0, -0.36, 0]}>
            <cylinderGeometry args={[0.085, 0.072, 0.72, 16]} />
            <meshStandardMaterial color="#071018" emissive={accent} emissiveIntensity={0.2} transparent opacity={0.9} />
          </mesh>
        </group>
        <group ref={rightLegRef} position={[0.14, -0.12, 0]}>
          <mesh position={[0, -0.36, 0]}>
            <cylinderGeometry args={[0.085, 0.072, 0.72, 16]} />
            <meshStandardMaterial color="#071018" emissive={accent} emissiveIntensity={0.2} transparent opacity={0.9} />
          </mesh>
        </group>
      </group>

      <CrewCompanion crewKey={String(member.crewKey || '').toLowerCase()} accent={accent} />

      <Billboard follow position={[0, 2.05, 0]}>
        <Text fontSize={0.12} color={accent} anchorX="center">{member.callSign}</Text>
        <Text position={[0, -0.18, 0]} fontSize={0.055} color="#b8d8df" anchorX="center">{String(member.role || 'CREW').toUpperCase()}</Text>
        {member.activeSection && (
          <Text position={[0, -0.32, 0]} fontSize={0.05} color={accent} anchorX="center">{`FOCUS // ${String(member.activeSection).toUpperCase()}`}</Text>
        )}
      </Billboard>

      <pointLight position={[0, 1.2, 0]} color={accent} intensity={2.6} distance={2.4} />
    </group>
  );
}

function RemoteCrewAvatars({ remoteCrew }) {
  return remoteCrew.map((member) => (
    <RemoteCrewAvatar key={member.userId} member={member} />
  ));
}

const CREW_STATION_DATA = [
  { crewKey: 'dave', callSign: 'DAVE', role: 'TELESCOPE OPERATIONS', color: '#43d4ff', position: [-2.6, 0, 1.95], yaw: -0.28 },
  { crewKey: 'justin', callSign: 'JUSTIN', role: 'TECHNOLOGY LEAD', color: '#ff9a3d', position: [2.6, 0, 1.95], yaw: 0.28 },
  { crewKey: 'chappy', callSign: 'CHAPPY', role: 'MISSION SUPPORT', color: '#9d7cff', position: [0, 0, -2.9], yaw: Math.PI },
];

function SleepingCrewAvatar({ crew }) {
  const rootRef = useRef();
  const zzzRef = useRef();

  useEffect(() => {
    HOLODECK_AVATAR_BLOCKERS.set(`sleep-${crew.crewKey}`, {
      x: crew.position[0],
      z: crew.position[2],
      radius: 0.86,
      minY: 0.2,
      maxY: 3.22,
    });
    return () => HOLODECK_AVATAR_BLOCKERS.delete(`sleep-${crew.crewKey}`);
  }, [crew]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    if (rootRef.current) {
      // Keep the sleeper planted on top of the crew station. The previous
      // animation accidentally replaced the group's base Y with the bob value,
      // sinking the avatar into the floor/pillar every frame.
      rootRef.current.position.y = 1.48 + Math.sin(time * 1.15 + crew.callSign.length) * 0.018;
    }
    if (zzzRef.current) {
      zzzRef.current.position.y = 2.78 + Math.sin(time * 1.8 + crew.callSign.length) * 0.08;
      zzzRef.current.rotation.z = Math.sin(time * 0.75) * 0.035;
    }
  });

  return (
    <group position={crew.position} rotation={[0, crew.yaw, 0]}>
      <group ref={rootRef} position={[0, 1.48, 0]} rotation={[0, 0, -0.12]} scale={1.14}>
        <mesh position={[0, 0.24, 0]} rotation={[0.08, 0, 0]}>
          <boxGeometry args={[0.42, 0.58, 0.24]} />
          <meshStandardMaterial color="#071018" emissive={crew.color} emissiveIntensity={0.2} metalness={0.56} roughness={0.36} transparent opacity={0.64} />
        </mesh>
        <mesh position={[0.08, 0.56, 0.015]} rotation={[0, 0, -0.18]}>
          <sphereGeometry args={[0.18, 24, 18]} />
          <meshStandardMaterial color="#08131b" emissive={crew.color} emissiveIntensity={0.22} metalness={0.65} roughness={0.3} transparent opacity={0.68} />
        </mesh>
        <mesh position={[0.11, 0.56, -0.165]} rotation={[0, 0, -0.18]}>
          <boxGeometry args={[0.24, 0.075, 0.025]} />
          <meshBasicMaterial color={crew.color} transparent opacity={0.66} />
        </mesh>

        <group position={[-0.28, 0.37, 0]} rotation={[0, 0, -0.32]}>
          <mesh position={[0, -0.2, 0]}>
            <cylinderGeometry args={[0.065, 0.055, 0.4, 14]} />
            <meshStandardMaterial color="#071018" emissive={crew.color} emissiveIntensity={0.16} transparent opacity={0.58} />
          </mesh>
        </group>
        <group position={[0.28, 0.37, 0]} rotation={[0, 0, 0.18]}>
          <mesh position={[0, -0.2, 0]}>
            <cylinderGeometry args={[0.065, 0.055, 0.4, 14]} />
            <meshStandardMaterial color="#071018" emissive={crew.color} emissiveIntensity={0.16} transparent opacity={0.58} />
          </mesh>
        </group>

        <group position={[-0.12, -0.02, 0]} rotation={[0.45, 0, -0.12]}>
          <mesh position={[0, -0.28, 0]}>
            <cylinderGeometry args={[0.075, 0.065, 0.56, 14]} />
            <meshStandardMaterial color="#061018" emissive={crew.color} emissiveIntensity={0.14} transparent opacity={0.6} />
          </mesh>
        </group>
        <group position={[0.12, -0.02, 0]} rotation={[0.45, 0, 0.12]}>
          <mesh position={[0, -0.28, 0]}>
            <cylinderGeometry args={[0.075, 0.065, 0.56, 14]} />
            <meshStandardMaterial color="#061018" emissive={crew.color} emissiveIntensity={0.14} transparent opacity={0.6} />
          </mesh>
        </group>
      </group>

      <CrewCompanion crewKey={crew.crewKey} accent={crew.color} sleeping />

      <Billboard follow position={[0, 2.42, 0]}>
        <Text fontSize={0.085} color={crew.color} anchorX="center">{crew.callSign}</Text>
        <Text position={[0, -0.13, 0]} fontSize={0.045} color="#617985" anchorX="center">OFFLINE // STATION IDLE</Text>
      </Billboard>

      <Billboard ref={zzzRef} follow position={[0.3, 2.78, 0]}>
        <Text fontSize={0.13} color={crew.color} fillOpacity={0.58} anchorX="center">Z Z Z</Text>
      </Billboard>

      <pointLight position={[0, 1.72, 0]} color={crew.color} intensity={1.1} distance={2.15} />
    </group>
  );
}

function InactiveCrewAvatars({ activeCrewKey, remoteCrew }) {
  const onlineCrewKeys = useMemo(
    () => new Set(remoteCrew.map((member) => String(member.crewKey || '').toLowerCase())),
    [remoteCrew]
  );

  return CREW_STATION_DATA
    .filter((crew) => crew.crewKey !== activeCrewKey && !onlineCrewKeys.has(crew.crewKey))
    .map((crew) => <SleepingCrewAvatar key={crew.crewKey} crew={crew} />);
}

function CrewStations({ activeSection, activeCrewKey }) {
  const crew = [
    ['DAVE', -2.6, 1.95],
    ['JUSTIN', 2.6, 1.95],
    ['CHAPPY', 0, -2.9],
  ];
  return crew.map(([name, x, z]) => (
    <group key={name} position={[x, 0, z]}>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.62, 0.74, 0.9, 32]} />
        <meshStandardMaterial color="#0a141b" metalness={0.72} roughness={0.34} emissive={activeSection === 'comms' ? '#0c5f49' : '#020608'} emissiveIntensity={activeSection === 'comms' ? 0.8 : 0.2} />
      </mesh>
      <Text position={[0, 0.95, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.16} color="#a9efff">{name}</Text>
      <mesh position={[0, 1.07, 0]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshBasicMaterial color={name.toLowerCase() === activeCrewKey ? '#47f0a7' : '#56707a'} />
      </mesh>
    </group>
  ));
}

function TelescopeDisplay({ activeSection }) {
  return (
    <group position={[6.5, 0, 5.4]} rotation={[0, -0.55, 0]}>
      <mesh position={[0, 0.35, 0]}><cylinderGeometry args={[1.15, 1.35, 0.35, 48]} /><meshStandardMaterial color="#111920" metalness={0.82} roughness={0.26} emissive={activeSection === 'systems' ? '#3f2508' : '#000000'} emissiveIntensity={activeSection === 'systems' ? 0.75 : 0} /></mesh>
      <mesh position={[0, 1.45, 0]} rotation={[0.18, 0, -0.52]}><cylinderGeometry args={[0.56, 0.72, 2.45, 48]} /><meshStandardMaterial color="#202a32" metalness={0.78} roughness={0.28} /></mesh>
      <mesh position={[0.72, 1.25, 0]}><boxGeometry args={[0.26, 1.9, 0.35]} /><meshStandardMaterial color="#0b1117" metalness={0.75} /></mesh>
      <Text position={[0, 0.06, 1.08]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.13} color="#ffb75c">CPC 800 // PRIMARY OBSERVATION PLATFORM</Text>
      <pointLight position={[0.45, 0.55, 0.55]} color="#ff2f3f" intensity={2.2} distance={1.2} />
    </group>
  );
}

function CommsPanel({ activeSection }) {
  if (activeSection !== 'comms') return null;

  const rows = [
    ['DAVE', 'ONLINE', 'Holodeck link stable'],
    ['JUSTIN', 'STANDBY', 'Telemetry nominal'],
    ['CHAPPY', 'AVAILABLE', 'Awaiting target selection'],
  ];

  return (
    <group position={[3.35, 2.4, 0.25]} rotation={[0, -0.9, 0]}>
      <mesh>
        <planeGeometry args={[3.7, 2.1]} />
        <meshBasicMaterial color="#06131c" transparent opacity={0.88} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[3.45, 1.86]} />
        <meshBasicMaterial color="#39f2b2" transparent opacity={0.06} />
      </mesh>
      <Text position={[-1.45, 0.76, 0.02]} fontSize={0.17} color="#aefbe2" anchorX="left">CREW COMMS</Text>
      <Text position={[-1.45, 0.5, 0.02]} fontSize={0.08} color="#6bd7b3" anchorX="left">LIVE CREW CHANNEL // HOLODECK PRESENCE</Text>
      {rows.map((row, index) => (
        <group key={row[0]} position={[0, 0.12 - index * 0.45, 0.02]}>
          <mesh>
            <planeGeometry args={[3.08, 0.32]} />
            <meshBasicMaterial color="#0c2128" transparent opacity={0.92} />
          </mesh>
          <Text position={[-1.35, 0, 0.02]} fontSize={0.085} color="#dffef6" anchorX="left" anchorY="middle">{row[0]}</Text>
          <Text position={[-0.35, 0, 0.02]} fontSize={0.072} color="#55f0b7" anchorX="left" anchorY="middle">{row[1]}</Text>
          <Text position={[0.35, 0, 0.02]} fontSize={0.072} color="#9ad7c0" anchorX="left" anchorY="middle">{row[2]}</Text>
        </group>
      ))}
    </group>
  );
}

function SystemsPanel({ activeSection }) {
  if (activeSection !== 'systems') return null;

  const rows = [
    ['CUZBRO.NET', 'ONLINE'],
    ['SUPABASE', 'SYNCED'],
    ['CLOUD R2', 'ARCHIVE READY'],
    ['CPC 800', 'STANDBY'],
    ['POWER JACK', 'UNTRUSTWORTHY'],
  ];

  return (
    <group position={[6.55, 2.3, 3.85]} rotation={[0, -2.33, 0]}>
      <mesh>
        <planeGeometry args={[3.9, 2.25]} />
        <meshBasicMaterial color="#120d06" transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[3.65, 2.0]} />
        <meshBasicMaterial color="#ffb75c" transparent opacity={0.06} />
      </mesh>
      <Text position={[-1.5, 0.8, 0.02]} fontSize={0.17} color="#ffd29a" anchorX="left">LIVE SYSTEMS</Text>
      <Text position={[-1.5, 0.55, 0.02]} fontSize={0.08} color="#ffbe72" anchorX="left">OBSERVATORY STATUS // PRIMARY PLATFORM HEALTH</Text>
      {rows.map((row, index) => (
        <group key={row[0]} position={[0, 0.16 - index * 0.33, 0.02]}>
          <mesh>
            <planeGeometry args={[3.2, 0.24]} />
            <meshBasicMaterial color="#23180b" transparent opacity={0.94} />
          </mesh>
          <Text position={[-1.35, 0, 0.02]} fontSize={0.075} color="#fff2df" anchorX="left" anchorY="middle">{row[0]}</Text>
          <Text position={[1.2, 0, 0.02]} fontSize={0.07} color={row[1] === 'UNTRUSTWORTHY' ? '#ff8668' : '#ffd088'} anchorX="right" anchorY="middle">{row[1]}</Text>
        </group>
      ))}
    </group>
  );
}

function SkyMapOverlay({ gallery, selectedMission, onMissionSelect, activeSection, skySnapshot }) {
  const visible = activeSection === 'sky';

  const snapshotLabel = useMemo(() => skySnapshot.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).toUpperCase(), [skySnapshot]);

  const capturedTargets = useMemo(() => (gallery || [])
    .slice(0, 16)
    .map((mission) => {
      const coords = getSkyCoords(mission);
      if (!coords) return null;
      const projection = getHorizontalProjection(skySnapshot, coords.ra, coords.dec, 7.0);
      if (!projection || projection.altitude <= 0) return null;
      return { ...mission, ...projection };
    })
    .filter(Boolean), [gallery, skySnapshot]);

  const futureTargets = useMemo(() => HOLODECK_FUTURE_TARGETS
    .map((target) => {
      const projection = getHorizontalProjection(skySnapshot, target.ra, target.dec, 7.0);
      if (!projection || projection.altitude <= 0) return null;
      return { ...target, ...projection };
    })
    .filter(Boolean), [skySnapshot]);

  const visibleConstellationStars = useMemo(() => CEILING_STAR_CATALOG
    .map((star) => {
      const projection = getHorizontalProjection(skySnapshot, star.ra, star.dec, 7.0);
      if (!projection || projection.altitude <= 0) return null;
      return { ...star, ...projection };
    })
    .filter(Boolean), [skySnapshot]);

  const starMap = useMemo(() => Object.fromEntries(visibleConstellationStars.map((star) => [star.id, star])), [visibleConstellationStars]);

  const constellationLineData = useMemo(() => {
    const values = [];
    CEILING_CONSTELLATION_SEGMENTS.forEach(([from, to]) => {
      const a = starMap[from];
      const b = starMap[to];
      if (!a || !b) return;
      values.push(a.x, -0.02, a.z, b.x, -0.02, b.z);
    });
    return new Float32Array(values);
  }, [starMap]);

  const eclipticPathData = useMemo(() => buildProjectedPathFromRaDec(
    skySnapshot,
    (t) => ({ ra: t * 24, dec: 23 * Math.sin(t * Math.PI * 2 - 0.85) }),
    72,
    7.0,
    -2,
  ), [skySnapshot]);

  const lunarPathData = useMemo(() => buildProjectedPathFromRaDec(
    skySnapshot,
    (t) => ({ ra: t * 24, dec: 28 * Math.sin(t * Math.PI * 2 - 0.35) + 5 }),
    72,
    7.0,
    -2,
  ), [skySnapshot]);

  const currentBodies = useMemo(() => getCurrentSkyBodies(skySnapshot), [skySnapshot]);
  const skyBackdropStars = useMemo(() => {
    const rand = (seed) => {
      const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
      return value - Math.floor(value);
    };

    const overlayPoints = [
      ...capturedTargets.map((target) => ({ x: target.x, z: target.z })),
      ...futureTargets.map((target) => ({ x: target.x, z: target.z })),
      ...currentBodies.map((body) => ({ x: body.x, z: body.z })),
    ];

    return Array.from({ length: 164 }, (_, index) => {
      const laneBias = rand(index + 4.2);
      const alongBand = (rand(index + 11.4) - 0.5) * 15.5;
      const bandNoise = (rand(index + 19.7) - 0.5) * (laneBias > 0.55 ? 1.5 : 6.4);
      const bandAngle = -0.48;
      const bandX = alongBand;
      const bandZ = bandNoise + Math.sin(alongBand * 0.32) * 0.42;
      const rotatedX = bandX * Math.cos(bandAngle) - bandZ * Math.sin(bandAngle);
      const rotatedZ = bandX * Math.sin(bandAngle) + bandZ * Math.cos(bandAngle);

      const randomAngle = rand(index + 27.1) * Math.PI * 2;
      const randomRadius = Math.pow(rand(index + 35.8), 0.76) * 7.76;
      const x = laneBias > 0.55 ? rotatedX : Math.cos(randomAngle) * randomRadius;
      const z = laneBias > 0.55 ? rotatedZ : Math.sin(randomAngle) * randomRadius;

      const radius = Math.hypot(x, z);
      if (radius > 7.8) return null;

      const brightness = rand(index + 51.3);
      const nearestOverlay = overlayPoints.reduce((closest, point) => {
        const distance = Math.hypot(x - point.x, z - point.z);
        return Math.min(closest, distance);
      }, Infinity);
      const overlayFade = nearestOverlay < 0.7 ? 0.2 : nearestOverlay < 1.2 ? 0.48 : 1;
      const bandBoost = laneBias > 0.55 ? 1.08 : 0.86;

      return {
        x,
        z,
        size: brightness > 0.96 ? 0.036 : brightness > 0.82 ? 0.027 : brightness > 0.5 ? 0.019 : 0.013,
        opacity: Math.min(0.82, (brightness > 0.9 ? 0.78 : brightness > 0.62 ? 0.52 : 0.28) * overlayFade * bandBoost),
      };
    }).filter(Boolean);
  }, [capturedTargets, currentBodies, futureTargets]);
  const polaris = starMap.polaris;
  const selectedCoords = getSkyCoords(selectedMission);

  if (!visible) return null;

  return (
    <group position={[0, 4.74, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[8.55, 160]} />
        <meshBasicMaterial color="#090918" transparent opacity={0.14} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.03, 0]} rotation={[Math.PI / 2, 0, -0.48]}>
        <planeGeometry args={[15.8, 2.1]} />
        <meshBasicMaterial color="#8278cf" transparent opacity={0.045} depthWrite={false} />
      </mesh>
      <mesh position={[0, -0.031, 0]} rotation={[Math.PI / 2, 0, -0.48]}>
        <planeGeometry args={[15.3, 0.9]} />
        <meshBasicMaterial color="#b5a8ff" transparent opacity={0.028} depthWrite={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.012, 0]}>
        <ringGeometry args={[8.18, 8.34, 180]} />
        <meshBasicMaterial color="#c0b5ff" transparent opacity={0.18} />
      </mesh>
      {[2.4, 4.8, 7.2].map((radius) => (
        <mesh key={radius} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.022, 0]}>
          <ringGeometry args={[radius - 0.012, radius + 0.012, 128]} />
          <meshBasicMaterial color="#9482eb" transparent opacity={0.04} />
        </mesh>
      ))}

      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array([
            0, -0.024, -7.95, 0, -0.024, 7.95,
            -7.95, -0.024, 0, 7.95, -0.024, 0,
          ]), 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#8d7af0" transparent opacity={0.05} />
      </lineSegments>

      {constellationLineData.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[constellationLineData, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#dce8ff" transparent opacity={0.72} />
        </lineSegments>
      )}

      {eclipticPathData.length > 0 && (
        <line>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[eclipticPathData, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#ffb75c" transparent opacity={0.24} />
        </line>
      )}
      {lunarPathData.length > 0 && (
        <line>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[lunarPathData, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#cfefff" transparent opacity={0.22} />
        </line>
      )}

      {skyBackdropStars.map((star, index) => (
        <mesh key={`backdrop-${index}`} position={[star.x, -0.027, star.z]}>
          <sphereGeometry args={[star.size, 10, 10]} />
          <meshBasicMaterial color="#e8eeff" transparent opacity={star.opacity} />
        </mesh>
      ))}

      {['N', 'E', 'S', 'W'].map((label, index) => {
        const angle = (index / 4) * Math.PI * 2;
        const x = Math.sin(angle) * 7.88;
        const z = -Math.cos(angle) * 7.88;
        return (
          <group key={label} position={[x, -0.034, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.28, 0.38, 40]} />
              <meshBasicMaterial color="#ff9a3d" transparent opacity={0.72} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
              <ringGeometry args={[0.2, 0.22, 40]} />
              <meshBasicMaterial color="#ffd8a6" transparent opacity={0.52} />
            </mesh>
            <mesh position={[0, -0.004, 0]}>
              <circleGeometry args={[0.2, 32]} />
              <meshBasicMaterial color="#1d1007" transparent opacity={0.82} depthWrite={false} />
            </mesh>
            <FloatingLabel position={[0, -0.28, 0]} fontSize={0.29} color="#fff0dc">{label}</FloatingLabel>
          </group>
        );
      })}

      {visibleConstellationStars.map((star) => (
        <group key={star.id} position={[star.x, -0.03, star.z]}>
          <mesh>
            <sphereGeometry args={[star.id === 'polaris' ? 0.05 : 0.038, 16, 16]} />
            <meshBasicMaterial color={star.id === 'polaris' ? '#fff8d8' : '#f6f7ff'} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
            <ringGeometry args={[star.id === 'polaris' ? 0.08 : 0.05, star.id === 'polaris' ? 0.13 : 0.075, 24]} />
            <meshBasicMaterial color={star.id === 'polaris' ? '#fff3c4' : '#d4e3ff'} transparent opacity={star.id === 'polaris' ? 0.72 : 0.34} />
          </mesh>
          {(star.major || star.id === 'polaris') && (
            <FloatingLabel position={[0.18, 0.05, 0]} fontSize={star.id === 'polaris' ? 0.075 : 0.06} color={star.id === 'polaris' ? '#fff3c4' : '#d8e7ff'} anchorX="left">
              {star.name.toUpperCase()}
            </FloatingLabel>
          )}
        </group>
      ))}

      {currentBodies.map((body) => (
        <group key={body.name} position={[body.x, -0.28, body.z]}>
          <mesh position={[0, 0.14, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.28, 8]} />
            <meshBasicMaterial color={body.color} transparent opacity={0.42} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[body.name === 'MOON' ? 0.11 : 0.09, body.name === 'MOON' ? 0.16 : 0.13, 36]} />
            <meshBasicMaterial color={body.color} transparent opacity={0.92} />
          </mesh>
          <mesh position={[0, -0.018, 0]}>
            <sphereGeometry args={[body.name === 'MOON' ? 0.055 : 0.04, 16, 16]} />
            <meshBasicMaterial color={body.color} />
          </mesh>
          <FloatingLabel position={[0.17, 0.05, 0]} fontSize={0.055} color={body.color} anchorX="left">
            {body.name}
          </FloatingLabel>
        </group>
      ))}

      {capturedTargets.map((target) => {
        const active = selectedMission?.id === target.id || selectedMission?.title === target.title;
        return (
          <group key={target.id || target.title} position={[target.x, -0.22, target.z]} onClick={(event) => { event.stopPropagation(); onMissionSelect(target); }}>
            <mesh position={[0, 0.11, 0]}>
              <cylinderGeometry args={[0.01, 0.01, 0.22, 8]} />
              <meshBasicMaterial color="#43d4ff" transparent opacity={0.4} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[active ? 0.15 : 0.095, active ? 0.21 : 0.14, 32]} />
              <meshBasicMaterial color={active ? '#ffffff' : '#43d4ff'} transparent opacity={0.96} />
            </mesh>
            <mesh position={[0, -0.02, 0]}>
              <sphereGeometry args={[0.042, 16, 16]} />
              <meshBasicMaterial color={active ? '#ffd39a' : '#a5f1ff'} />
            </mesh>
            <FloatingLabel position={[0.18, 0.05, 0]} fontSize={0.07} color={active ? '#ffffff' : '#b4efff'} anchorX="left">
              {target.shortTitle || target.title}
            </FloatingLabel>
          </group>
        );
      })}

      {futureTargets.map((target) => (
        <group key={target.title} position={[target.x, -0.18, target.z]}>
          <mesh position={[0, 0.09, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.18, 8]} />
            <meshBasicMaterial color="#ffb75c" transparent opacity={0.34} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.07, 0.11, 28]} />
            <meshBasicMaterial color="#ffb75c" transparent opacity={0.82} />
          </mesh>
          <mesh position={[0, -0.015, 0]}>
            <sphereGeometry args={[0.028, 14, 14]} />
            <meshBasicMaterial color="#ffd49f" />
          </mesh>
          <FloatingLabel position={[0.13, 0.045, 0]} fontSize={0.055} color="#ffd39c" anchorX="left">
            {target.shortTitle || target.title}
          </FloatingLabel>
        </group>
      ))}

      <group position={[5.65, -0.58, -4.7]}>
        <mesh>
          <planeGeometry args={[3.3, 1.95]} />
          <meshBasicMaterial color="#090918" transparent opacity={0.88} />
        </mesh>
        <Text position={[-1.22, 0.66, 0.02]} fontSize={0.12} color="#ece7ff" anchorX="left">HOLODECK SKY MAP</Text>
        <Text position={[-1.22, 0.42, 0.02]} fontSize={0.07} color="#8f78ff" anchorX="left">LIVE SKY SNAPSHOT // ELIOT, MAINE</Text>
        <mesh position={[-1.13, 0.1, 0.01]}><circleGeometry args={[0.045, 18]} /><meshBasicMaterial color="#43d4ff" /></mesh>
        <Text position={[-1.0, 0.1, 0.02]} fontSize={0.06} color="#bcefff" anchorX="left">Captured missions</Text>
        <mesh position={[-1.13, -0.14, 0.01]}><circleGeometry args={[0.045, 18]} /><meshBasicMaterial color="#ffb75c" /></mesh>
        <Text position={[-1.0, -0.14, 0.02]} fontSize={0.06} color="#ffd9b0" anchorX="left">Future targets</Text>
        <mesh position={[0.38, 0.1, 0.01]}><planeGeometry args={[0.17, 0.012]} /><meshBasicMaterial color="#ffb75c" /></mesh>
        <Text position={[0.56, 0.1, 0.02]} fontSize={0.06} color="#fff0c8" anchorX="left">Planetary path</Text>
        <mesh position={[0.38, -0.14, 0.01]}><planeGeometry args={[0.17, 0.012]} /><meshBasicMaterial color="#cfefff" /></mesh>
        <Text position={[0.56, -0.14, 0.02]} fontSize={0.06} color="#d3f7ff" anchorX="left">Lunar path</Text>
        <mesh position={[0.38, -0.38, 0.01]}><circleGeometry args={[0.045, 18]} /><meshBasicMaterial color="#fff3c4" /></mesh>
        <Text position={[0.56, -0.38, 0.02]} fontSize={0.06} color="#fff6d9" anchorX="left">Polaris</Text>
        <Text position={[-1.22, -0.62, 0.02]} fontSize={0.05} color="#7369b8" anchorX="left">{snapshotLabel}</Text>
        <Text position={[-1.22, -0.82, 0.02]} fontSize={0.05} color="#7369b8" anchorX="left">MIDNIGHT / ±1H / NOW ON CONTROL PILLAR</Text>
      </group>

      {selectedMission && selectedCoords && (
        <group position={[-5.0, -0.68, -4.8]}>
          <mesh>
            <planeGeometry args={[4.4, 1.85]} />
            <meshBasicMaterial color="#090918" transparent opacity={0.9} />
          </mesh>
          <Text position={[-1.82, 0.58, 0.02]} fontSize={0.15} color="#f6f1ff" anchorX="left">{selectedMission.title || 'TARGET SELECTED'}</Text>
          <Text position={[-1.82, 0.26, 0.02]} fontSize={0.075} color="#b6a7ff" anchorX="left">{String(selectedMission.objectType || selectedMission.category || 'Mission target').toUpperCase()}</Text>
          <Text position={[-1.82, -0.04, 0.02]} fontSize={0.065} color="#90dff2" anchorX="left">RA {selectedCoords.ra.toFixed(3)}h // DEC {selectedCoords.dec.toFixed(2)}°</Text>
          <Text position={[-1.82, -0.32, 0.02]} fontSize={0.065} color="#8679dc" anchorX="left">CURRENT SKY SNAPSHOT // ABOVE-HORIZON CEILING VIEW</Text>
          <Text position={[-1.82, -0.58, 0.02]} fontSize={0.06} color="#7369b8" anchorX="left">VISIBLE TARGETS ONLY ARE RENDERED IN THE CEILING MAP</Text>
        </group>
      )}

      <pointLight position={[0, -0.82, 0]} color="#8f78ff" intensity={18} distance={11.5} />
    </group>
  );
}

function Room({ gallery, selectedMission, setSelectedMission, openFace, setOpenFace, activeSection, onSectionSelect, focusRequest, clearFocus, controlsEnabled, captureOpen, setCaptureOpen, skySnapshot, onSkyTimeChange, activeCrewKey, initialPosition, onPose, remoteCrew, viewMode, crew }) {
  const activeColor = SECTION_COLORS[activeSection] || '#1ba8cf';
  const previewUrl = getImageUrl(getMissionImage(selectedMission));
  const localPoseRef = useRef({
    position: { x: initialPosition?.[0] || 0, y: 0, z: initialPosition?.[2] || 8.6 },
    rotation: { yaw: 0, pitch: 0 },
    moving: false,
    viewMode,
  });

  return (
    <>
      <CameraRig enabled={controlsEnabled} focusRequest={focusRequest} onFocusComplete={clearFocus} initialPosition={initialPosition} onPose={onPose} viewMode={viewMode} localPoseRef={localPoseRef} />
      <color attach="background" args={['#01040a']} />
      <fog attach="fog" args={['#02060b', 11, 28]} />
      <ambientLight intensity={0.38} />
      <directionalLight position={[2, 8, 4]} intensity={1.2} color="#b9ebff" />
      <pointLight position={[0, 4.8, 0]} intensity={activeSection ? 22 : 16} distance={13} color={activeColor} />
      <Stars radius={35} depth={20} count={2200} factor={3} saturation={0} fade speed={0.25} />

      <mesh position={[0, -0.08, 0]}><cylinderGeometry args={[9.8, 9.8, 0.18, 96]} /><meshStandardMaterial color="#050b10" metalness={0.78} roughness={0.36} /></mesh>
      <RingLight radius={3.9} color={activeColor} /><RingLight radius={7.25} opacity={0.18} color={activeColor} />

      <mesh position={[0, 4.9, 0]} rotation={[Math.PI, 0, 0]}><cylinderGeometry args={[9.6, 9.6, 0.12, 96]} /><meshStandardMaterial color="#02060a" metalness={0.65} roughness={0.5} transparent opacity={0.78} /></mesh>

      <DeepSkyWindow gallery={gallery} selectedMission={selectedMission} captureOpen={captureOpen} activeSection={activeSection} onMissionSelect={(mission) => { setSelectedMission(mission); }} />
      <MissionDetailPanel mission={selectedMission} gallery={gallery} captureOpen={captureOpen} activeSection={activeSection} previewUrl={previewUrl} onOpenCapture={() => setCaptureOpen((value) => !value)} onMissionSelect={(mission) => { setSelectedMission(mission); setCaptureOpen(false); }} />
      <MissionWall gallery={gallery} selectedMission={selectedMission} previewUrl={previewUrl} onMissionSelect={(mission) => { setSelectedMission(mission); setCaptureOpen(false); }} onOpenCapture={() => setCaptureOpen((value) => !value)} captureOpen={captureOpen} />
      <CrewStations activeSection={activeSection} activeCrewKey={activeCrewKey} />
      <LocalCrewAvatar crewKey={activeCrewKey || 'dave'} callSign={crew?.callSign || 'CREW'} role={crew?.role || 'CUZBRO CREW'} viewMode={viewMode} poseRef={localPoseRef} />
      <RemoteCrewAvatars remoteCrew={remoteCrew} />
      <InactiveCrewAvatars activeCrewKey={activeCrewKey} remoteCrew={remoteCrew} />
      <TelescopeDisplay activeSection={activeSection} />
      <CommsPanel activeSection={activeSection} />
      <SystemsPanel activeSection={activeSection} />
      <ControlPillar openFace={openFace} activeSection={activeSection} selectedMission={selectedMission} skySnapshot={skySnapshot} activeCrewKey={activeCrewKey} onFaceToggle={(faceKey) => setOpenFace((current) => current === faceKey ? null : faceKey)} onSectionSelect={onSectionSelect} onSkyTimeChange={onSkyTimeChange} />
      <SkyMapOverlay gallery={gallery} selectedMission={selectedMission} onMissionSelect={(mission) => { setSelectedMission(mission); setCaptureOpen(false); }} activeSection={activeSection} skySnapshot={skySnapshot} />
    </>
  );
}

export default function Holodeck({ gallery = [], session = null, crew = null }) {
  const activeCrewKey = String(crew?.callSign || '').toLowerCase();
  const [booted, setBooted] = useState(false);
  const [openFace, setOpenFace] = useState(activeCrewKey || null);
  const [selectedMission, setSelectedMission] = useState(gallery[0] || null);
  const [activeSection, setActiveSection] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const [xrError, setXrError] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [skySnapshot, setSkySnapshot] = useState(() => new Date());
  const [viewMode, setViewMode] = useState('first');
  const initialPosition = useMemo(() => getCrewSpawn(activeCrewKey), [activeCrewKey]);
  const { remoteCrew, connectionState, publishPose } = useHolodeckPresence({
    session,
    crew,
    enabled: booted,
    activeSection,
  });

  useEffect(() => {
    if (!selectedMission && gallery.length) setSelectedMission(gallery[0]);
  }, [gallery, selectedMission]);

  useEffect(() => {
    if (activeCrewKey) setOpenFace(activeCrewKey);
  }, [activeCrewKey]);

  useEffect(() => {
    if (!booted) return undefined;
    const onViewKey = (event) => {
      if (event.code !== 'KeyV' || event.repeat) return;
      const tag = String(event.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      setViewMode((current) => current === 'first' ? 'third' : 'first');
    };
    window.addEventListener('keydown', onViewKey);
    return () => window.removeEventListener('keydown', onViewKey);
  }, [booted]);

  function selectSection(key) {
    setActiveSection(key);
    if (key !== 'sky') setOpenFace(null);
    setFocusRequest({ key: `${key}-${Date.now()}`, preset: SECTION_PRESETS[key] });
  }

  function adjustSkyTime(action) {
    setSkySnapshot((current) => {
      const next = new Date(current);
      if (action === 'now') return new Date();
      if (action === 'midnight') {
        next.setHours(0, 0, 0, 0);
        return next;
      }
      if (action === '+1h') {
        next.setHours(next.getHours() + 1);
        return next;
      }
      if (action === '-1h') {
        next.setHours(next.getHours() - 1);
        return next;
      }
      return current;
    });
    setActiveSection('sky');
    setFocusRequest({ key: `sky-${Date.now()}`, preset: SECTION_PRESETS.sky });
  }

  async function enterVR() {
    setXrError('');
    try {
      await xrStore.enterVR();
    } catch (error) {
      console.error('Holodeck VR entry failed:', error);
      setXrError('VR session unavailable. Use an HTTPS WebXR-capable headset/browser.');
    }
  }

  return (
    <div className="virtualWatchFloor">
      {!booted && (
        <div className="virtualWatchBoot">
          <div className="virtualWatchBootMark">∞</div>
          <p>CREW AUTHENTICATED // {crew?.callSign || 'UNKNOWN'}</p>
          <h1>THE HOLODECK</h1>
          <span>{crew?.role || 'CUZBRO CREW'} // SESSION {session?.user?.id ? 'VERIFIED' : 'UNVERIFIED'}</span>
          <button type="button" onClick={() => setBooted(true)}>ENTER AS {crew?.callSign || 'CREW'}</button>
        </div>
      )}

      <div className="virtualWatchCanvas">
        <Canvas camera={{ position: [0, 1.72, 8.6], fov: 68, near: 0.1, far: 100 }} gl={{ antialias: true }}>
          <XR store={xrStore}>
            <Suspense fallback={null}>
              <Room
                gallery={gallery}
                selectedMission={selectedMission}
                setSelectedMission={setSelectedMission}
                openFace={openFace}
                setOpenFace={setOpenFace}
                activeSection={activeSection}
                onSectionSelect={selectSection}
                focusRequest={focusRequest}
                clearFocus={() => setFocusRequest(null)}
                controlsEnabled={booted}
                captureOpen={captureOpen}
                setCaptureOpen={setCaptureOpen}
                skySnapshot={skySnapshot}
                onSkyTimeChange={adjustSkyTime}
                activeCrewKey={activeCrewKey}
                initialPosition={initialPosition}
                onPose={publishPose}
                remoteCrew={remoteCrew}
                viewMode={viewMode}
                crew={crew}
              />
            </Suspense>
          </XR>
        </Canvas>
      </div>

      {booted && (
        <>
          <a href="/admin" className="virtualWatchExit"><ChevronLeft size={18} /> EXIT HOLODECK</a>
          <div className="virtualWatchHelp">WASD TO MOVE · CLICK + DRAG TO LOOK · V TO CHANGE VIEW · USE THE CENTER CONTROL PILLAR</div>
          <div className="virtualWatchViewToggle" role="group" aria-label="Holodeck camera view">
            <span>VIEW</span>
            <button type="button" className={viewMode === 'first' ? 'active' : ''} onClick={() => setViewMode('first')}>FIRST PERSON</button>
            <button type="button" className={viewMode === 'third' ? 'active' : ''} onClick={() => setViewMode('third')}>THIRD PERSON</button>
          </div>
          <button type="button" className="virtualWatchVrButton virtualWatchVrStandalone" onClick={enterVR}>ENTER VR</button>
          <div style={{ position: 'fixed', right: '1.4rem', top: '1.4rem', zIndex: 12, padding: '.72rem 1rem', border: '1px solid rgba(255,138,43,.4)', borderRadius: '999px', background: 'rgba(12,6,2,.78)', color: '#ffd6a8', fontFamily: 'monospace', letterSpacing: '.12em', fontSize: '.75rem' }}>CREW // {crew?.callSign || 'UNKNOWN'} · {crew?.role || 'CREW'}</div>
          <div style={{ position: 'fixed', right: '1.4rem', top: '4.75rem', zIndex: 12, padding: '.58rem .85rem', border: `1px solid ${connectionState === 'ONLINE' ? 'rgba(71,240,167,.5)' : 'rgba(143,234,255,.25)'}`, borderRadius: '999px', background: 'rgba(2,7,13,.78)', color: connectionState === 'ONLINE' ? '#91ffd0' : '#8feaff', fontFamily: 'monospace', letterSpacing: '.1em', fontSize: '.68rem' }}>HOLODECK LINK // {connectionState} · {remoteCrew.length + 1} CREW</div>
          {activeSection && <div className="virtualWatchSectionState"><span style={{ background: SECTION_COLORS[activeSection] }} /> ARRAY FOCUS // {activeSection.toUpperCase()}</div>}
          {xrError && <div className="virtualWatchXrError"><X size={15} /> {xrError}</div>}
        </>
      )}
    </div>
  );
}
