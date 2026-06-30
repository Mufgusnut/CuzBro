import { useEffect, useRef } from 'react';

export default function SpaceBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

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

    function resize() {
      width = window.innerWidth;
      height = Math.max(
        window.innerHeight,
        document.documentElement.scrollHeight
      )
      ratio = window.devicePixelRatio || 1;

      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      buildStarCanvas();
    }

    function buildStarCanvas() {
      starCanvas = document.createElement('canvas');
      starCanvas.width = width * ratio;
      starCanvas.height = height * ratio;

      const sctx = starCanvas.getContext('2d');
      sctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      const starCount = Math.min(550, Math.floor((width * height) / 1900));
      const colors = ['255,255,255', '180,215,255', '255,220,170'];

      for (let i = 0; i < starCount; i++) {
        const bright = Math.random() > 0.9;
        const x = Math.random() * width;
        const y = Math.random() * height;
        const r = bright ? Math.random() * 1.7 + 0.9 : Math.random() * 0.9 + 0.2;
        const alpha = bright ? Math.random() * 0.45 + 0.55 : Math.random() * 0.45 + 0.18;
        const color = colors[Math.floor(Math.random() * colors.length)];

        sctx.beginPath();
        sctx.arc(x, y, r, 0, Math.PI * 2);
        sctx.fillStyle = `rgba(${color},${alpha})`;
        sctx.fill();

        if (bright) {
          sctx.beginPath();
          sctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
          sctx.fillStyle = `rgba(${color},${alpha * 0.08})`;
          sctx.fill();
        }
      }
    }

    function spawnMeteor() {
      const fireball = Math.random() > 0.95;
      const fromLeft = Math.random() > 0.25;

      meteors.push({
        x: fromLeft ? -160 : width + 160,
        y: Math.random() * height * 0.7,
        vx: fromLeft ? Math.random() * 8 + 9 : -(Math.random() * 8 + 9),
        vy: Math.random() * 3 + 2,
        length: fireball ? Math.random() * 170 + 210 : Math.random() * 110 + 100,
        opacity: fireball ? 1 : 0.78,
        fireball
      });
    }

    function spawnSatellite() {
      satellites.push({
        x: -40,
        y: Math.random() * height * 0.55 + height * 0.08,
        vx: Math.random() * 0.45 + 0.35,
        vy: Math.random() * 0.06 - 0.03,
        opacity: 0
      });
    }

    function drawNebula(time) {
      const drift = Math.sin(time / 24000) * 36;

      const blueGlow = ctx.createRadialGradient(
        width * 0.18 + drift,
        height * 0.2,
        0,
        width * 0.18 + drift,
        height * 0.2,
        width * 0.55
      );
      blueGlow.addColorStop(0, 'rgba(74,140,255,0.11)');
      blueGlow.addColorStop(1, 'rgba(74,140,255,0)');

      const orangeGlow = ctx.createRadialGradient(
        width * 0.82,
        height * 0.2 + drift * 0.4,
        0,
        width * 0.82,
        height * 0.2 + drift * 0.4,
        width * 0.38
      );
      orangeGlow.addColorStop(0, 'rgba(255,157,28,0.06)');
      orangeGlow.addColorStop(1, 'rgba(255,157,28,0)');

      ctx.fillStyle = blueGlow;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = orangeGlow;
      ctx.fillRect(0, 0, width, height);
    }

    function animate(time) {
      animationFrame = requestAnimationFrame(animate);

      // 30 FPS cap
      if (time - lastFrame < 33) return;
      lastFrame = time;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#020710';
      ctx.fillRect(0, 0, width, height);

      drawNebula(time);

      if (starCanvas) {
        ctx.drawImage(starCanvas, 0, 0, width, height);
      }

      if (time - lastMeteor > 9000 + Math.random() * 14000) {
        spawnMeteor();
        lastMeteor = time;
      }

      if (time - lastSatellite > 34000 + Math.random() * 30000) {
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
        ctx.arc(satellite.x, satellite.y, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,215,255,${satellite.opacity})`;
        ctx.fill();
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        cancelAnimationFrame(animationFrame);
      } else {
        lastFrame = 0;
        animationFrame = requestAnimationFrame(animate);
      }
    }

    resize();
    animationFrame = requestAnimationFrame(animate);

    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return <canvas className="spaceCanvas" ref={canvasRef} aria-hidden="true" />;
}