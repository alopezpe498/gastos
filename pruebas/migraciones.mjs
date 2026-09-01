// Que una migración NUNCA impida arrancar.
//
// Esto nació de una caída de verdad. Una comprobación de esquema lanzaba un
// error al importar el módulo de la base, el proceso moría antes de escuchar en
// el puerto y nginx contestaba Bad Gateway: la aplicación entera fuera de juego
// por una tabla, y sin más salida que entrar por SSH a borrarla a mano.
//
// Por eso estas comprobaciones no miran el resultado de una migración concreta,
// sino la garantía: pase lo que pase con el esquema, el servidor levanta, y lo
// que no haya podido hacer se cuenta en el log y en la pantalla.
//
// Los tres casos son los que se dan de verdad:
//   - una base con el esquema ANTIGUO y datos dentro,
//   - una base vacía,
//   - una migración que revienta.
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { levantar, crearLlamar, crearComprobador, RAIZ } from './entorno.mjs'
import { aplicarMigraciones, estadoDeMigraciones, MIGRACIONES } from '../server/db/migraciones.js'

const { comprobar, estado } = crearComprobador()
const CARPETA = path.join(RAIZ, 'server', 'data')

/**
 * Una base como la que había en el servidor: entera y al día, salvo `tickets`,
 * que se queda con el esquema anterior y un ticket dentro.
 *
 * Se construye arrancando la aplicación de verdad y luego dando marcha atrás a
 * esa tabla. Escribir a mano cuatro tablas de mentira probaría otra cosa: una
 * base que no ha existido nunca.
 */
async function baseConEsquemaViejo(nombre) {
  const entorno = await levantar(nombre)
  const ruta = entorno.rutaBd
  await entorno.cerrar({ conservarBd: true })

  const bd = new Database(ruta)
  bd.pragma('foreign_keys = OFF')
  bd.exec(`
    DROP TABLE IF EXISTS lineas_ticket;
    DROP TABLE IF EXISTS tickets;

    -- El esquema ANTERIOR: sin «manual» entre los origenes.
    CREATE TABLE tickets (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      movimiento_id   INTEGER NOT NULL UNIQUE REFERENCES movimientos(id) ON DELETE CASCADE,
      tienda          TEXT,
      direccion       TEXT,
      fecha_hora      TEXT,
      total           REAL NOT NULL DEFAULT 0,
      forma_pago      TEXT,
      ultimos4_tarjeta TEXT,
      n_lineas        INTEGER NOT NULL DEFAULT 0,
      archivo_ruta    TEXT,
      texto_extraido  TEXT,
      origen          TEXT NOT NULL DEFAULT 'foto' CHECK (origen IN ('foto','pdf','portapapeles')),
      estado          TEXT NOT NULL DEFAULT 'revisado' CHECK (estado IN ('revisado','pendiente')),
      fecha_creacion  TEXT NOT NULL
    );
    CREATE TABLE lineas_ticket (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id    INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      orden        INTEGER NOT NULL DEFAULT 0,
      texto_ticket TEXT NOT NULL,
      cantidad     REAL NOT NULL DEFAULT 1,
      unidad       TEXT NOT NULL DEFAULT 'ud',
      precio_unitario REAL,
      importe      REAL NOT NULL DEFAULT 0,
      variante_id  INTEGER REFERENCES variantes(id),
      origen_asignacion TEXT NOT NULL DEFAULT 'ninguno',
      dudosa       INTEGER NOT NULL DEFAULT 0,
      nota         TEXT
    );`)

  // Un mes con su apunte de comida, y el ticket colgando de él.
  const mes = bd.prepare('SELECT id FROM meses LIMIT 1').get() ?? { id: null }
  if (!mes.id) {
    bd.prepare(
      'INSERT INTO meses (anio, mes, ingreso, presupuesto_comida, objetivo_ahorro, estado, fecha_apertura)' +
        " VALUES (2026, 10, 3220, 500, 0, 'abierto', '2026-10-01')",
    ).run()
    mes.id = bd.prepare('SELECT id FROM meses ORDER BY id DESC LIMIT 1').get().id
  }
  const sobre = bd.prepare("SELECT id FROM conceptos WHERE tipo = 'sobre' LIMIT 1").get()
  const movimiento = bd
    .prepare(
      'INSERT INTO movimientos (mes_id, concepto_id, importe, fecha_cobro, origen, fecha_creacion, fecha_modificacion)' +
        " VALUES (?, ?, 105, '2026-10-15', 'manual', '2026-10-15', '2026-10-15')",
    )
    .run(mes.id, sobre.id)

  bd.prepare(
    'INSERT INTO tickets (movimiento_id, tienda, fecha_hora, total, n_lineas, archivo_ruta, origen, fecha_creacion)' +
      " VALUES (?, 'Mercadona', '2026-10-15T19:12', 105, 2, 'la-foto-del-ticket.jpg', 'foto', '2026-10-15')",
  ).run(movimiento.lastInsertRowid)
  const ticketId = bd.prepare('SELECT id FROM tickets LIMIT 1').get().id

  const variante = bd.prepare('SELECT id FROM variantes LIMIT 1').get()
  const insertarLinea = bd.prepare(
    'INSERT INTO lineas_ticket (ticket_id, orden, texto_ticket, importe, variante_id) VALUES (?, ?, ?, ?, ?)',
  )
  insertarLinea.run(ticketId, 0, 'PIT 2 U.', 6.9, variante?.id ?? null)
  insertarLinea.run(ticketId, 1, 'COLIFLOR', 3.13, variante?.id ?? null)

  bd.close()
  return ruta
}

