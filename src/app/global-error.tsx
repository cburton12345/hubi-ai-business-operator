"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#071310", color: "#f4f7f5", fontFamily: "Arial, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section style={{ width: "min(620px, 100%)", padding: 32, border: "1px solid #315548", borderRadius: 20, background: "#0d211b" }}>
            <p style={{ margin: "0 0 12px", color: "#8fe1b7", fontWeight: 700, letterSpacing: ".08em" }}>FEROCITY</p>
            <h1 style={{ margin: "0 0 12px", fontSize: "clamp(2rem, 6vw, 3.4rem)", lineHeight: 1 }}>We hit a temporary problem.</h1>
            <p style={{ margin: "0 0 24px", color: "#c7d7d0", fontSize: 18, lineHeight: 1.6 }}>
              Your request could not be completed. Please try again. If service is interrupted, our team will post recovery information on the emergency status page.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <button onClick={reset} style={{ border: 0, borderRadius: 999, padding: "12px 20px", background: "#76e6aa", color: "#071310", fontWeight: 800, cursor: "pointer" }}>
                Try again
              </button>
              <a href="/emergency.html" style={{ border: "1px solid #66877a", borderRadius: 999, padding: "11px 20px", color: "#f4f7f5", textDecoration: "none", fontWeight: 700 }}>
                Emergency status
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
