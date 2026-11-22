"use client";

import React from "react";

const DEFAULT_GLYPHS = [
  { character: "JADI", from: "#201CF7", to: "#288CF5", rim: "#FD3001", lean: -2 },
  { character: "AKSI", from: "#FB3E04", to: "#FBCD08", rim: "#2318F7", lean: 2 },
  { character: "NYATA", from: "#20BFA5", to: "#75E7D4", rim: "#FDBB03", lean: -2 },
];

function shade(hex, amount = 0.58) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  const channels = [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16));
  return `rgb(${channels.map((channel) => Math.round(channel * amount)).join(",")})`;
}

export default function PlinthTally({ glyphs = DEFAULT_GLYPHS, background = "transparent", style }) {
  const words = (glyphs.length ? glyphs : DEFAULT_GLYPHS)
    .filter((glyph) => glyph?.character?.trim())
    .slice(0, 3);

  return (
    <div className="plinth-css-stage" style={{ background, ...style }} aria-hidden="true">
      <div className="plinth-css-words">
        {words.map((glyph, index) => {
          const start = glyph.from || DEFAULT_GLYPHS[index].from;
          const end = glyph.to || DEFAULT_GLYPHS[index].to;
          const rim = glyph.rim || DEFAULT_GLYPHS[index].rim;
          const lean = Number.isFinite(glyph.lean) ? Math.max(-8, Math.min(8, glyph.lean * 0.06)) : 0;
          const wordStyle = {
            "--word-index": index,
            "--word-lean": `${lean}deg`,
            "--word-start": start,
            "--word-end": end,
            "--word-depth": shade(start, 0.48),
            "--word-rim": rim,
          };

          return (
            <span className="plinth-css-word" key={glyph.character} style={wordStyle}>
              <span className="plinth-css-face" data-text={glyph.character}>
                {glyph.character}
              </span>
            </span>
          );
        })}
      </div>
      <i className="plinth-css-glint plinth-css-glint-one" />
      <i className="plinth-css-glint plinth-css-glint-two" />
      <i className="plinth-css-glint plinth-css-glint-three" />
    </div>
  );
}
