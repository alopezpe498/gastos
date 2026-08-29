import { useEffect, useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Concepto, LineaCaptura, LecturaCaptura } from '../../lib/tipos'
import { Sheet } from '../../components/Sheet'
import { SelectorConcepto } from '../../components/SelectorConcepto'
import { CampoFecha } from '../../components/CampoFecha'
import { CampoImporte, CampoTextoLinea, Interruptor } from '../../components/Campos'
import { useAvisos } from '../../components/Avisos'
import { IconoAviso, IconoPapelera } from '../../components/Iconos'
import { cuantos, euros } from '../../lib/formato'

type Props = {
  lectura: LecturaCaptura | null
  conceptos: Concepto[]
  mesId: number
  mesClave: string
  origen: 'foto' | 'portapapeles'
  onCerrar: () => void
  onGuardado: (cuantos: number) => void
  /** Para cambiar el ingreso y el dinero en cuenta si la captura los traía. */
  onAplicarMes: (cambios: Record<string, unknown>) => Promise<void>
}

type Fila = LineaCaptura & { id: number; incluida: boolean }

/**
 * Revisión de lo que ha leído la IA, antes de guardar nada.
 *
 * Esta pantalla es el motivo de que la IA pueda entrar en la aplicación: nunca
 * escribe sola. Aquí se corrige el concepto, el importe y la fecha, se descarta
 * lo que sobre, y solo entonces se guarda.
 */
