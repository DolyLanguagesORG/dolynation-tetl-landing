// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://dolynation.app',
  vite: {
    plugins: [tailwindcss()],
    server: {
      // Vite bloquea por defecto las peticiones cuyo `Host` no conoce
      // (proteccion contra DNS rebinding). El servidor de desarrollo de la
      // landing se abre desde la VPN, en `dev.dolynation.app`, asi que
      // ese nombre tiene que estar permitido.
      //
      // La lista es EXPLICITA: no se usa `allowedHosts: true`, que dejaria
      // abrir el servidor de desarrollo a cualquier `Host` que se le enviara.
      allowedHosts: [
        'dev.dolynation.app',
        'localhost',
        '127.0.0.1',
        '10.90.0.5',
      ],
    },
  },
});
