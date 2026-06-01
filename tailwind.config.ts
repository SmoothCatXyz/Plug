import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "var(--bg-void)",
        panel: "var(--bg-panel)",
        elevated: "var(--bg-elevated)",
        overlay: "var(--bg-overlay)",
        "border-subtle": "var(--border-subtle)",
        "border-default": "var(--border-default)",
        "border-strong": "var(--border-strong)",
        "border-accent": "var(--border-accent)",
        "border-glow": "var(--border-glow)",
        "cyan-dim": "var(--accent-cyan-dim)",
        amber: "var(--accent-amber)",
        red: "var(--accent-red)",
        "red-dim": "var(--accent-red-dim)",
        green: "var(--accent-green)",
        violet: "var(--accent-violet)",
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted: "var(--text-muted)",
        hud: "var(--text-hud)",
        cyan: "var(--accent-cyan)",
        "on-accent": "var(--text-on-accent)"
      },
      fontFamily: {
        default: "var(--font-default)",
        display: "var(--font-display)",
        mono: "var(--font-mono)"
      },
      fontSize: {
        hud: "var(--text-size-hud)",
        xs: "var(--text-size-xs)",
        sm: "var(--text-size-sm)",
        base: "var(--text-size-base)",
        lg: "var(--text-size-lg)",
        xl: "var(--text-size-xl)",
        "2xl": "var(--text-size-2xl)",
        display: "var(--text-size-display)"
      },
      borderRadius: {
        none: "var(--radius-none)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)"
      },
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)",
        8: "var(--space-8)",
        10: "var(--space-10)",
        12: "var(--space-12)",
        16: "var(--space-16)"
      },
      boxShadow: {
        "glow-cyan": "var(--glow-cyan)",
        "glow-amber": "var(--glow-amber)",
        "glow-red": "var(--glow-red)",
        "glow-green": "var(--glow-green)",
        modal: "var(--shadow-modal)"
      }
    }
  },
  plugins: []
} satisfies Config;
