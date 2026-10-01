const baseUrl = (process.env.FEROCITY_SMOKE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const response = await fetch(`${baseUrl}/api/internal/certifications/business-actions`, {
  method: "POST",
  headers: { "x-ferocity-certification": "business-actions" },
});
const body = await response.json();
if (!response.ok) throw new Error(`Business-action certification returned ${response.status}: ${JSON.stringify(body)}`);
console.log(JSON.stringify(body, null, 2));
