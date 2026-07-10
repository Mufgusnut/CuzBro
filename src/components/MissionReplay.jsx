import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Pause, Play, RotateCcw, X } from 'lucide-react';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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

function getManualFocus(xValue, yValue) {
  const x = Number(xValue);
  const y = Number(yValue);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    x: clamp(x, 0.02, 0.98),
    y: clamp(y, 0.02, 0.98)
  };
}

function analyzeImageFocus(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve({
        focus: { x: 0.5, y: 0.5 },
        imageMeta: null,
        status: 'missing'
      });
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';

    image.onload = () => {
      const naturalWidth = image.naturalWidth || image.width || 0;
      const naturalHeight = image.naturalHeight || image.height || 0;

      try {
        const sampleLimit = 320;
        const sampleScale = Math.min(1, sampleLimit / Math.max(naturalWidth, naturalHeight, 1));
        const sampleWidth = Math.max(96, Math.round(naturalWidth * sampleScale));
        const sampleHeight = Math.max(96, Math.round(naturalHeight * sampleScale));
        const canvas = document.createElement('canvas');
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;

        const context = canvas.getContext('2d', { willReadFrequently: true });

        if (!context) {
          throw new Error('2D canvas unavailable');
        }

        context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
        const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);

        const luminance = new Float32Array(sampleWidth * sampleHeight);

        for (let i = 0; i < luminance.length; i += 1) {
          const pixelIndex = i * 4;
          luminance[i] =
            data[pixelIndex] * 0.2126 +
            data[pixelIndex + 1] * 0.7152 +
            data[pixelIndex + 2] * 0.0722;
        }

        const scales = [4, 7, 11, 17];
        let bestScore = -Infinity;
        let bestX = sampleWidth / 2;
        let bestY = sampleHeight / 2;

        for (const radius of scales) {
          const step = Math.max(1, Math.floor(radius / 2));

          for (let y = radius; y < sampleHeight - radius; y += step) {
            for (let x = radius; x < sampleWidth - radius; x += step) {
              let total = 0;
              let count = 0;

              for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
                for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
                  if (offsetX * offsetX + offsetY * offsetY > radius * radius) {
                    continue;
                  }

                  const index = (y + offsetY) * sampleWidth + (x + offsetX);
                  total += luminance[index];
                  count += 1;
                }
              }

              if (!count) continue;

              const normalizedX = x / sampleWidth;
              const normalizedY = y / sampleHeight;
              const distanceFromCenter = Math.hypot(normalizedX - 0.5, normalizedY - 0.5);
              const centerWeight = Math.max(0.55, 1 - distanceFromCenter * 0.9);
              const score = (total / count) * radius * centerWeight;

              if (score > bestScore) {
                bestScore = score;
                bestX = x;
                bestY = y;
              }
            }
          }
        }

        resolve({
          focus: {
            x: clamp(bestX / sampleWidth, 0.08, 0.92),
            y: clamp(bestY / sampleHeight, 0.08, 0.92)
          },
          imageMeta:
            naturalWidth && naturalHeight
              ? {
                  width: naturalWidth,
                  height: naturalHeight
                }
              : null,
          status: 'auto'
        });
      } catch (error) {
        resolve({
          focus: { x: 0.5, y: 0.5 },
          imageMeta:
            naturalWidth && naturalHeight
              ? {
                  width: naturalWidth,
                  height: naturalHeight
                }
              : null,
          status: 'default'
        });
      }
    };

    image.onerror = () => {
      resolve({
        focus: { x: 0.5, y: 0.5 },
        imageMeta: null,
        status: 'missing'
      });
    };

    image.src = url;
  });
}

function useReplayStageFrame(url, manualFocus) {
  const [state, setState] = useState({
    focus: manualFocus || { x: 0.5, y: 0.5 },
    imageMeta: null,
    status: manualFocus ? 'manual' : 'loading'
  });

  useEffect(() => {
    let cancelled = false;

    analyzeImageFocus(url).then((result) => {
      if (cancelled) return;

      setState({
        focus: manualFocus || result.focus,
        imageMeta: result.imageMeta,
        status: manualFocus ? 'manual' : result.status
      });
    });

    return () => {
      cancelled = true;
    };
  }, [url, manualFocus?.x, manualFocus?.y]);

  return state;
}

function useShellSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;

    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) return;

      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height
      });
    });

    observer.observe(element);
    setSize({
      width: element.clientWidth,
      height: element.clientHeight
    });

    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function getFrameStyle(shellSize, imageMeta, focus) {
  if (
    !imageMeta?.width ||
    !imageMeta?.height ||
    !shellSize.width ||
    !shellSize.height
  ) {
    return {
      left: '50%',
      top: '50%',
      width: '78%',
      height: 'auto',
      transform: 'translate(-50%, -50%)'
    };
  }

  const safeFocusX = clamp(focus?.x ?? 0.5, 0.001, 0.999);
  const safeFocusY = clamp(focus?.y ?? 0.5, 0.001, 0.999);
  const imageWidth = imageMeta.width;
  const imageHeight = imageMeta.height;

  // Fit the complete image inside the replay stage without distortion.
  // A small reduction leaves cinematic breathing room around the capture.
  const containScale = Math.min(
    shellSize.width / imageWidth,
    shellSize.height / imageHeight
  );
  const replayScale = containScale * 0.78;

  const renderedWidth = imageWidth * replayScale;
  const renderedHeight = imageHeight * replayScale;

  // Translate the exact admin-selected image coordinate to the reticle center.
  const left = shellSize.width / 2 - safeFocusX * renderedWidth;
  const top = shellSize.height / 2 - safeFocusY * renderedHeight;

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${renderedWidth}px`,
    height: `${renderedHeight}px`,
    transform: 'none'
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
  const shellRef = useRef(null);

  const rawUrl = getCaptureImageUrl(photo.rawImage || photo.image);
  const stackedUrl = getCaptureImageUrl(photo.stackedImage || photo.rawImage || photo.image);
  const finalUrl = getCaptureImageUrl(photo.image);

  const rawManualFocus = useMemo(
    () => getManualFocus(photo.replayRawFocusX, photo.replayRawFocusY),
    [photo.replayRawFocusX, photo.replayRawFocusY]
  );
  const stackedManualFocus = useMemo(
    () => getManualFocus(photo.replayStackedFocusX, photo.replayStackedFocusY),
    [photo.replayStackedFocusX, photo.replayStackedFocusY]
  );
  const finalManualFocus = useMemo(
    () => getManualFocus(photo.replayFinalFocusX, photo.replayFinalFocusY),
    [photo.replayFinalFocusX, photo.replayFinalFocusY]
  );

  const rawStage = useReplayStageFrame(rawUrl, rawManualFocus);
  const stackedStage = useReplayStageFrame(stackedUrl, stackedManualFocus);
  const finalStage = useReplayStageFrame(finalUrl, finalManualFocus);
  const shellSize = useShellSize(shellRef);

  const replayState = useMemo(
    () => getReplayState(progress, frameCount, exposureSeconds),
    [progress, frameCount, exposureSeconds]
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
  const captureNoise = Math.max(0, 0.72 - captureFraction * 0.62);
  const isComplete = progress >= 96;

  const rawStyle = useMemo(
    () => getFrameStyle(shellSize, rawStage.imageMeta, rawStage.focus),
    [shellSize, rawStage.imageMeta, rawStage.focus]
  );
  const stackedStyle = useMemo(
    () => getFrameStyle(shellSize, stackedStage.imageMeta, stackedStage.focus),
    [shellSize, stackedStage.imageMeta, stackedStage.focus]
  );
  const finalStyle = useMemo(
    () => getFrameStyle(shellSize, finalStage.imageMeta, finalStage.focus),
    [shellSize, finalStage.imageMeta, finalStage.focus]
  );

  // Render exactly one positioned foreground image at a time. This prevents
  // a previous replay phase from showing through with a different target-lock
  // coordinate and makes the visible image/focus pair unambiguous.
  const activeFrame = useMemo(() => {
    if (progress >= 88) {
      return {
        key: 'final',
        url: finalUrl,
        style: finalStyle,
        alt: `${photo.title} final capture`,
        filter: 'none'
      };
    }

    if (progress >= 8) {
      return {
        key: 'stacked',
        url: stackedUrl,
        style: stackedStyle,
        alt: '',
        filter: `brightness(${0.58 + captureFraction * 0.34}) saturate(${0.55 + captureFraction * 0.45}) contrast(1.12)`
      };
    }

    return {
      key: 'raw',
      url: rawUrl,
      style: rawStyle,
      alt: '',
      filter: `brightness(${0.48 + captureFraction * 0.34}) contrast(${1.22 - captureFraction * 0.12})`
    };
  }, [
    progress,
    finalUrl,
    finalStyle,
    stackedUrl,
    stackedStyle,
    rawUrl,
    rawStyle,
    photo.title,
    captureFraction
  ]);

  const targetLockLabel =
    rawStage.status === 'manual' ||
    stackedStage.status === 'manual' ||
    finalStage.status === 'manual'
      ? 'MANUAL TARGET LOCK'
      : 'AUTO TARGET LOCK';

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
        <div ref={shellRef} className="missionReplayImageShell">
          <img
            key={activeFrame.key}
            className={`missionReplayImage missionReplay${activeFrame.key[0].toUpperCase()}${activeFrame.key.slice(1)}`}
            src={activeFrame.url}
            alt={activeFrame.alt}
            style={{
              ...activeFrame.style,
              opacity: 1,
              filter: activeFrame.filter
            }}
          />

          {progress >= 8 && progress < 88 && (
            <div className="missionReplayNoise" style={{ opacity: captureNoise }} aria-hidden="true" />
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
            <small>TARGET LOCK</small>
            <strong>{targetLockLabel}</strong>
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
