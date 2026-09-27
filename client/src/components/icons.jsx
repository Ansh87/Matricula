// icons.jsx - custom-drawn inline SVG symbols.
//
// The app used to lean on emoji and Unicode geometry characters for its
// arrows, checks, warnings, category markers and the document glyph. Those
// render differently on every platform (and the emoji picked up the host
// font's colour), so each one is redrawn here as a plain SVG path.
//
// Every symbol:
//   - is drawn in a 16x16 box and sized in `em`, so it scales with the text
//     it sits next to,
//   - paints in `currentColor`, so it inherits the surrounding colour,
//   - is `aria-hidden`, because each one sits beside a real text label.
//
// Pass `size` to override the 1em default (e.g. size="1.2em").
import React from "react";

function Svg({ size = "1em", style, children, ...rest }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true" focusable="false"
      style={{ display: "inline-block", verticalAlign: "-0.125em", flex: "none", ...style }}
      {...rest}
    >
      {children}
    </svg>
  );
}

const stroke = {
  stroke: "currentColor", strokeWidth: 1.6,
  strokeLinecap: "round", strokeLinejoin: "round",
};

/* ---------- arrows (were: → ← ↑ ↗) ---------- */

export function Arrow(props) {
  return (
    <Svg {...props}>
      <path d="M2.6 8h10" {...stroke} />
      <path d="M8.9 4.4 12.5 8l-3.6 3.6" {...stroke} />
    </Svg>
  );
}

export function ArrowLeft(props) {
  return (
    <Svg {...props}>
      <path d="M13.4 8h-10" {...stroke} />
      <path d="M7.1 4.4 3.5 8l3.6 3.6" {...stroke} />
    </Svg>
  );
}

export function ArrowUp(props) {
  return (
    <Svg {...props}>
      <path d="M8 13.4v-10" {...stroke} />
      <path d="M4.4 7.1 8 3.5l3.6 3.6" {...stroke} />
    </Svg>
  );
}

// Diagonal "opens elsewhere" arrow, used on links that leave the app.
export function ExternalArrow(props) {
  return (
    <Svg {...props}>
      <path d="M4 12 12 4" {...stroke} />
      <path d="M6.2 4h5.8v5.8" {...stroke} />
    </Svg>
  );
}

/* ---------- marks (were: ✓ ✕ ⚠ ★ ℹ) ---------- */

export function Check(props) {
  return (
    <Svg {...props}>
      <path d="M3 8.6 6.4 12 13 4.8" {...stroke} />
    </Svg>
  );
}

export function Close(props) {
  return (
    <Svg {...props}>
      <path d="M4.2 4.2 11.8 11.8" {...stroke} />
      <path d="M11.8 4.2 4.2 11.8" {...stroke} />
    </Svg>
  );
}

export function Warning(props) {
  return (
    <Svg {...props}>
      <path d="M8 2.4 14.6 13.4H1.4Z" {...stroke} />
      <path d="M8 6.6v3.1" {...stroke} />
      <circle cx="8" cy="11.7" r="0.85" fill="currentColor" />
    </Svg>
  );
}

export function Star(props) {
  return (
    <Svg {...props}>
      <path
        d="M8 2.1 9.56 6.16 13.9 6.38 10.52 9.12 11.64 13.32 8 10.95 4.36 13.32 5.48 9.12 2.1 6.38 6.44 6.16Z"
        fill="currentColor"
      />
    </Svg>
  );
}

export function Info(props) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6.2" {...stroke} />
      <circle cx="8" cy="4.9" r="0.9" fill="currentColor" />
      <path d="M8 7.3v4.3" {...stroke} />
    </Svg>
  );
}

/* ---------- list bullet (was: •) ---------- */

export function Bullet(props) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="2.4" fill="currentColor" />
    </Svg>
  );
}

/* ---------- admission-category markers (were: ▲ ◆ ● ○) ----------
   Three distinct shapes, so the categories stay tellable apart without
   relying on colour alone. */

export function Triangle(props) {
  return (
    <Svg {...props}>
      <path d="M8 2.4 14.2 13.2H1.8Z" fill="currentColor" />
    </Svg>
  );
}

export function Diamond(props) {
  return (
    <Svg {...props}>
      <path d="M8 2.2 13.8 8 8 13.8 2.2 8Z" fill="currentColor" />
    </Svg>
  );
}

export function CircleFilled(props) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5.4" fill="currentColor" />
    </Svg>
  );
}

export function CircleOpen(props) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5.3" stroke="currentColor" strokeWidth="1.7" />
    </Svg>
  );
}

// Half-filled circle, for a stage that's underway (was: ◐).
export function CircleHalf(props) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="5.3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 2.7a5.3 5.3 0 0 1 0 10.6Z" fill="currentColor" />
    </Svg>
  );
}

/* ---------- document (was: the 📄 emoji) ---------- */

export function DocumentIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4.3 1.9h5L12.6 5.2v8.4a.5.5 0 0 1-.5.5H4.3a.5.5 0 0 1-.5-.5V2.4a.5.5 0 0 1 .5-.5Z" {...stroke} />
      <path d="M9.3 1.9v3.3h3.3" {...stroke} />
      <path d="M6 8.3h4.4" {...stroke} strokeWidth="1.3" />
      <path d="M6 10.6h3" {...stroke} strokeWidth="1.3" />
    </Svg>
  );
}
