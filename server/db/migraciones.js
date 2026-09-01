import fs from 'node:fs'
import path from 'node:path'

/**
 * Las migraciones de esquema.
 *
 * REGLA QUE MANDA SOBRE TODO LO DEMAS: una migracion NUNCA impide arrancar.
 *
 * Esto existe porque paso lo contrario. Una comprobacion de esquema lanzaba un
 * error al importar el modulo de la base de datos, el proceso moria antes de
 * escuchar en el puerto, y nginx contestaba Bad Gateway. La aplicacion entera
 * caida por una tabla que ni siquiera se usa en la pantalla principal, y sin
 * mas salida que entrar por SSH a borrarla a mano.
 *
 * De ahi las cuatro condiciones de este modulo:
 *
 *   1. Cada migracion corre en su TRANSACCION. O entera, o nada.
 *   2. Si una falla, se registra y se sigue con las demas. La aplicacion
 *      arranca igual, en modo aviso, y lo dice en el log y en la pantalla.
 *   3. Antes de una migracion que pueda perder datos, COPIA de la base en
 *      data/backups/ con la fecha en el nombre.
 *   4. Lo que no encaje en el esquema nuevo no bloquea: se guarda tal cual en
 *      una tabla `_legacy` y se sigue. Perder el arranque por una fila rara es
 *      mucho peor que quedarse esa fila aparte.
 *
 * Son idempotentes: cada una comprueba primero si hay algo que hacer, y ademas
 * queda anotada en la tabla `migraciones`, asi que no se repiten.
 */

const TABLA = `
CREATE TABLE IF NOT EXISTS migraciones (
  nombre TEXT PRIMARY KEY,
  fecha  TEXT NOT NULL
);`

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

/** La sentencia con la que se creo una tabla, o null si no existe. */
function sqlDeTabla(bd, tabla) {
  const fila = bd
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tabla)
  return fila?.sql ?? null
}

const existeTabla = (bd, tabla) => sqlDeTabla(bd, tabla) !== null

/**
 * Una copia de la base antes de tocarla, en data/backups/ y con la fecha.
 *
 * Se hace en caliente con la API de SQLite en vez de copiando el archivo: con
 * WAL, copiar el .db a pelo puede dejar fuera lo ultimo escrito.
 */
function copiaDeSeguridad(bd, { carpetaDatos, nombre }) {
  const carpeta = path.join(carpetaDatos, 'backups')
  fs.mkdirSync(carpeta, { recursive: true })
  const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const destino = path.join(carpeta, `antes-de-${nombre}-${sello}.db`)
  bd.prepare('VACUUM INTO ?').run(destino)
  return destino
}

// ---------------------------------------------------------------------------
// La lista
// ---------------------------------------------------------------------------

/**
 * Cada migracion: un nombre que no cambia nunca, si toca datos, y que hacer.
 *
 * `hayQueHacerla` decide mirando el esquema de verdad, no la tabla de
 * migraciones: asi una base restaurada de una copia vieja tambien se arregla
 * sola aunque en `migraciones` figure como hecha.
 */
