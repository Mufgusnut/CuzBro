import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Stars, Text } from '@react-three/drei';
import { XR, createXRStore } from '@react-three/xr';
import { ChevronLeft, Crosshair, Radio, Telescope, Users, X } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

const xrStore = createXRStore();

const SECTION_PRESETS = {
  missions: { position: [-4.05, 2.15, -1.2], lookAt: [-7.75, 2.72, -1.2] },
  sky: { position: [0, 1.72, 2.2], lookAt: [0, 4.85, 0] },
  comms: { position: [2.2, 1.72, 1.7], lookAt: [2.6, 0.85, 1.95] },
  systems: { position: [3.9, 1.72, 3.5], lookAt: [6.5, 1.2, 5.4] },
};

const SECTION_COLORS = {
  missions: '#2bc6ef',
  sky: '#8f78ff',
  comms: '#39f2b2',
  systems: '#ffb75c',
};

function getImageUrl(image) {
  if (!image) return '';
  if (/^(https?:|blob:)/.test(image)) return image;
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
  }, [camera, enabled, gl]);

  useEffect(() => {
    if (!focusRequest?.key || !focusRequest?.preset) return;
    activeFocus.current = focusRequest.key;
    focusProgress.current = 0;
    startPosition.current.copy(camera.position);
    startQuaternion.current.copy(camera.quaternion);
    const targetObject = new THREE.Object3D();
    targetObject.position.copy(new THREE.Vector3(...focusRequest.preset.position));
    targetObject.lookAt(new THREE.Vector3(...focusRequest.preset.lookAt));
    targetQuaternion.current.copy(targetObject.quaternion);
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

    const moving = keys.current.has('KeyW') || keys.current.has('ArrowUp') || keys.current.has('KeyS') || keys.current.has('ArrowDown') || keys.current.has('KeyA') || keys.current.has('ArrowLeft') || keys.current.has('KeyD') || keys.current.has('ArrowRight');
    if (moving) activeFocus.current = null;

    if (keys.current.has('KeyW') || keys.current.has('ArrowUp')) camera.position.addScaledVector(forward, speed);
    if (keys.current.has('KeyS') || keys.current.has('ArrowDown')) camera.position.addScaledVector(forward, -speed);
    if (keys.current.has('KeyA') || keys.current.has('ArrowLeft')) camera.position.addScaledVector(right, -speed);
    if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) camera.position.addScaledVector(right, speed);

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
  const radius = 0.72;
  const target = useMemo(
    () => new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.13),
    [angle]
  );

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.position.lerp(target, 1 - Math.exp(-delta * 10));
    const nextScale = THREE.MathUtils.lerp(group.current.scale.x, 1, 1 - Math.exp(-delta * 12));
    group.current.scale.setScalar(nextScale);
  });

  return (
    <group
      ref={group}
      scale={0.04}
      position={[0, 0, 0.13]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(sectionKey);
      }}
    >
      <mesh>
        <circleGeometry args={[0.22, 48]} />
        <meshStandardMaterial
          color={selected ? '#173f4e' : '#071722'}
          emissive={SECTION_COLORS[sectionKey]}
          emissiveIntensity={selected ? 1.9 : 0.92}
          metalness={0.48}
          roughness={0.18}
          transparent
          opacity={0.9}
        />
      </mesh>
      <mesh position={[0, 0, 0.009]}>
        <ringGeometry args={[0.225, 0.255, 48]} />
        <meshBasicMaterial color={SECTION_COLORS[sectionKey]} transparent opacity={selected ? 1 : 0.78} />
      </mesh>
      <Text
        position={[0, 0, 0.03]}
        fontSize={0.058}
        maxWidth={0.34}
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
    { key: 'dave', label: 'DAVE', rotation: [0, 0, 0], position: [0, 0, 0.61] },
    { key: 'justin', label: 'JUSTIN', rotation: [0, (Math.PI * 2) / 3, 0], position: [0.528, 0, -0.305] },
    { key: 'chappy', label: 'CHAPPY', rotation: [0, -(Math.PI * 2) / 3, 0], position: [-0.528, 0, -0.305] },
  ];

  const triangleShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.69);
    shape.lineTo(-0.598, -0.345);
    shape.lineTo(0.598, -0.345);
    shape.closePath();
    return shape;
  }, []);

  const connectorPositions = useMemo(() => {
    const values = [];
    options.forEach(([, , angle]) => {
      values.push(0, 0, 0.1, Math.cos(angle) * 0.62, Math.sin(angle) * 0.62, 0.1);
    });
    return new Float32Array(values);
  }, []);

  return (
    <group>
      <mesh position={[0, 0.28, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[triangleShape, { depth: 2.58, bevelEnabled: false }]} />
        <meshStandardMaterial
          color="#07121b"
          metalness={0.86}
          roughness={0.24}
          emissive={openFace ? '#062f3f' : '#01070b'}
          emissiveIntensity={openFace ? 0.62 : 0.18}
        />
      </mesh>

      <mesh position={[0, 2.92, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[triangleShape]} />
        <meshStandardMaterial color="#10232d" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.27, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[triangleShape]} />
        <meshStandardMaterial color="#10232d" metalness={0.9} roughness={0.2} />
      </mesh>

      {faces.map((face) => {
        const isOpen = openFace === face.key;
        return (
          <group
            key={face.key}
            position={[face.position[0], face.position[1] + 1.58, face.position[2]]}
            rotation={face.rotation}
          >
            <mesh position={[0, 0, 0.018]}>
              <planeGeometry args={[1.04, 2.12]} />
              <meshStandardMaterial
                color="#040b11"
                emissive={isOpen ? '#031923' : '#000000'}
                emissiveIntensity={isOpen ? 0.8 : 0}
                metalness={0.62}
                roughness={0.34}
              />
            </mesh>

            <Text position={[0, 0.82, 0.07]} fontSize={0.09} color="#6fa8b8" letterSpacing={0.16}>
              {face.label}
            </Text>

            {isOpen && (
              <>
                <mesh position={[0, 0, 0.06]}>
                  <circleGeometry args={[0.92, 64]} />
                  <meshBasicMaterial color="#05131c" transparent opacity={0.28} depthWrite={false} />
                </mesh>
                <mesh position={[0, 0, 0.075]}>
                  <ringGeometry args={[0.79, 0.805, 72]} />
                  <meshBasicMaterial color="#46ddff" transparent opacity={0.3} />
                </mesh>
                <lineSegments>
                  <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[connectorPositions, 3]} />
                  </bufferGeometry>
                  <lineBasicMaterial color="#71e8ff" transparent opacity={0.42} />
                </lineSegments>
                {options.map(([label, key, angle]) => (
                  <BloomOption
                    key={key}
                    label={label}
                    sectionKey={key}
                    angle={angle}
                    selected={activeSection === key}
                    onSelect={onSectionSelect}
                  />
                ))}
              </>
            )}

            <group
              onClick={(event) => {
                event.stopPropagation();
                onFaceToggle(face.key);
              }}
            >
              <mesh position={[0, 0, 0.115]}>
                <cylinderGeometry args={[0.19, 0.19, 0.075, 48]} />
                <meshStandardMaterial
                  color="#0a1b26"
                  emissive="#46ddff"
                  emissiveIntensity={isOpen ? 1.6 : 1.1}
                  metalness={0.72}
                  roughness={0.18}
                />
              </mesh>
              <mesh position={[0, 0, 0.158]}>
                <circleGeometry args={[0.145, 48]} />
                <meshBasicMaterial color="#062632" transparent opacity={0.82} />
              </mesh>
              <Text position={[0, 0, 0.168]} fontSize={0.05} color="#e9fdff" anchorX="center" anchorY="middle">
                {isOpen ? 'CLOSE' : 'ACTIVATE'}
              </Text>
            </group>
          </group>
        );
      })}

      <pointLight
        position={[0, 2.05, 0]}
        color={activeSection ? SECTION_COLORS[activeSection] : '#46ddff'}
        intensity={openFace ? 7 : 1.8}
        distance={4.2}
      />
      {selectedMission && (
        <Text position={[0, 2.98, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.11} color="#8feaff" anchorX="center">
          {selectedMission.title}
        </Text>
      )}
    </group>
  );
}

