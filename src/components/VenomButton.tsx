import { useEffect, useRef, useState, type CSSProperties } from "react";

type Props = {
  background?: string;
  gooColor?: string;
  textColor?: string;
  label?: string;
  size?: number;
  onClick?: () => void;
  style?: CSSProperties;
  type?: "button" | "submit";
  disabled?: boolean;
};

const SENSE_DISTANCE = 680;
const RELEASE_DISTANCE = 760;

const VenomButton = ({
  background = "transparent",
  gooColor = "#00e83f",
  textColor = "#FFFFFF",
  label = "We are Venom",
  size = 58,
  onClick,
  style,
  type = "button",
  disabled = false,
}: Props) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: -1000, y: -1000, active: false });
  const smoothRef = useRef({ x: -1000, y: -1000 });
  const rafRef = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);
  const [near, setNear] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const button = buttonRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !button || !ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.65);
    let active = true;
    let wasNear = false;
    let lastTime = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.65);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onMove = (event: PointerEvent) => {
      if (!pointerRef.current.active) {
        smoothRef.current = { x: event.clientX, y: event.clientY };
      }
      pointerRef.current = { x: event.clientX, y: event.clientY, active: true };
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(draw);
    };
    const onLeave = () => {
      pointerRef.current.active = false;
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(draw);
    };

    const drawStrand = (
      sx: number, sy: number, ex: number, ey: number,
      nx: number, ny: number, spread: number, phase: number,
      thickness: number, time: number
    ) => {
      const dx = ex - sx;
      const dy = ey - sy;
      const length = Math.hypot(dx, dy);
      if (length < 2) return;
      const wave = Math.sin(time * 0.002 + phase) * Math.min(24, length * 0.045);
      const c1x = sx + dx * .28 + nx * (spread + wave);
      const c1y = sy + dy * .28 + ny * (spread + wave);
      const c2x = sx + dx * .76 + nx * (spread * .32 - wave * .35);
      const c2y = sy + dy * .76 + ny * (spread * .32 - wave * .35);

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
      const grad = ctx.createLinearGradient(sx, sy, ex, ey);
      grad.addColorStop(0, "rgba(0,255,74,.98)");
      grad.addColorStop(.48, "rgba(0,239,67,.88)");
      grad.addColorStop(.86, "rgba(64,255,112,.72)");
      grad.addColorStop(1, "rgba(0,255,90,.12)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = thickness;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(0,255,76,.92)";
      ctx.shadowBlur = 9 + thickness * 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.moveTo(sx, sy - .35);
      ctx.bezierCurveTo(c1x, c1y - .35, c2x, c2y - .35, ex, ey - .35);
      ctx.strokeStyle = "rgba(225,255,232,.82)";
      ctx.lineWidth = Math.max(.55, thickness * .18);
      ctx.stroke();
    };

    function draw(time: number) {
      rafRef.current = null;
      if (!active) return;
      const dt = lastTime ? Math.min(32, time - lastTime) : 16;
      lastTime = time;
      const pointer = pointerRef.current;
      const rect = button.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = pointer.x - cx;
      const dy = pointer.y - cy;
      const distance = Math.hypot(dx, dy);
      const within = pointer.active && distance < (wasNear ? RELEASE_DISTANCE : SENSE_DISTANCE);
      if (within !== wasNear) {
        wasNear = within;
        setNear(within);
      }

      const smooth = smoothRef.current;
      const blend = reducedMotion ? 1 : 1 - Math.pow(.0018, dt / 1000);
      smooth.x += (pointer.x - smooth.x) * blend;
      smooth.y += (pointer.y - smooth.y) * blend;

      ctx.clearRect(0, 0, width, height);
      if (within && !reducedMotion && !disabled) {
        const vx = smooth.x - cx;
        const vy = smooth.y - cy;
        const len = Math.max(1, Math.hypot(vx, vy));
        const ux = vx / len;
        const uy = vy / len;
        const nx = -uy;
        const ny = ux;
        const edge = 1 / Math.sqrt((ux * ux) / (rect.width * rect.width * .25) + (uy * uy) / (rect.height * rect.height * .25));
        const sx = cx + ux * edge;
        const sy = cy + uy * edge;
        const reach = Math.max(0, Math.min(1, 1 - distance / RELEASE_DISTANCE));
        const fan = 3 + reach * 13;
        const endX = smooth.x - ux * 7;
        const endY = smooth.y - uy * 7;

        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        drawStrand(sx + nx * 10, sy + ny * 10, endX + nx * 5, endY + ny * 5, nx, ny, fan * 1.2, .2, 2.5, time);
        drawStrand(sx + nx * 5, sy + ny * 5, endX + nx * 2, endY + ny * 2, nx, ny, fan * .7, 1.1, 2, time);
        drawStrand(sx, sy, endX, endY, nx, ny, 0, 2.2, 2.2, time);
        drawStrand(sx - nx * 5, sy - ny * 5, endX - nx * 3, endY - ny * 3, nx, ny, -fan * .7, 3.2, 2, time);
        drawStrand(sx - nx * 10, sy - ny * 10, endX - nx * 6, endY - ny * 6, nx, ny, -fan * 1.2, 4.1, 2.5, time);

        const blobRadius = 3 + reach * 5;
        const blob = ctx.createRadialGradient(smooth.x, smooth.y, 0, smooth.x, smooth.y, blobRadius * 2.4);
        blob.addColorStop(0, "rgba(220,255,230,.98)");
        blob.addColorStop(.3, "rgba(0,255,72,.9)");
        blob.addColorStop(1, "rgba(0,255,72,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(smooth.x, smooth.y, blobRadius * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (pointer.active && (within || wasNear)) {
        rafRef.current = requestAnimationFrame(draw);
      }
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onLeave, { passive: true });
    window.addEventListener("blur", onLeave);
    return () => {
      active = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, [disabled, reducedMotion]);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        minHeight: size + 18,
        overflow: "visible",
        isolation: "isolate",
        background,
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          pointerEvents: "none",
          width: "100vw",
          height: "100vh",
        }}
      />
      <style>{`
        .venom-button {
          position: relative;
          isolation: isolate;
          appearance: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          max-width: 100%;
          border: 1px solid rgba(210,255,220,.72);
          border-radius: 9999px;
          padding: 0 28px;
          overflow: hidden;
          cursor: pointer;
          font: 850 13px/1 system-ui, sans-serif;
          letter-spacing: .025em;
          box-shadow:
            inset 0 2px 2px rgba(255,255,255,.82),
            inset 0 -4px 7px rgba(0,100,28,.34),
            0 2px 4px rgba(0,0,0,.16),
            0 7px 15px rgba(0,220,58,.28),
            0 13px 22px -12px rgba(0,0,0,.4);
          transition:
            transform 420ms cubic-bezier(.2,.85,.2,1),
            box-shadow 420ms ease,
            filter 420ms ease;
          will-change: transform, filter;
        }
        .venom-button::before {
          content: "";
          position: absolute;
          inset: 1px 2px 48%;
          border-radius: inherit;
          background: linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,0));
          opacity: .9;
          pointer-events: none;
        }
        .venom-button::after {
          content: "";
          position: absolute;
          inset: 1px;
          border-radius: inherit;
          background: radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.42), transparent 62%);
          opacity: .8;
          pointer-events: none;
        }
        .venom-button > span {
          position: relative;
          z-index: 1;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0,90,25,.5), 0 0 10px rgba(255,255,255,.36);
        }
        .venom-button:focus-visible {
          outline: 3px solid #8ff8a8;
          outline-offset: 4px;
        }
        .venom-button:disabled {
          cursor: wait;
          opacity: .68;
          filter: saturate(.72);
        }
        @media (prefers-reduced-motion: reduce) {
          .venom-button { transition: none !important; }
        }
      `}</style>
      <button
        ref={buttonRef}
        type={type}
        className="venom-button"
        disabled={disabled}
        onClick={onClick}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        style={{
          zIndex: 41,
          height: size,
          color: textColor,
          background: `linear-gradient(180deg, #70ff9a 0%, #20f45b 22%, ${gooColor} 68%, #00b832 100%)`,
          transform: pressed && !reducedMotion ? "scale(.965) translateY(1px)" : near && !reducedMotion ? "scale(1.012)" : "scale(1)",
          filter: near && !reducedMotion ? "brightness(1.18) saturate(1.12)" : "none",
          boxShadow: near && !reducedMotion
            ? "inset 0 2px 3px rgba(255,255,255,.9), inset 0 -4px 8px rgba(0,100,24,.35), 0 0 0 1px rgba(190,255,205,.75), 0 0 34px rgba(0,255,75,.68), 0 14px 30px rgba(0,190,45,.36)"
            : undefined,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <span>{label}</span>
      </button>
    </div>
  );
};

export default VenomButton;
