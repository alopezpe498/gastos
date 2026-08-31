export type Tipo = 'fijo' | 'variable' | 'sobre'
export type Clasificacion = 'necesario' | 'prescindible' | 'ahorro'
export type Origen = 'manual' | 'excel' | 'extracto' | 'foto' | 'portapapeles'
export type EstadoMes = 'abierto' | 'cerrado'

export type NombreColor = 'lavanda' | 'ambar' | 'verde' | 'gris' | 'coral' | 'azul'

export type Concepto = {
  id: number
  nombre: string
  tipo: Tipo
  clasificacion: Clasificacion
  activo: boolean
  orden: number
  esObjetivo: boolean
  /** null = el que le toque por su id. Solo se guarda si se cambia a mano. */
  color: NombreColor | null
  /** null = el que le toque por su nombre. */
  icono: string | null
}

export type EntradaPlantilla = {
  id: number
  conceptoId: number
  diaPrevisto: string | null
  importePrevisto: number
  vigenteDesde: string
}

export type Alias = { id: number; alias: string }

// ---------- Reglas de clasificación del extracto ----------

export type Regla = {
  id: number
  texto: string
  conceptoId: number | null
  concepto: string | null
  conceptoTipo: Tipo | null
  tipo: 'fijo' | 'sobre' | 'variable' | 'manual'
  /**
   * 'empieza' = principio de palabra; 'exacta' = la palabra entera;
   * 'regex' = una expresión regular, para lo que no tiene texto fijo.
   */
  coincidencia: 'empieza' | 'exacta' | 'regex'
  prioridad: number
  estado: 'confirmada' | 'propuesta'
  activa: boolean
  vecesAplicada: number
  ultimaAplicacion: string | null
  origen: 'seed' | 'usuario' | 'aprendida'
}

export type PruebaRegla = {
  descripcion: string
  normalizada: string
  ganadora: {
    id: number
    texto: string
    concepto: string | null
    conceptoId: number | null
    tipo: Regla['tipo']
    estado: Regla['estado']
  } | null
  evaluadas: {
    id: number
    texto: string
    concepto: string | null
    prioridad: number
    activa: boolean
    acierta: boolean
  }[]
  /** Cuántas se han mirado y descartado antes de la que gana. */
  descartadas: number
  /** El texto que se propone si se quiere crear una regla nueva. */
  propuesta: { texto: string; coincidencia: 'empieza' | 'exacta' | 'regex'; explicacion: string }
  /** Cuántas de las descripciones mandadas encajarían con esa propuesta. */
  encajarian?: number
}

/**
 * Una linea de la plantilla: un concepto con el dia y el importe que le tocan
 * en el mes desde el que se este mirando.
 */
export type LineaPlantilla = {
  conceptoId: number
  nombre: string
  tipo: Tipo
  orden: number
  clasificacion: Clasificacion
  esObjetivo: boolean
  diaPrevisto: string | null
  importePrevisto: number
  /** El mes de la entrada que se esta viendo, no el mes elegido. */
  vigenteDesde: string | null
  /** true si el importe viene arrastrado de un mes anterior al elegido. */
  heredado: boolean
  versiones: number
}

export type Plantilla = {
  desde: string
  fijos: LineaPlantilla[]
  valores: {
    /** null = nunca se ha puesto; el mes hereda la nomina del anterior. */
    ingresoPrevisto: number | null
    comida: LineaPlantilla | null
    ahorro: LineaPlantilla | null
  }
  resumen: {
    cuantosFijos: number
    totalFijos: number
    presupuestoComida: number
    objetivoAhorro: number
    ingreso: number | null
    /** null si no hay nomina prevista: sin ella no hay resta que hacer. */
    sobrante: number | null
  }
}

export type ConceptoDetalle = Concepto & {
  plantilla: EntradaPlantilla[]
  previstoActual: EntradaPlantilla | null
  alias: Alias[]
  movimientos: number
}

export type Movimiento = {
  id: number
  mesId: number
  conceptoId: number
  concepto: string
  tipo: Tipo
  clasificacion: Clasificacion
  esObjetivo: boolean
  importe: number
  importePrevisto: number | null
  diaPrevisto: string | null
  fechaCobro: string | null
  cobrado: boolean
  descripcion: string
  origen: Origen
}

