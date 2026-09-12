import type { Config } from "tailwindcss";

// Design POV: an instrument panel, not a glowing crypto dashboard.
// Palette reads like real telemetry — a calm dark deck, precise signal colors,
// one accent. Signal colors carry meaning (ok / warn / crit), never decoration.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        deck: {
          900: "#0a0e12", // panel backdrop
          800: "#0f151b", // panel
          700: "#161e26", // raised
          600: "#1e2832", // hairline / border
          500: "#2a3742",
        },
        ink: {
          100: "#eef3f7", // primary text
          300: "#aebccb", // secondary
          500: "#6c7d8c", // muted / labels
        },
        signal: {
          ok: "#3ad29f",   // healthy
          warn: "#f2b03d",  // watch
          crit: "#ff5d5d",  // danger
          scan: "#4ba8ff",  // the agent / active
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "inset 0 1px 0 0 rgba(255,255,255,0.03), 0 1px 2px 0 rgba(0,0,0,0.5)",
        glow: "0 0 0 1px rgba(75,168,255,0.35), 0 0 24px -6px rgba(75,168,255,0.45)",
      },
      keyframes: {
        sweep: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(300%)" } },
        pulse2: { "0%,100%": { opacity: "0.35" }, "50%": { opacity: "1" } },
        rise: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        sweep: "sweep 2.2s linear infinite",
        pulse2: "pulse2 1.6s ease-in-out infinite",
        rise: "rise 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
