import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slatebrand: {
          50: "#f7f9fb",
          100: "#eef2f7",
          200: "#d7e0ea",
          300: "#b6c6d8",
          400: "#8ea5c0",
          500: "#647f9f",
          600: "#4d6684",
          700: "#3d526a",
          800: "#2f4053",
          900: "#22303e"
        }
      }
    }
  },
  plugins: []
};

export default config;
