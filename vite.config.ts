import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { spawn } from "child_process";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  build: {
    // Biarkan Rollup menentukan chunk otomatis. manualChunks manual sebelumnya
    // memecah React ke chunk terpisah dan menyebabkan error
    // "Cannot read properties of undefined (reading 'createContext')".
    chunkSizeWarningLimit: 1600,
  },
  plugins: [
    react(),
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
