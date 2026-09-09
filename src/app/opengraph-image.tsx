import { ImageResponse } from "next/og";
export const alt =
  "Rezlee. Your place, under control. Bills, records, care, and what needs you next.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#f8f6ef",
        color: "#244c40",
        display: "flex",
        flexDirection: "column",
        padding: 80,
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>
        rezlee
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 88, letterSpacing: -5 }}>
          Your place, under control.
        </div>
        <div style={{ fontSize: 28, marginTop: 25 }}>
          Bills. Records. Care. And what needs you next.
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 20 }}>
        For where you live. Whether you rent or own.
      </div>
    </div>,
    size,
  );
}
