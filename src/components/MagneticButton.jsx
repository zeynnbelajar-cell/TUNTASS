/* eslint-disable */
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const RANGE_PER_POINT = 18;
const MAX_PULL = 0.5;

export default function MagneticButton({
  label = "Magnetic Hover",
  onClick,
  disabled = false,
  fill = "#FFFFFF",
  textColor = "#000000",
  sweepColor = "#0000FF",
  sweepTextColor = "#FFFFFF",
  paddingX = 48,
  paddingY = 24,
  radius = 100,
  magnet = 10,
  transition = { type: "tween", stiffness: 800, damping: 60, mass: 1, ease: "easeInOut", duration: 0.3 },
  border = true,
  borderOptions = { color: "#FFFFFF", width: 1 },
  style,
}) {
  const ref = useRef(null);
  const [hover, setHover] = useState(false);
  const [origin, setOrigin] = useState({ x: 0, y: 0, d: 0 });
  const hoverRef = useRef(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.4 });
  const borderColor = borderOptions?.color ?? "#FFFFFF";
  const borderWidth = border ? borderOptions?.width ?? 0 : 0;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const pull = (magnet / 20) * MAX_PULL;
    const reach = magnet * RANGE_PER_POINT;

    function onMove(event) {
      const rect = node.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2 - sx.get());
      const dy = event.clientY - (rect.top + rect.height / 2 - sy.get());
      const inside = event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom;
      const edgeX = Math.max(0, Math.abs(dx) - rect.width / 2);
      const edgeY = Math.max(0, Math.abs(dy) - rect.height / 2);
      const gap = Math.hypot(edgeX, edgeY);

      if (inside !== hoverRef.current) {
        setOrigin({
          x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
          y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
          d: 2 * Math.hypot(rect.width, rect.height),
        });
        hoverRef.current = inside;
        setHover(inside);
      }
      if (gap > reach || disabled) {
        x.set(0);
        y.set(0);
        return;
      }
      const falloff = reach === 0 ? 0 : 1 - gap / reach;
      x.set(dx * pull * falloff);
      y.set(dy * pull * falloff);
    }
    function onLeave() {
      x.set(0);
      y.set(0);
      hoverRef.current = false;
      setHover(false);
    }
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [magnet, x, y, sx, sy, disabled]);

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      style={{
        position: "relative", display: "inline-flex", alignItems: "center",
        justifyContent: "center", boxSizing: "border-box",
        padding: `${paddingY}px ${paddingX}px`, borderRadius: radius,
        background: fill, border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : "none",
        cursor: disabled ? "not-allowed" : "pointer", overflow: "hidden",
        textDecoration: "none", whiteSpace: "nowrap", x: sx, y: sy,
        opacity: disabled ? 0.58 : 1,
        boxShadow: hover ? "0 16px 40px rgba(0,0,0,0.22)" : "0 8px 22px rgba(0,0,0,0.14)",
        ...style,
      }}
    >
      <motion.span
        aria-hidden
        initial={false}
        animate={{ scale: hover && !disabled ? 1 : 0 }}
        transition={transition}
        style={{
          position: "absolute", top: origin.y, left: origin.x,
          width: origin.d, height: origin.d, marginLeft: -origin.d / 2,
          marginTop: -origin.d / 2, borderRadius: "50%",
          background: sweepColor, transformOrigin: "center", pointerEvents: "none",
        }}
      />
      <motion.span
        initial={false}
        animate={{ color: hover && !disabled ? sweepTextColor : textColor }}
        transition={transition}
        style={{ position: "relative", zIndex: 1 }}
      >
        {label}
      </motion.span>
    </motion.button>
  );
}
