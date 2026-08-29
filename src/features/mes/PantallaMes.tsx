import { useCallback, useEffect, useState } from 'react'
import { api, ErrorApi, mensajeDeError } from '../../lib/api'
import type { Concepto, MesCompleto, MesPorAbrir, Movimiento, PanelMes } from '../../lib/tipos'
import { Confirmar } from '../../components/Basicos'
import { useAvisos } from '../../components/Avisos'
import { cuantos, hoyIso, NOMBRES_MESES } from '../../lib/formato'
import { BloquePrincipal, BloqueFijos, BloqueComida, BloqueExtras, BloqueAhorro } from './Bloques'
import { ListaMovimientos, ListaFijos } from './Listas'
import { Analisis } from './Analisis'
import { MenuMes } from './MenuMes'
import { Acciones } from '../../components/Navegacion'
import { IconoCandado } from '../../components/Iconos'

/**
 * La pantalla Mes.
 *
 * Arriba, cinco bloques que responden a «¿cómo voy?» sin leer una sola tabla:
 * lo que queda, los fijos, la comida, los extras y el ahorro. Abajo, las dos
 * listas con las que se trabaja. El análisis del mes vive aquí dentro, como una
 * sección desplegable: era una pantalla entera para algo que se mira de vez en
 * cuando.
 */

type Props = {
  mesElegido: { anio: number; mes: number } | null
  onCambioDeMes: (mes: { anio: number; mes: number } | null) => void
  onImportarExtracto: (mesId: number) => void
  onBloquear: () => void
}

