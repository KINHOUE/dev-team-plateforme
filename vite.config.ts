import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

// Configuration Vite standard, independante de Lovable.
// Le point d'entree serveur reste src/server.ts (enveloppe SSR avec capture d'erreurs).
export default defineConfig({
  server: {
    port: 8080,
    host: true,
    strictPort: false,
  },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
    }),
    viteReact(),
  ],
});
