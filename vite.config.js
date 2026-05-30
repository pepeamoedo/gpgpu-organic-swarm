import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  return {
    base: mode === 'production' ? '/ENJAMBRE/' : '/',
    server: {
      port: 3000,
      open: true
    }
  };
});
