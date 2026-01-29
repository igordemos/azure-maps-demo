/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9edff",
          200: "#b8ddff",
          300: "#86c6ff",
          400: "#53a9ff",
          500: "#2e86ff",
          600: "#1b63f5",
          700: "#174ed8",
          800: "#1a43ae",
          900: "#1a3c8b",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(46,134,255,0.3), 0 10px 30px rgba(46,134,255,0.18)",
      },
    },
  },
  plugins: [],
};