function MissionWall({ gallery, selectedMission, onMissionSelect, onOpenCapture, captureOpen }) {
  const missions = gallery.slice(0, 8);
  return (
    <group position={[-7.75, 2.75, -1.2]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[6.9, 4.9, 0.18]} />
        <meshStandardMaterial color="#07131c" emissive="#082634" emissiveIntensity={0.65} metalness={0.48} roughness={0.42} />
      </mesh>
      <Text position={[0, 2.03, 0]} fontSize={0.27} color="#ffb75c">MISSION ARCHIVE</Text>
      <Text position={[0, 1.7, 0]} fontSize={0.095} color="#70bfd2">SELECT A RECORD // OPEN CAPTURE TO PROJECT ARCHIVED IMAGE</Text>
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
          <mesh><planeGeometry args={[2.55, 0.46]} /><meshStandardMaterial color={captureOpen ? '#3d2e10' : '#123a4a'} emissive={captureOpen ? '#ffb75c' : '#46ddff'} emissiveIntensity={0.85} /></mesh>
          <Text position={[0, 0, 0.025]} fontSize={0.11} color="#f4ffff" anchorX="center">{captureOpen ? 'CLOSE ARCHIVED CAPTURE' : 'OPEN ARCHIVED CAPTURE'}</Text>
        </group>
      )}
    </group>
  );
}

