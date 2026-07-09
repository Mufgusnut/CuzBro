import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Pause, Play, RotateCcw, X } from 'lucide-react';

function getCaptureImageUrl(image) {
  if (!image) return '';

  if (
    image.startsWith('http://') ||
    image.startsWith('https://') ||
    image.startsWith('blob:')
  ) {
    return image;
  }

  return import.meta.env.BASE_URL + image.replace(/^\/+/, '');
}

function formatReplayDate(value) {
  if (!value) return 'MISSION DATE UNKNOWN';

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return String(value).toUpperCase();
  }

  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
    .format(date)
    .toUpperCase();
}

function formatElapsed(seconds) {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

function getReplayState(progress, frameCount, exposureSeconds) {
  const captureEnd = 72;
  const stackEnd = 82;
  const calibrationEnd = 90;
  const stretchEnd = 96;
  const captureFraction = Math.min(1, progress / captureEnd);
  const frame = Math.max(1, Math.min(frameCount, Math.round(captureFraction * frameCount)));
  const elapsedSeconds = frame * exposureSeconds;

  if (progress < 2.5) {
    return {
      phase: 'INITIALIZING',
      headline: 'MISSION ARCHIVE // REPLAY INITIALIZING',
      detail: 'RESTORING CAPTURE TELEMETRY',
      frame,
      elapsedSeconds,
      imageStage: 'raw'
    };
  }

  if (progress < 8) {
    return {
      phase: 'TARGET ACQUISITION',
      headline: 'TARGET ACQUIRED',
      detail: 'OPTICAL TRAIN ON TARGET',
      frame,
      elapsedSeconds,
      imageStage: 'raw'
    };
  }

  if (progress < captureEnd) {
    return {
      phase: 'CAPTURE SEQUENCE',
      headline: frame <= 2 ? 'FIRST LIGHT RECEIVED' : 'SIGNAL ACCUMULATION',
      detail: `FRAME ${String(frame).padStart(3, '0')} / ${frameCount}`,
      frame,
      elapsedSeconds,
      imageStage: 'capture'
    };
  }

  if (progress < stackEnd) {
    return {
      phase: 'STACKING',
      headline: 'CAPTURE SEQUENCE COMPLETE',
      detail: `${frameCount} FRAMES RECEIVED // ALIGNING SIGNAL`,
      frame: frameCount,
      elapsedSeconds: frameCount * exposureSeconds,
      imageStage: 'stacked'
    };
  }

  if (progress < calibrationEnd) {
    return {
      phase: 'CALIBRATION',
      headline: 'PROCESSING PIPELINE INITIATED',
      detail: 'BACKGROUND + COLOR CALIBRATION',
      frame: frameCount,
      elapsedSeconds: frameCount * exposureSeconds,
      imageStage: 'stacked'
    };
  }

  if (progress < stretchEnd) {
    return {
      phase: 'NON-LINEAR STRETCH',
      headline: 'SIGNAL REVEALED',
      detail: 'NON-LINEAR STRETCH // FINAL PROCESSING',
      frame: frameCount,
      elapsedSeconds: frameCount * exposureSeconds,
      imageStage: 'transition'
    };
  }

  return {
    phase: 'MISSION COMPLETE',
    headline: 'MISSION COMPLETE',
    detail: 'CAPTURED BY CUZBRO // ELIOT, MAINE',
    frame: frameCount,
    elapsedSeconds: frameCount * exposureSeconds,
    imageStage: 'final'
  };
}

function parseReplayCaptureSettings(exposureText) {
  const value = String(exposureText || '').toLowerCase();
  const multiplicationMatch = value.match(/(\d{1,6})\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/i);

  if (multiplicationMatch) {
    return {
      frameCount: Number(multiplicationMatch[1]),
      exposureSeconds: Number(multiplicationMatch[2])
    };
  }

  const frameMatch = value.match(/(\d{1,6})\s*(?:frames?|subs?|exposures?)/i);
  const secondsMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/i);

  return {
    frameCount: frameMatch ? Number(frameMatch[1]) : 600,
    exposureSeconds: secondsMatch ? Number(secondsMatch[1]) : 5
  };
}

