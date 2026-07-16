import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./remotion/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        stage: {
          bg: "#0b0b12",
          panel: "#14141f",
          border: "#26263a",
          accent: "#8b5cf6",
          accent2: "#22d3ee",
        },
      },
    },
  },
  plugins: [],
};

export default config;