/** Borra una base de pruebas y sus archivos de WAL. */
function borrar(ruta) {
  for (const sufijo of ['', '-wal', '-shm']) {
    if (fs.existsSync(`${ruta}${sufijo}`)) {
      try {
        fs.unlinkSync(`${ruta}${sufijo}`)
      } catch {
        /* en Windows a veces tarda en soltarse; no es grave */
      }
    }
  }
}
try {
  // -------------------------------------------------------------------------
  console.log('\nUna base con el esquema antiguo y datos dentro')
  // -------------------------------------------------------------------------
  {
    const ruta = await baseConEsquemaViejo('migracion-vieja')
    const bd = new Database(ruta)
    bd.pragma('foreign_keys = ON')
    const registro = []
    const r = aplicarMigraciones(bd, {
      rutaBd: ruta,
      carpetaDatos: CARPETA,
      registrar: (linea) => registro.push(linea),
    })

    comprobar(
      r.aplicadas.includes('tickets-origen-manual') && r.fallidas.length === 0,
      'la migración se aplica sola',
      JSON.stringify(r),
    )

    const sql = bd.prepare("SELECT sql FROM sqlite_master WHERE name = 'tickets'").get().sql
    comprobar(sql.includes("'manual'"), 'y el esquema queda al día')

    // LO QUE IMPORTA: los datos siguen ahí.
    const ticket = bd.prepare('SELECT * FROM tickets WHERE id = 1').get()
    comprobar(!!ticket, 'el ticket que había se conserva')
    comprobar(ticket.tienda === 'Mercadona', 'con su tienda')
    comprobar(Math.abs(ticket.total - 105) < 0.005, 'con su total')
    comprobar(
      ticket.archivo_ruta === 'la-foto-del-ticket.jpg',
      'y con la ruta de su archivo: el papel original no se pierde',
      String(ticket.archivo_ruta),
    )

    const lineas = bd.prepare('SELECT * FROM lineas_ticket WHERE ticket_id = 1').all()
    comprobar(lineas.length === 2, 'y sus dos líneas siguen colgando de él', String(lineas.length))

    const sueltas = bd.pragma('foreign_key_check')
    comprobar(sueltas.length === 0, 'sin referencias rotas', JSON.stringify(sueltas))

    // Y queda anotada, con su fecha.
    const anotada = bd.prepare("SELECT * FROM migraciones WHERE nombre = 'tickets-origen-manual'").get()
    comprobar(!!anotada?.fecha, 'queda anotada en la tabla migraciones, con la fecha')

    // Una copia de seguridad, antes de tocar nada.
    const copias = fs
      .readdirSync(path.join(CARPETA, 'backups'))
      .filter((f) => f.includes('tickets-origen-manual'))
    comprobar(copias.length > 0, 'y antes se hizo una copia de la base', copias[0] ?? 'ninguna')

    // Idempotente: pasarla otra vez no hace nada ni rompe nada.
    const otraVez = aplicarMigraciones(bd, { rutaBd: ruta, carpetaDatos: CARPETA })
    comprobar(
      otraVez.aplicadas.length === 0 && otraVez.fallidas.length === 0,
      'pasarla dos veces no vuelve a hacer nada',
      JSON.stringify(otraVez),
    )
    comprobar(
      bd.prepare('SELECT COUNT(*) AS n FROM tickets').get().n === 1,
      'y el ticket sigue siendo uno, no dos',
    )

    bd.close()
    borrar(ruta)
  }

  // -------------------------------------------------------------------------
  console.log('\nUna migración que revienta no impide arrancar')
  // -------------------------------------------------------------------------
  {
    const ruta = await baseConEsquemaViejo('migracion-rota')
    const bd = new Database(ruta)

    // Se cuela una migración imposible en la lista, delante de la buena.
    const rota = {
      nombre: 'la-que-revienta',
      descripcion: 'una que no puede salir bien',
      tocaDatos: false,
      hayQueHacerla: () => true,
      aplicar() {
        throw new Error('esto no puede ser')
      },
    }
    MIGRACIONES.unshift(rota)

    let r
    try {
      r = aplicarMigraciones(bd, { rutaBd: ruta, carpetaDatos: CARPETA })
    } finally {
      MIGRACIONES.shift()
    }

    comprobar(
      r.fallidas.some((f) => f.nombre === 'la-que-revienta'),
      'la que falla se anota como fallida',
      JSON.stringify(r.fallidas),
    )
    comprobar(
      r.fallidas[0]?.error.includes('esto no puede ser'),
      'con su error, para poder arreglarlo',
      r.fallidas[0]?.error,
    )
    comprobar(
      r.aplicadas.includes('tickets-origen-manual'),
      'y las DEMÁS se aplican igual: una mala no bloquea a las buenas',
      JSON.stringify(r.aplicadas),
    )
    comprobar(
      !bd.prepare("SELECT nombre FROM migraciones WHERE nombre = 'la-que-revienta'").get(),
      'la fallida no se da por hecha: se reintenta en el siguiente arranque',
    )

    bd.close()
    borrar(ruta)
  }

  // -------------------------------------------------------------------------
  console.log('\nEl servidor arranca de verdad, con esquema viejo y todo')
  // -------------------------------------------------------------------------
  {
    // La prueba que faltaba el día que se cayó: levantar el servidor entero
    // sobre una base con el esquema antiguo y comprobar que CONTESTA.
    await baseConEsquemaViejo('arranque')

    // Y ahora se levanta encima, sin borrarla: es el arranque que se cayó.
    const entorno = await levantar('arranque', {}, { conservarBd: true })
    const llamar = crearLlamar(entorno)
    try {
      const { estado: codigo } = await llamar('/meses')
      comprobar(codigo === 200, 'el servidor levanta y contesta')

      const { datos } = await llamar('/estado')
      comprobar(Array.isArray(datos?.avisos), 'y publica su estado de arranque')
    } finally {
      await entorno.cerrar()
    }
  }

  // -------------------------------------------------------------------------
  console.log('\nEl estado de las migraciones se puede consultar')
  // -------------------------------------------------------------------------
  {
    const ruta = await baseConEsquemaViejo('migracion-estado')
    const bd = new Database(ruta)

    const antes = estadoDeMigraciones(bd)
    const suya = antes.find((m) => m.nombre === 'tickets-origen-manual')
    comprobar(suya?.pendiente === true, 'con el esquema viejo figura como pendiente')
    /*
     * Y esto es lo importante: en esta base la migración YA figura como hecha —la
     * aplicó un arranque anterior— pero el esquema volvió atrás, como pasa al
     * restaurar una copia vieja. Manda lo que dice el esquema, no la anotación:
     * si no, una base restaurada se quedaría rota para siempre.
     */
    comprobar(
      suya?.aplicada === true && suya?.pendiente === true,
      'aunque estuviera anotada: manda el esquema de verdad, no la anotación',
      JSON.stringify(suya),
    )

    aplicarMigraciones(bd, { rutaBd: ruta, carpetaDatos: CARPETA })

    const despues = estadoDeMigraciones(bd).find((m) => m.nombre === 'tickets-origen-manual')
    comprobar(despues?.aplicada === true, 'después, como aplicada')
    comprobar(!!despues?.fecha, 'con la fecha en la que se hizo')
    comprobar(despues?.pendiente === false, 'y ya no queda pendiente')

    bd.close()
    borrar(ruta)
  }
} finally {
  // Las copias que ha ido dejando la prueba.
  const backups = path.join(CARPETA, 'backups')
  if (fs.existsSync(backups)) {
    for (const f of fs.readdirSync(backups)) fs.unlinkSync(path.join(backups, f))
    fs.rmdirSync(backups)
  }
}

console.log(
  `\n${estado.fallos === 0 ? 'TODO OK' : `${estado.fallos} FALLOS`} (${estado.total} comprobaciones)`,
)
process.exit(estado.fallos === 0 ? 0 : 1)
