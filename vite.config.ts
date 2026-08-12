import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { spawn } from "child_process";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Code-splitting: memecah bundle per vendor agar ukuran tiap chunk
        // kecil dan peak memory parser (wasm) tidak melampaui batas RAM.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (id.includes("recharts") || id.includes("/d3-") || id.includes("victory-vendor")) return "charts";
          if (id.includes("react-router") || id.includes("history")) return "router";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("lucide-react")) return "icons";
          if (id.includes("xlsx") || id.includes("jspdf") || id.includes("html2canvas") || id.includes("jszip")) return "export";
          if (id.includes("date-fns")) return "date";
          if (id.includes("react") || id.includes("scheduler") || id.includes("/redux")) return "react";
          return "vendor";
        },
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    {
      name: 'spawn-whatsapp-gateway',
      configureServer(server: any) {
        server.middlewares.use((req: any, res: any, next: any) => {
          if (req.url === '/api/spawn-whatsapp') {
            try {
              const batPath = path.resolve(__dirname, 'start_whatsapp_only.bat');
              console.log('Spawning WhatsApp Gateway from bat:', batPath);
              const child = spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', batPath], {
                detached: true,
                stdio: 'ignore'
              });
              child.unref();

              res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ success: true, message: 'WhatsApp server spawning...' }));
            } catch (err: any) {
              console.error('Error spawning WhatsApp:', err);
              res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
            return;
          }
          next();
        });
      }
    }
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
