import { useEffect, useRef, useState } from 'react';

const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a'
];

const EGG_DURATION = 10000;
const CHAPPY_DURATION = 12000;
const KONAMI_DURATION = 5200;

function isTypingTarget(target) {
  const tagName = target?.tagName?.toLowerCase();

  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target?.isContentEditable
  );
}

export default function EasterEggs() {
  const [activeEgg, setActiveEgg] = useState(null);
  const typedBuffer = useRef('');
  const konamiIndex = useRef(0);
  const timeoutRef = useRef(null);

  useEffect(() => {
    function clearActiveTimeout() {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    function activateEgg(name, duration) {
      clearActiveTimeout();
      setActiveEgg(name);

      if (name === 'god') {
        document.documentElement.classList.add('cuzbro-god-mode');
      }

      if (name === 'chappy') {
        window.dispatchEvent(
          new CustomEvent('cuzbro:chappy-mode', {
            detail: { active: true }
          })
        );
      }

      timeoutRef.current = window.setTimeout(() => {
        setActiveEgg(null);
        document.documentElement.classList.remove('cuzbro-god-mode');

        if (name === 'chappy') {
          window.dispatchEvent(
            new CustomEvent('cuzbro:chappy-mode', {
              detail: { active: false }
            })
          );
        }

        timeoutRef.current = null;
      }, duration);
    }

    function handleKeyDown(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      const normalizedKey =
        event.key.length === 1
          ? event.key.toLowerCase()
          : event.key;

      if (normalizedKey === KONAMI[konamiIndex.current]) {
        konamiIndex.current += 1;

        if (konamiIndex.current === KONAMI.length) {
          konamiIndex.current = 0;
          typedBuffer.current = '';
          activateEgg('konami', KONAMI_DURATION);
          return;
        }
      } else {
        konamiIndex.current =
          normalizedKey === KONAMI[0] ? 1 : 0;
      }

      if (normalizedKey.length !== 1) {
        return;
      }

      typedBuffer.current = (
        typedBuffer.current + normalizedKey
      ).slice(-20);

      if (typedBuffer.current.endsWith('iddqd')) {
        typedBuffer.current = '';
        activateEgg('god', EGG_DURATION);
        return;
      }

      if (typedBuffer.current.endsWith('chappy')) {
        typedBuffer.current = '';
        activateEgg('chappy', CHAPPY_DURATION);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearActiveTimeout();
      document.documentElement.classList.remove('cuzbro-god-mode');

      window.dispatchEvent(
        new CustomEvent('cuzbro:chappy-mode', {
          detail: { active: false }
        })
      );
    };
  }, []);

  if (!activeEgg) {
    return null;
  }

  if (activeEgg === 'god') {
    return (
      <div className="cuzbro-egg-overlay cuzbro-god-overlay" aria-live="polite">
        <div className="cuzbro-god-scanlines" />
        <div className="cuzbro-egg-message cuzbro-god-message">
          <strong>GOD MODE ENABLED</strong>
          <span>THIS SEEMS IRRESPONSIBLE</span>
        </div>
      </div>
    );
  }

  if (activeEgg === 'konami') {
    return (
      <div className="cuzbro-egg-overlay cuzbro-konami-overlay" aria-live="polite">
        <svg
          className="cuzbro-konami-infinity"
          viewBox="0 0 900 360"
          role="img"
          aria-label="A shooting star draws the CuzBro infinity trail"
        >
          <defs>
            <filter id="cuzbro-star-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path
            id="cuzbro-infinity-path"
            className="cuzbro-konami-trail"
            pathLength="1"
            d="M 105 180 C 190 45, 330 45, 450 180 C 570 315, 710 315, 795 180 C 710 45, 570 45, 450 180 C 330 315, 190 315, 105 180"
          />

          <circle className="cuzbro-konami-star" r="9" filter="url(#cuzbro-star-glow)">
            <animateMotion dur="3.25s" begin="0.15s" fill="freeze" rotate="auto">
              <mpath href="#cuzbro-infinity-path" />
            </animateMotion>
          </circle>
        </svg>

        <div className="cuzbro-egg-message cuzbro-konami-message">
          <strong>ANOMALY DETECTED</strong>
          <span>INFINITY SIGNATURE CONFIRMED</span>
        </div>
      </div>
    );
  }

  return (
    <div className="cuzbro-egg-overlay cuzbro-chappy-overlay" aria-live="polite">
      <div className="cuzbro-egg-message cuzbro-chappy-message">
        <strong>CHAPPY MODE DETECTED</strong>
        <span>ESTIMATED ARRIVAL: EVENTUALLY</span>
      </div>
    </div>
  );
}
