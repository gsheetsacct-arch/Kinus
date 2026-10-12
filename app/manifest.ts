import type { MetadataRoute } from "next";

/** "Add to Home Screen" on the check-in phones: opens like an app, with the Kinus icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kinus",
    short_name: "Kinus",
    description: "Camp check-in, lists and name tags",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f9fc",
    theme_color: "#00618f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
