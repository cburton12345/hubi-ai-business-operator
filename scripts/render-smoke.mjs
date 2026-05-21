const baseUrl = (process.env.RENDER_SMOKE_URL ?? "https://hubi-ai-business-operator.onrender.com").replace(/\/$/, "");

const checks = [
  { path: "/", label: "public landing page" },
  { path: "/login", label: "login page" }
];

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Render smoke failed for ${check.label}: ${response.status} ${response.statusText}`);
  }
}

console.log(`Render smoke passed for ${baseUrl}`);
