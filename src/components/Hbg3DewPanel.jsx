import {
  Activity,
  CloudFog,
  Gauge,
  RefreshCw,
  Thermometer,
  Waves
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase.js';

const REFRESH_MS = 5000;
const STALE_AFTER_MS = 30000;

function formatTemperature(value) {
  return Number.isFinite(Number(value))
    ? `${Number(value).toFixed(1)}°C`
    : '—';
}

function formatCurrent(value) {
  return Number.isFinite(Number(value))
    ? `${Number(value).toFixed(2)} A`
    : '—';
}

function formatUpdatedAt(value) {
  if (!value) return 'NO TELEMETRY';

  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });
}

function normalizeChannel(channel, index) {
  return {
    index: Number.isFinite(Number(channel?.index))
      ? Number(channel.index)
      : index,
    pwmPercent: Number(channel?.pwmPercent ?? channel?.dew_pwm_percent ?? 0),
    aggression: Number(channel?.aggression ?? channel?.dew_aggression ?? 0),
    manualPwm: Number(channel?.manualPwm ?? channel?.dew_manual_pwm ?? 0),
    temperatureC: Number(channel?.temperatureC ?? channel?.dew_temperature ?? 0),
    amps: Number(channel?.amps ?? channel?.dew_amps ?? 0),
    maxAmps: Number(channel?.maxAmps ?? channel?.dew_max_amps ?? 0),
    sensorDetected:
      channel?.sensorDetected ??
      Number(channel?.temperatureC ?? channel?.dew_temperature ?? 0) !== 0
  };
}

export default function Hbg3DewPanel() {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const loadTelemetry = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('hbg3_dew_status')
      .select('station,captured_at,connected,raw_data')
      .eq('station', 'eliot')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (queryError) {
      setError(queryError.message || 'Unable to read HBG3 telemetry.');
      setLoading(false);
      return;
    }

    setRecord(data || null);
    setError('');
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTelemetry();

    const interval = window.setInterval(() => {
      setNow(Date.now());
      loadTelemetry();
    }, REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [loadTelemetry]);

  const channels = useMemo(() => {
    const rawChannels = record?.raw_data?.channels;
    return Array.isArray(rawChannels)
      ? rawChannels.map(normalizeChannel)
      : [];
  }, [record]);

  const ageMs = record?.captured_at
    ? now - new Date(record.captured_at).getTime()
    : Infinity;

  const stale = ageMs > STALE_AFTER_MS;
  const online = Boolean(record?.connected) && !stale && !error;

  return (
    <section className={`hbg3-panel hbg3-panel-${online ? 'online' : 'offline'}`}>
      <div className="hbg3-panel-header">
        <div>
          <span className="admin-eyebrow">OBSERVATORY ENVIRONMENT</span>
          <h2>HBG3 Dew Control</h2>
          <p>Live heater telemetry relayed from the Eliot observatory computer.</p>
        </div>

        <div className="hbg3-link-state">
          <i />
          <div>
            <span>HBG3 LINK</span>
            <strong>
              {loading ? 'CONNECTING' : online ? 'ONLINE' : stale ? 'STALE' : 'OFFLINE'}
            </strong>
          </div>
          <button type="button" onClick={loadTelemetry} aria-label="Refresh HBG3 telemetry">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="hbg3-message hbg3-message-error">{error}</div>
      ) : !record && !loading ? (
        <div className="hbg3-message">
          No HBG3 telemetry has been received yet. Start the observatory bridge on the local PC.
        </div>
      ) : (
        <>
          <div className="hbg3-channel-grid">
            {[0, 1].map((index) => {
              const channel = channels.find((item) => item.index === index);
              const detected = Boolean(channel?.sensorDetected);

              return (
                <article className={`hbg3-channel hbg3-channel-${detected ? 'detected' : 'missing'}`} key={index}>
                  <div className="hbg3-channel-title">
                    <div>
                      <CloudFog size={22} />
                      <span>DEW CHANNEL {index + 1}</span>
                    </div>
                    <strong>{detected ? 'SENSOR DETECTED' : 'NO SENSOR'}</strong>
                  </div>

                  <div className="hbg3-metrics">
                    <div>
                      <Thermometer size={18} />
                      <span>Temperature</span>
                      <strong>{detected ? formatTemperature(channel?.temperatureC) : '—'}</strong>
                    </div>
                    <div>
                      <Waves size={18} />
                      <span>Heater Output</span>
                      <strong>{channel ? `${channel.pwmPercent}%` : '—'}</strong>
                    </div>
                    <div>
                      <Activity size={18} />
                      <span>Current Draw</span>
                      <strong>{channel ? formatCurrent(channel.amps) : '—'}</strong>
                    </div>
                    <div>
                      <Gauge size={18} />
                      <span>Aggression</span>
                      <strong>{channel ? channel.aggression : '—'}</strong>
                    </div>
                  </div>

                  <div className="hbg3-channel-footer">
                    <span>MANUAL PWM {channel?.manualPwm ?? '—'}%</span>
                    <span>MAX {channel ? formatCurrent(channel.maxAmps) : '—'}</span>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hbg3-panel-footer">
            <span>STATION: ELIOT</span>
            <span>LAST UPDATE: {formatUpdatedAt(record?.captured_at)}</span>
            {stale && <strong>TELEMETRY OLDER THAN 30 SECONDS</strong>}
          </div>
        </>
      )}
    </section>
  );
}
