import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    ignores: [
      ".next/**",
      ".next-stale-*/**",
      ".netlify/**",
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "next-env.d.ts"
    ]
  }
];

export default config;
