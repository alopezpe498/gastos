// Configuracion de pm2 para el servidor de produccion.
// Primer arranque:  pm2 start ecosystem.config.cjs && pm2 save
// Actualizaciones:  ./deploy.sh
//
// La extension es .cjs (y no .js) porque el package.json declara
// "type": "module": un .js con module.exports se cargaria como ESM y pm2 no
// leeria nada de aqui.
module.exports = {
  apps: [
    {
      name: 'gastos',
      script: 'server/index.js',
      cwd: __dirname,
      instances: 1,
      // better-sqlite3 es sincrono y el fichero .db no admite varios escritores:
      // este proceso tiene que ser unico, nunca en modo cluster.
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,

        // PIN de la familia. Sin esta variable la aplicacion arranca SIN
        // proteccion (lo avisa por consola al iniciarse).
        APP_PIN: '1234',

        // Opcional: secreto para firmar los tokens de sesion. Si no se define,
        // se genera uno solo y se guarda en la base de datos.
        // APP_SECRET: 'cambia-esto-por-una-cadena-larga-y-aleatoria',
      },
      out_file: './logs/salida.log',
      error_file: './logs/error.log',
      merge_logs: true,
      time: true,
    },
  ],
}
