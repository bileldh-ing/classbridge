import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", ".pgdata/**", "drizzle/**", "next-env.d.ts", "storage/**"] },
];
export default config;
