import { ImageResponse } from "next/og";
import { Logo } from "@/shared/ui/logo/logo";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: "#111", color: "#fff", borderRadius: 12 }}>
      <Logo size={46} color="#fff" />
    </div>,
    size,
  );
}
