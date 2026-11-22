import { useEffect, useRef } from "react";

const IMAGE_URL = "https://images.unsplash.com/photo-1695805311440-628c4db1c1d5?w=1600&auto=format&fit=crop&q=75";
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Full-viewport Zoom Grid background.
 * The canvas is deliberately non-interactive; pointer tracking happens on
 * window so the app's buttons, forms, maps and navigation remain clickable.
 */
export default function ZoomGridBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return undefined;

    const image = new Image();
    image.decoding = "async";
    image.src = IMAGE_URL;

    const settings = {
      cell: 72,
      zoom: 3,
      reach: 470,
      speed: 34,
      dotSize: 3.2,
      fade: 62,
    };

    let width = 1;
    let height = 1;
    let dpr = 1;
    let cells = [];
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    const focus = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5, hover: 0, targetHover: 0, reach: 0 };

    const resize = () => {
      const nextDpr = Math.min(1.5, window.devicePixelRatio || 1);
      const nextWidth = Math.max(1, Math.round(window.innerWidth * nextDpr));
      const nextHeight = Math.max(1, Math.round(window.innerHeight * nextDpr));
      if (nextWidth === width && nextHeight === height && nextDpr === dpr) return;
      width = nextWidth;
      height = nextHeight;
      dpr = nextDpr;
      canvas.width = width;
      canvas.height = height;
      const cell = Math.max(12, Math.round(settings.cell * dpr));
      cells = [];
      for (let y = 0; y < height; y += cell) {
        for (let x = 0; x < width; x += cell) cells.push({ x, y, s: 0 });
      }
    };

    const onPointerMove = (event) => {
      focus.targetX = clamp(event.clientX / Math.max(1, window.innerWidth), 0, 1);
      focus.targetY = clamp(event.clientY / Math.max(1, window.innerHeight), 0, 1);
      focus.targetHover = 1;
    };
    const onPointerLeave = () => { focus.targetHover = 0; };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("blur", onPointerLeave);
    document.addEventListener("mouseleave", onPointerLeave);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      elapsed += dt * (settings.speed / 50);

      const driftX = 0.5 + 0.31 * Math.sin(elapsed * 0.6);
      const driftY = 0.5 + 0.27 * Math.sin(elapsed * 0.92 + 1.3);
      focus.hover += (focus.targetHover - focus.hover) * (1 - Math.exp(-8 * dt));
      const targetX = driftX + (focus.targetX - driftX) * focus.hover;
      const targetY = driftY + (focus.targetY - driftY) * focus.hover;
      const follow = 1 - Math.exp(-7.5 * dt);
      const oldX = focus.x;
      const oldY = focus.y;
      focus.x += (targetX - focus.x) * follow;
      focus.y += (targetY - focus.y) * follow;
      const lag = Math.hypot(targetX - focus.x, targetY - focus.y) * Math.max(width, height);
      const idleReach = settings.reach * dpr * 0.34 * (settings.speed / 50);
      const targetReach = idleReach + (Math.min(settings.reach * dpr, lag * 2) - idleReach) * focus.hover;
      focus.reach += (targetReach - focus.reach) * (1 - Math.exp(-1.8 * dt));

      if (!image.complete || !image.naturalWidth) {
        ctx.fillStyle = "#030712";
        ctx.fillRect(0, 0, width, height);
        return;
      }

      const iw = image.naturalWidth;
      const ih = image.naturalHeight;
      const scale = Math.max(width / iw, height / ih);
      const viewW = width / scale;
      const viewH = height / scale;
      const ox = (iw - viewW) / 2;
      const oy = (ih - viewH) / 2;
      const fx = focus.x * width;
      const fy = focus.y * height;
      const cell = Math.max(12, Math.round(settings.cell * dpr));

      ctx.globalAlpha = 1;
      ctx.fillStyle = "#030712";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, ox, oy, viewW, viewH, 0, 0, width, height);

      const reach = Math.max(0, focus.reach);
      const zoomFactor = settings.zoom - 1;
      for (let i = 0; i < cells.length; i++) {
        const tile = cells[i];
        const centerX = tile.x + cell / 2;
        const centerY = tile.y + cell / 2;
        const distance = Math.hypot(centerX - fx, centerY - fy);
        const strength = reach > 1 ? 1 - Math.min(1, distance / reach) : 0;
        tile.s = strength;
        if (strength < 0.003) continue;

        const sourceSize = cell / (1 + zoomFactor * strength) / scale;
        const sx = clamp(ox + centerX / scale - sourceSize / 2, 0, Math.max(0, iw - sourceSize));
        const sy = clamp(oy + centerY / scale - sourceSize / 2, 0, Math.max(0, ih - sourceSize));
        ctx.globalAlpha = (1 - (settings.fade / 100) * (1 - strength)) * Math.min(1, strength * 8);
        ctx.drawImage(image, sx, sy, sourceSize, sourceSize, tile.x, tile.y, cell, cell);
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(2, 7, 18, 0.34)";
      ctx.fillRect(0, 0, width, height);

      const dotRadius = cell * settings.dotSize / 100;
      ctx.fillStyle = "rgba(218, 246, 255, 0.42)";
      ctx.beginPath();
      for (let i = 0; i < cells.length; i++) {
        const tile = cells[i];
        if (tile.s < 0.025) continue;
        const radius = dotRadius * tile.s;
        ctx.moveTo(tile.x + radius, tile.y);
        ctx.arc(tile.x, tile.y, radius, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", onPointerLeave);
      document.removeEventListener("mouseleave", onPointerLeave);
      image.onload = null;
    };
  }, []);

  return (
    <div className="zoom-grid-background" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
