import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Vite dev/build config for the streatery pre-screener.
 *
 * Tailwind v4 uses a Vite plugin (no separate config file or postcss step).
 * The React plugin enables JSX + fast refresh.
 *
 * If DC's ArcGIS endpoints start blocking browser-origin requests, add a
 * `server.proxy` block here to forward `/dc/*` to maps2.dcgis.dc.gov. For
 * now (verified during initial build), CORS works directly.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    open: false,
    proxy: {
      // DC's MAR geocoder (`citizenatlas.dc.gov`) doesn't send CORS
      // headers, so a browser-direct fetch would be blocked. The Vite
      // dev server forwards `/api/mar/...` calls to citizenatlas
      // server-side, where CORS doesn't apply. For production deployment,
      // recreate the same path convention with a serverless proxy
      // (CloudFlare Worker, Vercel Function, etc.).
      "/api/mar": {
        target: "https://citizenatlas.dc.gov",
        changeOrigin: true,
        rewrite: (path) =>
          path.replace(/^\/api\/mar/, "/newwebservices/locationverifier.asmx"),
        secure: true,
        // Citizen-atlas is fronted by an F5 WAF that rejects the
        // combination of browser-identifying headers (Origin, Referer,
        // Sec-Fetch-*, browser User-Agent) with a "Request Rejected"
        // HTML page. Strip them server-side before forwarding so the
        // request looks like a plain server-to-server call.
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("origin");
            proxyReq.removeHeader("referer");
            proxyReq.removeHeader("sec-fetch-mode");
            proxyReq.removeHeader("sec-fetch-site");
            proxyReq.removeHeader("sec-fetch-dest");
            proxyReq.removeHeader("sec-ch-ua");
            proxyReq.removeHeader("sec-ch-ua-mobile");
            proxyReq.removeHeader("sec-ch-ua-platform");
            proxyReq.setHeader("User-Agent", "streatery-prescreener/1.0");
          });
        },
      },
    },
  },
});
