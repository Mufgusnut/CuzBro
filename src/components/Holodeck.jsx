import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Stars, Text } from '@react-three/drei';
import { XR, createXRStore } from '@react-three/xr';
import { ChevronLeft, X } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

const xrStore = createXRStore();

const SECTION_PRESETS = {
  missions: { position: [-4.45, 1.72, -1.2], lookAt: [-7.75, 2.18, -1.2] },
  sky: { position: [0, 1.72, 2.65], lookAt: [0, 5.1, 0] },
  comms: { position: [0.95, 1.72, 4.15], lookAt: [3.35, 2.2, 0.25] },
  systems: { position: [3.45, 1.72, 0.95], lookAt: [6.55, 2.28, 3.85] },
};

const SECTION_COLORS = {
  missions: '#2bc6ef',
  sky: '#8f78ff',
  comms: '#39f2b2',
  systems: '#ffb75c',
};

function getMissionImage(mission) {
  return mission?.image || mission?.stackedImage || mission?.rawImage || '';
}

function getImageUrl(image) {
  if (!image) return '';
  if (/^(https?:|blob:|data:)/.test(image)) return image;
  return `${import.meta.env.BASE_URL}${String(image).replace(/^\/+/, '')}`;
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
        <meshBasicMaterial color="#071520" transparent opacity={0.82} depthWrite={false} />
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

function ControlPillar({ openFace, activeSection, selectedMission, onFaceToggle, onSectionSelect }) {
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

  return (
    <group>
      <mesh position={[0, 0.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[triangleShape, { depth: 3.08, bevelEnabled: false }]} />
        <meshStandardMaterial color="#08111a" metalness={0.86} roughness={0.22} emissive={openFace ? '#0a3140' : '#02070b'} emissiveIntensity={openFace ? 0.48 : 0.14} />
      </mesh>

      <mesh position={[0, 3.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[triangleShape]} />
        <meshStandardMaterial color="#112531" metalness={0.86} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.21, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[triangleShape]} />
        <meshStandardMaterial color="#112531" metalness={0.86} roughness={0.2} />
      </mesh>

      {faces.map((face) => {
        const isOpen = openFace === face.key;
        return (
          <group key={face.key} position={[face.position[0], face.position[1] + 1.72, face.position[2]]} rotation={face.rotation}>
            <mesh position={[0, 0, 0.02]}>
              <planeGeometry args={[1.46, 2.62]} />
              <meshStandardMaterial color="#07111a" emissive={isOpen ? '#072534' : '#01060a'} emissiveIntensity={isOpen ? 0.52 : 0.08} metalness={0.55} roughness={0.28} />
            </mesh>
            <mesh position={[0, 0, 0.024]}>
              <planeGeometry args={[1.28, 2.44]} />
              <meshBasicMaterial color="#46ddff" transparent opacity={isOpen ? 0.08 : 0.03} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0, 0.026]}>
              <ringGeometry args={[0.62, 0.625, 72]} />
              <meshBasicMaterial color="#71e8ff" transparent opacity={isOpen ? 0.2 : 0.08} />
            </mesh>

            <Text position={[0, 1.02, 0.05]} fontSize={0.1} color="#8cc9da" letterSpacing={0.14}>
              {face.label}
            </Text>

            {isOpen && (
              <>
                <mesh position={[0, 0, 0.045]}>
                  <circleGeometry args={[0.78, 72]} />
                  <meshBasicMaterial color="#071722" transparent opacity={0.22} depthWrite={false} />
                </mesh>
                <mesh position={[0, 0, 0.048]}>
                  <ringGeometry args={[0.58, 0.585, 72]} />
                  <meshBasicMaterial color="#71e8ff" transparent opacity={0.34} />
                </mesh>
                <mesh position={[0, 0, 0.049]}>
                  <ringGeometry args={[0.77, 0.775, 96]} />
                  <meshBasicMaterial color="#71e8ff" transparent opacity={0.16} />
                </mesh>
                <lineSegments>
                  <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[connectorPositions, 3]} />
                  </bufferGeometry>
                  <lineBasicMaterial color="#71e8ff" transparent opacity={0.42} />
                </lineSegments>
                {options.map(([label, key, angle]) => (
                  <BloomOption key={key} label={label} sectionKey={key} angle={angle} selected={activeSection === key} onSelect={onSectionSelect} />
                ))}
              </>
            )}

            <group
              onClick={(event) => {
                event.stopPropagation();
                onFaceToggle(face.key);
              }}
            >
              <mesh position={[0, 0, 0.04]}>
                <circleGeometry args={[0.2, 56]} />
                <meshStandardMaterial color="#0a1923" emissive="#46ddff" emissiveIntensity={isOpen ? 1.25 : 0.82} metalness={0.68} roughness={0.24} />
              </mesh>
              <mesh position={[0, 0, 0.043]}>
                <ringGeometry args={[0.175, 0.202, 56]} />
                <meshBasicMaterial color="#b6fbff" transparent opacity={0.78} />
              </mesh>
              <Text position={[0, 0, 0.048]} fontSize={0.045} color="#f3feff" anchorX="center" anchorY="middle">
                {isOpen ? 'CLOSE' : 'ACTIVATE'}
              </Text>
            </group>
          </group>
        );
      })}

      <pointLight position={[0, 2.2, 0]} color={activeSection ? SECTION_COLORS[activeSection] : '#46ddff'} intensity={openFace ? 7 : 1.8} distance={4.8} />
      {selectedMission && (
        <Text position={[0, 3.36, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.11} color="#8feaff" anchorX="center">
          {selectedMission.title}
        </Text>
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

function CrewStations({ activeSection }) {
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
        <meshBasicMaterial color={name === 'DAVE' ? '#47f0a7' : '#56707a'} />
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

function SkyMapOverlay({ gallery, selectedMission, onMissionSelect, activeSection }) {
  const targets = gallery.slice(0, 12);
  const visible = activeSection === 'sky';
  const points = useMemo(() =>
    targets.map((mission, index) => {
      const angle = (index / Math.max(targets.length, 1)) * Math.PI * 2 + (index % 3) * 0.18;
      const radius = 1.7 + (index % 4) * 1.35;
      return {
        mission,
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        drop: 0.16 + (index % 5) * 0.11,
      };
    }),
  [targets]);

  const linePositions = useMemo(() => {
    const values = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      if (i % 4 === 3) continue;
      values.push(points[i].x, -0.035, points[i].z, points[i + 1].x, -0.035, points[i + 1].z);
    }
    return new Float32Array(values);
  }, [points]);

  if (!visible) return null;

  return (
    <group position={[0, 4.74, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[8.5, 120]} />
        <meshBasicMaterial color="#07061a" transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <ringGeometry args={[8.15, 8.35, 160]} />
        <meshBasicMaterial color="#ac9dff" transparent opacity={0.38} />
      </mesh>
      {[1.7, 3.4, 5.1, 6.8].map((radius) => (
        <mesh key={radius} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.024, 0]}>
          <ringGeometry args={[radius - 0.015, radius + 0.015, 128]} />
          <meshBasicMaterial color="#8f78ff" transparent opacity={0.28} />
        </mesh>
      ))}
      {Array.from({ length: 12 }).map((_, index) => {
        const rotation = (index / 12) * Math.PI * 2;
        return (
          <mesh key={index} position={[0, -0.026, 0]} rotation={[Math.PI / 2, 0, rotation]}>
            <planeGeometry args={[15.8, 0.018]} />
            <meshBasicMaterial color="#8f78ff" transparent opacity={0.2} />
          </mesh>
        );
      })}

      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#c6bcff" transparent opacity={0.34} />
      </lineSegments>

      {points.map(({ mission, x, z, drop }) => {
        const active = selectedMission?.id === mission.id;
        return (
          <group key={mission.id || mission.title} position={[x, -drop, z]} onClick={(event) => { event.stopPropagation(); onMissionSelect(mission); }}>
            <mesh position={[0, drop / 2, 0]}>
              <cylinderGeometry args={[0.008, 0.008, drop, 8]} />
              <meshBasicMaterial color="#9e8bff" transparent opacity={0.35} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[active ? 0.16 : 0.085, active ? 0.235 : 0.14, 32]} />
              <meshBasicMaterial color={active ? '#ffb75c' : '#d1c7ff'} transparent opacity={0.96} />
            </mesh>
            <mesh position={[0, -0.02, 0]}>
              <sphereGeometry args={[0.042, 16, 16]} />
              <meshBasicMaterial color={active ? '#ffd39a' : '#f0ebff'} />
            </mesh>
            <Text position={[0.2, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]} fontSize={0.09} color={active ? '#ffd39a' : '#ddd7ff'} anchorX="left">
              {mission.title || 'TARGET'}
            </Text>
          </group>
        );
      })}

      {selectedMission && (
        <group position={[0, -0.88, -0.2]}>
          <mesh>
            <planeGeometry args={[4.2, 1.2]} />
            <meshBasicMaterial color="#0b0920" transparent opacity={0.88} />
          </mesh>
          <mesh position={[0, 0, 0.01]}>
            <planeGeometry args={[3.95, 0.96]} />
            <meshBasicMaterial color="#8f78ff" transparent opacity={0.06} />
          </mesh>
          <Text position={[0, 0.24, 0.02]} fontSize={0.17} color="#efeaff" anchorX="center">{selectedMission.title || 'TARGET SELECTED'}</Text>
          <Text position={[0, -0.02, 0.02]} fontSize={0.085} color="#b7a9ff" anchorX="center">{String(selectedMission.objectType || selectedMission.category || 'Mission target').toUpperCase()}</Text>
          <Text position={[0, -0.28, 0.02]} fontSize={0.075} color="#887ae0" anchorX="center">LINKED TO MISSION ARCHIVE // CEILING CELESTIAL OVERLAY</Text>
        </group>
      )}

      <Text position={[0, -0.06, -7.7]} rotation={[Math.PI / 2, 0, 0]} fontSize={0.25} color="#b5a8ff">CUZBRO SKY MAP // CEILING HOLOGRAM</Text>
      <Text position={[0, -0.06, 7.55]} rotation={[Math.PI / 2, Math.PI, 0]} fontSize={0.1} color="#8f78ff">SELECT TARGET MARKER TO LINK MISSION RECORD</Text>
      <pointLight position={[0, -0.78, 0]} color="#8f78ff" intensity={18} distance={11} />
    </group>
  );
}

function Room({ gallery, selectedMission, setSelectedMission, openFace, setOpenFace, activeSection, onSectionSelect, focusRequest, clearFocus, controlsEnabled, captureOpen, setCaptureOpen }) {
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
      <CrewStations activeSection={activeSection} />
      <TelescopeDisplay activeSection={activeSection} />
      <CommsPanel activeSection={activeSection} />
      <SystemsPanel activeSection={activeSection} />
      <ControlPillar openFace={openFace} activeSection={activeSection} selectedMission={selectedMission} onFaceToggle={(faceKey) => setOpenFace((current) => current === faceKey ? null : faceKey)} onSectionSelect={onSectionSelect} />
      <SkyMapOverlay gallery={gallery} selectedMission={selectedMission} onMissionSelect={(mission) => { setSelectedMission(mission); setCaptureOpen(false); }} activeSection={activeSection} />
    </>
  );
}

export default function Holodeck({ gallery = [] }) {
  const [booted, setBooted] = useState(false);
  const [openFace, setOpenFace] = useState(null);
  const [selectedMission, setSelectedMission] = useState(gallery[0] || null);
  const [activeSection, setActiveSection] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const [xrError, setXrError] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);

  useEffect(() => {
    if (!selectedMission && gallery.length) setSelectedMission(gallery[0]);
  }, [gallery, selectedMission]);

  function selectSection(key) {
    setActiveSection(key);
    setOpenFace(null);
    setFocusRequest({ key: `${key}-${Date.now()}`, preset: SECTION_PRESETS[key] });
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
          <p>CUZBRO OBSERVATORY</p>
          <h1>THE HOLODECK</h1>
          <span>ELIOT, MAINE // IMMERSIVE OPERATIONS ENVIRONMENT</span>
          <button type="button" onClick={() => setBooted(true)}>ENTER HOLODECK</button>
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
              />
            </Suspense>
          </XR>
        </Canvas>
      </div>

      {booted && (
        <>
          <a href="/" className="virtualWatchExit"><ChevronLeft size={18} /> EXIT HOLODECK</a>
          <div className="virtualWatchHelp">WASD TO MOVE · CLICK + DRAG TO LOOK · USE THE CENTER CONTROL PILLAR</div>
          <button type="button" className="virtualWatchVrButton virtualWatchVrStandalone" onClick={enterVR}>ENTER VR</button>
          {activeSection && <div className="virtualWatchSectionState"><span style={{ background: SECTION_COLORS[activeSection] }} /> ARRAY FOCUS // {activeSection.toUpperCase()}</div>}
          {xrError && <div className="virtualWatchXrError"><X size={15} /> {xrError}</div>}
        </>
      )}
    </div>
  );
}