export function PantallaMes({
  mesElegido,
  onCambioDeMes,
  onImportarExtracto,
  onBloquear,
}: Props) {
  const { avisar, avisarError } = useAvisos()
  const [mes, setMes] = useState<MesCompleto | null>(null)
  const [panel, setPanel] = useState<PanelMes | null>(null)
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [porAbrir, setPorAbrir] = useState<(MesPorAbrir & { anio: number; mes: number }) | null>(null)
  const [error, setError] = useState('')
  const [abriendo, setAbriendo] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [aBorrar, setABorrar] = useState<Movimiento | null>(null)
  // Sube cada vez que se pulsa «Apuntar»: la lista lo mira para poner el foco
  // en su línea. Un número y no un booleano, porque hay que poder pulsarlo dos
  // veces seguidas.
  const [pedirApunte, setPedirApunte] = useState(0)

  const cargar = useCallback(async () => {
    setError('')
    try {
      const catalogo = await api<Concepto[]>('/conceptos?activos=1')
      setConceptos(catalogo)

      // Navegar no crea nada: si el mes no existe, se ofrece abrirlo.
      const datos = mesElegido
        ? await api<MesCompleto>(`/meses/${mesElegido.anio}/${mesElegido.mes}`).catch(async (causa) => {
            if (!(causa instanceof ErrorApi) || causa.estado !== 404) throw causa
            const info = await api<MesPorAbrir>(
              `/meses/por-abrir/${mesElegido.anio}/${mesElegido.mes}`,
            )
            setPorAbrir({ ...info, anio: mesElegido.anio, mes: mesElegido.mes })
            return null
          })
        : await api<MesCompleto | null>('/meses/actual')

      setMes(datos)
      if (datos) {
        setPorAbrir(null)
        setPanel(await api<PanelMes>(`/meses/${datos.id}/panel`))
      }
    } catch (causa) {
      setError(mensajeDeError(causa))
    }
  }, [mesElegido])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const recargar = useCallback(async () => {
    if (!mes) return
    const datos = await api<MesCompleto>(`/meses/${mes.anio}/${mes.mes}`)
    setMes(datos)
    setPanel(await api<PanelMes>(`/meses/${datos.id}/panel`))
  }, [mes])

  const cambiarMes = async (cambios: Record<string, unknown>) => {
    if (!mes) return
    try {
      setMes(await api<MesCompleto>(`/meses/${mes.id}`, { metodo: 'PATCH', cuerpo: cambios }))
      setPanel(await api<PanelMes>(`/meses/${mes.id}/panel`))
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  const cambiarMovimiento = async (id: number, cambios: Record<string, unknown>) => {
    try {
      await api(`/movimientos/${id}`, { metodo: 'PATCH', cuerpo: cambios })
      await recargar()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  const alternarCobro = async (movimientoId: number) => {
    const fijo = panel?.fijos.find((f) => f.movimientoId === movimientoId)
    if (!fijo) return
    await cambiarMovimiento(movimientoId, { fechaCobro: fijo.cobrado ? null : hoyIso() })
  }

  const apuntar = async (datos: { conceptoId: number; importe: number; descripcion: string }) => {
    if (!mes) return
    try {
      await api('/movimientos', {
        metodo: 'POST',
        cuerpo: { mesId: mes.id, ...datos, fechaCobro: hoyIso() },
      })
      await recargar()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  const borrar = async () => {
    if (!aBorrar) return
    const cual = aBorrar
    setABorrar(null)
    try {
      await api(`/movimientos/${cual.id}`, { metodo: 'DELETE' })
      avisar(`"${cual.concepto}" borrado`)
      await recargar()
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    }
  }

  const abrir = async (anio: number, numeroMes: number) => {
    setAbriendo(true)
    try {
      const nuevo = await api<MesCompleto>('/meses/asegurar', {
        metodo: 'POST',
        cuerpo: { anio, mes: numeroMes },
      })
      avisar(`${nuevo.nombreMes} abierto con ${cuantos(nuevo.fijos.length, 'fijo')}`)
      onCambioDeMes({ anio: nuevo.anio, mes: nuevo.mes })
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setAbriendo(false)
    }
  }

  const irA = (delta: number) => {
    if (!mes) return
    const n = mes.anio * 12 + (mes.mes - 1) + delta
    onCambioDeMes({ anio: Math.floor(n / 12), mes: (n % 12) + 1 })
  }

  // ---- estados que no son el mes ----

  if (error) {
    return (
      <div className="vacio">
        <p>{error}</p>
        <button className="boton-texto" onClick={() => void cargar()}>
          Reintentar
        </button>
      </div>
    )
  }

  if (porAbrir) {
    const nombre = NOMBRES_MESES[porAbrir.mes - 1]
    return (
      <div className="bloque vacio">
        <p style={{ fontWeight: 600 }}>
          {nombre} de {porAbrir.anio} todavía no está abierto
        </p>
        <p className="t12">
          {porAbrir.intermedios.length > 0
            ? `Al abrirlo se crearán también ${porAbrir.intermedios.map((m) => m.nombre.toLowerCase()).join(', ')}.`
            : 'Al abrirlo se generan los fijos activos, pendientes de cobro.'}
        </p>
        <button
          className="boton boton-negro"
          style={{ marginTop: 12 }}
          disabled={abriendo}
          onClick={() => void abrir(porAbrir.anio, porAbrir.mes)}
        >
          {abriendo ? 'Abriendo…' : 'Abrir este mes'}
        </button>
      </div>
    )
  }

  if (!mes || !panel) {
    return <div className="cargando">Un momento…</div>
  }

  const variables = mes.variables
  const conceptosVariables = conceptos.filter((c) => c.tipo !== 'fijo' || c.esObjetivo === false)

  return (
    <>
      <Acciones>
        <button className="boton" onClick={() => onImportarExtracto(mes.id)}>
          Importar extracto
        </button>
        <button className="boton boton-negro" onClick={() => setPedirApunte((n) => n + 1)}>
          + Apuntar
        </button>
        <button
          className="boton-icono"
          aria-label="Más cosas de este mes"
          onClick={() => setMenuAbierto(true)}
        >
          ···
        </button>
        <button className="boton-icono" aria-label="Bloquear la aplicación" onClick={onBloquear}>
          <IconoCandado size={18} />
        </button>
      </Acciones>

      <div className="rejilla-arriba">
        <BloquePrincipal
          mes={mes}
          panel={panel}
          onMesAnterior={() => irA(-1)}
          onMesSiguiente={() => irA(1)}
          onCambiarSaldo={(valor) => cambiarMes({ dineroEnCuenta: valor })}
        />
        <BloqueFijos panel={panel} />
        <BloqueComida mes={mes} />
        <BloqueExtras panel={panel} />
        <BloqueAhorro mes={mes} />
      </div>

      <div className="rejilla-abajo">
        <ListaMovimientos
          variables={variables}
          conceptos={conceptosVariables}
          mesReferencia={mes.clave}
          onCambiar={cambiarMovimiento}
          onBorrar={setABorrar}
          onCrear={apuntar}
          onImportar={() => onImportarExtracto(mes.id)}
          pedirApunte={pedirApunte}
        />
        <ListaFijos
          panel={panel}
          onAlternarCobro={alternarCobro}
          onCambiarImporte={(id, importe) => cambiarMovimiento(id, { importe })}
        />
      </div>

      <Analisis mesId={mes.id} conceptos={conceptos} />

      <MenuMes
        mes={mes}
        abierto={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
        onCambiado={recargar}
        onCambiarEstado={async (estado) => {
          await cambiarMes({ estado })
          avisar(estado === 'cerrado' ? 'Mes cerrado' : 'Mes reabierto')
        }}
      />

      <Confirmar
        abierto={!!aBorrar}
        titulo="¿Borrar el apunte?"
        mensaje={`Se va "${aBorrar?.concepto}" de ${mes.nombreMes.toLowerCase()}.`}
        textoConfirmar="Borrar"
        peligroso
        onConfirmar={() => void borrar()}
        onCancelar={() => setABorrar(null)}
      />
    </>
  )
}