export function RevisionCaptura({
  lectura,
  conceptos,
  mesId,
  mesClave,
  origen,
  onCerrar,
  onGuardado,
  onAplicarMes,
}: Props) {
  const { avisarError } = useAvisos()
  const [filas, setFilas] = useState<Fila[]>([])
  const [desglosado, setDesglosado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [aplicarIngreso, setAplicarIngreso] = useState(true)

  useEffect(() => {
    if (!lectura) return
    setDesglosado(false)
    setAplicarIngreso(true)
    setFilas(lectura.movimientos.map((m, i) => ({ ...m, id: i, incluida: true })))
  }, [lectura])

  if (!lectura) return null

  const cambiar = (id: number, cambios: Partial<Fila>) =>
    setFilas((actuales) => actuales.map((f) => (f.id === id ? { ...f, ...cambios } : f)))

  /** Un ticket se propone como una línea; esto abre las que leyó la IA. */
  const alternarDesglose = () => {
    const origenFilas = desglosado ? lectura.movimientos : lectura.desglose
    setFilas(origenFilas.map((m, i) => ({ ...m, id: i, incluida: true })))
    setDesglosado(!desglosado)
  }

  const incluidas = filas.filter((f) => f.incluida)
  const sinConcepto = incluidas.filter((f) => f.conceptoId === null)
  const total = incluidas.reduce((t, f) => t + f.importe, 0)

  const guardar = async () => {
    if (sinConcepto.length > 0) {
      avisarError('Hay líneas sin concepto. Elígeles uno o descártalas.')
      return
    }
    setGuardando(true)
    try {
      const { creados } = await api<{ creados: number }>('/importar/captura/aplicar', {
        metodo: 'POST',
        cuerpo: {
          mesId,
          origen,
          movimientos: incluidas.map((f) => ({
            conceptoId: f.conceptoId,
            importe: f.importe,
            fecha: f.fecha,
            descripcion: f.descripcion,
            cobrado: f.cobrado,
          })),
        },
      })

      // El ingreso y el dinero en cuenta solo llegan en una captura de la hoja
      // del mes, y solo se tocan si se ha dejado marcado.
      if (aplicarIngreso && (lectura.ingreso !== null || lectura.dineroEnCuenta !== null)) {
        const cambios: Record<string, unknown> = {}
        if (lectura.ingreso !== null) cambios.ingreso = lectura.ingreso
        if (lectura.dineroEnCuenta !== null) cambios.dineroEnCuenta = lectura.dineroEnCuenta
        await onAplicarMes(cambios)
      }

      onGuardado(creados)
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setGuardando(false)
    }
  }

  const titulo =
    lectura.tipo === 'ticket'
      ? `Ticket${lectura.comercio ? ` de ${lectura.comercio}` : ''}`
      : lectura.tipo === 'factura'
        ? `Factura${lectura.comercio ? ` de ${lectura.comercio}` : ''}`
        : lectura.tipo === 'hoja'
          ? 'Captura de una hoja'
          : 'Gastos leídos'

  return (
    <Sheet
      abierta
      titulo={titulo}
      onCerrar={onCerrar}
      accionDerecha={
        <button
          className="boton-texto"
          onClick={() => void guardar()}
          disabled={guardando || incluidas.length === 0}
        >
          {guardando ? 'Guardando…' : `Guardar ${incluidas.length}`}
        </button>
      }
    >
      {lectura.avisos.map((aviso) => (
        <p className="banda-aviso" key={aviso}>
          <IconoAviso size={18} />
          <span>{aviso}</span>
        </p>
      ))}

      {(lectura.tipo === 'ticket' || lectura.tipo === 'factura') && lectura.desglose.length > 0 ? (
        <div className="fila fila-ajuste">
          <div className="fila-cuerpo">
            <span className="fila-titulo">
              {desglosado ? 'Guardando el desglose' : 'Guardando solo el total'}
            </span>
            <span className="fila-detalle">
              {desglosado
                ? `${cuantos(lectura.desglose.length, 'línea')} por separado.`
                : `Un solo apunte con el total. La IA ha leído ${cuantos(lectura.desglose.length, 'línea')}.`}
            </span>
          </div>
          <button className="boton boton-secundario boton-compacto" onClick={alternarDesglose}>
            {desglosado ? 'Solo el total' : 'Desglosar'}
          </button>
        </div>
      ) : null}

      {lectura.ingreso !== null || lectura.dineroEnCuenta !== null ? (
        <div className="fila fila-ajuste">
          <div className="fila-cuerpo">
            <span className="fila-titulo">También actualizar el mes</span>
            <span className="fila-detalle">
              {[
                lectura.ingreso !== null ? `ingresos ${euros(lectura.ingreso)}` : '',
                lectura.dineroEnCuenta !== null
                  ? `dinero en cuenta ${euros(lectura.dineroEnCuenta)}`
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <Interruptor
            activo={aplicarIngreso}
            onCambiar={setAplicarIngreso}
            ariaLabel="Actualizar también el ingreso y el dinero en cuenta"
          />
        </div>
      ) : null}

      {sinConcepto.length > 0 ? (
        <p className="banda-aviso">
          <IconoAviso size={18} />
          <span>
            {cuantos(sinConcepto.length, 'línea')} sin concepto conocido:{' '}
            {sinConcepto.map((f) => `«${f.concepto}»`).join(', ')}. Elígeles uno del catálogo o
            descártalas. Si quieres un concepto nuevo, créalo antes en Conceptos.
          </span>
        </p>
      ) : null}

      <div className="tarjeta revision">
        {filas.map((fila) => (
          <div
            className={`revision-fila${fila.incluida ? '' : ' descartada'}${
              fila.conceptoId === null ? ' sin-concepto' : ''
            }`}
            key={fila.id}
          >
            <span className="revision-concepto">
              <SelectorConcepto
                conceptos={conceptos}
                valor={fila.conceptoId}
                onElegir={(conceptoId) => {
                  const elegido = conceptos.find((c) => c.id === conceptoId)
                  cambiar(fila.id, {
                    conceptoId,
                    concepto: elegido?.nombre ?? fila.concepto,
                    nuevo: false,
                  })
                }}
                ariaLabel={`Concepto de ${fila.concepto}`}
                placeholder={fila.concepto}
              />
            </span>

            <CampoFecha
              valor={fila.fecha ?? `${mesClave}-01`}
              mesReferencia={mesClave}
              onGuardar={(fecha) => cambiar(fila.id, { fecha })}
              ariaLabel={`Fecha de ${fila.concepto}`}
              className="revision-fecha"
              compacto
            />

            <span className="revision-descripcion">
              <CampoTextoLinea
                valor={fila.descripcion}
                onGuardar={(descripcion) => cambiar(fila.id, { descripcion })}
                ariaLabel={`Descripción de ${fila.concepto}`}
                placeholder="—"
              />
            </span>

            <CampoImporte
              valor={fila.importe}
              onGuardar={(importe) => cambiar(fila.id, { importe: importe ?? 0 })}
              ariaLabel={`Importe de ${fila.concepto}`}
              className="revision-importe"
            />

            <button
              className="icono-boton"
              aria-label={
                fila.incluida
                  ? `Descartar ${fila.concepto}`
                  : `Volver a incluir ${fila.concepto}`
              }
              aria-pressed={!fila.incluida}
              onClick={() => cambiar(fila.id, { incluida: !fila.incluida })}
            >
              <IconoPapelera size={18} />
            </button>
          </div>
        ))}
      </div>

      <p className="pista">
        {cuantos(incluidas.length, 'línea')} · <strong className="dinero">{euros(total)}</strong>
        {filas.length !== incluidas.length
          ? ` · ${filas.length - incluidas.length} descartadas`
          : ''}
      </p>
    </Sheet>
  )
}
