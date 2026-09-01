import { useState } from 'react'
import {
  BotonIcono,
  BotonPrimario,
  BotonTexto,
  Cabecera,
  Card,
  Check,
  Chip,
  Esqueleto,
  IconoConcepto,
  Interruptor,
  MenuFila,
  Tabs,
  Tile,
  Vacio,
} from './Basicos'
import {
  CampoArea,
  CampoImporte,
  CampoTexto,
  SelectorConcepto,
  SelectorMes,
  SelectorOpcion,
  ValorEditable,
} from './Campos'
import { Anillos, BarraProgreso, BarrasPorDia, CifraQueCuenta, Leyenda, LeyendaItem, Puntos, SegmentBar, Sparkline } from './Graficos'
import { AccionDialogo, ConfirmacionDialogo, Dialogo } from './Dialogo'
import { Asa, Fila, GrupoFilas, Importe, TramoLista } from './Fila'
import { Desglose } from './Desglose'
import { Celda, Fila as FilaTabla, Tabla } from './Tabla'
import { Dropzone } from './Dropzone'
import { Icono, ICONOS_DE_CONCEPTO } from './Icono'
import { Acciones, Navegacion } from './Navegacion'
import { PALETAS } from '../../lib/conceptos'
import { euros, redondo } from '../../lib/formato'

/**
 * La página del kit: todos los componentes juntos, con sus variantes.
 *
 * No es una demo bonita: es la prueba de que la caja está cerrada. Si al montar
 * una pantalla hace falta algo que no está aquí, se añade aquí primero. Solo
 * existe en desarrollo, en `#kit`.
 */

const CONCEPTOS = [
  { id: 1, nombre: 'Comida', tipo: 'sobre' },
  { id: 2, nombre: 'Hipoteca', tipo: 'fijo' },
  { id: 3, nombre: 'Peaje', tipo: 'variable' },
  { id: 4, nombre: 'Amazon', tipo: 'variable' },
  { id: 5, nombre: 'Bar', tipo: 'variable' },
  { id: 6, nombre: 'Gimnasio', tipo: 'fijo' },
]