export default function MissionReplay({ photo, onClose, onCopyLink }) {
  const { frameCount, exposureSeconds } = parseReplayCaptureSettings(photo.exposure);
  const durationMs = 24500;
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [finished, setFinished] = useState(false);
  const startRef = useRef(performance.now());
  const progressRef = useRef(0);
  const animationRef = useRef(null);

  const rawUrl = getCaptureImageUrl(photo.rawImage || photo.image);
  const stackedUrl = getCaptureImageUrl(photo.stackedImage || photo.rawImage || photo.image);
  const finalUrl = getCaptureImageUrl(photo.image);

  const replayState = useMemo(
    () => getReplayState(progress, frameCount, exposureSeconds),
    [progress]
  );

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    if (!playing || finished) return undefined;

    startRef.current = performance.now() - (progressRef.current / 100) * durationMs;

    const tick = (now) => {
      const nextProgress = Math.min(100, ((now - startRef.current) / durationMs) * 100);

      setProgress(nextProgress);

      if (nextProgress >= 100) {
        setPlaying(false);
        setFinished(true);
        return;
      }

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animationRef.current);
  }, [playing, finished]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }

      if (event.code === 'Space') {
        event.preventDefault();
        setPlaying((current) => !current);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    document.body.classList.add('missionReplayOpen');

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.body.classList.remove('missionReplayOpen');
    };
  }, [onClose]);

  const restartReplay = () => {
    setProgress(0);
    setFinished(false);
    setPlaying(true);
    progressRef.current = 0;
    startRef.current = performance.now();
  };

  const scrubReplay = (value) => {
    const nextProgress = Number(value);
    setProgress(nextProgress);
    progressRef.current = nextProgress;
    setFinished(nextProgress >= 100);
    setPlaying(false);
  };

  const captureFraction = Math.min(1, progress / 72);
  const rawOpacity = replayState.imageStage === 'raw' ? 1 : Math.max(0, 1 - captureFraction * 1.1);
  const stackedOpacity =
    replayState.imageStage === 'capture'
      ? Math.max(0, Math.min(0.82, (captureFraction - 0.08) * 0.92))
      : replayState.imageStage === 'stacked' || replayState.imageStage === 'transition'
        ? 1
        : replayState.imageStage === 'final'
          ? 0
          : 0;
  const finalOpacity = progress < 88 ? 0 : Math.min(1, (progress - 88) / 10);
  const captureNoise = Math.max(0, 0.72 - captureFraction * 0.62);
  const isComplete = progress >= 96;

  return (
    <div className="missionReplay" role="dialog" aria-modal="true" aria-label={`${photo.title} mission replay`}>
      <div className="missionReplayScanlines" aria-hidden="true" />
      <div className="missionReplayVignette" aria-hidden="true" />

      <header className="missionReplayHeader">
        <div>
          <span className="missionReplayCrosshair">⊕</span>
          <strong>CUZBRO // MISSION REPLAY</strong>
          <span>MR-0001</span>
        </div>

        <div className="missionReplayHeaderActions">
          {onCopyLink && (
            <button type="button" onClick={onCopyLink} aria-label="Copy replay link">
              <Link size={18} />
              COPY REPLAY LINK
            </button>
          )}

          <button type="button" onClick={onClose} aria-label="Exit mission replay">
            <X size={19} />
            EXIT REPLAY
          </button>
        </div>
      </header>

      <main className="missionReplayStage">
        <div className="missionReplayImageShell">
          <img
            className="missionReplayImage missionReplayRaw"
            src={rawUrl}
            alt=""
            style={{
              opacity: rawOpacity,
              filter: `brightness(${0.48 + captureFraction * 0.34}) contrast(${1.22 - captureFraction * 0.12})`
            }}
          />

          <img
            className="missionReplayImage missionReplayStacked"
            src={stackedUrl}
            alt=""
            style={{
              opacity: stackedOpacity,
              filter: `brightness(${0.58 + captureFraction * 0.34}) saturate(${0.55 + captureFraction * 0.45}) contrast(1.12)`
            }}
          />

          <img
            className="missionReplayImage missionReplayFinal"
            src={finalUrl}
            alt={`${photo.title} final capture`}
            style={{ opacity: finalOpacity }}
          />

          {progress >= 8 && progress < 88 && (
            <div
              className="missionReplayNoise"
              style={{ opacity: captureNoise }}
              aria-hidden="true"
            />
          )}

          <div className="missionReplayReticle" aria-hidden="true">
            <span />
            <i />
          </div>
        </div>

        <section className="missionReplayTelemetry missionReplayTelemetryLeft">
          <small>{replayState.phase}</small>
          <h1>{replayState.headline}</h1>
          <p>{replayState.detail}</p>
        </section>

        <section className="missionReplayTelemetry missionReplayTelemetryRight">
          <small>TARGET</small>
          <strong>{photo.title}</strong>
          <span>{photo.subtitle}</span>
          <b>{formatReplayDate(photo.captureDate || photo.date)}</b>
        </section>

        <section className="missionReplayCaptureData">
          <div>
            <small>MISSION ELAPSED</small>
            <strong>T+{formatElapsed(replayState.elapsedSeconds)}</strong>
          </div>

          <div>
            <small>FRAME</small>
            <strong>{String(replayState.frame).padStart(3, '0')} / {frameCount}</strong>
          </div>

          <div>
            <small>EXPOSURE</small>
            <strong>{exposureSeconds.toFixed(1)} SEC</strong>
          </div>

          <div>
            <small>SEQUENCE</small>
            <strong className={isComplete ? 'complete' : 'active'}>
              ● {isComplete ? 'COMPLETE' : 'ACTIVE'}
            </strong>
          </div>
        </section>
      </main>

      <footer className="missionReplayFooter">
        <div className="missionReplayProgressLabels">
          <span>CAPTURE</span>
          <span>STACK</span>
          <span>CALIBRATE</span>
          <span>STRETCH</span>
          <span>FINAL</span>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={progress}
          onChange={(event) => scrubReplay(event.target.value)}
          aria-label="Mission replay timeline"
        />

        <div className="missionReplayControls">
          <button
            type="button"
            onClick={() => {
              if (finished) {
                restartReplay();
              } else {
                setPlaying((current) => !current);
              }
            }}
          >
            {finished ? <RotateCcw size={17} /> : playing ? <Pause size={17} /> : <Play size={17} />}
            {finished ? 'REPLAY AGAIN' : playing ? 'PAUSE' : 'RESUME'}
          </button>

          <span>{progress.toFixed(1)}% // SPACE TO PAUSE</span>
        </div>
      </footer>
    </div>
  );
}