export type ResumenMes = {
  ingreso: number
  gastos: number
  sobrante: number
  dineroEnCuenta: number | null
  fijos: number
  extras: number
  comida: {
    presupuesto: number
    gastado: number
    queda: number
    contada: number
    criterio: 'presupuesto' | 'gastado'
  }
  objetivoAhorro: number
  fijosPendientes: { cuantos: number; importe: number }
  ahorroReal: number
}

export type Mes = {
  id: number
  anio: number
  mes: number
  clave: string
  nombreMes: string
  ingreso: number
  dineroEnCuenta: number | null
  presupuestoComida: number
  objetivoAhorro: number
  notas: string
  /** El periodo real que cubre, del extracto. null hasta que se importa uno. */
  fechaInicio: string | null
  fechaFin: string | null
  estado: EstadoMes
  fechaApertura: string
  resumen: ResumenMes
}

export type MesCompleto = Mes & {
  fijos: Movimiento[]
  variables: Movimiento[]
  /** Solo al abrir un mes: cuántos fijos se han generado. */
  generados?: number
  /** Meses que se han creado de paso para llegar hasta este. */
  creados?: { anio: number; mes: number; nombre: string }[]
  recortado?: boolean
}

export type Trozo = {
  nombre: string
  clave: string
  importe: number
  porcentaje: number | null
}

export type BloqueRegla = {
  nombre: string
  importe: number
  porcentaje: number | null
  ideal: number
  cumple: boolean | null
  desvio: number | null
}

export type Grupo = { nombre: string; importe: number; porcentaje: number | null }

export type LineaRanking = {
  conceptoId: number
  concepto: string
  clasificacion: Clasificacion
  importe: number
  cuantos: number
}

export type Analisis = {
  mes: Mes
  resumen: ResumenMes
  reparto: Trozo[]
  pesoFijos: Grupo[]
  regla: BloqueRegla[]
  ranking: LineaRanking[]
}

export type FilaAnual = {
  nombre: string
  tipo: 'fijo' | 'sobre' | 'otros' | 'total'
  conceptoId?: number
  valores: (number | null)[]
  total: number
  media: number
}

export type LineaDetalleAnual = {
  conceptoId: number
  concepto: string
  importe: number
  descripcion: string
  fecha: string | null
}

export type TotalesAnioAnterior = {
  anio: number
  meses: number
  /** clave de concepto ('concepto:12') -> total de ese año */
  totales: Record<string, number | null>
  generales: TotalAnual | null
}

export type Anual = {
  anio: number
  meses: { numero: number; nombre: string; mesId: number | null; estado: EstadoMes | null }[]
  filas: FilaAnual[]
  detalleVariables: Record<string, LineaDetalleAnual[]>
}

export type GrupoFijos = { nombre: string; conceptos: number[] }

export type Ajustes = {
  ideales: { necesario: number; prescindible: number; ahorro: number }
  comidaEnTotal: 'presupuesto' | 'gastado'
  gruposFijos: GrupoFijos[]
  protegido: boolean
}

// ---------- Importación de Excel ----------

export type HojaDelLibro = { nombre: string; anio: number | null; esCandidata: boolean }

export type MesPrevisto = {
  mes: number
  nombre: string
  ingreso: number
  comida: number
  objetivoAhorro: number
  variables: number
  otrosExcel: number | null
  otrosCalculado: number
  descuadre: number | null
  gastosExcel: number | null
  gastosCalculado: number
  diferenciaGastos: number | null
}

export type ConceptoPrevisto = {
  nombreExcel: string
  apuntes: number
  meses: number
  total: number
  tipoSugerido: Tipo
  conceptoId: number | null
  conceptoNombre: string | null
  porAlias: boolean
  nuevo: boolean
}

export type VistaPrevia = {
  hoja: string
  anio: number
  meses: MesPrevisto[]
  fijos: ConceptoPrevisto[]
  variables: ConceptoPrevisto[]
  yaImportado: boolean
  mesesExistentes: number[]
  objetivoAhorro: string | null
  sobre: string | null
  avisos: string[]
  /** Hay IA configurada: se pueden pedir sugerencias y usar el plan B. */
  hayIa?: boolean
  /** La hoja la ha leído la IA, no el parser: la lectura vive en una sesión. */
  leidaPorIa?: boolean
  sesionId?: string
}

