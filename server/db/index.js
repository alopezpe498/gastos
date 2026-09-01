import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { aplicarMigraciones } from './migraciones.js'

const aqui = path.dirname(fileURLToPath(import.meta.url))
export const CARPETA_DATOS = path.resolve(aqui, '..', 'data')

/**
 * Base de datos en uso.
 *
 * Por defecto la de desarrollo, server/data/gastos.db, que es PERSISTENTE:
 * nadie la borra ni la recrea al arrancar (aqui solo se hace CREATE TABLE IF
 * NOT EXISTS). Las pruebas nunca la tocan: arrancan su propio servidor con
 * GASTOS_DB apuntando a un archivo aparte, que crean y destruyen ellas.
 */
/*
 * Los archivos originales de los tickets: la foto o el PDF.
 *
 * Al lado de la base de datos y fuera del repositorio, como todo lo que son
 * datos. Se guardan porque son la unica forma de comprobar una linea seis meses
 * despues: el texto que saco la IA puede estar mal, la foto no.
 */
export const CARPETA_TICKETS = path.join(CARPETA_DATOS, 'tickets')

export const RUTA_BD = process.env.GASTOS_DB
  ? path.resolve(process.env.GASTOS_DB)
  : path.join(CARPETA_DATOS, 'gastos.db')

fs.mkdirSync(path.dirname(RUTA_BD), { recursive: true })

export const bd = new Database(RUTA_BD)
bd.pragma('journal_mode = WAL')
bd.pragma('foreign_keys = ON')

/**
 * Normaliza un nombre para comparaciones: sin mayusculas, sin acentos y sin
 * espacios sobrantes. Se guarda en columna aparte para detectar duplicados y
 * para que la importacion reconozca "Santa Lucia" como "Santa Lucia".
 */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '') // quita las marcas de acento
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

bd.function('normalizar_sql', (texto) => normalizar(texto))