function MissionDetailPanel({ mission, captureOpen, activeSection }) {
  if (!mission || activeSection !== 'missions') return null;
  const lines = [
    mission.objectType || mission.category || 'MISSION CAPTURE',
    mission.date ? `CAPTURED // ${mission.date}` : 'CUZBRO MISSION ARCHIVE',
    mission.equipment || mission.telescope || 'CPC 800 // PRIMARY OBSERVATION PLATFORM',
  ];
  return (
    <group position={[-4.95, 2.2, -7.92]}>
      <mesh><planeGeometry args={[3.7, 2.1]} /><meshBasicMaterial color="#06131c" transparent opacity={0.92} /></mesh>
      <Text position={[-1.55, 0.63, 0.02]} fontSize={0.22} color="#eaffff" anchorX="left">{mission.title || 'MISSION CAPTURE'}</Text>
      {lines.map((line, index) => <Text key={`${line}-${index}`} position={[-1.55, 0.2 - index * 0.34, 0.02]} fontSize={0.105} color={index === 0 ? '#63dff5' : '#90b9c3'} anchorX="left">{String(line).toUpperCase()}</Text>)}
      <Text position={[-1.55, -0.78, 0.02]} fontSize={0.09} color={captureOpen ? '#ffb75c' : '#6f9aa5'} anchorX="left">{captureOpen ? 'ARCHIVED CAPTURE PROJECTED // DEEP SKY WINDOW' : 'ARCHIVE RECORD SELECTED // CAPTURE CLOSED'}</Text>
    </group>
  );
}

