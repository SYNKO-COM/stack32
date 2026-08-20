"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, background: "#080808", color: "#fafafa", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Cette page n&apos;a pas pu s&apos;afficher</h1>
          <p style={{ maxWidth: 420, color: "#a1a1aa", fontSize: 14 }}>
            Rechargez pour réessayer.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ borderRadius: 999, background: "#fafafa", color: "#080808", border: 0, padding: "8px 16px", fontWeight: 500 }}
          >
            Recharger
          </button>
        </div>
      </body>
    </html>
  );
}
