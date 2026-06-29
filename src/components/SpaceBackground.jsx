import { useEffect, useRef } from 'react';

export default function SpaceBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    let width;
    let height;
    let stars = [];
    let meteors = [];
    let animationFrame;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

      stars = Array.from({ length: Math.min(650, Math.floor(width * height / 1800)) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.4 + 0.25,
        alpha: Math.random() * 0.8 + 0.2,
        twinkle: Math.random() * 0.025 + 0.006,
        drift: Math.random() * 0.06 + 0.015
      }));
    }

    function spawnMeteor() {
      meteors.push({
        x: -120,
        y: Math.random() * height * 0.65,
        length: Math.random() * 120 + 110,
        speed: Math.random() * 8 + 9,
        opacity: 1
      });
    }

    function drawNebula() {
      const blueGlow = ctx.createRadialGradient(width * 0.2, height * 0.18, 0, width * 0.2, height * 0.18, width * 0.55);
      blueGlow.addColorStop(0, 'rgba(74,140,255,0.14)');
      blueGlow.addColorStop(1, 'rgba(74,140,255,0)');

      const orangeGlow = ctx.createRadialGradient(width * 0.82, height * 0.2, 0, width * 0.82, height * 0.2, width * 0.42);
      orangeGlow.addColorStop(0, 'rgba(255,157,28,0.09)');
      orangeGlow.addColorStop(1, 'rgba(255,157,28,0)');

      ctx.fillStyle = blueGlow;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = orangeGlow;
      ctx.fillRect(0, 0, width, height);
    }

    let lastMeteor = 0;

    function animate(time) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#020710';
      ctx.fillRect(0, 0, width, height);

      drawNebula();

      for (const star of stars) {
        star.alpha += star.twinkle * (Math.random() > 0.5 ? 1 : -1);
        star.alpha = Math.max(0.15, Math.min(1, star.alpha));
        star.x += star.drift * 0.15;

        if (star.x > width + 2) star.x = -2;

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${star.alpha})`;
        ctx.fill();
      }

      if (time - lastMeteor > 9000 + Math.random() * 9000) {
        spawnMeteor();
        lastMeteor = time;
      }

      meteors = meteors.filter((meteor) => meteor.opacity > 0);

      for (const meteor of meteors) {
        meteor.x += meteor.speed;
        meteor.y += meteor.speed * 0.38;
        meteor.opacity -= 0.012;

        const gradient = ctx.createLinearGradient(
          meteor.x,
          meteor.y,
          meteor.x - meteor.length,
          meteor.y - meteor.length * 0.38
        );

        gradient.addColorStop(0, `rgba(255,255,255,${meteor.opacity})`);
        gradient.addColorStop(0.35, `rgba(255,157,28,${meteor.opacity * 0.8})`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(meteor.x, meteor.y);
        ctx.lineTo(meteor.x - meteor.length, meteor.y - meteor.length * 0.38);
        ctx.stroke();
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