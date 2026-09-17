"use client";

import { useEffect } from "react";

// This only fires if the root layout itself throws, so it can't rely on
// anything the layout provides (fonts, globals.css, shared components) —
// it has to render its own <html>/<body> and stay dependency-free.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#F5F6F8",
          color: "#14162B",
        }}
      >
        <div>
          <h1 style={{ fontSize: "20px", fontWeight: 600, margin: 0 }}>
            TaskFlow hit an unexpected error
          </h1>
          <p style={{ marginTop: "6px", color: "#6B7080", fontSize: "13.5px" }}>
            Try reloading the page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            borderRadius: "12px",
            backgroundColor: "#3457D5",
            color: "#fff",
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
