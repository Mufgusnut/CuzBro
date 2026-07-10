import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, Html, Stars, Text } from '@react-three/drei';
import { XR, createXRStore } from '@react-three/xr';
import { ChevronLeft, X } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Body, Equator, Horizon, Observer } from 'astronomy-engine';

const xrStore = createXRStore();

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

function CameraRig({ enabled, focusRequest, onFocusComplete }) {
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

  useEffect(() => {
    camera.position.set(0, 1.72, 8.6);

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
      pitch.current = THREE.MathUtils.clamp(pitch.current - dy * 0.003, -1.15, 1.05);
    };
    const onPointerUp = () => {
      dragging.current = false;
    };

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
  }, [camera, enabled, gl]);

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

  useFrame((_, delta) => {
    if (!enabled) return;

    if (activeFocus.current && focusRequest?.preset) {
      focusProgress.current = Math.min(1, focusProgress.current + delta / 0.72);
      const eased = 1 - Math.pow(1 - focusProgress.current, 3);
      camera.position.lerpVectors(startPosition.current, new THREE.Vector3(...focusRequest.preset.position), eased);
      camera.quaternion.slerpQuaternions(startQuaternion.current, targetQuaternion.current, eased);
      if (focusProgress.current >= 1) {
        const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        yaw.current = euler.y;
        pitch.current = euler.x;
        activeFocus.current = null;
        onFocusComplete?.();
      }
      return;
    }

    camera.rotation.order = 'YXZ';
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;

    const speed = 4.25 * delta;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    const moving =
      keys.current.has('KeyW') ||
      keys.current.has('ArrowUp') ||
      keys.current.has('KeyS') ||
      keys.current.has('ArrowDown') ||
      keys.current.has('KeyA') ||
      keys.current.has('ArrowLeft') ||
      keys.current.has('KeyD') ||
      keys.current.has('ArrowRight');
    if (moving) activeFocus.current = null;

    const movement = new THREE.Vector3();
    if (keys.current.has('KeyW') || keys.current.has('ArrowUp')) movement.addScaledVector(forward, speed);
    if (keys.current.has('KeyS') || keys.current.has('ArrowDown')) movement.addScaledVector(forward, -speed);
    if (keys.current.has('KeyA') || keys.current.has('ArrowLeft')) movement.addScaledVector(right, -speed);
    if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) movement.addScaledVector(right, speed);

    if (movement.lengthSq() > 0) {
      const next = camera.position.clone().add(movement);
      const centerDistance = Math.hypot(next.x, next.z);
      const controlBoundary = 1.28;

      if (centerDistance < controlBoundary) {
        const currentDistance = Math.hypot(camera.position.x, camera.position.z);
        if (currentDistance >= controlBoundary) {
          const normal = new THREE.Vector2(next.x, next.z);
          if (normal.lengthSq() < 0.0001) normal.set(camera.position.x || 1, camera.position.z);
          normal.normalize().multiplyScalar(controlBoundary);
          next.x = normal.x;
          next.z = normal.y;
        } else {
          const normal = new THREE.Vector2(camera.position.x || 1, camera.position.z);
          normal.normalize().multiplyScalar(controlBoundary);
          next.x = normal.x;
          next.z = normal.y;
        }
      }

      camera.position.copy(next);
    }

    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -8.5, 8.5);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -8.5, 8.5);
    camera.position.y = 1.72;
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

