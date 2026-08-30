/**
 * Los iconos, dibujados a mano en el estilo de Lucide.
 *
 * Se dibujan aquí en vez de traer la librería entera por tamaño: la aplicación
 * usa unos treinta y `lucide-react` son mil. Todos comparten el mismo trazo de
 * la referencia —`stroke-width: 2`, extremos y uniones redondeados, sin
 * relleno— así que se ven como uno solo aunque los haya dibujado yo.
 */

export type NombreIcono =
  // navegación
  | 'calendario'
  | 'barras'
  | 'tendencia'
  | 'lista'
  | 'subir'
  | 'ajustes'
  | 'candado'
  // acciones
  | 'mas'
  | 'check'
  | 'cerrar'
  | 'puntos'
  | 'chevron'
  | 'abajo'
  | 'izquierda'
  | 'derecha'
  | 'papelera'
  | 'repetir'
  | 'reloj'
  | 'arrastrar'
  | 'buscar'
  | 'camara'
  | 'nota'
  | 'descargar'
  | 'documento'
  | 'chispa'
  | 'aviso'
  | 'lapiz'
  | 'dividir'
  | 'copiar'
  // conceptos
  | 'casa'
  | 'comida'
  | 'bar'
  | 'rayo'
  | 'antena'
  | 'pantalla'
  | 'coche'
  | 'flecha'
  | 'avion'
  | 'pesa'
  | 'cruz'
  | 'mochila'
  | 'huella'
  | 'carro'
  | 'hucha'
  | 'entrada'
  | 'escudo'
  | 'edificio'
  | 'trebol'
  | 'billete'
  | 'etiqueta'

/** El trazo de cada icono, en un viewBox de 24. */
const TRAZOS: Record<NombreIcono, string> = {
  calendario: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  barras: '<path d="M3 20h18M6 16V10M11 16V6M16 16v-3M21 16V8"/>',
  tendencia: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  lista: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  subir: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  ajustes:
    '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  candado: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',

  mas: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l4 4L19 6"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  puntos: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  abajo: '<path d="M6 9l6 6 6-6"/>',
  izquierda: '<path d="M15 6l-6 6 6 6"/>',
  derecha: '<path d="M9 6l6 6-6 6"/>',
  papelera: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  repetir: '<path d="M4 10a8 8 0 0113-5l3 3M20 14a8 8 0 01-13 5l-3-3"/><path d="M20 4v6h-6M4 20v-6h6"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrastrar:
    '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  camara: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3"/>',
  nota: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  descargar: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  documento: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/>',
  chispa: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18 16l.9 2.1L21 19l-2.1.9L18 22l-.9-2.1L15 19l2.1-.9z"/>',
  aviso: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  lapiz: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  dividir: '<path d="M6 3v18M18 3v18M6 12h12"/>',
  copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>',

  casa: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
  comida: '<path d="M6 3v7a3 3 0 006 0V3M9 3v18M18 3c-2 2-2 6-2 8h2v10"/>',
  bar: '<path d="M5 8h11v6a4 4 0 01-4 4H9a4 4 0 01-4-4zM16 9h2a2 2 0 010 4h-2M6 21h10"/>',
  rayo: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  antena: '<path d="M12 13a2 2 0 100-4 2 2 0 000 4zM12 13v8"/><path d="M6.5 5.5a8 8 0 000 11M17.5 5.5a8 8 0 010 11"/>',
  pantalla: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  coche: '<path d="M5 15l1.5-5A2 2 0 018.4 8.6h7.2A2 2 0 0117.5 10L19 15"/><rect x="3" y="15" width="18" height="4" rx="1.5"/><path d="M7 19v2M17 19v2"/>',
  flecha: '<path d="M3 12h18M15 6l6 6-6 6"/>',
  avion: '<path d="M3 12l18-7-4 8 4 8-18-7z"/><path d="M3 12h14"/>',
  pesa: '<path d="M4 9v6M8 6v12M16 6v12M20 9v6M8 12h8"/>',
  cruz: '<path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="4"/>',
  mochila: '<path d="M6 8a6 6 0 0112 0v11a2 2 0 01-2 2H8a2 2 0 01-2-2z"/><path d="M9 8V6a3 3 0 016 0v2M9 14h6"/>',
  huella: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="9" r="2"/><path d="M12 12c-3 0-5 2.5-5 5a3 3 0 003 3h4a3 3 0 003-3c0-2.5-2-5-5-5z"/>',
  carro: '<path d="M6 6h15l-1.5 9h-12zM6 6L5 3H2"/><circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/>',
  hucha: '<path d="M4 12a7 5 0 0114 0v4h-2l-1 3h-3l-1-3H6a2 2 0 01-2-2z"/><path d="M15 10h.01M4 11L2 9v4z"/>',
  entrada: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  escudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  edificio: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
  trebol: '<path d="M12 13c-3 3-7 1-6-2s5-2 6 1c1-3 5-4 6-1s-3 5-6 2z"/><path d="M12 13v8"/>',
  billete: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  etiqueta: '<path d="M3 12V5a2 2 0 012-2h7l9 9-9 9z"/><circle cx="8" cy="8" r="1.3"/>',
}

type Props = {
  nombre: NombreIcono | string
  /** 15 en la navegación, 16 en las filas, 12 dentro de un check. */
  size?: number
  className?: string
}

export function Icono({ nombre, size = 16, className }: Props) {
  const trazo = TRAZOS[nombre as NombreIcono] ?? TRAZOS.etiqueta
  return (
    <svg
      className={className ? `ic ${className}` : 'ic'}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: trazo }}
    />
  )
}

/** Todos los nombres, para la página del kit y el selector de Conceptos. */
export const ICONOS_DE_CONCEPTO: NombreIcono[] = [
  'casa',
  'comida',
  'bar',
  'rayo',
  'antena',
  'pantalla',
  'coche',
  'flecha',
  'avion',
  'pesa',
  'cruz',
  'mochila',
  'huella',
  'carro',
  'hucha',
  'entrada',
  'escudo',
  'edificio',
  'trebol',
  'billete',
  'etiqueta',
]
