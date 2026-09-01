import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { BotonTexto } from './Basicos'
import { Icono } from './Icono'

/**
 * La banda que sale cuando la aplicación ha arrancado con algo a medias.
 *
 * Existe por una caída de verdad: una comprobación de esquema lanzaba un error,
 * el servidor moría antes de escuchar y nginx contestaba Bad Gateway. Ahora el
 * servidor arranca pase lo que pase —eso es lo que importa—, pero arrancar «a
 * pesar de» solo vale si en algún sitio se dice qué se ha quedado sin hacer.
 *
 * Este es ese sitio. Va arriba del todo, se puede cerrar, y no bloquea nada:
 * la aplicación funciona, y esto es un recado para cuando haya un rato.
 */

type Estado = {
  avisos: { nombre: string; error: string }[]
  migraciones: { nombre: string; descripcion: string; pendiente: boolean }[]
}

export function AvisoArranque() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [cerrado, setCerrado] = useState(false)

  useEffect(() => {
    let vigente = true
    api<Estado>('/estado')
      .then((d) => vigente && setEstado(d))
      // Si ni siquiera esto contesta, no se pinta nada: no se avisa de un aviso.
      .catch(() => undefined)
    return () => {
      vigente = false
    }
  }, [])

  if (cerrado || !estado) return null

  const pendientes = estado.migraciones.filter((m) => m.pendiente)
  if (estado.avisos.length === 0 && pendientes.length === 0) return null

  return (
    <div className="aviso-arranque" role="status">
      <Icono nombre="aviso" size={16} />
      <div className="aviso-arranque-cuerpo">
        <p className="aviso-arranque-titulo">
          La aplicación funciona, pero algo del arranque se ha quedado a medias.
        </p>
        {estado.avisos.map((a) => (
          <p className="d" key={a.nombre}>
            <b>{a.nombre}</b>: {a.error}
          </p>
        ))}
        {pendientes.map((m) => (
          <p className="d" key={m.nombre}>
            <b>{m.nombre}</b>: sin aplicar ({m.descripcion}).
          </p>
        ))}
        <p className="d">
          Se reintenta en cada arranque. En el servidor: <code>npm run migrar</code>.
        </p>
      </div>
      <BotonTexto onClick={() => setCerrado(true)}>Cerrar</BotonTexto>
    </div>
  )
}
