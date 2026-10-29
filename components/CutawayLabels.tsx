"use client";

import { useState } from "react";
import { motion, useMotionValueEvent, type MotionValue } from "framer-motion";

type Anchor = "left" | "right";
type Label = {
  text: string;
  top: string;
  left: string;
  anchor: Anchor;
  angle: number;
  length: number;
};

const LABELS: Label[] = [
  { text: "ECU", top: "38%", left: "72%", anchor: "left", angle: 180, length: 50 },
  { text: "CAMSHAFT", top: "32%", left: "68%", anchor: "left", angle: 135, length: 60 },
  { text: "HARNESS LOOM", top: "52%", left: "74%", anchor: "left", angle: 180, length: 55 },
  { text: "CARBON MONOCOQUE", top: "62%", left: "65%", anchor: "left", angle: 180, length: 50 },
  { text: "IN VALVE", top: "36%", left: "28%", anchor: "right", angle: 0, length: 50 },
  { text: "TRANSAXLE", top: "58%", left: "25%", anchor: "right", angle: 0, length: 50 },
];

export default function CutawayLabels({
  scrollYProgress,
}: {
  scrollYProgress: MotionValue<number>;
}) {
  const [visible, setVisible] = useState(false);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setVisible(v >= 0.6 && v < 0.78);
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        pointerEvents: "none",
      }}
    >
      {LABELS.map((label, i) => (
        <motion.div
          key={label.text}
          initial={{ opacity: 0 }}
          animate={{ opacity: visible ? 1 : 0 }}
          transition={{
            delay: visible ? i * 0.1 : 0,
            duration: visible ? 0.4 : 0.15,
            ease: "easeOut",
          }}
          style={{
            position: "absolute",
            top: label.top,
            left: label.left,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "10px",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            color: "#E0E0E0",
          }}
        >
          <div
            style={{
              position: "relative",
              padding: "3px 7px",
              background: "rgba(0,0,0,0.55)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "2px",
              whiteSpace: "nowrap",
            }}
          >
            {label.text}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: label.anchor === "left" ? 0 : "100%",
                width: `${label.length}px`,
                height: "1px",
                background: "rgba(255,255,255,0.35)",
                transformOrigin: "0 50%",
                transform: `rotate(${label.angle}deg)`,
              }}
            />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
