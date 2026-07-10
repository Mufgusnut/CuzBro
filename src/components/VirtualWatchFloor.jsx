import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars, Text } from '@react-three/drei';
import { XR, createXRStore } from '@react-three/xr';
import { ChevronLeft, Crosshair, Radio, Telescope, Users, X } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

const xrStore = createXRStore();

const SECTION_PRESETS = {
  missions: { position: [-3.2, 1.72, 1.1], lookAt: [-7.75, 2.7, -1.2] },
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

function RadialConsole({ active, activeSection, onToggle, onSectionSelect }) {
  const options = [
    ['MISSIONS', 'missions'],
    ['SKY MAP', 'sky'],
    ['COMMS', 'comms'],
    ['SYSTEMS', 'systems'],
  ];

  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 0.78, 0]} onClick={(event) => { event.stopPropagation(); onToggle(); }}>
        <cylinderGeometry args={[1.22, 1.42, 0.28, 64]} />
        <meshStandardMaterial color={active ? '#12364a' : '#09131c'} metalness={0.76} roughness={0.28} emissive={active ? '#0b6c87' : '#031017'} emissiveIntensity={active ? 1.3 : 0.35} />
      </mesh>
      <Text position={[0, 0.95, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.19} color="#dffaff" anchorX="center" anchorY="middle">
        CUZBRO
      </Text>
      {active && options.map(([label, key], index) => {
        const angle = (index / options.length) * Math.PI * 2 - Math.PI / 2;
        const selected = activeSection === key;
        return (
          <group key={key} position={[Math.cos(angle) * 2.05, 0.9, Math.sin(angle) * 2.05]} onClick={(event) => { event.stopPropagation(); onSectionSelect(key); }}>
            <mesh>
              <cylinderGeometry args={[0.55, 0.62, 0.16, 48]} />
              <meshStandardMaterial color={selected ? '#164c61' : '#0b1e2b'} emissive={SECTION_COLORS[key]} emissiveIntensity={selected ? 1.25 : 0.5} metalness={0.65} roughness={0.3} />
            </mesh>
            <Text position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.11} color="#cfffff" anchorX="center" anchorY="middle">
              {label}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

function MissionWall({ gallery, selectedMission, onMissionSelect }) {
  const missions = gallery.slice(0, 6);
  return (
    <group position={[-7.75, 2.75, -1.2]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[6.5, 4.7, 0.18]} />
        <meshStandardMaterial color="#07131c" emissive="#082634" emissiveIntensity={0.65} metalness={0.48} roughness={0.42} />
      </mesh>
      <Text position={[0, 1.9, 0]} fontSize={0.27} color="#ffb75c">MISSION ARCHIVE</Text>
      {missions.map((mission, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const x = col === 0 ? -1.55 : 1.55;
        const y = 1.15 - row * 1.2;
        const active = selectedMission?.id === mission.id;
        return (
          <group key={mission.id || mission.title} position={[x, y, 0.03]} onClick={(event) => { event.stopPropagation(); onMissionSelect(mission); }}>
            <mesh>
              <planeGeometry args={[2.65, 0.88]} />
              <meshBasicMaterial color={active ? '#164c61' : '#0d2430'} transparent opacity={0.92} />
            </mesh>
            {active && <pointLight position={[0, 0, 0.5]} color="#46ddff" intensity={2.6} distance={2.4} />}
            <Text position={[-1.1, 0.12, 0.02]} fontSize={0.18} color="#e9fbff" anchorX="left">{mission.title || 'UNTITLED'}</Text>
            <Text position={[-1.1, -0.2, 0.02]} fontSize={0.1} color="#79cfe5" anchorX="left">{mission.objectType || mission.category || 'MISSION CAPTURE'}</Text>
          </group>
        );
      })}
    </group>
  );
}

function MissionDetailPanel({ mission }) {
  if (!mission) return null;
  const lines = [
    mission.objectType || mission.category || 'MISSION CAPTURE',
    mission.date ? `CAPTURED // ${mission.date}` : 'CUZBRO MISSION ARCHIVE',
    mission.equipment || mission.telescope || 'CPC 800 // PRIMARY OBSERVATION PLATFORM',
  ];
  return (
    <group position={[-4.95, 2.2, -7.92]}>
      <mesh>
        <planeGeometry args={[3.7, 2.1]} />
        <meshBasicMaterial color="#06131c" transparent opacity={0.92} />
      </mesh>
      <Text position={[-1.55, 0.63, 0.02]} fontSize={0.22} color="#eaffff" anchorX="left">{mission.title || 'MISSION CAPTURE'}</Text>
      {lines.map((line, index) => (
        <Text key={`${line}-${index}`} position={[-1.55, 0.2 - index * 0.34, 0.02]} fontSize={0.105} color={index === 0 ? '#63dff5' : '#90b9c3'} anchorX="left">{String(line).toUpperCase()}</Text>
      ))}
      <Text position={[-1.55, -0.78, 0.02]} fontSize={0.09} color="#ffb75c" anchorX="left">ACTUAL CUZBRO MISSION CAPTURE // LIVE ARCHIVE LINK</Text>
    </group>
  );
}

function DeepSkyWindow({ selectedMission }) {
  const texture = useMemo(() => {
    const url = getImageUrl(selectedMission?.image);
    if (!url) return null;
    const loaded = new THREE.TextureLoader().load(url);
    loaded.colorSpace = THREE.SRGBColorSpace;
    return loaded;
  }, [selectedMission?.image]);

  return (
    <group position={[0, 3.8, -8.42]}>
      <mesh>
        <planeGeometry args={[8.6, 4.4]} />
        {texture ? <meshBasicMaterial map={texture} toneMapped={false} /> : <meshBasicMaterial color="#02070d" />}
      </mesh>
      <mesh position={[0, 0, -0.05]}>
        <planeGeometry args={[9, 4.8]} />
        <meshBasicMaterial color="#08131d" />
      </mesh>
      <Text position={[0, -2.42, 0.05]} fontSize={0.18} color="#84dff1">
        {selectedMission ? `${selectedMission.title} // ACTUAL MISSION CAPTURE` : 'DEEP SKY WINDOW // SELECT A MISSION'}
      </Text>
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

function SkyArray({ gallery, selectedMission, onMissionSelect, activeSection }) {
  const targets = gallery.slice(0, 8);
  return (
    <group position={[0, 4.76, 0]}>
      {targets.map((mission, index) => {
        const angle = (index / Math.max(targets.length, 1)) * Math.PI * 2;
        const radius = 2.4 + (index % 2) * 2.2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const active = selectedMission?.id === mission.id;
        return (
          <group key={mission.id || mission.title} position={[x, 0, z]} onClick={(event) => { event.stopPropagation(); onMissionSelect(mission); }}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[active ? 0.13 : 0.07, active ? 0.18 : 0.11, 32]} />
              <meshBasicMaterial color={active ? '#ffb75c' : activeSection === 'sky' ? '#9b8bff' : '#63dff5'} transparent opacity={activeSection === 'sky' || active ? 0.95 : 0.42} />
            </mesh>
            {(activeSection === 'sky' || active) && <Text position={[0.16, -0.01, 0]} rotation={[Math.PI / 2, 0, 0]} fontSize={0.09} color={active ? '#ffcf8d' : '#b9f5ff'} anchorX="left">{mission.title || 'TARGET'}</Text>}
          </group>
        );
      })}
      <Text position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} fontSize={0.34} color={activeSection === 'sky' ? '#aa9dff' : '#63dff5'}>CUZBRO SKY ARRAY</Text>
    </group>
  );
}

function Room({ gallery, selectedMission, setSelectedMission, radialOpen, setRadialOpen, activeSection, onSectionSelect, focusRequest, clearFocus, controlsEnabled }) {
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

      <DeepSkyWindow selectedMission={selectedMission} />
      <MissionDetailPanel mission={selectedMission} />
      <MissionWall gallery={gallery} selectedMission={selectedMission} onMissionSelect={setSelectedMission} />
      <CrewStations activeSection={activeSection} />
      <TelescopeDisplay activeSection={activeSection} />
      <RadialConsole active={radialOpen} activeSection={activeSection} onToggle={() => setRadialOpen((value) => !value)} onSectionSelect={onSectionSelect} />
      <SkyArray gallery={gallery} selectedMission={selectedMission} onMissionSelect={setSelectedMission} activeSection={activeSection} />
    </>
  );
}

function RadialHud({ open, setOpen, selectedMission, activeSection, onSectionSelect, onEnterVR }) {
  const items = [
    { label: 'MISSIONS', key: 'missions', icon: Crosshair },
    { label: 'SKY MAP', key: 'sky', icon: Telescope },
    { label: 'COMMS', key: 'comms', icon: Radio },
    { label: 'SYSTEMS', key: 'systems', icon: Users },
  ];

  return (
    <div className={`virtualWatchRadial ${open ? 'open' : ''}`}>
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <button key={item.label} type="button" className={`virtualWatchRadialItem item${index + 1} ${activeSection === item.key ? 'active' : ''}`} onClick={() => onSectionSelect(item.key)}>
            <Icon size={18} /><span>{item.label}</span>
          </button>
        );
      })}
      <button type="button" className="virtualWatchRadialCore" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="virtualWatchRadialPulse" />
        <strong>{selectedMission?.title || 'CUZBRO'}</strong>
        <small>{open ? 'CLOSE ARRAY' : 'OPEN ARRAY'}</small>
      </button>
      <button type="button" className="virtualWatchVrButton" onClick={onEnterVR}>ENTER VR</button>
    </div>
  );
}