export type SugerenciaConcepto = {
  nombreExcel: string
  conceptoId: number
  conceptoNombre: string
  confianza: number
  motivo: string
}

export type ResultadoImportacion = {
  anio: number
  meses: number
  fijos: number
  variables: number
  conceptosCreados: string[]
  aliasCreados: string[]
  ajustes: { mes: number; diferencia: number; aplicado: boolean }[]
}

// ---------- Inteligencia artificial ----------

export type ConfigIa = {
  proveedor: 'anthropic' | 'openai'
  modelo: string
  claveEnmascarada: string
  configurada: boolean
}

export type PruebaIa = {
  ok: boolean
  proveedor: string
  modelo: string
  mensaje: string
  respuesta?: string
}

// ---------- Capturas (foto, portapapeles) ----------

export type LineaCaptura = {
  concepto: string
  conceptoId: number | null
  nuevo: boolean
  importe: number
  fecha: string | null
  descripcion: string
  tipo: Tipo
  cobrado: boolean | null
}

export type LecturaCaptura = {
  tipo: 'ticket' | 'factura' | 'hoja' | 'lista'
  comercio: string | null
  movimientos: LineaCaptura[]
  /** Solo en tickets: las líneas que la IA leyó, por si se quieren desglosar. */
  desglose: LineaCaptura[]
  ingreso: number | null
  dineroEnCuenta: number | null
  avisos: string[]
  mes: { id: number; anio: number; mes: number; clave: string }
}

// ---------- Importar el extracto del banco ----------

export type DestinoLinea =
  | 'fijo'
  | 'comida'
  | 'variable'
  /** La nómina: no crea apunte, va a `meses.ingreso`. */
  | 'ingreso'
  | 'descartado'
  | 'duplicado'
  | 'sinClasificar'

export type LineaExtracto = {
  id: number
  linea: number
  fecha: string | null
  importe: number
  descripcionOriginal: string
  descripcionLimpia: string
  huella: string
  /** Lo que cobró el banco. No cambia al dividir: los trozos deben sumar esto. */
  importeOriginal?: number
  /** El banco ingresa dinero: entrará como variable en negativo. */
  esAbono?: boolean
  destino: DestinoLinea
  conceptoId: number | null
  concepto: string | null
  reglaId: number | null
  /** De dónde sale la asignación, para verlo de un vistazo con un color. */
  procedencia: 'regla' | 'aprendida' | 'ia' | 'manual' | 'ninguno'
  nota: string
  /** Lo que se guardará como descripción; la original no se toca nunca. */
  descripcion?: string
}

export type Conciliacion = {
  conceptoId: number
  concepto: string
  lineas: number[]
  detalleLineas: { fecha: string | null; importe: number; descripcion: string }[]
  cuantasLineas: number
  importe: number
  fecha: string | null
  detalle: string
  movimientoId: number | null
  importePrevisto: number | null
  importeAnterior: number | null
  /**
   * Lo que va a pasar. No se pregunta: el extracto es la verdad y el fijo se
   * pone al día con lo que dice el banco.
   */
  accion: 'cobrar' | 'actualizar' | 'crear' | 'igual'
}

/** Un fijo cuyo importe real no coincide con la plantilla. */
export type PlantillaPropuesta = {
  conceptoId: number
  concepto: string
  previsto: number
  real: number
  aplicar: boolean
  diaPrevisto: string | null
  vigenteDesde: string
}

export type ContadorExtracto = {
  total: number
  fijos: number
  variables: number
  comida: number
  ingreso: number
  descartados: number
  duplicados: number
  sinClasificar: number
  suma: number
  cuadra: boolean
}

export type Importacion = {
  id: number
  mesId: number
  fecha: string
  nombreArchivo: string | null
  formatoBancoId: number | null
  conteos: {
    movimientos: number
    fijos: number
    variables: number
    ingresos: number
    descartados: number
    duplicados: number
  }
  estado: 'borrador' | 'aceptada' | 'deshecha'
  ingresoAnterior: number | null
  anio: number | null
  mes: number | null
}

