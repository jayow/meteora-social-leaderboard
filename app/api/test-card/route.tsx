import { ImageResponse } from "next/og";

export const dynamic = "force-dynamic";

export async function GET(): Promise<ImageResponse> {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#110D14",
          color: "#fff",
          fontSize: "48px",
          fontFamily: "system-ui",
        }}
      >
        <div style={{ display: "flex" }}>Test Card</div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
