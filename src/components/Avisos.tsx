import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type Aviso = { id: number; texto: string; tipo: 'info' | 'error' }

type ContextoAvisos = {
  avisar: (texto: string) => void
  avisarError: (texto: string) => void
}

const Contexto = createContext<ContextoAvisos>({ avisar: () => {}, avisarError: () => {} })

export const useAvisos = () => useContext(Contexto)

let siguienteId = 1

/** Avisos breves flotantes, al estilo de las notificaciones de iOS. */
export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])

  const mostrar = useCallback((texto: string, tipo: 'info' | 'error') => {
    const id = siguienteId++
    setAvisos((actuales) => [...actuales, { id, texto, tipo }])
    setTimeout(() => setAvisos((actuales) => actuales.filter((a) => a.id !== id)), 3200)
  }, [])

  const valor = useMemo(
    () => ({
      avisar: (texto: string) => mostrar(texto, 'info'),
      avisarError: (texto: string) => mostrar(texto, 'error'),
    }),
    [mostrar],
  )

  return (
    <Contexto.Provider value={valor}>
      {children}
      <div className="avisos" aria-live="polite">
        {avisos.map((aviso) => (
          <div key={aviso.id} className={`aviso${aviso.tipo === 'error' ? ' error' : ''}`}>
            {aviso.texto}
          </div>
        ))}
      </div>
    </Contexto.Provider>
  )
}
