/* eslint-disable */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

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

const VenomButton = ({
  background = "transparent",
  gooColor = "#020203",
  textColor = "#FFFFFF",
  label = "We are Venom",
  size = 58,
  onClick,
  style,
  type = "button",
  disabled = false,
}: Props) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0, active: false });
  const [pressed, setPressed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setPointer({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, active: true });
  };

  const nearButton = (() => {
    const button = buttonRef.current?.getBoundingClientRect();
    const stage = stageRef.current?.getBoundingClientRect();
    return !!pointer.active && !!button && !!stage &&
      Math.hypot(pointer.x - (button.left - stage.left + button.width / 2), pointer.y - (button.top - stage.top + button.height / 2)) < 250;
  })();

  return (
    <div
      ref={stageRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setPointer((current) => ({ ...current, active: false }))}
      style={{
        position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
        width: "100%", minHeight: 74, overflow: "hidden", background, ...style,
      }}
    >
      <style>{`
        .venom-button {
          appearance:none;border:0;border-radius:9999px;padding:0 28px;
          width:100%;max-width:100%;font:800 14px/1 system-ui,sans-serif;
          letter-spacing:.015em;cursor:pointer;outline:none;
          transition:transform 180ms cubic-bezier(.2,.8,.2,1),filter 180ms ease,opacity 180ms ease;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.18),inset 0 -2px 0 rgba(255,255,255,.12),0 18px 32px -16px rgba(0,0,0,.65);
        }
        .venom-button:focus-visible{outline:3px solid #8ff8ed;outline-offset:4px}
        .venom-button:disabled{cursor:wait;opacity:.58;filter:saturate(.55)}
      `}</style>
      <div aria-hidden="true" style={{
        position:"absolute",left:pointer.x,top:pointer.y,
        width:nearButton&&!reducedMotion?46:0,height:nearButton&&!reducedMotion?46:0,
        borderRadius:"50%",background:gooColor,filter:"blur(2px)",
        transform:"translate(-50%,-50%)",opacity:nearButton && !reducedMotion ? 0.92 : 0,
        transition:"width 220ms ease,height 220ms ease,opacity 180ms ease",
        pointerEvents:"none",zIndex:3,
      }} />
      <button
        ref={buttonRef}
        type={type}
        className="venom-button"
        disabled={disabled}
        onClick={onClick}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        style={{
          position:"relative",zIndex:4,height:size,color:textColor,
          background:`linear-gradient(180deg, ${gooColor} 0%, #000 100%)`,
          transform:pressed&&!reducedMotion?"scale(.97)":"scale(1)",
          textShadow:"0 1px 0 rgba(0,0,0,.75)",WebkitTapHighlightColor:"transparent",
        }}
      >{label}</button>
    </div>
  );
};

export default VenomButton;
