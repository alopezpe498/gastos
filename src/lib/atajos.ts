/** Reglas comunes de los atajos de teclado de escritorio. */

const CAMPOS = ['INPUT', 'TEXTAREA', 'SELECT']

/**
 * Si el usuario esta escribiendo, los atajos no deben dispararse.
 *
 * Se mira el objetivo del evento y no solo document.activeElement: el objetivo
 * es el campo en el que se teclea aunque el foco del documento se haya quedado
 * en otra parte, que es justo lo que pasa en algunos navegadores y al probar
 * con la ventana en segundo plano.
 */
export function estaEscribiendo(evento: KeyboardEvent): boolean {
  const candidatos = [evento.target, document.activeElement]
  return candidatos.some(
    (nodo) =>
      nodo instanceof HTMLElement && (CAMPOS.includes(nodo.tagName) || nodo.isContentEditable),
  )
}

/** Con un popover, una sheet o una alerta delante, los atajos globales callan. */
export function hayCapaAbierta(): boolean {
  return !!document.querySelector('.popover, .sheet, .alerta')
}

/** Un atajo simple no lleva modificadores (Alt se usa aparte al arrastrar). */
export function conModificadores(evento: KeyboardEvent): boolean {
  return evento.metaKey || evento.ctrlKey || evento.altKey
}
