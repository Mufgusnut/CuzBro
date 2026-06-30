import { useEffect, useRef } from 'react';

export default function SpaceBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });

    let width = 0;
    let height = 0;
    let ratio = 1;
    let animationFrame;
    let lastFrame = 0;
    let lastMeteor = 0;
    let lastSatellite = 0;
    let meteors = [];
    let satellites = [];
    let starCanvas;
    let isRunning = true;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      ratio = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      buildStarCanvas();
    }

    function buildStarCanvas() {
      starCanvas = document.createElement('canvas');
      starCanvas.width = Math.floor(width * ratio);
      starCanvas.height = Math.floor(height * ratio);

      const sctx = starCanvas.getContext('2d');
      sctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      const mobile = width < 700;
      const starCount = mobile
        ? Math.min(360, Math.floor((width * height) / 1600))
        : Math.min(550, Math.floor((width * height) / 1900));

      const colors = ['255,255,255', '180,215,255', '255,220,170'];

      for (let i = 0; i < starCount; i += 1) {
        const bright = Math.random() > 0.9;
        const x = Math.random() * width;
        const y = Math.random() * height;
        const r = bright ? Math.random() * 1.6 + 0.8 : Math.random() * 0.85 + 0.2;
        const alpha = bright ? Math.random() * 0.42 + 0.52 : Math.random() * 0.42 + 0.16;
        const color = colors[Math.floor(Math.random() * colors.length)];

        sctx.beginPath();
        sctx.arc(x, y, r, 0, Math.PI * 2);
        sctx.fillStyle = `rgba(${color},${alpha})`;
        sctx.fill();

        if (bright) {
          sctx.beginPath();
          sctx.arc(x, y, r * 3, 0, Math.PI * 2);
          sctx.fillStyle = `rgba(${color},${alpha * 0.08})`;
          sctx.fill();
        }
      }
    }

    function spawnMeteor() {
      const fireball = Math.random() > 0.96;
      const fromLeft = Math.random() > 0.25;

      meteors.push({
        x: fromLeft ? -160 : width + 160,
        y: Math.random() * height * 0.62,
        vx: fromLeft ? Math.random() * 7 + 8 : -(Math.random() * 7 + 8),
        vy: Math.random() * 2.7 + 1.8,
        length: fireball ? Math.random() * 160 + 200 : Math.random() * 100 + 90,
        opacity: fireball ? 1 : 0.76,
        fireball
      });
    }

    function spawnSatellite() {
      satellites.push({
        x: -40,
        y: Math.random() * height * 0.5 + height * 0.08,
        vx: Math.random() * 0.4 + 0.32,
        vy: Math.random() * 0.05 - 0.025,
        opacity: 0
      });
    }

    function drawNebula(time) {
      const drift = Math.sin(time / 26000) * 28;

      const blueGlow = ctx.createRadialGradient(
        width * 0.18 + drift,
        height * 0.2,
        0,
        width * 0.18 + drift,
        height * 0.2,
        width * 0.6
      );
      blueGlow.addColorStop(0, 'rgba(74,140,255,0.10)');
      blueGlow.addColorStop(1, 'rgba(74,140,255,0)');

      const orangeGlow = ctx.createRadialGradient(
        width * 0.82,
        height * 0.22 + drift * 0.35,
        0,
        width * 0.82,
        height * 0.22 + drift * 0.35,
        width * 0.42
      );
      orangeGlow.addColorStop(0, 'rgba(255,157,28,0.055)');
      orangeGlow.addColorStop(1, 'rgba(255,157,28,0)');

      ctx.fillStyle = blueGlow;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = orangeGlow;
      ctx.fillRect(0, 0, width, height);
    }

    function animate(time) {
      if (!isRunning) return;
      animationFrame = requestAnimationFrame(animate);

      if (time - lastFrame < 33) return;
      lastFrame = time;

      ctx.fillStyle = '#020710';
      ctx.fillRect(0, 0, width, height);

      drawNebula(time);

      if (starCanvas) {
        ctx.drawImage(starCanvas, 0, 0, width, height);
      }

      if (time - lastMeteor > 10000 + Math.random() * 16000) {
        spawnMeteor();
        lastMeteor = time;
      }

      if (time - lastSatellite > 42000 + Math.random() * 38000) {
        spawnSatellite();
        lastSatellite = time;
      }

      meteors = meteors.filter((meteor) => meteor.opacity > 0);

      for (const meteor of meteors) {
        meteor.x += meteor.vx;
        meteor.y += meteor.vy;
        meteor.opacity -= meteor.fireball ? 0.009 : 0.016;

        const tailX = meteor.x - Math.sign(meteor.vx) * meteor.length;
        const tailY = meteor.y - meteor.length * 0.32;

        const gradient = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
        gradient.addColorStop(0, `rgba(255,255,255,${meteor.opacity})`);
        gradient.addColorStop(0.3, `rgba(255,157,28,${meteor.opacity * 0.75})`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = meteor.fireball ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(meteor.x, meteor.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
      }

      satellites = satellites.filter((satellite) => satellite.x < width + 60);

      for (const satellite of satellites) {
        satellite.x += satellite.vx;
        satellite.y += satellite.vy;

        if (satellite.x < width * 0.25) satellite.opacity += 0.01;
        if (satellite.x > width * 0.75) satellite.opacity -= 0.01;

        satellite.opacity = Math.max(0, Math.min(0.5, satellite.opacity));

        ctx.beginPath();
        ctx.arc(satellite.x, satellite.y, 1.35, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,215,255,${satellite.opacity})`;
        ctx.fill();
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        isRunning = false;
        cancelAnimationFrame(animationFrame);
      } else {
        isRunning = true;
        lastFrame = 0;
        animationFrame = requestAnimationFrame(animate);
      }
    }

    resize();
    animationFrame = requestAnimationFrame(animate);

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isRunning = false;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return <canvas className="spaceCanvas" ref={canvasRef} aria-hidden="true" />;
}