export const MIGRACIONES = [
  {
    nombre: 'tickets-origen-manual',
    /*
     * Un ticket se puede escribir a mano cuando se pierde el papel, y
     * `tickets.origen` nacio sin ese valor. El CHECK de SQLite no se puede
     * alterar: hay que rehacer la tabla.
     */
    descripcion: 'tickets.origen admite «manual»',
    tocaDatos: true,
    hayQueHacerla(bd) {
      const sql = sqlDeTabla(bd, 'tickets')
      return sql !== null && !sql.includes("'manual'")
    },
    aplicar(bd, { registrar }) {
      const columnas = bd
        .prepare('PRAGMA table_info(tickets)')
        .all()
        .map((c) => c.name)
      const viejos = bd.prepare('SELECT * FROM tickets').all()

      bd.exec(`
        CREATE TABLE tickets_nueva (
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
          origen          TEXT NOT NULL DEFAULT 'foto'
                          CHECK (origen IN ('foto','pdf','portapapeles','manual')),
          estado          TEXT NOT NULL DEFAULT 'revisado'
                          CHECK (estado IN ('revisado','pendiente')),
          fecha_creacion  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tickets_legacy (
          id       INTEGER,
          motivo   TEXT NOT NULL,
          datos    TEXT NOT NULL,
          fecha    TEXT NOT NULL
        );`)

      const insertar = bd.prepare(`
        INSERT INTO tickets_nueva
          (id, movimiento_id, tienda, direccion, fecha_hora, total, forma_pago,
           ultimos4_tarjeta, n_lineas, archivo_ruta, texto_extraido, origen, estado, fecha_creacion)
        VALUES
          (@id, @movimiento_id, @tienda, @direccion, @fecha_hora, @total, @forma_pago,
           @ultimos4_tarjeta, @n_lineas, @archivo_ruta, @texto_extraido, @origen, @estado, @fecha_creacion)`)

      const guardarAparte = bd.prepare(
        'INSERT INTO tickets_legacy (id, motivo, datos, fecha) VALUES (?, ?, ?, ?)',
      )

      let copiados = 0
      let apartados = 0
      for (const viejo of viejos) {
        const fila = {
          id: viejo.id,
          movimiento_id: viejo.movimiento_id,
          tienda: viejo.tienda ?? null,
          direccion: viejo.direccion ?? null,
          fecha_hora: viejo.fecha_hora ?? null,
          total: viejo.total ?? 0,
          forma_pago: viejo.forma_pago ?? null,
          ultimos4_tarjeta: viejo.ultimos4_tarjeta ?? null,
          n_lineas: viejo.n_lineas ?? 0,
          // La ruta del archivo se conserva tal cual: es el papel original.
          archivo_ruta: columnas.includes('archivo_ruta') ? (viejo.archivo_ruta ?? null) : null,
          texto_extraido: columnas.includes('texto_extraido') ? (viejo.texto_extraido ?? null) : null,
          origen: viejo.origen ?? 'foto',
          estado: viejo.estado ?? 'revisado',
          fecha_creacion: viejo.fecha_creacion ?? new Date().toISOString(),
        }

        try {
          insertar.run(fila)
          copiados += 1
        } catch (causa) {
          /*
           * No encaja en el esquema nuevo. En vez de parar la migracion —y con
           * ella el arranque— se guarda la fila entera con sus lineas, en
           * texto, para poder mirarla despues sin prisa.
           */
          const lineas = existeTabla(bd, 'lineas_ticket')
            ? bd.prepare('SELECT * FROM lineas_ticket WHERE ticket_id = ?').all(viejo.id)
            : []
          guardarAparte.run(
            viejo.id,
            causa.message,
            JSON.stringify({ ticket: viejo, lineas }),
            new Date().toISOString(),
          )
          apartados += 1
        }
      }

      /*
       * Y el cambiazo. `lineas_ticket` apunta a "tickets" por nombre, asi que
       * al renombrar la nueva encima siguen colgando de ella, con los mismos
       * ids. Las claves ajenas van apagadas mientras dura el baile: es el
       * procedimiento que documenta SQLite para rehacer una tabla.
       */
      bd.exec('DROP TABLE tickets; ALTER TABLE tickets_nueva RENAME TO tickets;')

      registrar(
        `   ${copiados} tickets conservados` +
          (apartados > 0 ? `, ${apartados} apartados en tickets_legacy` : ''),
      )
      return { copiados, apartados }
    },
  },
]

// ---------------------------------------------------------------------------
// El motor
// ---------------------------------------------------------------------------

function anotar(bd, nombre) {
  bd.prepare('INSERT OR REPLACE INTO migraciones (nombre, fecha) VALUES (?, ?)').run(
    nombre,
    new Date().toISOString(),
  )
}

export function yaAplicada(bd, nombre) {
  return !!bd.prepare('SELECT nombre FROM migraciones WHERE nombre = ?').get(nombre)
}

/**
 * Aplica lo que falte. NUNCA lanza: devuelve lo que ha pasado.
 *
 * Quien llama decide que hacer con los fallos —escribirlos en el log, ensenar
 * un aviso—, pero la aplicacion arranca igual. Ese es el punto entero.
 */