export function Kit() {
  const [tab, setTab] = useState('uno')
  const [check, setCheck] = useState(true)
  const [interruptor, setInterruptor] = useState(true)
  const [criterio, setCriterio] = useState('mes-anterior')
  const [desglose, setDesglose] = useState([
    { nombre: 'Netflix', importe: 12.99 },
    { nombre: 'Spotify', importe: 10.99 },
    { nombre: 'Anthropic', importe: 21.99 },
  ])
  const [concepto, setConcepto] = useState<number | null>(3)
  const [importe, setImporte] = useState<number | null>(56)
  const [texto, setTexto] = useState('Mercadona Rambla')
  const [mes, setMes] = useState('2026-09')
  const [dialogo, setDialogo] = useState<'no' | 'lista' | 'confirmar'>('no')

  return (
    <div className="pagina">
      <Navegacion
        secciones={[
          { id: 'mes', nombre: 'Mes', icono: 'calendario' },
          { id: 'anual', nombre: 'Año', icono: 'barras' },
          { id: 'analitica', nombre: 'Analítica', icono: 'tendencia' },
          { id: 'conceptos', nombre: 'Conceptos', icono: 'lista' },
          { id: 'importar', nombre: 'Importar', icono: 'subir' },
        ]}
        activa="mes"
        onIr={() => undefined}
      />
      <Acciones>
        <BotonTexto>Importar extracto</BotonTexto>
        <BotonPrimario>+ Apuntar</BotonPrimario>
      </Acciones>

      <Cabecera
        titulo="Kit de componentes"
        subtitulo="Todas las piezas y sus variantes. Si algo no está aquí, no puede usarse en una pantalla."
        acciones={
          <>
            <BotonTexto>Acción secundaria</BotonTexto>
            <BotonPrimario icono="mas">Botón primario</BotonPrimario>
          </>
        }
      />

      <div className="pila">
        {/* ---------------- tokens ---------------- */}
        <Card titulo="Tokens" ayuda="Los colores, las sombras y los radios salen todos de aquí.">
          <div className="fila-campos" style={{ marginTop: 10 }}>
            {Object.entries(PALETAS).map(([nombre, p]) => (
              <span key={nombre} style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
                <span className="ico" style={{ background: p.suave, color: p.color }}>
                  <Icono nombre="etiqueta" size={16} />
                </span>
                <span className="muted-3">{nombre}</span>
              </span>
            ))}
          </div>
          <div className="fila-campos" style={{ marginTop: 16 }}>
            <span className="card" style={{ padding: 14, borderRadius: 'var(--r-card)' }}>
              radio 20 · sombra
            </span>
            <span
              style={{
                padding: 14,
                borderRadius: 'var(--r-tile)',
                background: 'var(--superficie)',
                boxShadow: 'var(--sombra-pill)',
              }}
            >
              radio 14 · sombra pill
            </span>
            <span className="ico" style={{ background: 'var(--acento-fondo)', color: 'var(--tinta)' }}>
              <Icono nombre="check" size={16} />
            </span>
          </div>
        </Card>

        {/* ---------------- tipografía ---------------- */}
        <Card titulo="Tipografía" ayuda="Manrope 500 / 600 / 800, con cifras tabulares en todo importe.">
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <span className="big">1.574 €</span>
            <span className="cabecera-titulo">Título de pantalla · 22/800</span>
            <span className="card-titulo">Título de tarjeta · 16/800</span>
            <span className="tile-n">Cifra de tile · 28/800</span>
            <span style={{ fontWeight: 600 }}>Fila · 14/600</span>
            <span className="muted">Contexto · 13 gris</span>
            <span className="muted-3">Detalle · 12 gris claro</span>
          </div>
        </Card>

        {/* ---------------- tabs y botones ---------------- */}
        <Card titulo="Tabs, botones y chips">
          <div className="fila-campos" style={{ marginTop: 10 }}>
            <Tabs
              pestanas={[
                { id: 'uno', nombre: 'Primera' },
                { id: 'dos', nombre: 'Segunda' },
                { id: 'tres', nombre: 'Tercera' },
              ]}
              activa={tab}
              onCambiar={setTab}
            />
          </div>
          <div className="fila-campos" style={{ marginTop: 14 }}>
            <BotonPrimario>Primario</BotonPrimario>
            <BotonPrimario peligro>Primario peligro</BotonPrimario>
            <BotonPrimario disabled>Apagado</BotonPrimario>
            <BotonTexto>Texto</BotonTexto>
            <BotonTexto peligro>Texto peligro</BotonTexto>
            <BotonIcono icono="puntos" etiqueta="Más" />
          </div>
          <div className="fila-campos" style={{ marginTop: 14 }}>
            <Chip color="var(--azul)" suave="var(--azul-suave)">
              Necesario
            </Chip>
            <Chip color="var(--ambar)" suave="var(--ambar-suave)">
              Prescindible
            </Chip>
            <Chip color="var(--ok)" suave="var(--ok-suave)">
              Ahorro
            </Chip>
            <Chip color="var(--extras)" suave="var(--extras-suave)" punto>
              Amazon
            </Chip>
            <Chip>regla</Chip>
            <Chip color="var(--extras)" suave="var(--extras-suave)">
              IA
            </Chip>
          </div>
        </Card>

        {/* ---------------- tiles ---------------- */}
        <div className="tiles">
          <Tile icono="check" etiqueta="Fijos" cifra={redondo(1288)} frase="2 de 14 cobrados · el siguiente, comunidad el día 5">
            <Puntos total={14} llenos={2} titulo="2 de 14 cobrados" />
          </Tile>
          <Tile
            icono="comida"
            color="var(--comida)"
            suave="var(--comida-suave)"
            etiqueta="Comida"
            cifra={redondo(104)}
            sufijo="/ 500"
            frase="Te quedan 396 €, unos 14 € al día"
          >
            <BarraProgreso parte={0.21} titulo="Sobre de comida" />
          </Tile>
          <Tile
            icono="carro"
            color="var(--extras)"
            suave="var(--extras-suave)"
            etiqueta="Extras"
            cifra={redondo(134)}
            frase="Un 30 % menos que en septiembre pasado"
          >
            <Sparkline valores={[2, 4, 3, 8, 6, 12, 10, 18, 16, 22, 24]} titulo="Extras por día" />
          </Tile>
        </div>

        {/* ---------------- hero ---------------- */}
        <div className="card hero">
          <div>
            <div className="hero-mes">
              <span style={{ color: 'var(--tinta-3)' }}>‹</span>
              Septiembre
              <span style={{ color: 'var(--tinta-3)' }}>›</span>
              <span className="muted" style={{ fontWeight: 500 }}>
                · 1 → 30 sep · día 3
              </span>
            </div>
            <div className="muted" style={{ marginTop: 16 }}>
              Te queda
            </div>
            <div className="big">
              <CifraQueCuenta valor={1574} formato={(n) => redondo(n)} />
            </div>
            <div className="hero-frase">
              Vas bien. Con lo que llevas, te sobran <b>46 € al día</b> hasta la nómina.
            </div>
            <SegmentBar
              segmentos={[
                { nombre: 'Pagado', valor: 238, color: 'var(--tinta)' },
                { nombre: 'Comprometido', valor: 1288, color: '#C9C9C4' },
                { nombre: 'Libre', valor: 1574, color: 'var(--acento-suave)' },
              ]}
            />
            <Leyenda>
              <LeyendaItem color="var(--tinta)">Pagado {redondo(238)}</LeyendaItem>
              <LeyendaItem color="#C9C9C4">Comprometido {redondo(1288)}</LeyendaItem>
              <LeyendaItem color="var(--acento-suave)">Libre {redondo(1574)}</LeyendaItem>
              <span className="leg-derecha">Nómina {redondo(3100)}</span>
            </Leyenda>
          </div>
          <Anillos partePeriodo={0.1} parteGasto={0.49} centro="49%" pie="usado · 10% del mes" />
        </div>

        {/* ---------------- filas ---------------- */}
        <div className="dos-columnas">
          <Card titulo="Movimientos" derecha={<span className="muted">5 · 238 €</span>}>
            <TramoLista titulo="Extras" color="var(--extras)" derecha="3 · 148 €" />
            <GrupoFilas>Hoy</GrupoFilas>
            <Fila
              izquierda={
                <IconoConcepto icono="comida" color="var(--comida)" suave="var(--comida-suave)" />
              }
              titulo="Mercadona Rambla"
              detalle="Comida"
              importe={<Importe>{euros(16.65)}</Importe>}
              acciones={
                <MenuFila
                  etiqueta="Más acciones"
                  opciones={[
                    { id: 'editar', nombre: 'Editar', icono: 'lapiz' },
                    { id: 'dividir', nombre: 'Dividir', icono: 'dividir' },
                    { id: 'duplicar', nombre: 'Duplicar', icono: 'copiar' },
                    { id: 'borrar', nombre: 'Borrar', icono: 'papelera', peligro: true },
                  ]}
                  onElegir={() => undefined}
                />
              }
            />
            <Fila
              izquierda={<IconoConcepto icono="flecha" color="var(--ok)" suave="var(--ok-suave)" />}
              titulo="Tunelspan Barrera Cadí"
              detalle="Peaje"
              importe={<Importe>{euros(14.56)}</Importe>}
            />
            <Fila
              izquierda={<IconoConcepto icono="entrada" color="var(--ok)" suave="var(--ok-suave)" />}
              titulo="Transferencia de Silvia"
              detalle="Silvia · abono"
              importe={<Importe abono>−{euros(117)}</Importe>}
            />
            <Fila
              confirmando
              titulo="¿Borrar este apunte de 56,00 €?"
              importe={
                <span className="fila-campos" style={{ gap: 8 }}>
                  <BotonPrimario peligro>Borrar</BotonPrimario>
                  <BotonTexto>Cancelar</BotonTexto>
                </span>
              }
            />
          </Card>

          <Card titulo="Fijos" derecha={<span className="muted">12 pendientes</span>}>
            <Fila
              izquierda={<Check marcado etiqueta="Hipoteca" onClick={() => setCheck(!check)} />}
              titulo="Hipoteca"
              detalle="cobrado el 31"
              importe={<Importe>{euros(622.53)}</Importe>}
            />
            <Fila
              izquierda={<Check marcado={false} tarde etiqueta="Comunidad" />}
              titulo="Comunidad"
              detalle="era el día 1"
              detalleTarde
              importe={<Importe apagado>{euros(131)}</Importe>}
            />
            <Fila
              izquierda={<Check marcado={false} etiqueta="Seguro casa" />}
              titulo="Seguro casa"
              detalle="día 5"
              importe={<Importe apagado>{euros(28.45)}</Importe>}
            />
            <Fila
              izquierda={<Check marcado etiqueta="Suscripciones" />}
              titulo="Suscripciones"
              detalle="cobrado el 30 · 3 cosas"
              importe={<Importe>{euros(45.97)}</Importe>}
              acciones={
                <BotonIcono icono="abajo" etiqueta="Cerrar el desglose" expandido onClick={() => undefined} />
              }
            />
            <Desglose lineas={desglose} onGuardar={setDesglose} />
            <Fila
              izquierda={<Asa />}
              titulo="Concepto arrastrable"
              detalle="variante concepto"
              centro={
                <>
                  <span className="dot" style={{ background: 'var(--extras)' }} />
                  <Chip>Variable</Chip>
                </>
              }
              importe={
                <Interruptor activo={interruptor} etiqueta="Activo" onCambiar={setInterruptor} />
              }
            />
          </Card>
        </div>

        {/* ---------------- campos ---------------- */}
        <Card titulo="Campos" ayuda="En una lista, texto hasta que lo tocas. En un formulario, campo siempre.">
          <div className="fila-campos" style={{ marginTop: 12 }}>
            <span style={{ width: 220 }}>
              <SelectorConcepto
                conceptos={CONCEPTOS}
                valor={concepto}
                onElegir={setConcepto}
                etiqueta="Concepto"
                frecuentes={[3, 1]}
              />
            </span>
            <span style={{ width: 130 }}>
              <CampoImporte valor={importe} etiqueta="Importe" visible onGuardar={setImporte} />
            </span>
            <span style={{ width: 96 }}>
              <CampoImporte valor={50} etiqueta="Porcentaje" visible estrecho onGuardar={() => undefined} />
            </span>
            <SelectorMes valor={mes} onCambiar={setMes} etiqueta="Vigente desde" />
            <SelectorOpcion
              valor={criterio}
              etiqueta="De dónde sale el importe"
              opciones={[
                { id: 'importe', nombre: 'Este importe', ayuda: 'El número de al lado, tal cual' },
                { id: 'mes-anterior', nombre: 'Mes anterior', ayuda: 'Lo que costó el mes de antes' },
                { id: 'ano-anterior', nombre: 'Año anterior', ayuda: 'Lo que costó ese mes el año pasado' },
              ]}
              onElegir={setCriterio}
            />
          </div>
          <div className="campo-grupo">
            <label className="campo-etiqueta">Texto en un formulario</label>
            <CampoTexto valor={texto} etiqueta="Descripción" visible onGuardar={setTexto} />
          </div>
          <div className="campo-grupo">
            <label className="campo-etiqueta">Área de texto</label>
            <CampoArea valor="" etiqueta="Notas" placeholder="Pega aquí…" filas={3} onGuardar={() => undefined} />
          </div>
          <div className="campo-grupo fila-campos">
            <span>En una fila:</span>
            <span style={{ width: 110 }}>
              <CampoImporte valor={31.5} etiqueta="Importe inline" onGuardar={() => undefined} />
            </span>
            <ValorEditable valor={3100} prefijo="Nómina" etiqueta="Nómina" onGuardar={() => undefined} />
            <ValorEditable valor={0} vacio="Ponerte un objetivo" etiqueta="Objetivo" onGuardar={() => undefined} />
          </div>
        </Card>

        {/* ---------------- tabla ---------------- */}
        <Card titulo="Tabla" ayuda="Primera columna fija, cifras a la derecha, sin bandas alternas.">
          <Tabla
            etiqueta="Ejemplo de tabla"
            columnas={[
              { clave: 'c', titulo: 'Concepto' },
              { clave: 'ene', titulo: 'Ene', num: true },
              { clave: 'feb', titulo: 'Feb', num: true },
              { clave: 'mar', titulo: 'Mar', num: true },
              { clave: 'tot', titulo: 'Total', num: true, separa: true },
              { clave: 'med', titulo: 'Media', num: true },
            ]}
          >
            <FilaTabla>
              <Celda>
                <span className="fila-campos" style={{ gap: 8 }}>
                  <IconoConcepto icono="casa" color="var(--ok)" suave="var(--ok-suave)" size={14} />
                  Hipoteca
                </span>
              </Celda>
              <Celda num>622,53</Celda>
              <Celda num destacada>
                622,53
              </Celda>
              <Celda num>622,53</Celda>
              <Celda num separa>
                1.867,59
              </Celda>
              <Celda num apagado>
                622,53
              </Celda>
            </FilaTabla>
            <FilaTabla total>
              <Celda>Total</Celda>
              <Celda num>1.288</Celda>
              <Celda num>1.301</Celda>
              <Celda num>1.288</Celda>
              <Celda num separa>
                3.877
              </Celda>
              <Celda num>1.292</Celda>
            </FilaTabla>
          </Tabla>
        </Card>

        {/* ---------------- gráficos ---------------- */}
        <Card titulo="Micro-gráficos">
          <div className="tiles" style={{ margin: '12px 0 0' }}>
            <div>
              <p className="muted">Barras por día</p>
              <BarrasPorDia valores={[0, 12, 4, 0, 30, 6, 8, 0, 45, 3, 9, 0, 14]} titulo="Extras por día" />
            </div>
            <div>
              <p className="muted">Sparkline</p>
              <Sparkline valores={[2, 4, 3, 8, 6, 12, 10, 18]} titulo="Evolución" />
            </div>
            <div>
              <p className="muted">Puntos</p>
              <Puntos total={14} llenos={9} titulo="9 de 14" />
            </div>
          </div>
        </Card>

        {/* ---------------- carga y estados ---------------- */}
        <div className="dos-columnas">
          <Card titulo="Dropzone">
            <Dropzone
              titulo="Arrastra aquí el archivo del banco"
              texto=".xls, .xlsx o .csv — o si lo prefieres:"
              textoBoton="Elegir archivo"
              accept=".xls,.xlsx,.csv"
              onArchivo={() => undefined}
              extra={<BotonTexto icono="nota">Pegar una tabla</BotonTexto>}
            />
          </Card>
          <Card titulo="Estados">
            <Vacio frase="Aún no hay apuntes este mes." accion="Importa el extracto" onAccion={() => undefined} />
            <Esqueleto filas={3} />
          </Card>
        </div>

        {/* ---------------- iconos ---------------- */}
        <Card titulo="Iconos de concepto" ayuda="Se eligen solos por el nombre y se pueden cambiar en Conceptos.">
          <div className="fila-campos" style={{ marginTop: 10 }}>
            {ICONOS_DE_CONCEPTO.map((n) => (
              <span key={n} style={{ display: 'grid', gap: 4, justifyItems: 'center', width: 62 }}>
                <IconoConcepto icono={n} color="var(--tinta-2)" suave="var(--fondo)" />
                <span className="muted-3">{n}</span>
              </span>
            ))}
          </div>
        </Card>

        {/* ---------------- diálogo ---------------- */}
        <Card titulo="Diálogo">
          <div className="fila-campos" style={{ marginTop: 10 }}>
            <BotonTexto onClick={() => setDialogo('lista')}>Abrir lista de acciones</BotonTexto>
            <BotonTexto onClick={() => setDialogo('confirmar')}>Abrir confirmación</BotonTexto>
          </div>
        </Card>
      </div>

      {dialogo !== 'no' ? (
        <Dialogo titulo="Septiembre 2026" onCerrar={() => setDialogo('no')}>
          {dialogo === 'lista' ? (
            <>
              <AccionDialogo
                icono="repetir"
                titulo="Regenerar desde la plantilla"
                detalle="Añade los fijos que falten y actualiza los que sigan pendientes."
                onClick={() => setDialogo('confirmar')}
              />
              <AccionDialogo
                icono="papelera"
                titulo="Reiniciar el mes"
                detalle="Borra todos los apuntes y lo genera de nuevo."
                onClick={() => setDialogo('confirmar')}
              />
              <AccionDialogo
                icono="papelera"
                titulo="Borrar el mes"
                detalle="Se va entero. No se puede deshacer."
                peligro
                onClick={() => setDialogo('confirmar')}
              />
            </>
          ) : (
            <ConfirmacionDialogo
              frase="Se borran los 14 apuntes de septiembre y se generan de nuevo 14 fijos desde la plantilla."
              detalle="El ingreso, el dinero en cuenta y las notas se conservan. No se puede deshacer."
              textoConfirmar="Sí, reiniciar el mes"
              onConfirmar={() => setDialogo('no')}
              onCancelar={() => setDialogo('lista')}
            />
          )}
        </Dialogo>
      ) : null}
    </div>
  )
}
