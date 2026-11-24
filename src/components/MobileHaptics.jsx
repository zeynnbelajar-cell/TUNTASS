import React, { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_EMOJIS = ["🎉", "✨", "😄", "🔥", "💥", "⭐", "💖", "🤩", "👍", "🥳", "🎊", "😎"];

export default function MobileHaptics({
  type = "button",
  label = "KIRIM",
  disabled = false,
  emojis = DEFAULT_EMOJIS,
  burstCount = 40,
  power = 13,
  spread = 125,
  gravity = 2,
  emojiSize = 31,
  radius = 20,
  shakeIntensity = 16,
  autoBurst = false,
  autoBurstInterval = 4000,
  style = {},
  onClick,
}) {
  const [particles, setParticles] = useState([]);
  const [shaking, setShaking] = useState(false);
  const frameRef = useRef(0);
  const particlesRef = useRef([]);
  const lastAutoBurst = useRef(0);
  const buttonRef = useRef(null);

  const burst = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Ledakan bermula dari bibir atas tombol, menyembur ke atas dan melebar acak.
    const originY = rect.top + 3;
    const cone = Math.max(100, Math.min(155, spread));
    const next = Array.from({ length: Math.max(1, burstCount) }, (_, index) => {
      const angle = (-90 + (Math.random() - 0.5) * cone) * Math.PI / 180;
      const velocity = power * (0.75 + Math.random() * 0.9);
      return {
        id: `${Date.now()}-${index}-${Math.random()}`,
        emoji: emojis[Math.floor(Math.random() * emojis.length)] || "✨",
        x: rect.left + rect.width * (0.12 + Math.random() * 0.76),
        y: originY + (Math.random() - 0.5) * radius * 0.25,
        vx: Math.cos(angle) * velocity + (Math.random() - 0.5) * 2.2,
        vy: Math.sin(angle) * velocity,
        rotation: Math.random() * 90 - 45,
        spin: (Math.random() - 0.5) * 18,
        size: emojiSize * (0.75 + Math.random() * 0.55),
      };
    });

    particlesRef.current = [...particlesRef.current, ...next];
    setParticles([...particlesRef.current]);
    setShaking(true);
    window.setTimeout(() => setShaking(false), 360);
  }, [burstCount, emojis, emojiSize, power, radius, spread]);

  useEffect(() => {
    let active = true;
    const tick = () => {
      if (!active) return;
      const next = particlesRef.current
        .map((particle) => ({
          ...particle,
          x: particle.x + particle.vx,
          y: particle.y + particle.vy,
          vx: particle.vx * 0.992,
          vy: particle.vy + gravity * 0.16,
          rotation: particle.rotation + particle.spin,
        }))
        .filter((particle) => (
          particle.x > -particle.size * 2 &&
          particle.x < window.innerWidth + particle.size * 2 &&
          particle.y > -particle.size * 2 &&
          particle.y < window.innerHeight + particle.size * 2
        ));

      particlesRef.current = next;
      setParticles(next);
      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);
    return () => {
      active = false;
      window.cancelAnimationFrame(frameRef.current);
    };
  }, [gravity]);

  useEffect(() => {
    if (!autoBurst) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (now - lastAutoBurst.current >= autoBurstInterval) {
        lastAutoBurst.current = now;
        burst();
      }
    }, autoBurstInterval);
    return () => window.clearInterval(timer);
  }, [autoBurst, autoBurstInterval, burst]);

  const handleClick = (event) => {
    if (disabled) return;
    burst();
    onClick?.(event);
  };

  return (
    <>
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 99999 }}>
        {particles.map((particle) => (
          <span
            key={particle.id}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              fontSize: particle.size,
              lineHeight: 1,
              opacity: 1,
              color: "initial",
              filter: "none",
              textShadow: "none",
              transform: `translate(${particle.x}px, ${particle.y}px) rotate(${particle.rotation}deg)`,
              transformOrigin: "center center",
              willChange: "transform",
              userSelect: "none",
            }}
          >
            {particle.emoji}
          </span>
        ))}
      </div>

      <div className="mobile-haptics-wrap" style={{ position: "relative", width: "100%", overflow: "visible" }}>
        <button
          ref={buttonRef}
          type={type}
          disabled={disabled}
          onClick={handleClick}
          className="mobile-haptics-button"
          style={{
            width: "100%",
            minHeight: 74,
            padding: "0 18px",
            border: "1px solid rgba(112,255,207,.65)",
            borderRadius: 999,
            background: "linear-gradient(135deg, #07111b 0%, #102b32 55%, #07111b 100%)",
            color: "#F4FFFF",
            fontWeight: 900,
            fontSize: "clamp(12px, 2vw, 15px)",
            letterSpacing: ".12em",
            cursor: disabled ? "not-allowed" : "pointer",
            boxShadow: "0 0 22px rgba(47,255,190,.18), inset 0 1px 0 rgba(255,255,255,.12)",
            transition: "transform .12s ease, opacity .2s ease, box-shadow .2s ease",
            transform: shaking ? `translate(${(Math.random() - .5) * shakeIntensity}px, ${(Math.random() - .5) * shakeIntensity}px) scale(1.015)` : "translate(0,0) scale(1)",
            opacity: disabled ? .58 : 1,
            ...style,
          }}
        >
          {label}
        </button>
      </div>
    </>
  );
}