export type PropuestaExtracto = {
  importacion: Importacion
  lectura: {
    hoja: string
    filaCabecera: number
    cabecera: string[]
    nOrigen: number
    filasDescartadas: number
    /** El periodo que cubre el extracto: es lo que define el mes. */
    periodo: { desde: string | null; hasta: string | null }
    nominas: {
      id: number
      fecha: string | null
      importe: number
      descripcion: string
      abreElMes: boolean
    }[]
  }
  /** Avisos no bloqueantes: la nómina no abre el mes, hay más de una… */
  avisos?: string[]
  lineas: LineaExtracto[]
  conciliaciones: Conciliacion[]
  plantillaPropuesta: PlantillaPropuesta[]
  fijosSinEncontrar: {
    movimientoId: number
    conceptoId: number
    concepto: string
    importePrevisto: number | null
    diaPrevisto: string | null
  }[]
  resumen: ContadorExtracto
  conceptos: Concepto[]
  /** Ids que van primero en el desplegable: los más usados últimamente. */
  frecuentes?: number[]
  /** La importación aceptada que ya trajo estos movimientos, si los hay. */
  yaImportado?: {
    id: number
    fecha: string
    nombreArchivo: string | null
    anio: number
    mes: number
    nombreMes: string
    cuantas: number
  } | null
  /** Cuando no reconoce el fichero, en vez de la propuesta llega esto. */
  necesitaAyuda?: boolean
  motivo?: string
  primerasFilas?: string[][]
}

export type FormatoBanco = {
  id: number
  nombre: string
  columnaFecha: string | null
  columnaConcepto: string | null
  columnaImporte: string | null
  formatoFecha: string | null
  separadorDecimal: string
  filaCabeceraTexto: string
  /** Trozos que se quitan de la descripción SOLO para poder leerla. */
  prefijosALimpiar: string[]
  porDefecto: boolean
}

export type LecturaPrueba = {
  necesitaAyuda?: boolean
  motivo?: string
  filaCabecera?: number
  nOrigen?: number
  movimientos?: { fecha: string | null; importe: number; descripcionLimpia: string }[]
}

export type SugerenciaIa = {
  conceptoId: number
  concepto: string
  tipo: Tipo
  confianza: 'alta' | 'media' | 'baja'
  porque: string
}

export type ReglaNueva = {
  texto: string
  conceptoId: number | null
  coincidencia: 'empieza' | 'exacta' | 'regex'
}

/** Los datos que necesitan los bloques de la pantalla Mes. */
export type PanelMes = {
  periodo: {
    desde: string
    hasta: string
    dias: number
    diaActual: number
    diasQueQuedan: number
    hoy: string | null
    delExtracto: boolean
  }
  puntos: { dia: string; extras: number; acumulado: number | null }[]
  gastado: number
  /** Lo que ya ha salido de la cuenta. */
  pagado: number
  /** Lo que sigue dentro pero ya tiene dueño: los fijos por cobrar. */
  comprometido: number
  /** ingreso − pagado − comprometido. */
  libre: number
  /** Lo pagado sin los fijos: es lo único con lo que se juzga el ritmo. */
  pagadoSinFijos: number
  fijos: {
    movimientoId: number
    conceptoId: number
    concepto: string
    importe: number
    diaPrevisto: string | null
    cobrado: boolean
    tarde: boolean
    /** Lo que costó ese mismo fijo el mes pasado, si se cobró. */
    importeMesAnterior: number | null
  }[]
  pendientes: number
  nombresPendientes: string[]
  siguienteFijo: { concepto: string; dia: number } | null
  extras: {
    total: number
    mayor: { concepto: string; porcentaje: number } | null
    /** null si el mismo mes del año pasado no existe. */
    anoPasado: number | null
  }
  comida: {
    presupuesto: number
    gastado: number
    contada: number
    sobreId: number | null
    alDia: number
  }
}

// ---------- Analítica ----------

export type Rango = { desde: string; hasta: string }

export type OpcionSerie = { clave: string; nombre: string; tipo?: Tipo; activo?: boolean }

export type RangoDisponible = {
  primero: string | null
  ultimo: string | null
  anios: number[]
  agrupaciones: { clave: string; nombre: string }[]
  conceptos: (OpcionSerie & { id: number })[]
}

export type PuntoSerie = {
  anio: number
  mes: number
  clave: string
  nombre: string
  valor: number | null
  previsto: number | null
  mesId?: number
}

