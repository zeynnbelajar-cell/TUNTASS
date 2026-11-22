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

const SENSE_DISTANCE = 440;
const RELEASE_DISTANCE = 520;

const VenomButton = ({
  background = "transparent",
  gooColor = "#030506",
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
      const wave = Math.sin(time * 0.0022 + phase) * Math.min(13, length * 0.035);
      const c1x = sx + dx * 0.34 + nx * (spread * 0.45 + wave);
      const c1y = sy + dy * 0.34 + ny * (spread * 0.45 + wave);
      const c2x = sx + dx * 0.76 + nx * (spread * 0.18 - wave * 0.45);
      const c2y = sy + dy * 0.76 + ny * (spread * 0.18 - wave * 0.45);
      const endX = ex + nx * spread * 0.08;
      const endY = ey + ny * spread * 0.08;
      const startW = thickness;
      const endW = Math.max(1.1, thickness * 0.08);

      ctx.beginPath();
      ctx.moveTo(sx + nx * startW, sy + ny * startW);
      ctx.bezierCurveTo(c1x + nx * startW * 0.68, c1y + ny * startW * 0.68,
        c2x + nx * endW, c2y + ny * endW, endX + nx * endW, endY + ny * endW);
      ctx.quadraticCurveTo(endX, endY, endX - nx * endW, endY - ny * endW);
      ctx.bezierCurveTo(c2x - nx * endW, c2y - ny * endW,
        c1x - nx * startW * 0.68, c1y - ny * startW * 0.68,
        sx - nx * startW, sy - ny * startW);
      ctx.closePath();

      const grad = ctx.createLinearGradient(sx, sy, ex, ey);
      grad.addColorStop(0, "rgba(1,3,5,.98)");
      grad.addColorStop(.38, "rgba(7,12,15,.96)");
      grad.addColorStop(.78, "rgba(3,6,8,.9)");
      grad.addColorStop(1, "rgba(2,4,6,.08)");
      ctx.fillStyle = grad;
      ctx.shadowColor = "rgba(0,0,0,.42)";
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.moveTo(sx + nx * startW * .24, sy + ny * startW * .24);
      ctx.bezierCurveTo(c1x + nx * startW * .16, c1y + ny * startW * .16,
        c2x + nx * endW * .2, c2y + ny * endW * .2,
        endX + nx * endW * .15, endY + ny * endW * .15);
      ctx.strokeStyle = "rgba(170,205,211,.18)";
      ctx.lineWidth = Math.max(.7, thickness * .1);
      ctx.lineCap = "round";
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
        const edge = Math.min(rect.width * .42, rect.height * .34);
        const sx = cx + ux * edge;
        const sy = cy + uy * edge;
        const reach = Math.max(0, Math.min(1, 1 - distance / RELEASE_DISTANCE));
        const tension = .55 + reach * .9;
        const endX = smooth.x - ux * 13;
        const endY = smooth.y - uy * 13;
        const spread = (9 + reach * 15) * tension;

        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        drawStrand(sx + nx * 7, sy + ny * 7, endX, endY, nx, ny, spread * 1.2, .3, 10 + reach * 7, time);
        drawStrand(sx - nx * 5, sy - ny * 5, endX - nx * 8, endY - ny * 8, nx, ny, -spread * .8, 1.8, 7 + reach * 5, time);
        drawStrand(sx + nx * 1, sy + ny * 1, endX + nx * 9, endY + ny * 9, nx, ny, spread * .55, 3.1, 4 + reach * 3, time);

        const blobRadius = 5 + reach * 8;
        const blob = ctx.createRadialGradient(smooth.x - 3, smooth.y - 4, 1, smooth.x, smooth.y, blobRadius * 1.8);
        blob.addColorStop(0, "rgba(10,15,18,.96)");
        blob.addColorStop(.62, "rgba(2,5,7,.9)");
        blob.addColorStop(1, "rgba(2,5,7,0)");
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(smooth.x, smooth.y, blobRadius * 1.8, 0, Math.PI * 2);
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
          border: 1px solid rgba(195, 225, 230, .2);
          border-radius: 9999px;
          padding: 0 28px;
          overflow: hidden;
          cursor: pointer;
          font: 850 13px/1 system-ui, sans-serif;
          letter-spacing: .035em;
          box-shadow:
            inset 0 1px 1px rgba(255,255,255,.3),
            inset 0 -3px 7px rgba(0,0,0,.72),
            0 8px 15px rgba(0,0,0,.28),
            0 20px 38px -18px rgba(0,0,0,.72);
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
          background: linear-gradient(180deg, rgba(255,255,255,.2), rgba(255,255,255,0));
          opacity: .72;
          pointer-events: none;
        }
        .venom-button::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.12), transparent 58%);
          opacity: .7;
          pointer-events: none;
        }
        .venom-button > span {
          position: relative;
          z-index: 1;
          text-shadow: 0 1px 2px rgba(0,0,0,.9), 0 0 12px rgba(255,255,255,.12);
        }
        .venom-button:focus-visible {
          outline: 3px solid #8ff8ed;
          outline-offset: 4px;
        }
        .venom-button:disabled {
          cursor: wait;
          opacity: .62;
          filter: saturate(.55);
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
          background: `linear-gradient(180deg, #20272b 0%, ${gooColor} 28%, #000 100%)`,
          transform: pressed && !reducedMotion ? "scale(.965) translateY(1px)" : near && !reducedMotion ? "scale(1.012)" : "scale(1)",
          filter: near && !reducedMotion ? "brightness(1.18) saturate(1.12)" : "none",
          boxShadow: near && !reducedMotion
            ? "inset 0 1px 2px rgba(255,255,255,.38), inset 0 -4px 8px rgba(0,0,0,.75), 0 0 0 1px rgba(160,220,225,.2), 0 0 28px rgba(8,12,16,.48), 0 18px 42px rgba(0,0,0,.42)"
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
