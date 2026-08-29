/**
 * Iconos SVG en linea. Todos de la misma familia: rejilla de 24, trazo de
 * 1.75 con extremos redondeados. Nada de mezclar grosores ni estilos.
 */
type Props = { size?: number; className?: string }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

// ---------- navegacion ----------

/** La marca de la app: las tres barras del icono. */
export const IconoBarras = ({ size = 22, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M6 20v-6M12 20V9M18 20V4" strokeWidth="2.4" />
  </svg>
)

export const IconoCalendario = ({ size = 22, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
)

export const IconoTarta = ({ size = 22, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M12 3a9 9 0 1 0 9 9h-9z" />
    <path d="M14.5 2.6A9 9 0 0 1 21.4 9.5h-6.9z" />
  </svg>
)

export const IconoTabla = ({ size = 22, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M3 9.5h18M3 15h18M9 4v16" />
  </svg>
)

export const IconoEtiquetas = ({ size = 22, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M4 6.5h4M4 12h4M4 17.5h4" />
    <path d="M11.5 6.5H20M11.5 12H20M11.5 17.5H20" />
  </svg>
)

export const IconoAjustes = ({ size = 22, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.55V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1.03H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.03z" />
  </svg>
)

export const IconoPanelIzquierdo = ({ size = 18, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M9.5 4v16" />
  </svg>
)

// ---------- acciones ----------

export const IconoMas = ({ size = 22, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconoCerrar = ({ size = 22, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const IconoBuscar = ({ size = 18, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

export const IconoPapelera = ({ size = 20, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </svg>
)

export const IconoComprobado = ({ size = 20, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
)

export const IconoLapiz = ({ size = 18, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M15.5 4.5 19.5 8.5 8 20H4v-4z" />
    <path d="m13.5 6.5 4 4" />
  </svg>
)

export const IconoSubir = ({ size = 20, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M12 16V4M8 7.5 12 3.5l4 4" />
    <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
)

export const IconoDescargar = ({ size = 20, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M12 3v12M8 11.5l4 4 4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
)

export const IconoArrastrar = ({ size = 18, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth="2.6" />
  </svg>
)

// ---------- direcciones ----------

export const IconoAtras = ({ size = 22, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="m15 5-7 7 7 7" />
  </svg>
)

export const IconoAdelante = ({ size = 22, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="m9 5 7 7-7 7" />
  </svg>
)

export const IconoChevron = ({ size = 18, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="m9 5 7 7-7 7" />
  </svg>
)

export const IconoArriba = ({ size = 18, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="m5 15 7-7 7 7" />
  </svg>
)

export const IconoAbajo = ({ size = 18, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="m5 9 7 7 7-7" />
  </svg>
)

// ---------- dinero y estado ----------

export const IconoEuro = ({ size = 20, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M17.5 6.5a6.5 6.5 0 1 0 0 11" />
    <path d="M4 10h8M4 14h8" />
  </svg>
)

export const IconoSobre = ({ size = 20, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </svg>
)

export const IconoReloj = ({ size = 18, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </svg>
)

export const IconoCandado = ({ size = 28, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <rect x="4.5" y="10" width="15" height="11" rx="3" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
)

export const IconoBorrarTecla = ({ size = 24, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M20 5H9.5L3 12l6.5 7H20a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
    <path d="m12 9.5 5 5M17 9.5l-5 5" />
  </svg>
)

export const IconoInterrogacion = ({ size = 20, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.2a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2-2.4 3.6" />
    <path d="M12 17h.01" />
  </svg>
)

export const IconoAviso = ({ size = 20, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3.1L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4M12 17h.01" />
  </svg>
)

export const IconoChispa = ({ size = 20, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M12 3.5 13.6 8l4.5 1.6-4.5 1.6L12 15.7l-1.6-4.5L5.9 9.6 10.4 8z" />
    <path d="M18 15.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
  </svg>
)

export const IconoCamara = ({ size = 20, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M3 8.5A2 2 0 0 1 5 6.5h2.2l1.2-2h7.2l1.2 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="13" r="3.4" />
  </svg>
)

export const IconoPortapapeles = ({ size = 20, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M9 4.5H7.5a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2H15" />
    <rect x="9" y="2.5" width="6" height="4" rx="1.3" />
  </svg>
)

export const IconoTendencia = ({ size = 22, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M3 17.5 9 11l4 4 7.5-8" />
    <path d="M15.5 7h5v5" />
  </svg>
)

export const IconoDocumento = ({ size = 20, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </svg>
)

export const IconoRepetir = ({ size = 20, className }: Props) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M4 9h12a4 4 0 0 1 4 4M20 15H8a4 4 0 0 1-4-4" />
    <path d="m7 6-3 3 3 3M17 18l3-3-3-3" />
  </svg>
)