function DeepSkyWindow({ selectedMission, captureOpen, activeSection }) {
  const imageUrl = getImageUrl(selectedMission?.image);

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
        <Html
          transform
          position={[0, 0, 0.035]}
          distanceFactor={1}
          occlude={false}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              width: '860px',
              height: '440px',
              overflow: 'hidden',
              background: '#02070d',
              border: '1px solid rgba(132,223,241,.28)',
              boxShadow: '0 0 45px rgba(70,221,255,.16)',
            }}
          >
            <img
              src={imageUrl}
              alt={selectedMission?.title || 'Archived mission capture'}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            />
          </div>
        </Html>
      )}

      {!captureOpen && activeSection === 'missions' && (
        <Text position={[0, 0, 0.03]} fontSize={0.18} color="#315766" anchorX="center">
          PROJECTION STANDBY
        </Text>
      )}
      {(captureOpen || activeSection === 'missions') && (
        <Text position={[0, -2.42, 0.05]} fontSize={0.15} color="#84dff1">
          {captureOpen && selectedMission
            ? `${selectedMission.title} // ARCHIVED MISSION CAPTURE`
            : 'DEEP SKY WINDOW // PROJECTION STANDBY'}
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

function SkyMapOverlay({ gallery, selectedMission, onMissionSelect, activeSection }) {
  const targets = gallery.slice(0, 12);
  const visible = activeSection === 'sky';
  const points = useMemo(() => targets.map((mission, index) => {
    const angle = (index / Math.max(targets.length, 1)) * Math.PI * 2 + (index % 3) * 0.19;
    const radius = 1.7 + (index % 4) * 1.25;
    return { mission, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, drop: 0.12 + (index % 5) * 0.1 };
  }), [targets]);

  const linePositions = useMemo(() => {
    const values = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      if (i % 3 === 2) continue;
      values.push(points[i].x, -0.035, points[i].z, points[i + 1].x, -0.035, points[i + 1].z);
    }
    return new Float32Array(values);
  }, [points]);

  if (!visible) return null;

  return (
    <group position={[0, 4.77, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[8.45, 96]} />
        <meshBasicMaterial color="#08051a" transparent opacity={0.64} depthWrite={false} />
      </mesh>

      {[1.8, 3.6, 5.4, 7.2].map((radius) => (
        <mesh key={radius} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
          <ringGeometry args={[radius - 0.012, radius + 0.012, 128]} />
          <meshBasicMaterial color="#8f78ff" transparent opacity={0.36} />
        </mesh>
      ))}
      {[0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].map((rotation, index) => (
        <mesh key={index} position={[0, -0.028, 0]} rotation={[Math.PI / 2, 0, rotation]}>
          <planeGeometry args={[15.2, 0.018]} />
          <meshBasicMaterial color="#8f78ff" transparent opacity={0.28} />
        </mesh>
      ))}

      <lineSegments position={[0, 0, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#b9adff" transparent opacity={0.38} />
      </lineSegments>

      {points.map(({ mission, x, z, drop }) => {
        const active = selectedMission?.id === mission.id;
        return (
          <group key={mission.id || mission.title} position={[x, -drop, z]} onClick={(event) => { event.stopPropagation(); onMissionSelect(mission); }}>
            <mesh position={[0, drop / 2, 0]}>
              <cylinderGeometry args={[0.008, 0.008, drop, 8]} />
              <meshBasicMaterial color="#8f78ff" transparent opacity={0.34} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[active ? 0.13 : 0.07, active ? 0.19 : 0.115, 32]} />
              <meshBasicMaterial color={active ? '#ffb75c' : '#b5a8ff'} transparent opacity={0.98} />
            </mesh>
            <mesh position={[0, -0.02, 0]}><sphereGeometry args={[0.035, 14, 14]} /><meshBasicMaterial color={active ? '#ffcf8d' : '#e8e3ff'} /></mesh>
            <Text position={[0.15, -0.012, 0]} rotation={[Math.PI / 2, 0, 0]} fontSize={0.085} color={active ? '#ffcf8d' : '#d8d2ff'} anchorX="left">{mission.title || 'TARGET'}</Text>
          </group>
        );
      })}

      <Text position={[0, -0.06, -7.62]} rotation={[Math.PI / 2, 0, 0]} fontSize={0.26} color="#aa9dff">CUZBRO SKY MAP // HOLOGRAPHIC CELESTIAL OVERLAY</Text>
      <Text position={[0, -0.06, 7.5]} rotation={[Math.PI / 2, Math.PI, 0]} fontSize={0.1} color="#8576d8">SELECT TARGET MARKER TO LINK MISSION RECORD</Text>
      <pointLight position={[0, -0.7, 0]} color="#8f78ff" intensity={18} distance={10} />
    </group>
  );
}

function Room({ gallery, selectedMission, setSelectedMission, openFace, setOpenFace, activeSection, onSectionSelect, focusRequest, clearFocus, controlsEnabled, captureOpen, setCaptureOpen }) {
  const activeColor = SECTION_COLORS[activeSection] || '#1ba8cf';
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
      <MissionDetailPanel mission={selectedMission} captureOpen={captureOpen} activeSection={activeSection} />
      <MissionWall gallery={gallery} selectedMission={selectedMission} onMissionSelect={(mission) => { setSelectedMission(mission); setCaptureOpen(false); }} onOpenCapture={() => setCaptureOpen((value) => !value)} captureOpen={captureOpen} />
      <CrewStations activeSection={activeSection} />
      <TelescopeDisplay activeSection={activeSection} />
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
              <Room gallery={gallery} selectedMission={selectedMission} setSelectedMission={setSelectedMission} openFace={openFace} setOpenFace={setOpenFace} activeSection={activeSection} onSectionSelect={selectSection} focusRequest={focusRequest} clearFocus={() => setFocusRequest(null)} controlsEnabled={booted} captureOpen={captureOpen} setCaptureOpen={setCaptureOpen} />
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