export type Serie = {
  rango: Rango
  clave: string
  nombre: string
  puntos: PuntoSerie[]
  resumen: {
    total: number
    media: number | null
    mesesConDatos: number
    maximo: { clave: string; nombre: string; anio: number; valor: number } | null
    minimo: { clave: string; nombre: string; anio: number; valor: number } | null
  }
  comparacion: {
    desde: string
    hasta: string
    total: number
    mesesConDatos: number
    comparable: boolean
    variacion: number | null
  } | null
  porAnio: { anio: number; valores: (number | null)[] }[]
}

export type FilaComparativa = {
  clave: string
  nombre: string
  tipo: Tipo
  totales: Record<string, number>
  diferencia: number | null
  variacion: number | null
}

export type TotalAnual = {
  gastos: number
  ingresos: number
  sobrante: number
  meses: number
  porcentajeAhorro: number | null
}

export type Comparativa = {
  anios: number[]
  hastaMes: number
  parcial: boolean
  filas: FilaComparativa[]
  totales: Record<string, TotalAnual>
}

export type LineaReparto = {
  conceptoId: number
  nombre: string
  tipo: Tipo
  clasificacion: Clasificacion
  importe: number
  apuntes: number
  porcentaje: number | null
  ticketMedio?: number | null
}

export type Reparto = {
  rango: Rango
  total: number
  porConcepto: LineaReparto[]
  resto: { importe: number; porcentaje: number | null; cuantos: number } | null
  porClasificacion: { nombre: string; clave: string; importe: number }[]
  evolucion: {
    clave: string
    nombre: string
    anio: number
    mes: number
    necesario: number | null
    prescindible: number | null
    ahorro: number | null
  }[]
  ranking: LineaReparto[]
}

export type Estacionalidad = {
  rango: Rango
  filas: {
    conceptoId: number
    nombre: string
    medias: (number | null)[]
    total: number
    puntaEn: { mes: number; nombre: string; veces: number } | null
  }[]
  totalPorMes: {
    mes: number
    nombre: string
    media: number | null
    anios: { anio: number; valor: number }[]
  }[]
}

export type Ahorro = {
  rango: Rango
  puntos: {
    anio: number
    mes: number
    clave: string
    nombre: string
    sobrante: number | null
    objetivo?: number
    acumulado: number | null
    mesId?: number
  }[]
  resumen: {
    mesesConDatos: number
    positivos: number
    negativos: number
    media: number | null
    total: number
    mejor: { nombre: string; anio: number; sobrante: number } | null
    peor: { nombre: string; anio: number; sobrante: number } | null
  }
  regla: {
    anio: number
    meses: number
    ingresos: number
    necesario: number
    prescindible: number
    ahorro: number
    porcentajes: { necesario: number | null; prescindible: number | null; ahorro: number | null }
    ideales: { necesario: number; prescindible: number; ahorro: number }
  }[]
}

export type ValorPlantilla = {
  actual: number
  propuesto: number | null
  origen: string | null
}

export type ResumenRegeneracion = {
  /** Importaciones aceptadas del mes: reiniciar o borrar las deshace. */
  importacionesAceptadas?: number
  mesId: number
  anio: number
  mes: number
  estado: EstadoMes
  anadir: { conceptoId: number; nombre: string; importePrevisto: number; diaPrevisto: string | null }[]
  actualizar: {
    movimientoId: number
    conceptoId: number
    nombre: string
    importeAntes: number
    importeDespues: number
    previstoAntes: number | null
    previstoDespues: number
    cambiaImporte: boolean
  }[]
  ignorar: { conceptoId: number; nombre: string; motivo: string; importe: number }[]
  variables: number
  valores: {
    ingreso: ValorPlantilla
    presupuestoComida: ValorPlantilla
    objetivoAhorro: ValorPlantilla
  }
  sinCambios: boolean
}

/** Un mes al que se ha navegado y que todavía no se ha abierto. */
export type MesPorAbrir = {
  existe: false
  intermedios: { anio: number; mes: number; nombre: string }[]
}

export type MesAbierto = { id: number; anio: number; mes: number; nombreMes: string }

export type ContextoMes = {
  mesId: number
  anioAnterior: {
    clave: string
    gastos: number
    sobrante: number
    variacionGastos: number | null
    variacionSobrante: number | null
  } | null
  mediaDoceMeses: {
    meses: number
    gastos: number | null
    sobrante: number | null
    variacionGastos: number | null
    variacionSobrante: number | null
  } | null
  posiciones: { conceptoId: number; nombre: string; puesto: number; deCuantos: number; importe: number }[]
}