function BloomOption({ label, sectionKey, angle, selected, onSelect }) {
  const group = useRef();
  const radius = 0.64;
  const target = useMemo(
    () => new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.06),
    [angle]
  );

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.position.lerp(target, 1 - Math.exp(-delta * 11));
    const nextScale = THREE.MathUtils.lerp(group.current.scale.x, 1, 1 - Math.exp(-delta * 12));
    group.current.scale.setScalar(nextScale);
  });

  return (
    <group
      ref={group}
      scale={0.08}
      position={[0, 0, 0.06]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(sectionKey);
      }}
    >
      <mesh>
        <circleGeometry args={[0.2, 48]} />
        <meshBasicMaterial color="#120d08" transparent opacity={0.84} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, -0.001]}>
        <ringGeometry args={[0.155, 0.165, 48]} />
        <meshBasicMaterial color="#ff9a3d" transparent opacity={0.42} />
      </mesh>
      <mesh position={[0, 0, 0.003]}>
        <ringGeometry args={[0.185, 0.21, 48]} />
        <meshBasicMaterial color={SECTION_COLORS[sectionKey]} transparent opacity={selected ? 1 : 0.78} />
      </mesh>
      <mesh position={[0, 0, -0.002]}>
        <circleGeometry args={[0.17, 48]} />
        <meshBasicMaterial color={SECTION_COLORS[sectionKey]} transparent opacity={selected ? 0.22 : 0.12} depthWrite={false} />
      </mesh>
      <Text
        position={[0, 0, 0.01]}
        fontSize={0.05}
        maxWidth={0.28}
        textAlign="center"
        color="#f0fdff"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
}


function SkyTimeChip({ label, angle, selected, onClick }) {
  const group = useRef();
  const width = label.length > 4 ? 0.34 : 0.2;
  const target = useMemo(
    () => new THREE.Vector3(Math.cos(angle) * 1.02, Math.sin(angle) * 1.02, 0.09),
    [angle]
  );

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.position.lerp(target, 1 - Math.exp(-delta * 11));
    const nextScale = THREE.MathUtils.lerp(group.current.scale.x, 1, 1 - Math.exp(-delta * 12));
    group.current.scale.setScalar(nextScale);
  });

  return (
    <group
      ref={group}
      scale={0.08}
      position={[0, 0, 0.08]}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <mesh>
        <planeGeometry args={[width, 0.12]} />
        <meshBasicMaterial color="#231408" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[width - 0.02, 0.092]} />
        <meshBasicMaterial color="#ff8a2b" transparent opacity={selected ? 0.22 : 0.1} depthWrite={false} />
      </mesh>
      <Text position={[0, 0, 0.01]} fontSize={0.04} color={selected ? '#fff1df' : '#ffd6a8'} anchorX="center" anchorY="middle">
        {label}
      </Text>
    </group>
  );
}

