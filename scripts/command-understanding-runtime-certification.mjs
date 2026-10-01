const baseUrl = (process.env.FEROCITY_SMOKE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const response = await fetch(`${baseUrl}/api/internal/certifications/command-understanding`, {
  method: "POST",
  headers: { "x-ferocity-certification": "command-understanding" },
});
const body = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Command-understanding certification failed (${response.status}): ${body.error ?? JSON.stringify(body)}`);
if (body.certifiedCapabilities?.length !== body.expectedCapabilities) throw new Error("Not every command family was certified.");
console.log(JSON.stringify(body, null, 2));