const ESQUEMA = `
-- Catalogo de conceptos. 'fijo' se repite cada mes, 'variable' es un apunte
-- suelto y 'sobre' es un presupuesto mensual del que se va tirando (Comida).
CREATE TABLE IF NOT EXISTS conceptos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre             TEXT NOT NULL,
  nombre_normalizado TEXT NOT NULL UNIQUE,
  tipo               TEXT NOT NULL CHECK (tipo IN ('fijo','variable','sobre')),
  clasificacion      TEXT NOT NULL CHECK (clasificacion IN ('necesario','prescindible','ahorro')),
  activo             INTEGER NOT NULL DEFAULT 1,
  orden              INTEGER NOT NULL DEFAULT 0,
  -- Solo "Ahorro": no es un gasto, es lo que me gustaria apartar.
  es_objetivo        INTEGER NOT NULL DEFAULT 0,
  fecha_creacion     TEXT NOT NULL
);

-- Nombres alternativos con los que un concepto aparece en el Excel (o, en la
-- fase 3, en el extracto del banco). Hace que reimportar sea idempotente: el
-- mapeo que se elige en la vista previa se recuerda para la proxima vez.
CREATE TABLE IF NOT EXISTS conceptos_alias (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  concepto_id       INTEGER NOT NULL REFERENCES conceptos(id) ON DELETE CASCADE,
  alias             TEXT NOT NULL,
  alias_normalizado TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_alias_concepto ON conceptos_alias(concepto_id);

-- Dia e importe previstos de un fijo, con historico. Al abrir un mes se aplica
-- la entrada vigente mas reciente con vigente_desde <= ese mes.
CREATE TABLE IF NOT EXISTS plantilla_fijos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  concepto_id      INTEGER NOT NULL REFERENCES conceptos(id) ON DELETE CASCADE,
  -- Texto libre a proposito: hay recibos que caen varios dias ("30,13,23").
  dia_previsto     TEXT,
  importe_previsto REAL NOT NULL DEFAULT 0,
  vigente_desde    TEXT NOT NULL,          -- 'AAAA-MM'
  UNIQUE (concepto_id, vigente_desde)
);
CREATE INDEX IF NOT EXISTS idx_plantilla_concepto ON plantilla_fijos(concepto_id);

CREATE TABLE IF NOT EXISTS meses (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  anio               INTEGER NOT NULL,
  mes                INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ingreso            REAL NOT NULL DEFAULT 0,
  -- Nullable a proposito: null es "todavia no he mirado el banco", que no es
  -- lo mismo que tener cero euros.
  dinero_en_cuenta   REAL,
  presupuesto_comida REAL NOT NULL DEFAULT 0,
  objetivo_ahorro    REAL NOT NULL DEFAULT 0,
  notas              TEXT,
  -- El periodo que de verdad cubre el mes, sacado del extracto: de la nomina a
  -- la siguiente. NO es el mes del calendario, y por eso se guarda: agosto va
  -- del 29/07 al 26/08. Vacios mientras no se haya importado ningun extracto.
  fecha_inicio       TEXT,
  fecha_fin          TEXT,
  estado             TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')),
  fecha_apertura     TEXT NOT NULL,
  UNIQUE (anio, mes)
);

-- Fijos y variables comparten tabla: lo que los distingue es el tipo de su
-- concepto, no la fila.
CREATE TABLE IF NOT EXISTS movimientos (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  mes_id             INTEGER NOT NULL REFERENCES meses(id) ON DELETE CASCADE,
  concepto_id        INTEGER NOT NULL REFERENCES conceptos(id),
  -- Puede ser negativo: devoluciones y correcciones ("Prestamo -500").
  importe            REAL NOT NULL DEFAULT 0,
  importe_previsto   REAL,                 -- solo fijos
  -- Copiado de la plantilla al abrir el mes. Se guarda aqui para poder ordenar
  -- la tabla de fijos sin rehacer la busqueda de vigencia, y para que cambiar
  -- hoy el dia previsto no reescriba los meses ya pasados.
  dia_previsto       TEXT,
  -- NULL = pendiente de cobro. Con fecha = ya me lo han cobrado.
  fecha_cobro        TEXT,
  descripcion        TEXT,
  origen             TEXT NOT NULL DEFAULT 'manual'
                     CHECK (origen IN ('manual','excel','extracto','foto','portapapeles')),
  fecha_creacion     TEXT NOT NULL,
  fecha_modificacion TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mov_mes      ON movimientos(mes_id);
CREATE INDEX IF NOT EXISTS idx_mov_concepto ON movimientos(concepto_id);
-- La analitica lee siempre por mes y agrupa por concepto: este indice cubre esa
-- consulta entera sin tocar la tabla.
CREATE INDEX IF NOT EXISTS idx_mov_mes_concepto ON movimientos(mes_id, concepto_id);

-- Como se reconoce un movimiento del banco. "La descripcion limpia CONTIENE
-- este texto" y se para en la primera que encaje, por eso el orden importa
-- tanto: 'PRIME' tiene que mirarse antes que 'AMAZON'.
--
-- concepto_id NULL = "esto siempre lo miro yo": la regla reconoce el movimiento
-- pero no lo clasifica (los Bizum, que pueden ser cualquier cosa).
CREATE TABLE IF NOT EXISTS reglas_clasificacion (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  texto             TEXT NOT NULL,
  -- Sin acentos ni mayusculas, que es como se compara. Se guarda para no
  -- normalizar cincuenta reglas en cada movimiento del extracto.
  texto_normalizado TEXT NOT NULL,
  concepto_id       INTEGER REFERENCES conceptos(id) ON DELETE CASCADE,
  -- Como tiene que encajar el texto dentro de la descripcion del banco:
  --   'empieza' -> al principio de una palabra, y puede seguir. Es lo normal:
  --               la regla 'AUTOPISTA' tiene que pillar 'AUTOPISTAS', y
  --               'PRESTAM' tiene que pillar 'PRESTAMOS'.
  --   'exacta'  -> la palabra entera. Hace falta para las cortas: sin esto,
  --               'BAR' encaja dentro de 'BARCELONA' y se lleva medio extracto.
  --   'regex'   -> una expresion regular. Hace falta para los pagos por movil,
  --               que traen un codigo distinto cada vez ("13AUG B7DG2ZYM-Barcelona")
  --               y no hay ningun texto fijo que buscar.
  coincidencia      TEXT NOT NULL DEFAULT 'empieza'
                    CHECK (coincidencia IN ('empieza','exacta','regex')),
  -- Manda el orden de evaluacion: fijos, luego el sobre, luego los variables.
  -- 'manual' es la regla que reconoce algo y aun asi lo manda a revision.
  tipo              TEXT NOT NULL CHECK (tipo IN ('fijo','sobre','variable','manual')),
  prioridad         INTEGER NOT NULL DEFAULT 0,
  -- Una regla 'propuesta' la ha aprendido la aplicacion y clasifica, pero se
  -- ve marcada en la revision hasta que se confirma a mano.
  estado            TEXT NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('confirmada','propuesta')),
  activa            INTEGER NOT NULL DEFAULT 1,
  veces_aplicada    INTEGER NOT NULL DEFAULT 0,
  ultima_aplicacion TEXT,
  origen            TEXT NOT NULL DEFAULT 'usuario' CHECK (origen IN ('seed','usuario','aprendida')),
  fecha_creacion    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reglas_orden ON reglas_clasificacion(prioridad);

-- Como viene el fichero de cada banco. Se guarda para no volver a señalar las
-- columnas a mano cada mes.
CREATE TABLE IF NOT EXISTS formatos_banco (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre              TEXT NOT NULL,
  -- Nombre de la columna en la cabecera, no su numero: los bancos mueven las
  -- columnas de sitio entre exportaciones, pero no les cambian el nombre.
  columna_fecha       TEXT,
  columna_concepto    TEXT,
  columna_importe     TEXT,
  formato_fecha       TEXT,
  separador_decimal   TEXT NOT NULL DEFAULT ',',
  -- El texto que delata la fila de cabecera: las exportaciones traen encima
  -- un numero variable de filas de titulo y saldos.
  fila_cabecera_texto TEXT NOT NULL DEFAULT 'Importe',
  -- Lo que delata la nomina: es el primer movimiento del mes y el que va al
  -- ingreso, no un abono cualquiera.
  texto_nomina        TEXT NOT NULL DEFAULT 'NOMINA',
  -- JSON: trozos a quitar de la descripcion ("COMPRA TARJ. 5402XXXX4010").
  prefijos_a_limpiar  TEXT NOT NULL DEFAULT '[]',
  por_defecto         INTEGER NOT NULL DEFAULT 0,
  fecha_creacion      TEXT NOT NULL
);

-- Cada vez que se sube un extracto. Vive en 'borrador' mientras se revisa, y
-- guarda lo suficiente para deshacerla entera despues de aceptada.
CREATE TABLE IF NOT EXISTS importaciones (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  mes_id           INTEGER NOT NULL REFERENCES meses(id) ON DELETE CASCADE,
  fecha            TEXT NOT NULL,
  nombre_archivo   TEXT,
  formato_banco_id INTEGER REFERENCES formatos_banco(id),
  n_movimientos    INTEGER NOT NULL DEFAULT 0,
  n_fijos          INTEGER NOT NULL DEFAULT 0,
  n_variables      INTEGER NOT NULL DEFAULT 0,
  n_ingresos       INTEGER NOT NULL DEFAULT 0,
  n_descartados    INTEGER NOT NULL DEFAULT 0,
  n_duplicados     INTEGER NOT NULL DEFAULT 0,
  estado           TEXT NOT NULL DEFAULT 'borrador'
                   CHECK (estado IN ('borrador','aceptada','deshecha')),
  -- La revision a medias, para poder cerrar y volver manana.
  borrador_json    TEXT,
  -- Lo que valia el ingreso del mes antes de aceptar, para restaurarlo al
  -- deshacer. NULL si la importacion no lo toco.
  ingreso_anterior REAL
);
CREATE INDEX IF NOT EXISTS idx_importaciones_mes ON importaciones(mes_id);

-- La huella de cada linea del banco ya procesada. Es lo que hace que subir dos
-- veces el mismo extracto no duplique nada.
CREATE TABLE IF NOT EXISTS huellas_banco (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  importacion_id       INTEGER NOT NULL REFERENCES importaciones(id) ON DELETE CASCADE,
  hash                 TEXT NOT NULL,
  fecha                TEXT,
  importe              REAL,
  descripcion_original TEXT,
  descripcion_limpia   TEXT,
  resultado            TEXT NOT NULL
                       CHECK (resultado IN ('conciliado','creado','ingreso','descartado','ignorado','duplicado')),
  movimiento_id        INTEGER
);
-- Se consulta siempre por hash, al clasificar, una vez por linea del extracto.
CREATE INDEX IF NOT EXISTS idx_huellas_hash ON huellas_banco(hash);
CREATE INDEX IF NOT EXISTS idx_huellas_importacion ON huellas_banco(importacion_id);

CREATE TABLE IF NOT EXISTS config (
  clave TEXT PRIMARY KEY,
  valor TEXT
);

-- ---------------------------------------------------------------------------
-- El detalle de la compra
-- ---------------------------------------------------------------------------
--
-- Un ticket del super es UN movimiento del sobre Comida con su total, y eso no
-- cambia: estas tablas cuelgan de ese movimiento y no suman nada por su cuenta.
-- Lo que anaden es poder preguntar en que se va la comida, cuanto se gasta en
-- pollo o cuanto ha subido el aceite, que del total no se saca.
--
-- Tres niveles a proposito, porque son tres preguntas distintas:
--   categoria  Carne y charcuteria      -> en que se va la compra
--   producto   Pollo                    -> cuanto gasto en pollo
--   variante   Pechuga de pollo         -> que compro exactamente, y a como

CREATE TABLE IF NOT EXISTS categorias_producto (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  orden  INTEGER NOT NULL DEFAULT 0,
  activa INTEGER NOT NULL DEFAULT 1
);

-- El nombre generico, en castellano y SIN marca: "Pollo", "Leche", "Lejia".
CREATE TABLE IF NOT EXISTS productos (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre               TEXT NOT NULL UNIQUE,
  categoria_id         INTEGER NOT NULL REFERENCES categorias_producto(id),
  activo               INTEGER NOT NULL DEFAULT 1,
  -- Reservado para emparejar con la despensa de las otras apps. Aqui no se usa.
  id_externo_despensa  TEXT
);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);

-- Lo que de verdad se compra. La marca va aparte: "Petit suisse" es lo mismo
-- sea Nesquik o no, y solo separandola se puede comparar el precio.
CREATE TABLE IF NOT EXISTS variantes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id      INTEGER NOT NULL REFERENCES productos(id),
  nombre           TEXT NOT NULL,
  marca            TEXT,
  unidad_habitual  TEXT NOT NULL DEFAULT 'ud' CHECK (unidad_habitual IN ('ud','kg','l')),
  activa           INTEGER NOT NULL DEFAULT 1,
  UNIQUE (producto_id, nombre, marca)
);
CREATE INDEX IF NOT EXISTS idx_variantes_producto ON variantes(producto_id);

-- La memoria: como se llama esa cosa en el ticket de esa cadena.
--
-- La tienda va en la clave porque el mismo texto significa cosas distintas en
-- cadenas distintas. NULL = vale en cualquiera. Y "confirmado" separa lo que
-- he dicho yo de lo que solo propuso la IA: lo segundo se vuelve a preguntar.
CREATE TABLE IF NOT EXISTS alias_ticket (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  texto_ticket          TEXT NOT NULL,
  tienda                TEXT,
  variante_id           INTEGER NOT NULL REFERENCES variantes(id) ON DELETE CASCADE,
  veces_visto           INTEGER NOT NULL DEFAULT 1,
  confirmado_por_usuario INTEGER NOT NULL DEFAULT 0,
  UNIQUE (texto_ticket, tienda)
);
CREATE INDEX IF NOT EXISTS idx_alias_texto ON alias_ticket(texto_ticket);

-- El ticket, pegado a su movimiento. Uno por movimiento: por eso es UNIQUE.
CREATE TABLE IF NOT EXISTS tickets (
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
  estado          TEXT NOT NULL DEFAULT 'revisado' CHECK (estado IN ('revisado','pendiente')),
  fecha_creacion  TEXT NOT NULL
);

-- Una linea impresa del ticket. "variante_id" puede ser NULL: una linea sin
-- asignar sigue contando en el total, que es lo que tiene que cuadrar.
CREATE TABLE IF NOT EXISTS lineas_ticket (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id         INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  orden             INTEGER NOT NULL DEFAULT 0,
  texto_ticket      TEXT NOT NULL,
  cantidad          REAL NOT NULL DEFAULT 1,
  unidad            TEXT NOT NULL DEFAULT 'ud' CHECK (unidad IN ('ud','kg','l')),
  precio_unitario   REAL,
  importe           REAL NOT NULL DEFAULT 0,
  variante_id       INTEGER REFERENCES variantes(id),
  origen_asignacion TEXT NOT NULL DEFAULT 'ninguno'
                    CHECK (origen_asignacion IN ('alias','ia','manual','ninguno')),
  dudosa            INTEGER NOT NULL DEFAULT 0,
  nota              TEXT
);
CREATE INDEX IF NOT EXISTS idx_lineas_ticket ON lineas_ticket(ticket_id);
CREATE INDEX IF NOT EXISTS idx_lineas_variante ON lineas_ticket(variante_id);
`

