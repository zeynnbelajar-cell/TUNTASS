import React, { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_EMOJIS = ["🎉", "✨", "😄", "🔥", "💥", "⭐", "💖", "🤩", "👍", "🥳", "🎊", "😎"];

export default function MobileHaptics({
  type = "button",
  label = "KIRIM",
  disabled = false,
  emojis = DEFAULT_EMOJIS,
  burstCount = 40,
  power = 13,
  spread = 55,
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

  const burst = useCallback(() => {
    const next = Array.from({ length: Math.max(1, burstCount) }, (_, index) => {
      const angle = (-Math.PI / 2) + ((Math.random() - 0.5) * spread * Math.PI / 180) + (index / burstCount) * 0.18;
      const velocity = power * (0.65 + Math.random() * 0.7);
      return {
        id: `${Date.now()}-${index}-${Math.random()}`,
        emoji: emojis[Math.floor(Math.random() * emojis.length)] || "✨",
        x: (Math.random() - 0.5) * radius,
        y: 0,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        rotation: Math.random() * 90 - 45,
        spin: (Math.random() - 0.5) * 18,
        life: 1,
        size: emojiSize * (0.75 + Math.random() * 0.55),
      };
    });
    particlesRef.current = [...particlesRef.current, ...next].slice(-120);
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
          vx: particle.vx * 0.985,
          vy: particle.vy + gravity * 0.12,
          rotation: particle.rotation + particle.spin,
          life: particle.life - 0.014,
        }))
        .filter((particle) => particle.life > 0);
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
    <div className="mobile-haptics-wrap" style={{ position: "relative", width: "100%", overflow: "visible" }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none", zIndex: 5 }}>
        {particles.map((particle) => (
          <span
            key={particle.id}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              fontSize: particle.size,
              lineHeight: 1,
              opacity: Math.max(0, particle.life),
              transform: `translate(${particle.x}px, ${particle.y}px) rotate(${particle.rotation}deg)`,
              filter: "drop-shadow(0 3px 5px rgba(0,0,0,.25))",
              willChange: "transform, opacity",
            }}
          >
            {particle.emoji}
          </span>
        ))}
      </div>
      <button
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
  );
}