export default function VirtualWatchFloor({ gallery = [] }) {
  const [booted, setBooted] = useState(false);
  const [radialOpen, setRadialOpen] = useState(false);
  const [selectedMission, setSelectedMission] = useState(gallery[0] || null);
  const [activeSection, setActiveSection] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  const [xrError, setXrError] = useState('');

  useEffect(() => {
    if (!selectedMission && gallery.length) setSelectedMission(gallery[0]);
  }, [gallery, selectedMission]);

  function selectSection(key) {
    setActiveSection(key);
    setRadialOpen(true);
    setFocusRequest({ key: `${key}-${Date.now()}`, preset: SECTION_PRESETS[key] });
  }

  async function enterVR() {
    setXrError('');
    try {
      await xrStore.enterVR();
    } catch (error) {
      console.error('Watch Floor VR entry failed:', error);
      setXrError('VR session unavailable. Use an HTTPS WebXR-capable headset/browser.');
    }
  }

  return (
    <div className="virtualWatchFloor">
      {!booted && (
        <div className="virtualWatchBoot">
          <div className="virtualWatchBootMark">∞</div>
          <p>CUZBRO OBSERVATORY</p>
          <h1>THE WATCH FLOOR</h1>
          <span>ELIOT, MAINE // IMMERSIVE OPERATIONS ENVIRONMENT</span>
          <button type="button" onClick={() => setBooted(true)}>ENTER WATCH FLOOR</button>
        </div>
      )}

      <div className="virtualWatchCanvas">
        <Canvas camera={{ position: [0, 1.72, 8.6], fov: 68, near: 0.1, far: 100 }} gl={{ antialias: true }}>
          <XR store={xrStore}>
            <Suspense fallback={null}>
              <Room gallery={gallery} selectedMission={selectedMission} setSelectedMission={setSelectedMission} radialOpen={radialOpen} setRadialOpen={setRadialOpen} activeSection={activeSection} onSectionSelect={selectSection} focusRequest={focusRequest} clearFocus={() => setFocusRequest(null)} controlsEnabled={booted} />
            </Suspense>
          </XR>
        </Canvas>
      </div>

      {booted && (
        <>
          <a href="/" className="virtualWatchExit"><ChevronLeft size={18} /> EXIT WATCH FLOOR</a>
          <div className="virtualWatchHelp">WASD TO MOVE · CLICK + DRAG TO LOOK · OPEN THE RADIAL ARRAY TO FOCUS A WATCH FLOOR STATION</div>
          <RadialHud open={radialOpen} setOpen={setRadialOpen} selectedMission={selectedMission} activeSection={activeSection} onSectionSelect={selectSection} onEnterVR={enterVR} />
          {activeSection && <div className="virtualWatchSectionState"><span style={{ background: SECTION_COLORS[activeSection] }} /> ARRAY FOCUS // {activeSection.toUpperCase()}</div>}
          {xrError && <div className="virtualWatchXrError"><X size={15} /> {xrError}</div>}
        </>
      )}
    </div>
  );
}
