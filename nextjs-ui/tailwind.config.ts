import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ServerMind brand palette
        brand: {
          teal: "#49C5B6",
          "teal-bright": "#13E8D5",
          dark: "#0D0D0D",
          light: "#F2F2F2",
          muted: "#666666",
        },
        background: "#0D0D0D",
        foreground: "#F2F2F2",
        card: {
          DEFAULT: "#141414",
          foreground: "#F2F2F2",
        },
        popover: {
          DEFAULT: "#1A1A1A",
          foreground: "#F2F2F2",
        },
        primary: {
          DEFAULT: "#49C5B6",
          foreground: "#0D0D0D",
        },
        secondary: {
          DEFAULT: "#1E1E1E",
          foreground: "#F2F2F2",
        },
        muted: {
          DEFAULT: "#1A1A1A",
          foreground: "#666666",
        },
        accent: {
          DEFAULT: "#13E8D5",
          foreground: "#0D0D0D",
        },
        destructive: {
          DEFAULT: "#EF4444",
          foreground: "#F2F2F2",
        },
        border: "#2A2A2A",
        input: "#1E1E1E",
        ring: "#49C5B6",
        // Status colors
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#3B82F6",
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        slideup: {
          from: { transform: "translateY(20px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        pulse: "pulse 1.5s ease-in-out infinite",
        slideup: "slideup 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