function ControlPillar({ openFace, activeSection, selectedMission, skySnapshot, activeCrewKey, onFaceToggle, onSectionSelect, onSkyTimeChange }) {
  const options = [
    ['MISSIONS', 'missions', Math.PI],
    ['SKY MAP', 'sky', Math.PI / 2],
    ['CREW COMMS', 'comms', 0],
    ['LIVE SYSTEMS', 'systems', -Math.PI / 2],
  ];

  const faces = [
    { key: 'dave', label: 'DAVE', rotation: [0, 0, 0], position: [0, 0, 0.72] },
    { key: 'justin', label: 'JUSTIN', rotation: [0, (Math.PI * 2) / 3, 0], position: [0.624, 0, -0.36] },
    { key: 'chappy', label: 'CHAPPY', rotation: [0, -(Math.PI * 2) / 3, 0], position: [-0.624, 0, -0.36] },
  ];

  const triangleShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.82);
    shape.lineTo(-0.71, -0.41);
    shape.lineTo(0.71, -0.41);
    shape.closePath();
    return shape;
  }, []);

  const connectorPositions = useMemo(() => {
    const values = [];
    options.forEach(([, , angle]) => {
      values.push(0, 0, 0.05, Math.cos(angle) * 0.53, Math.sin(angle) * 0.53, 0.05);
    });
    return new Float32Array(values);
  }, []);

  const skyControls = [
    { label: 'MIDNIGHT', action: 'midnight', angle: 2.36 },
    { label: '-1H', action: '-1h', angle: 2.02 },
    { label: 'NOW', action: 'now', angle: 1.56 },
    { label: '+1H', action: '+1h', angle: 1.1 },
  ];

  const skyTimeLabel = useMemo(() => formatSkySnapshotLabel(skySnapshot), [skySnapshot]);

  return (
    <group>
      <mesh position={[0, 0.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[triangleShape, { depth: 3.08, bevelEnabled: false }]} />
        <meshStandardMaterial color="#251006" metalness={0.92} roughness={0.16} emissive={openFace ? '#ff7b1f' : '#5a2108'} emissiveIntensity={openFace ? 0.72 : 0.28} />
      </mesh>

      <mesh position={[0, 3.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[triangleShape]} />
        <meshStandardMaterial color="#4b1807" metalness={0.9} roughness={0.18} emissive="#ff8a2b" emissiveIntensity={0.32} />
      </mesh>
      <mesh position={[0, 0.21, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[triangleShape]} />
        <meshStandardMaterial color="#4b1807" metalness={0.9} roughness={0.18} emissive="#ff8a2b" emissiveIntensity={0.18} />
      </mesh>

      {faces.map((face) => {
        const isOpen = openFace === face.key;
        const isCurrentCrew = activeCrewKey === face.key;
        return (
          <group key={face.key} position={[face.position[0], face.position[1] + 1.72, face.position[2]]} rotation={face.rotation}>
            <mesh position={[0, 0, 0.02]}>
              <planeGeometry args={[1.58, 2.74]} />
              <meshStandardMaterial color="#1b0c05" emissive={isOpen ? '#ff8a2b' : isCurrentCrew ? '#b7440c' : '#401406'} emissiveIntensity={isOpen ? 0.72 : isCurrentCrew ? 0.46 : 0.22} metalness={0.68} roughness={0.18} />
            </mesh>
            <mesh position={[0, 0, 0.023]}>
              <planeGeometry args={[1.42, 2.58]} />
              <meshBasicMaterial color="#ff8a2b" transparent opacity={isOpen ? 0.13 : 0.07} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0, 0.025]}>
              <planeGeometry args={[1.34, 2.5]} />
              <meshBasicMaterial color="#ffd5a5" transparent opacity={isOpen ? 0.045 : 0.02} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0, 0.026]}>
              <ringGeometry args={[0.62, 0.628, 72]} />
              <meshBasicMaterial color="#ffb263" transparent opacity={isOpen ? 0.26 : 0.12} />
            </mesh>

            <Text position={[0, 1.06, 0.05]} fontSize={0.105} color={isCurrentCrew ? '#fff6eb' : '#ffe4c6'} letterSpacing={0.14}>
              {face.label}{isCurrentCrew ? ' // YOU' : ''}
            </Text>

            {isOpen && (
              <>
                <mesh position={[0, 0, 0.045]}>
                  <circleGeometry args={[0.8, 72]} />
                  <meshBasicMaterial color="#110b07" transparent opacity={0.28} depthWrite={false} />
                </mesh>
                <mesh position={[0, 0, 0.048]}>
                  <ringGeometry args={[0.58, 0.592, 72]} />
                  <meshBasicMaterial color="#ff9a3d" transparent opacity={0.5} />
                </mesh>
                <mesh position={[0, 0, 0.049]}>
                  <ringGeometry args={[0.77, 0.782, 96]} />
                  <meshBasicMaterial color="#ff9a3d" transparent opacity={0.22} />
                </mesh>
                <lineSegments>
                  <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[connectorPositions, 3]} />
                  </bufferGeometry>
                  <lineBasicMaterial color="#ffb263" transparent opacity={0.48} />
                </lineSegments>
                {options.map(([label, key, angle]) => (
                  <BloomOption key={key} label={label} sectionKey={key} angle={angle} selected={activeSection === key} onSelect={onSectionSelect} />
                ))}
                {activeSection === 'sky' && (
                  <>
                    {skyControls.map((control) => (
                      <SkyTimeChip
                        key={control.action}
                        label={control.label}
                        angle={control.angle}
                        selected={control.action === 'now'}
                        onClick={() => onSkyTimeChange(control.action)}
                      />
                    ))}
                    <Text position={[0, -1.02, 0.08]} fontSize={0.05} color="#ffd6a8" anchorX="center">SKY TIME // {skyTimeLabel}</Text>
                  </>
                )}
              </>
            )}

            <group
              onClick={(event) => {
                event.stopPropagation();
                onFaceToggle(face.key);
              }}
            >
              <mesh position={[0, 0, 0.04]}>
                <circleGeometry args={[0.205, 56]} />
                <meshStandardMaterial color="#2d1307" emissive="#ff8a2b" emissiveIntensity={isOpen ? 1.6 : 1.05} metalness={0.82} roughness={0.18} />
              </mesh>
              <mesh position={[0, 0, 0.043]}>
                <ringGeometry args={[0.175, 0.208, 56]} />
                <meshBasicMaterial color="#ffe7c7" transparent opacity={0.84} />
              </mesh>
              <Text position={[0, 0, 0.048]} fontSize={0.045} color="#fff6eb" anchorX="center" anchorY="middle">
                {isOpen ? 'CLOSE' : 'ACTIVATE'}
              </Text>
            </group>
          </group>
        );
      })}

      <pointLight position={[0, 2.2, 0]} color={openFace ? '#ff8a2b' : '#ff6f1a'} intensity={openFace ? 9 : 3.2} distance={5.4} />
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
        <Html transform position={[0, -0.35, 0.08]} distanceFactor={1.15} occlude={false}>
          <div style={{ width: '300px', height: '170px', border: '1px solid rgba(132,223,241,.26)', background: 'rgba(2,7,13,.92)', boxShadow: '0 0 25px rgba(70,221,255,.12)', overflow: 'hidden' }}>
            <img src={previewUrl} alt={selectedMission?.title || 'Mission preview'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        </Html>
      )}
    </group>
  );
}

