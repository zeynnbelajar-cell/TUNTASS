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
  size = 44,
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

      // The reference uses several hair-thin, independently rippling filaments,
      // not a handful of thick straight strokes.
      const drawFilament = (offset: number, phaseShift: number, width: number, alpha: number) => {
        ctx.beginPath();
        for (let step = 0; step <= 34; step += 1) {
          const t = step / 34;
          const envelope = Math.sin(Math.PI * t);
          const broad = Math.sin(t * Math.PI * 1.55 + time * .0021 + phase + phaseShift) * Math.min(18, length * .035);
          const fine = Math.sin(t * Math.PI * 4.2 - time * .0032 + phase * 1.7 + phaseShift) * Math.min(4.5, length * .009);
          const taper = (broad + fine) * envelope;
          const curve = spread * Math.sin(Math.PI * t) * (1 - t * .28);
          const x = sx + dx * t + nx * (offset + curve + taper);
          const y = sy + dy * t + ny * (offset + curve + taper);
          if (step === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const grad = ctx.createLinearGradient(sx, sy, ex, ey);
        grad.addColorStop(0, `rgba(0,255,54,${alpha})`);
        grad.addColorStop(.42, `rgba(0,255,70,${alpha * .92})`);
        grad.addColorStop(.82, `rgba(58,255,102,${alpha * .78})`);
        grad.addColorStop(1, "rgba(0,255,72,.08)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(0,255,65,.9)";
        ctx.shadowBlur = 4.5;
        ctx.stroke();
        ctx.shadowBlur = 0;
      };

      drawFilament(-1.05, .0, Math.max(.72, thickness * .34), .88);
      drawFilament(.15, 1.7, Math.max(.62, thickness * .27), .96);
      drawFilament(1.15, 3.1, Math.max(.62, thickness * .25), .76);
      drawFilament(.1, 4.8, .48, .55);
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
          border: 1px solid rgba(225,255,231,.9);
          border-radius: 9999px;
          padding: 0 28px;
          overflow: hidden;
          cursor: pointer;
          font: 700 13px/1 Georgia, 'Times New Roman', serif;
          letter-spacing: .005em;
          box-shadow:
            inset 0 2px 2px rgba(255,255,255,.95),
            inset 0 -3px 7px rgba(0,100,24,.3),
            0 2px 3px rgba(0,0,0,.12),
            0 5px 12px rgba(0,230,54,.25),
            0 10px 18px -12px rgba(0,0,0,.3);
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
          font-family: Georgia, 'Times New Roman', serif;
          text-shadow: 0 1px 1px rgba(0,90,25,.42), 0 0 7px rgba(255,255,255,.28);
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
          background: `linear-gradient(180deg, #8bffad 0%, #37ff68 18%, ${gooColor} 62%, #00c832 100%)`,
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
