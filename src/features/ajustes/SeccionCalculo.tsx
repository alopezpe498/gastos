import { useState } from 'react'
import { api, mensajeDeError } from '../../lib/api'
import type { Ajustes, Concepto, GrupoFijos } from '../../lib/tipos'
import { useAvisos } from '../../components/Avisos'
import { IconoPapelera } from '../../components/Iconos'

type Props = {
  ajustes: Ajustes
  conceptos: Concepto[]
  onGuardado: (ajustes: Ajustes) => void
}

/** Los tres ajustes que cambian lo que dicen los números. */
export function SeccionCalculo({ ajustes, conceptos, onGuardado }: Props) {
  const { avisarError } = useAvisos()
  const [ideales, setIdeales] = useState(ajustes.ideales)
  const [guardando, setGuardando] = useState(false)

  const fijos = conceptos.filter((c) => c.tipo === 'fijo' && !c.esObjetivo)
  const suma = ideales.necesario + ideales.prescindible + ideales.ahorro

  const guardar = async (cambios: Partial<Ajustes>) => {
    setGuardando(true)
    try {
      onGuardado(await api<Ajustes>('/config', { metodo: 'PUT', cuerpo: cambios }))
    } catch (causa) {
      avisarError(mensajeDeError(causa))
    } finally {
      setGuardando(false)
    }
  }

  const cambiarGrupos = (grupos: GrupoFijos[]) => void guardar({ gruposFijos: grupos })

  return (
    <>
      {/* ---------- 50/30/20 ---------- */}
      <section className="bloque">
        <h3 className="seccion-titulo">Porcentajes ideales</h3>
        <p className="seccion-pista">
          Contra qué se compara el reparto real del mes. La regla clásica es 50 / 30 / 20.
        </p>

        <div className="fila-porcentajes">
          {(['necesario', 'prescindible', 'ahorro'] as const).map((clave) => (
            <div key={clave}>
              <label className="campo-etiqueta" htmlFor={`ideal-${clave}`}>
                {clave === 'necesario'
                  ? 'Necesario'
                  : clave === 'prescindible'
                    ? 'Prescindible'
                    : 'Ahorro'}
              </label>
              <input
                id={`ideal-${clave}`}
                className="campo dinero"
                type="number"
                min={0}
                max={100}
                value={ideales[clave]}
                onChange={(e) => setIdeales({ ...ideales, [clave]: Number(e.target.value) })}
                onBlur={() => {
                  if (ideales[clave] !== ajustes.ideales[clave]) void guardar({ ideales })
                }}
              />
            </div>
          ))}
        </div>

        <p className={`pista${suma !== 100 ? ' aviso' : ''}`}>
          {suma === 100
            ? 'Suman 100 %.'
            : `Suman ${suma} %. No es un error —cada bloque se compara por separado—, pero lo ` +
              'normal es que sumen 100.'}
        </p>
      </section>

      {/* ---------- criterio de la comida ---------- */}
      <section className="bloque">
        <h3 className="seccion-titulo">Cómo cuenta la comida</h3>
        <p className="seccion-pista">
          La comida es un sobre con presupuesto, no un recibo. Esto decide qué se suma al total de
          gastos del mes.
        </p>

        <div className="segmentado">
          <button
            className={ajustes.comidaEnTotal === 'presupuesto' ? 'activo' : ''}
            disabled={guardando}
            onClick={() => void guardar({ comidaEnTotal: 'presupuesto' })}
          >
            El presupuesto
          </button>
          <button
            className={ajustes.comidaEnTotal === 'gastado' ? 'activo' : ''}
            disabled={guardando}
            onClick={() => void guardar({ comidaEnTotal: 'gastado' })}
          >
            Lo gastado
          </button>
        </div>

        <p className="pista">
          {ajustes.comidaEnTotal === 'presupuesto'
            ? 'Como en tu Excel: el sobre entero cuenta como gasto desde el día 1, gastes lo que gastes.'
            : 'Solo cuenta lo que has apuntado de verdad. El total del mes irá subiendo según comas.'}
        </p>
      </section>

      {/* ---------- grupos de fijos ---------- */}
      <section className="bloque">
        <h3 className="seccion-titulo">Grupos de gastos fijos</h3>
        <p className="seccion-pista">
          Cómo se agrupan los fijos en el análisis del mes. Lo que no entre en ningún grupo se suma
          en «Resto».
        </p>

        {ajustes.gruposFijos.length === 0 ? (
          <p className="pista">
            Ahora mismo se usan los tres de siempre: Hipoteca; Luz, agua, gas y seguros; y Niñas.
            En cuanto crees uno aquí, mandan los tuyos.
          </p>
        ) : null}

        {ajustes.gruposFijos.map((grupo, indice) => (
          <div className="grupo" key={indice}>
            <div className="fila-campos">
              <input
                className="campo"
                defaultValue={grupo.nombre}
                aria-label={`Nombre del grupo ${indice + 1}`}
                onBlur={(e) => {
                  const copia = [...ajustes.gruposFijos]
                  copia[indice] = { ...grupo, nombre: e.target.value.trim() || 'Sin nombre' }
                  cambiarGrupos(copia)
                }}
              />
              <button
                className="icono-boton"
                aria-label={`Borrar el grupo "${grupo.nombre}"`}
                onClick={() => cambiarGrupos(ajustes.gruposFijos.filter((_, i) => i !== indice))}
              >
                <IconoPapelera size={18} />
              </button>
            </div>

            <div className="etiquetas-fila">
              {fijos.map((concepto) => {
                const dentro = grupo.conceptos.includes(concepto.id)
                return (
                  <button
                    key={concepto.id}
                    className={`etiqueta${dentro ? ' activa' : ''}`}
                    aria-pressed={dentro}
                    onClick={() => {
                      const copia = [...ajustes.gruposFijos]
                      copia[indice] = {
                        ...grupo,
                        conceptos: dentro
                          ? grupo.conceptos.filter((id) => id !== concepto.id)
                          : [...grupo.conceptos, concepto.id],
                      }
                      cambiarGrupos(copia)
                    }}
                  >
                    {concepto.nombre}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <button
          className="boton boton-secundario"
          onClick={() => cambiarGrupos([...ajustes.gruposFijos, { nombre: 'Nuevo grupo', conceptos: [] }])}
        >
          Añadir grupo
        </button>
      </section>
    </>
  )
}
