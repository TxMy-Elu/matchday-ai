/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        pitch: {
          950: "#0A0F0C", // near-black night-pitch background
          900: "#0F1712",
          800: "#16211A",
          700: "#1F2E24",
        },
        turf: {
          700: "#1F5C38",
          600: "#2A7548",
          500: "#358B57",
        },
        floodlight: {
          400: "#FFC85C",
          500: "#FFB627", // signature amber accent
          600: "#E89E10",
        },
        chalk: {
          50: "#F5F4EE",
          200: "#DCDDD4",
          400: "#8B9A93",
          600: "#5B6862",
        },
        pitchline: "#2A3B30",
      },
      fontFamily: {
        display: ["Anton", "sans-serif"],
        body: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
}
