/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        void: {
          950: "#050609", // page background
          900: "#0A0B12",
          800: "#12141F",
          700: "#1B1E2C", // recessed / muted surface
        },
        mist: {
          50: "#F4F5FA", // primary text
          300: "#9195AA", // secondary text
          500: "#666A7E", // muted / meta text
          700: "#3D4053", // placeholder / disabled
        },
        line: "rgba(255,255,255,0.09)",
        violet: {
          500: "#8B5CF6", // brand / away-win accent
          400: "#A78BFA",
        },
        emerald: {
          500: "#10B981", // pitch green — home-win, primary CTA
          400: "#34D399",
        },
        cyan: {
          500: "#22D3EE", // secondary glow highlight
        },
        amber: {
          500: "#F5B942", // championship odds highlight
        },
        crimson: {
          500: "#F0555F", // upsets / errors
        },
      },
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px -8px rgba(139, 92, 246, 0.45)",
        "glow-emerald": "0 0 40px -8px rgba(16, 185, 129, 0.45)",
      },
    },
  },
  plugins: [],
}