function MissionDetailPanel({ mission, captureOpen, activeSection, previewUrl, onOpenCapture }) {
  if (!mission || activeSection !== 'missions') return null;
  const lines = [
    mission.objectType || mission.category || 'MISSION CAPTURE',
    mission.date ? `CAPTURED // ${mission.date}` : 'CUZBRO MISSION ARCHIVE',
    mission.equipment || mission.telescope || 'CPC 800 // PRIMARY OBSERVATION PLATFORM',
  ];
  return (
    <group position={[-4.95, 1.95, -7.92]}>
      <mesh>
        <planeGeometry args={[3.8, 2.35]} />
        <meshBasicMaterial color="#06131c" transparent opacity={0.92} />
      </mesh>
      <Text position={[-1.55, 0.75, 0.02]} fontSize={0.22} color="#eaffff" anchorX="left">{mission.title || 'MISSION CAPTURE'}</Text>
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
        <Html transform position={[0.72, 0.28, 0.03]} distanceFactor={1.2} occlude={false}>
          <div style={{ width: '170px', height: '110px', border: '1px solid rgba(132,223,241,.24)', background: 'rgba(2,7,13,.92)', overflow: 'hidden' }}>
            <img src={previewUrl} alt={mission?.title || 'Mission preview'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        </Html>
      )}
    </group>
  );
}