/**
 * Lo que no ha ido bien al preparar la base.
 *
 * NUNCA se lanza desde aqui. El servidor arranca igual, lo escribe en el log
 * y la pantalla ensena un aviso: una aplicacion caida no se puede arreglar
 * desde la aplicacion, y quedarse sin Bad Gateway por una tabla es peor que
 * cualquier tabla mal.
 */
export const avisosDeArranque = []

/** Corre algo del arranque sin que un fallo mate el proceso. */
export function sinTumbarElArranque(nombre, hacer) {
  try {
    return hacer()
  } catch (causa) {
    avisosDeArranque.push({ nombre, error: causa.message })
    console.error(`[gastos] FALLO AL ARRANCAR (${nombre}): ${causa.message}`)
    return null
  }
}

const avisos = avisosDeArranque

/*
 * La tabla de reglas de la fase 1 era un hueco reservado (patron, concepto_id,
 * activa, veces_aplicada) que nunca llego a usarse. Si la base de datos la
 * tiene todavia asi y esta vacia, se tira para que el esquema de abajo la cree
 * bien; migrarla a golpe de ALTER dejaria una columna 'patron' muerta para
 * siempre.
 *
 * Va ANTES del CREATE a proposito: el esquema nuevo indexa una columna que la
 * tabla vieja no tiene, y el indice se creaba antes de llegar aqui.
 */
