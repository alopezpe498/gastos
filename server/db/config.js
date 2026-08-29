import { bd } from './index.js'
import { redondear } from '../lib/http.js'

/**
 * Ajustes de la aplicacion. Todo se guarda como texto en la tabla config; los
 * valores compuestos, como los grupos de fijos del analisis, van en JSON.
 */
export const POR_DEFECTO = {
  // Regla 50/30/20, en porcentaje sobre los ingresos.
  ideal_necesario: '50',
  ideal_prescindible: '30',
  ideal_ahorro: '20',
  // Como cuenta la comida en el total de gastos del mes:
  //   'presupuesto' -> se cuenta el sobre entero, como en el Excel de siempre.
  //   'gastado'     -> se cuenta solo lo que de verdad se ha apuntado.
  comida_en_total: 'presupuesto',
  // Agrupacion de fijos del analisis del mes. Se guarda por ids de concepto.
  grupos_fijos: '[]',
  // La nomina prevista. Vacio = "todavia no lo he dicho", que no es lo mismo
  // que cero: mientras este vacio, al abrir un mes se hereda la del anterior.
  ingreso_previsto: '',
}

export function leer(clave, porDefecto = null) {
  const fila = bd.prepare('SELECT valor FROM config WHERE clave = ?').get(clave)
  if (fila) return fila.valor
  return porDefecto !== null ? porDefecto : (POR_DEFECTO[clave] ?? null)
}

export function escribir(clave, valor) {
  bd.prepare(
    `INSERT INTO config (clave, valor) VALUES (@clave, @valor)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
  ).run({ clave, valor: valor === null || valor === undefined ? null : String(valor) })
}

function leerNumero(clave) {
  const n = Number(leer(clave))
  return Number.isFinite(n) ? n : Number(POR_DEFECTO[clave])
}

function leerJson(clave, porDefecto) {
  try {
    const crudo = leer(clave)
    return crudo ? JSON.parse(crudo) : porDefecto
  } catch {
    return porDefecto
  }
}

/** Configuracion completa tal como la consume el frontend. */
export function ajustes() {
  return {
    ideales: {
      necesario: leerNumero('ideal_necesario'),
      prescindible: leerNumero('ideal_prescindible'),
      ahorro: leerNumero('ideal_ahorro'),
    },
    comidaEnTotal: leer('comida_en_total'),
    gruposFijos: leerJson('grupos_fijos', []),
  }
}

export function guardarAjustes({ ideales, comidaEnTotal, gruposFijos }) {
  if (ideales) {
    if (ideales.necesario !== undefined) escribir('ideal_necesario', Number(ideales.necesario))
    if (ideales.prescindible !== undefined) {
      escribir('ideal_prescindible', Number(ideales.prescindible))
    }
    if (ideales.ahorro !== undefined) escribir('ideal_ahorro', Number(ideales.ahorro))
  }
  if (comidaEnTotal === 'presupuesto' || comidaEnTotal === 'gastado') {
    escribir('comida_en_total', comidaEnTotal)
  }
  if (Array.isArray(gruposFijos)) escribir('grupos_fijos', JSON.stringify(gruposFijos))
  return ajustes()
}

// ---------- Valores por defecto del mes ----------
//
// El ingreso previsto es la unica pieza de la plantilla que no es un concepto:
// la nomina no es un recibo que se cobre, es lo que entra. Vive aqui, en los
// ajustes, y no lleva historico porque cada mes ya guarda su propio ingreso: lo
// que valga hoy no cambia lo que se cobro en marzo.

/** La nomina prevista, o null si nunca se ha dicho. */
export function ingresoPrevisto() {
  const crudo = leer('ingreso_previsto', '')
  if (crudo === null || String(crudo).trim() === '') return null
  const n = Number(crudo)
  return Number.isFinite(n) ? redondear(n) : null
}

/** Guardarla. `null` la borra y vuelve a heredarse del mes anterior. */
export function guardarIngresoPrevisto(valor) {
  escribir('ingreso_previsto', valor === null ? '' : redondear(Number(valor) || 0))
  return ingresoPrevisto()
}

// ---------- Inteligencia artificial ----------
//
// La clave de API vive aqui, en el servidor, y NUNCA sale entera hacia el
// navegador: las respuestas de la API llevan solo la version enmascarada.

export const MODELOS_POR_DEFECTO = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o-mini',
}

/** Configuracion con la clave completa: solo para uso interno del servidor. */
export function iaCompleta() {
  const proveedor = leer('ia_proveedor', 'anthropic')
  return {
    proveedor,
    clave: leer('ia_clave', '') || '',
    modelo: leer('ia_modelo', '') || MODELOS_POR_DEFECTO[proveedor] || MODELOS_POR_DEFECTO.anthropic,
  }
}

/** Enmascara una clave dejando los 4 primeros y 4 ultimos caracteres. */
export function enmascarar(clave) {
  if (!clave) return ''
  if (clave.length <= 8) return '*'.repeat(clave.length)
  return `${clave.slice(0, 4)}${'*'.repeat(Math.min(clave.length - 8, 24))}${clave.slice(-4)}`
}

/** Version publica: nunca incluye la clave completa. */
export function iaPublica() {
  const { proveedor, clave, modelo } = iaCompleta()
  return {
    proveedor,
    modelo,
    claveEnmascarada: enmascarar(clave),
    configurada: !!clave,
  }
}

export function guardarIa({ proveedor, modelo, clave }) {
  if (proveedor) escribir('ia_proveedor', proveedor)
  // El modelo vacio vuelve al valor por defecto del proveedor elegido.
  if (modelo !== undefined) {
    const proveedorFinal = proveedor || leer('ia_proveedor', 'anthropic')
    escribir('ia_modelo', String(modelo).trim() || MODELOS_POR_DEFECTO[proveedorFinal])
  }
  // La clave solo se sobrescribe si llega un valor nuevo: reenviar la
  // enmascarada desde el cliente no debe destruir la guardada.
  if (clave !== undefined && clave !== null && String(clave).trim() !== '') {
    escribir('ia_clave', String(clave).trim())
  }
  return iaPublica()
}

/** Borra la clave guardada. */
export function olvidarClaveIa() {
  escribir('ia_clave', '')
  return iaPublica()
}