function DeepSkyWindow({ selectedMission, captureOpen, activeSection }) {
  const imageUrl = getImageUrl(getMissionImage(selectedMission));

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

      {captureOpen && imageUrl && (
        <Html transform position={[0, 0, 0.04]} distanceFactor={1} occlude={false} style={{ pointerEvents: 'none' }}>
          <div style={{ width: '860px', height: '440px', overflow: 'hidden', background: '#02070d', border: '1px solid rgba(132,223,241,.28)', boxShadow: '0 0 45px rgba(70,221,255,.16)' }}>
            <img src={imageUrl} alt={selectedMission?.title || 'Archived mission capture'} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#02070d' }} />
          </div>
        </Html>
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
      {(captureOpen || activeSection === 'missions') && (
        <Text position={[0, -2.42, 0.05]} fontSize={0.15} color="#84dff1">
          {captureOpen && selectedMission ? `${selectedMission.title} // ARCHIVED MISSION CAPTURE` : 'DEEP SKY WINDOW // PROJECTION STANDBY'}
        </Text>
      )}
    </group>
  );
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

function Room({ gallery, selectedMission, setSelectedMission, openFace, setOpenFace, activeSection, onSectionSelect, focusRequest, clearFocus, controlsEnabled, captureOpen, setCaptureOpen, skySnapshot, onSkyTimeChange, activeCrewKey }) {
  const activeColor = SECTION_COLORS[activeSection] || '#1ba8cf';
  const previewUrl = getImageUrl(getMissionImage(selectedMission));

  return (
    <>
      <CameraRig enabled={controlsEnabled} focusRequest={focusRequest} onFocusComplete={clearFocus} />
      <color attach="background" args={['#01040a']} />
      <fog attach="fog" args={['#02060b', 11, 28]} />
      <ambientLight intensity={0.38} />
      <directionalLight position={[2, 8, 4]} intensity={1.2} color="#b9ebff" />
      <pointLight position={[0, 4.8, 0]} intensity={activeSection ? 22 : 16} distance={13} color={activeColor} />
      <Stars radius={35} depth={20} count={2200} factor={3} saturation={0} fade speed={0.25} />

      <mesh position={[0, -0.08, 0]}><cylinderGeometry args={[9.8, 9.8, 0.18, 96]} /><meshStandardMaterial color="#050b10" metalness={0.78} roughness={0.36} /></mesh>
      <RingLight radius={3.9} color={activeColor} /><RingLight radius={7.25} opacity={0.18} color={activeColor} />

      <mesh position={[0, 4.9, 0]} rotation={[Math.PI, 0, 0]}><cylinderGeometry args={[9.6, 9.6, 0.12, 96]} /><meshStandardMaterial color="#02060a" metalness={0.65} roughness={0.5} transparent opacity={0.78} /></mesh>

      <DeepSkyWindow selectedMission={selectedMission} captureOpen={captureOpen} activeSection={activeSection} />
      <MissionDetailPanel mission={selectedMission} captureOpen={captureOpen} activeSection={activeSection} previewUrl={previewUrl} onOpenCapture={() => setCaptureOpen((value) => !value)} />
      <MissionWall gallery={gallery} selectedMission={selectedMission} previewUrl={previewUrl} onMissionSelect={(mission) => { setSelectedMission(mission); setCaptureOpen(false); }} onOpenCapture={() => setCaptureOpen((value) => !value)} captureOpen={captureOpen} />
      <CrewStations activeSection={activeSection} activeCrewKey={activeCrewKey} />
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

  useEffect(() => {
    if (!selectedMission && gallery.length) setSelectedMission(gallery[0]);
  }, [gallery, selectedMission]);

  useEffect(() => {
    if (activeCrewKey) setOpenFace(activeCrewKey);
  }, [activeCrewKey]);

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
              />
            </Suspense>
          </XR>
        </Canvas>
      </div>

      {booted && (
        <>
          <a href="/admin" className="virtualWatchExit"><ChevronLeft size={18} /> EXIT HOLODECK</a>
          <div className="virtualWatchHelp">WASD TO MOVE · CLICK + DRAG TO LOOK · USE THE CENTER CONTROL PILLAR</div>
          <button type="button" className="virtualWatchVrButton virtualWatchVrStandalone" onClick={enterVR}>ENTER VR</button>
          <div style={{ position: 'fixed', right: '1.4rem', top: '1.4rem', zIndex: 12, padding: '.72rem 1rem', border: '1px solid rgba(255,138,43,.4)', borderRadius: '999px', background: 'rgba(12,6,2,.78)', color: '#ffd6a8', fontFamily: 'monospace', letterSpacing: '.12em', fontSize: '.75rem' }}>CREW // {crew?.callSign || 'UNKNOWN'} · {crew?.role || 'CREW'}</div>
          {activeSection && <div className="virtualWatchSectionState"><span style={{ background: SECTION_COLORS[activeSection] }} /> ARRAY FOCUS // {activeSection.toUpperCase()}</div>}
          {xrError && <div className="virtualWatchXrError"><X size={15} /> {xrError}</div>}
        </>
      )}
    </div>
  );
}