const reglasViejas = bd.prepare('PRAGMA table_info(reglas_clasificacion)').all()
if (reglasViejas.length > 0 && !reglasViejas.some((c) => c.name === 'texto')) {
  const cuantas = bd.prepare('SELECT COUNT(*) AS n FROM reglas_clasificacion').get().n
  if (cuantas === 0) {
    bd.exec('DROP TABLE reglas_clasificacion')
  } else {
    /*
     * Con datos dentro se deja como esta y se apunta el aviso. Antes esto
     * lanzaba, el proceso moria y la aplicacion entera se quedaba fuera de
     * juego por una tabla; ahora arranca y lo dice.
     */
    avisos.push({
      nombre: 'reglas_clasificacion-esquema-antiguo',
      error:
        'La tabla reglas_clasificacion tiene el esquema antiguo y datos dentro: ' +
        'las reglas del extracto no funcionaran hasta migrarla a mano.',
    })
  }
}

sinTumbarElArranque('crear el esquema', () => bd.exec(ESQUEMA))

/**
 * Migraciones: columnas que se anaden sobre bases de datos que ya existian.
 * SQLite no tiene "ADD COLUMN IF NOT EXISTS", asi que se mira antes.
 */
export function anadirColumnaSiFalta(tabla, columna, definicion) {
  const columnas = bd.prepare(`PRAGMA table_info(${tabla})`).all()
  if (columnas.some((c) => c.name === columna)) return false
  bd.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`)
  return true
}

/*
 * Ajustes de esquema sobre bases que ya existian.
 *
 * Van todos dentro de la red: antes estaban sueltos a nivel de modulo y
 * cualquiera de ellos podia matar el proceso al importar este archivo, que es
 * exactamente lo que dejo la aplicacion en Bad Gateway. Si uno falla ahora, se
 * anota, se dice en el log y el servidor arranca igual.
 */
sinTumbarElArranque('ajustes de esquema', () => {
  /*
   * De donde sale cada movimiento del extracto. Se guarda en el propio movimiento
   * para poder deshacer una importacion entera, y para saber cual era la
   * descripcion del banco cuando en pantalla se ve otra mas corta.
   */
  anadirColumnaSiFalta('movimientos', 'importacion_id', 'INTEGER')
  anadirColumnaSiFalta('movimientos', 'descripcion_original', 'TEXT')
  anadirColumnaSiFalta(
    'reglas_clasificacion',
    'coincidencia',
    "TEXT NOT NULL DEFAULT 'empieza'",
  )
  anadirColumnaSiFalta('formatos_banco', 'texto_nomina', "TEXT NOT NULL DEFAULT 'NOMINA'")

  /*
   * El CHECK de `coincidencia` no admitia 'regex' en las bases creadas antes.
   * SQLite no sabe cambiar un CHECK con ALTER, asi que hay que rehacer la tabla:
   * se crea al lado, se copian las reglas (que ya son datos de verdad, con las
   * que el usuario ha tocado), y se cambia el nombre.
   */
  const defRegla = bd
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reglas_clasificacion'")
    .get()
  if (defRegla && !defRegla.sql.includes('regex')) {
    bd.exec(`
      CREATE TABLE reglas_nuevas (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        texto             TEXT NOT NULL,
        texto_normalizado TEXT NOT NULL,
        concepto_id       INTEGER REFERENCES conceptos(id) ON DELETE CASCADE,
        tipo              TEXT NOT NULL CHECK (tipo IN ('fijo','sobre','variable','manual')),
        coincidencia      TEXT NOT NULL DEFAULT 'empieza'
                          CHECK (coincidencia IN ('empieza','exacta','regex')),
        prioridad         INTEGER NOT NULL DEFAULT 0,
        estado            TEXT NOT NULL DEFAULT 'confirmada'
                          CHECK (estado IN ('confirmada','propuesta')),
        activa            INTEGER NOT NULL DEFAULT 1,
        veces_aplicada    INTEGER NOT NULL DEFAULT 0,
        ultima_aplicacion TEXT,
        origen            TEXT NOT NULL DEFAULT 'usuario'
                          CHECK (origen IN ('seed','usuario','aprendida')),
        fecha_creacion    TEXT NOT NULL
      );
      INSERT INTO reglas_nuevas
        (id, texto, texto_normalizado, concepto_id, tipo, coincidencia, prioridad,
         estado, activa, veces_aplicada, ultima_aplicacion, origen, fecha_creacion)
        SELECT id, texto, texto_normalizado, concepto_id, tipo, coincidencia, prioridad,
               estado, activa, veces_aplicada, ultima_aplicacion, origen, fecha_creacion
        FROM reglas_clasificacion;
      DROP TABLE reglas_clasificacion;
      ALTER TABLE reglas_nuevas RENAME TO reglas_clasificacion;
      CREATE INDEX IF NOT EXISTS idx_reglas_orden ON reglas_clasificacion(prioridad);
    `)
  }
  /*
   * El color de un concepto. Nulo quiere decir «el que le toque»: la aplicacion
   * reparte una paleta por id, y esto solo guarda las veces que se cambia a mano.
   */
  anadirColumnaSiFalta('conceptos', 'color', 'TEXT')

  /*
   * El icono de un concepto. Nulo quiere decir «el que le toque»: la aplicacion
   * lo adivina por el nombre, y esto solo guarda las veces que se cambia a mano.
   */
  anadirColumnaSiFalta('conceptos', 'icono', 'TEXT')

  /*
   * El desglose de un movimiento, en JSON: [{ nombre, importe }].
   *
   * Un fijo puede ser en realidad muchas cosas —Suscripciones son Netflix, Spotify
   * y seis mas— y el extracto ya las trae separadas. Antes se pegaban en la
   * descripcion como un texto y el importe era solo la suma: se veia el total pero
   * no se podia mirar dentro ni anadir una a mano.
   *
   * El total sigue en `importe`, asi que ningun calculo cambia por esto.
   */
  anadirColumnaSiFalta('movimientos', 'detalle', 'TEXT')

  /*
   * «Netflix etc» pasa a llamarse Suscripciones.
   *
   * El nombre venia del Excel, de cuando el recibo era Netflix y poco mas; ahora
   * son seis cosas y ninguna se llama Netflix. Se cambia solo si el concepto
   * existe con ese nombre exacto y todavia no hay un Suscripciones: renombrar es
   * seguro —el id no se mueve, asi que los movimientos, las reglas y el historico
   * siguen colgando de el— pero pisar un concepto que ya existiera no lo seria.
   */
  const viejoNetflix = bd
    .prepare("SELECT id FROM conceptos WHERE nombre = 'Netflix etc'")
    .get()
  if (viejoNetflix) {
    const yaHay = bd.prepare("SELECT id FROM conceptos WHERE nombre = 'Suscripciones'").get()
    if (!yaHay) {
      bd.prepare("UPDATE conceptos SET nombre = 'Suscripciones' WHERE id = ?").run(viejoNetflix.id)
      console.log('[gastos] «Netflix etc» ahora se llama Suscripciones')
    }
  }

  /*
   * De donde sale el importe de un fijo al generar un mes.
   *
   * Nulo o 'importe' es lo de siempre: el numero escrito en la plantilla. Los
   * otros dos —'mes-anterior' y 'ano-anterior'— dicen que ese numero solo es el
   * respaldo, y que lo que manda es lo que costo de verdad en el mes de
   * referencia. La luz no vale lo mismo en enero que en julio, y copiar el julio
   * pasado acierta mas que un importe fijo puesto hace dos anos.
   */
  anadirColumnaSiFalta('plantilla_fijos', 'criterio', 'TEXT')

  anadirColumnaSiFalta('meses', 'fecha_inicio', 'TEXT')
  anadirColumnaSiFalta('meses', 'fecha_fin', 'TEXT')
})

/*
 * Y las migraciones con nombre, que se anotan en la tabla `migraciones` y se
 * pueden mirar con `npm run migrar -- --estado`. Tampoco lanzan: devuelven lo
 * que ha pasado, y lo que haya fallado se ensena como aviso en la pantalla.
 */
export const resultadoMigraciones = aplicarMigraciones(bd, {
  rutaBd: RUTA_BD,
  carpetaDatos: CARPETA_DATOS,
  registrar: (linea) => console.log(linea),
})
for (const fallo of resultadoMigraciones.fallidas) avisosDeArranque.push(fallo)
