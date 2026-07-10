import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase.js';

const CHANNEL_NAME = 'cuzbro-holodeck';
const MOVEMENT_EVENT = 'crew-pose';
const BROADCAST_INTERVAL_MS = 100;

const CREW_AVATAR_COLORS = {
  dave: '#43d4ff',
  justin: '#ff9a3d',
  chappy: '#9d7cff',
};

function normalizePose(pose) {
  return {
    position: {
      x: Number(pose?.position?.x) || 0,
      y: Number(pose?.position?.y) || 1.72,
      z: Number(pose?.position?.z) || 0,
    },
    rotation: {
      yaw: Number(pose?.rotation?.yaw) || 0,
      pitch: Number(pose?.rotation?.pitch) || 0,
    },
  };
}

function flattenPresenceState(state, ownUserId) {
  const crew = {};

  Object.values(state || {}).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (!entry?.userId || entry.userId === ownUserId) return;
      crew[entry.userId] = {
        userId: entry.userId,
        crewKey: entry.crewKey || 'unknown',
        callSign: entry.callSign || 'CREW',
        role: entry.role || 'Crew',
        color: entry.color || '#8feaff',
        activeSection: entry.activeSection || null,
        ...normalizePose(entry),
        connectedAt: entry.connectedAt || null,
      };
    });
  });

  return crew;
}

export function useHolodeckPresence({ session, crew, enabled, activeSection }) {
  const channelRef = useRef(null);
  const latestPoseRef = useRef(null);
  const lastSentAtRef = useRef(0);
  const activeSectionRef = useRef(activeSection);
  const [remoteCrew, setRemoteCrew] = useState({});
  const [connectionState, setConnectionState] = useState('OFFLINE');

  const userId = session?.user?.id || '';
  const crewKey = String(crew?.callSign || '').toLowerCase();
  const callSign = crew?.callSign || 'CREW';
  const role = crew?.role || 'Crew';
  const color = CREW_AVATAR_COLORS[crewKey] || '#8feaff';

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  useEffect(() => {
    if (!enabled || !userId || !crewKey) {
      setRemoteCrew({});
      setConnectionState('OFFLINE');
      return undefined;
    }

    let active = true;

    const channel = supabase.channel(CHANNEL_NAME, {
      config: {
        presence: { key: userId },
        broadcast: { self: false, ack: false },
      },
    });

    channelRef.current = channel;
    setConnectionState('CONNECTING');

    const syncPresence = () => {
      if (!active) return;
      setRemoteCrew((current) => {
        const online = flattenPresenceState(channel.presenceState(), userId);
        const next = {};

        Object.entries(online).forEach(([remoteUserId, onlineCrew]) => {
          const existing = current[remoteUserId];
          next[remoteUserId] = {
            ...onlineCrew,
            ...(existing || {}),
            userId: onlineCrew.userId,
            crewKey: onlineCrew.crewKey,
            callSign: onlineCrew.callSign,
            role: onlineCrew.role,
            color: onlineCrew.color,
            connectedAt: onlineCrew.connectedAt,
            position: existing?.position || onlineCrew.position,
            rotation: existing?.rotation || onlineCrew.rotation,
            activeSection: existing?.activeSection ?? onlineCrew.activeSection,
          };
        });

        return next;
      });
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, syncPresence)
      .on('broadcast', { event: MOVEMENT_EVENT }, ({ payload }) => {
        if (!active || !payload?.userId || payload.userId === userId) return;

        setRemoteCrew((current) => ({
          ...current,
          [payload.userId]: {
            ...(current[payload.userId] || {}),
            userId: payload.userId,
            crewKey: payload.crewKey || 'unknown',
            callSign: payload.callSign || 'CREW',
            role: payload.role || 'Crew',
            color: payload.color || '#8feaff',
            activeSection: payload.activeSection || null,
            ...normalizePose(payload),
            lastPoseAt: payload.sentAt || Date.now(),
          },
        }));
      })
      .subscribe(async (status, error) => {
        if (!active) return;

        if (status === 'SUBSCRIBED') {
          setConnectionState('ONLINE');
          const pose = normalizePose(latestPoseRef.current);
          await channel.track({
            userId,
            crewKey,
            callSign,
            role,
            color,
            activeSection: activeSectionRef.current,
            ...pose,
            connectedAt: new Date().toISOString(),
          });
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnectionState('OFFLINE');
          if (error) console.error('[HOLODECK LINK] Realtime channel error:', error);
        }
      });

    return () => {
      active = false;
      channelRef.current = null;
      setRemoteCrew({});
      setConnectionState('OFFLINE');
      supabase.removeChannel(channel).catch((error) => {
        console.error('[HOLODECK LINK] Channel cleanup failed:', error);
      });
    };
  }, [enabled, userId, crewKey, callSign, role, color]);

  const publishPose = useCallback((pose) => {
    latestPoseRef.current = pose;

    const channel = channelRef.current;
    if (!channel || connectionState !== 'ONLINE') return;

    const now = performance.now();
    if (now - lastSentAtRef.current < BROADCAST_INTERVAL_MS) return;
    lastSentAtRef.current = now;

    const normalized = normalizePose(pose);
    channel.send({
      type: 'broadcast',
      event: MOVEMENT_EVENT,
      payload: {
        userId,
        crewKey,
        callSign,
        role,
        color,
        activeSection: activeSectionRef.current,
        ...normalized,
        sentAt: Date.now(),
      },
    }).catch((error) => {
      console.error('[HOLODECK LINK] Pose broadcast failed:', error);
    });
  }, [connectionState, userId, crewKey, callSign, role, color]);

  return {
    remoteCrew: Object.values(remoteCrew),
    connectionState,
    publishPose,
  };
}