export function aplicarMigraciones(bd, { rutaBd, carpetaDatos, registrar = () => {} } = {}) {
  const resultado = { aplicadas: [], fallidas: [], sinTocar: [] }

  try {
    bd.exec(TABLA)
  } catch (causa) {
    resultado.fallidas.push({ nombre: 'crear la tabla migraciones', error: causa.message })
    return resultado
  }

  for (const migracion of MIGRACIONES) {
    let pendiente = false
    try {
      pendiente = migracion.hayQueHacerla(bd)
    } catch (causa) {
      resultado.fallidas.push({ nombre: migracion.nombre, error: causa.message })
      continue
    }

    if (!pendiente) {
      // Idempotente: si el esquema ya esta bien, solo se deja constancia.
      if (!yaAplicada(bd, migracion.nombre)) {
        try {
          anotar(bd, migracion.nombre)
        } catch {
          /* si ni siquiera se puede anotar, tampoco pasa nada grave */
        }
      }
      resultado.sinTocar.push(migracion.nombre)
      continue
    }

    let copia = null
    try {
      if (migracion.tocaDatos && rutaBd && carpetaDatos) {
        copia = copiaDeSeguridad(bd, { carpetaDatos, nombre: migracion.nombre })
        registrar(`[gastos] copia antes de migrar: ${path.basename(copia)}`)
      }
    } catch (causa) {
      /*
       * Sin copia se sigue igual, avisando. Negarse a migrar por no poder
       * copiar dejaria la base a medias para siempre, que es peor.
       */
      registrar(`[gastos] AVISO: no he podido hacer la copia previa (${causa.message})`)
    }

    /*
     * Las claves ajenas se apagan FUERA de la transaccion: SQLite ignora el
     * PRAGMA si hay una abierta, y rehacer una tabla necesita apagarlas.
     */
    const teniaClaves = bd.pragma('foreign_keys', { simple: true })
    try {
      if (teniaClaves) bd.pragma('foreign_keys = OFF')
      registrar(`[gastos] migrando: ${migracion.nombre} (${migracion.descripcion})`)

      bd.transaction(() => {
        migracion.aplicar(bd, { registrar })
        anotar(bd, migracion.nombre)
      })()

      const rotas = bd.pragma('foreign_key_check', { simple: false })
      if (Array.isArray(rotas) && rotas.length > 0) {
        registrar(`[gastos] AVISO: ${rotas.length} referencias sueltas tras ${migracion.nombre}`)
      }
      resultado.aplicadas.push(migracion.nombre)
    } catch (causa) {
      // La transaccion ya ha deshecho lo suyo. Se anota y se sigue.
      resultado.fallidas.push({ nombre: migracion.nombre, error: causa.message })
      registrar(`[gastos] MIGRACION FALLIDA: ${migracion.nombre}: ${causa.message}`)
      if (copia) registrar(`[gastos] la base de antes esta en ${copia}`)
    } finally {
      if (teniaClaves) bd.pragma('foreign_keys = ON')
    }
  }

  return resultado
}

/** Cuales hay, cuales se han aplicado y cuando. Lo usa `npm run migrar`. */
export function estadoDeMigraciones(bd) {
  try {
    bd.exec(TABLA)
  } catch {
    return MIGRACIONES.map((m) => ({ ...m, aplicada: false, fecha: null, pendiente: true }))
  }

  const hechas = new Map(
    bd
      .prepare('SELECT nombre, fecha FROM migraciones')
      .all()
      .map((f) => [f.nombre, f.fecha]),
  )

  return MIGRACIONES.map((m) => {
    let pendiente = false
    try {
      pendiente = m.hayQueHacerla(bd)
    } catch {
      pendiente = false
    }
    return {
      nombre: m.nombre,
      descripcion: m.descripcion,
      tocaDatos: !!m.tocaDatos,
      aplicada: hechas.has(m.nombre),
      fecha: hechas.get(m.nombre) ?? null,
      pendiente,
    }
  })
}
