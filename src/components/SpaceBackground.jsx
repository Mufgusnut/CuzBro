import { useEffect, useRef } from 'react';

export default function SpaceBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    let width = 0;
    let height = 0;
    let stars = [];
    let meteors = [];
    let satellites = [];
    let animationFrame;
    let lastMeteor = 0;
    let lastSatellite = 0;

    const colors = [
      '255,255,255',
      '180,215,255',
      '255,220,170',
      '210,235,255'
    ];

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;

      const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      const starCount = Math.min(900, Math.floor((width * height) / 1200));

      stars = Array.from({ length: starCount }, () => {
        const bright = Math.random() > 0.88;

        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: bright ? Math.random() * 1.9 + 1.0 : Math.random() * 1.05 + 0.25,
          alpha: bright ? Math.random() * 0.45 + 0.55 : Math.random() * 0.55 + 0.18,
          twinkle: Math.random() * 0.018 + 0.004,
          drift: Math.random() * 0.035 + 0.006,
          color: colors[Math.floor(Math.random() * colors.length)]
        };
      });
    }

    function spawnMeteor() {
      const fireball = Math.random() > 0.94;
      const fromLeft = Math.random() > 0.25;

      meteors.push({
        x: fromLeft ? -160 : width + 160,
        y: Math.random() * height * 0.7,
        vx: fromLeft ? Math.random() * 9 + 10 : -(Math.random() * 9 + 10),
        vy: Math.random() * 3.5 + 2.2,
        length: fireball ? Math.random() * 180 + 230 : Math.random() * 130 + 120,
        opacity: fireball ? 1 : 0.82,
        fireball
      });
    }

    function spawnSatellite() {
      satellites.push({
        x: -40,
        y: Math.random() * height * 0.55 + height * 0.08,
        vx: Math.random() * 0.55 + 0.45,
        vy: Math.random() * 0.08 - 0.04,
        opacity: 0
      });
    }

    function drawNebula(time) {
      const drift = Math.sin(time / 18000) * 40;

      const blueGlow = ctx.createRadialGradient(
        width * 0.18 + drift,
        height * 0.2,
        0,
        width * 0.18 + drift,
        height * 0.2,
        width * 0.55
      );
      blueGlow.addColorStop(0, 'rgba(74,140,255,0.14)');
      blueGlow.addColorStop(1, 'rgba(74,140,255,0)');

      const purpleGlow = ctx.createRadialGradient(
        width * 0.72 - drift,
        height * 0.38,
        0,
        width * 0.72 - drift,
        height * 0.38,
        width * 0.5
      );
      purpleGlow.addColorStop(0, 'rgba(124,77,255,0.10)');
      purpleGlow.addColorStop(1, 'rgba(124,77,255,0)');

      const orangeGlow = ctx.createRadialGradient(
        width * 0.82,
        height * 0.2 + drift * 0.4,
        0,
        width * 0.82,
        height * 0.2 + drift * 0.4,
        width * 0.38
      );
      orangeGlow.addColorStop(0, 'rgba(255,157,28,0.08)');
      orangeGlow.addColorStop(1, 'rgba(255,157,28,0)');

      ctx.fillStyle = blueGlow;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = purpleGlow;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = orangeGlow;
      ctx.fillRect(0, 0, width, height);
    }

    function animate(time) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#020710';
      ctx.fillRect(0, 0, width, height);

      drawNebula(time);

      for (const star of stars) {
        star.alpha += star.twinkle * (Math.random() > 0.5 ? 1 : -1);
        star.alpha = Math.max(0.12, Math.min(1, star.alpha));
        star.x += star.drift * 0.12;

        if (star.x > width + 3) star.x = -3;

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${star.color},${star.alpha})`;
        ctx.fill();

        if (star.r > 1.7) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.r * 3.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${star.color},${star.alpha * 0.08})`;
          ctx.fill();
        }
      }

      if (time - lastMeteor > 7000 + Math.random() * 12000) {
        spawnMeteor();
        lastMeteor = time;
      }

      if (time - lastSatellite > 26000 + Math.random() * 26000) {
        spawnSatellite();
        lastSatellite = time;
      }

      meteors = meteors.filter((meteor) => meteor.opacity > 0);

      for (const meteor of meteors) {
        meteor.x += meteor.vx;
        meteor.y += meteor.vy;
        meteor.opacity -= meteor.fireball ? 0.007 : 0.013;

        const tailX = meteor.x - Math.sign(meteor.vx) * meteor.length;
        const tailY = meteor.y - meteor.length * 0.32;

        const gradient = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
        gradient.addColorStop(0, `rgba(255,255,255,${meteor.opacity})`);
        gradient.addColorStop(0.25, `rgba(255,157,28,${meteor.opacity * 0.85})`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = meteor.fireball ? 3.2 : 2;
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

        satellite.opacity = Math.max(0, Math.min(0.55, satellite.opacity));

        ctx.beginPath();
        ctx.arc(satellite.x, satellite.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,215,255,${satellite.opacity})`;
        ctx.fill();
      }

      animationFrame = requestAnimationFrame(animate);
    }

    resize();
    animationFrame = requestAnimationFrame(animate);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas className="spaceCanvas" ref={canvasRef} aria-hidden="true" />;
}