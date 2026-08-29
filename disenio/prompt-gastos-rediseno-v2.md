# Prompt para Claude Code — App "Gastos" · Rediseño "Bento claro" (v2)

## Punto de partida

En la raíz del proyecto hay un archivo `referencia-mes.html`. **Es el diseño aprobado de la pantalla Mes.** Ábrelo en un navegador, mira cómo se ve a 1120 px y a 390 px, y reprodúcelo en la app con fidelidad: mismos colores, mismas proporciones, mismos tamaños de texto, misma disposición. No es una inspiración, es la especificación. Lo que no esté en el HTML se rige por este documento; en caso de duda, gana el HTML.

Este rediseño **sustituye por completo** al anterior ("La libreta"), que se queda a medias y no ha gustado. Descarta sus tokens, su cinta del mes y su tipografía. Trabaja en la rama `rediseno-v2`.

**No se toca la lógica**: ni el modelo de datos, ni la API, ni los cálculos, ni el flujo de importación. Solo la capa de presentación. Si necesitas un dato que la API no da (p. ej. gasto acumulado por día para la barra del bloque principal, o extras por día para el micro-gráfico), añade un endpoint de solo lectura y documéntalo en `API.md`.

## Qué hace que este diseño funcione (para que lo apliques al resto de pantallas)

1. **Fondo claro cálido (`#F4F3EF`) con bloques blancos redondeados (radio 18) y sin sombras.** La profundidad la dan los bloques de color, no las sombras.
2. **Cada categoría tiene un color, y ese color se repite en todas partes**: en el bloque de la cabecera, en la etiqueta de cada apunte, en los gráficos. El usuario reconoce Comida por el coral antes de leer la palabra. Paleta y asignación exactas en las variables CSS del HTML. Los conceptos variables se reparten los colores secundarios (lavanda, ámbar, verde, gris) de forma estable: mismo concepto, mismo color siempre; asignación automática con posibilidad de cambiarla en Conceptos.
3. **Cifras muy grandes y gordas** (Inter Tight 800, letter-spacing negativo): 58 px la protagonista, 26 px las de bloque. El resto de texto es discreto (14 base, 12 secundario). Fuente autoalojada (woff2).
4. **La app te habla**: el bloque principal tiene siempre una frase en lenguaje natural que resume cómo vas ("Vas bien: te sobran 73 € al día hasta la nómina" / "Cuidado: a este ritmo te quedas sin nada el día 22" / "Te has pasado 120 €; los fijos que faltan suman 80 €"). Se calcula con lo que queda, los días que faltan hasta el fin del periodo y los fijos pendientes. Cada bloque secundario tiene también su frase corta de contexto ("9 de 15 cobrados · comunidad y luz aún no", "Amazon se lleva el 64 %", "Objetivo 20 % · lo vas a cumplir").
5. **Un solo botón negro** por pantalla (la acción principal); el resto son chips blancos.
6. **Micro-gráficos dentro de los bloques** en vez de comparativas en texto: barra de progreso con la marca de "hoy", puntos que se llenan al cobrar cada fijo, barritas por día de extras. Las comparativas con el año anterior y la media de 12 meses solo aparecen en Analítica, y solo con al menos 6 meses de histórico.
7. **Nada de formularios a la vista**: el alta rápida es una línea "Apunta algo… 'peaje 9,76' o pega el ticket" que al recibir foco se despliega (concepto con buscador, importe, fecha con hoy por defecto, descripción) y que además **entiende texto libre**: "peaje 9,76" rellena concepto e importe; si hay IA configurada, se usa para interpretar; si no, un parser sencillo (último número = importe, resto = concepto). Foto, PDF y pegar como tres iconos pequeños a la derecha de la línea.
8. **Listas como filas** separadas por una línea de 1 px, nunca como tarjetas apiladas. Fecha corta a la izquierda ("25 ago"), descripción, etiqueta de concepto con su punto de color, importe en negrita alineado a la derecha con cifras tabulares. Los abonos (importe negativo) en verde con "−" tipográfico. Edición inline al hacer clic; menú "···" al final con Dividir, Duplicar, Borrar.
9. **Fijos como checklist**: círculo negro con check si está cobrado; círculo con borde coral y el texto "día 1, aún no" si está pendiente y su día ya pasó; borde gris si aún no toca. Importe en gris hasta que se cobra. Al marcar cobrado, el círculo se rellena con una animación de 160 ms.
10. **Copy con gracia, sin pasarse**: frases cortas, en segunda persona, con datos. Nunca signos de exclamación, nunca emojis, nunca mayúsculas.

## Navegación

Barra superior sobre el fondo, sin caja: el nombre "gastos" en negrita con el punto final en coral, y las secciones como texto (Mes · Año · Analítica · Conceptos · Importar); la activa con subrayado de 2 px negro. Ajustes y el candado a la derecha como iconos. En móvil, barra inferior con las cinco secciones (icono + texto de 11 px) y Ajustes en un menú.

## Pantalla Mes

Reproducir el HTML. Detalles que el HTML no muestra:
- Selector de mes: las flechas ‹ › a los lados del nombre del mes dentro del bloque principal; el nombre del mes abre un desplegable de mes/año; "Ir a hoy" solo aparece si no estás en el mes actual.
- El bloque principal cambia de color según el estado: **lima** si vas bien, **ámbar suave (`#FFF1D6`)** si el ritmo es alto pero aún queda, **coral suave** si ya te has pasado. Es la única "alarma" de la pantalla: sin rojos sueltos en ningún otro sitio.
- "Dinero en cuenta": un enlace pequeño "Anotar el saldo del banco" en la esquina inferior derecha del bloque principal; si tiene valor, "Saldo en cuenta 826 €" y la diferencia con lo que queda.
- Barra de progreso del bloque principal: el relleno es el gasto sobre la nómina; la marca vertical es la posición de hoy en el periodo. Si el relleno pasa la marca, la frase cambia a la de "cuidado".
- El bloque Fijos muestra un punto por fijo (máximo 20; si hay más, agrupa); los puntos se ordenan por día previsto. Tocar el bloque lleva a la lista de fijos.
- El bloque Extras: barritas por día del periodo; las que superan el doble de la media en lavanda intenso; frase con el concepto que más pesa.
- El bloque Ahorro real: porcentaje de la nómina que queda; frase según el objetivo.
- Escritorio: rejilla tal cual el HTML (1,6 fr / 1 fr / 1 fr arriba; 1,6 fr / 1 fr abajo). Móvil: todo en una columna, bloque principal primero, alta rápida como botón negro flotante que abre una hoja desde abajo.

## Resto de pantallas (aplicar las 10 reglas)

- **Año**: la matriz concepto × mes dentro de un único bloque blanco, cifras tabulares, líneas finas, sin bandas alternas; encima, tres bloques de color con el total del año, la media mensual y el mejor/peor mes con su frase. Cada fila de concepto con su punto de color.
- **Analítica**: mismos bloques; gráficos con los colores de categoría; los años superpuestos se distinguen por intensidad del mismo color; sin leyendas si el título ya lo dice; sin rejillas verticales.
- **Análisis del mes**: se fusiona dentro de Mes como una sección desplegable "Ver análisis" bajo los bloques (tarta plana con los colores de categoría, 50/30/20 como tres barras horizontales con la marca del ideal). Eliminar la entrada "Análisis" del menú.
- **Conceptos**: lista de filas con punto de color (clic en el punto para cambiarlo), arrastrar para ordenar, plantilla de fijos como filas con día e importe editables inline.
- **Importar → Extracto**: la revisión hereda el sistema. Bloque "Sin clasificar" con fondo ámbar suave (es trabajo, no error); etiquetas de origen (regla / aprendida / IA) como chips grises en tres intensidades; las filas exactamente como las de Movimientos.
- **Ajustes**: pestañas de texto con subrayado negro; cada bloque como tarjeta blanca con título y una frase de ayuda.
- **PIN**: fondo lima, "gastos." grande, teclado numérico de círculos blancos; los puntos del PIN se rellenan en negro.
- **Modo oscuro**: no en esta fase.

## Cómo trabajar

1. Abre `referencia-mes.html`, haz una captura a 1120 y a 390 px y guárdalas como objetivo. Entrega un plan de una página: tokens (copiados del HTML), componentes a crear o reescribir, orden. Espera mi confirmación.
2. Implementa en este orden, dejando la app arrancable al final de cada paso: tokens y fuente → navegación → pantalla Mes → Importar/revisión → Año → Analítica → Conceptos y Ajustes → PIN.
3. Tras la pantalla Mes, haz una captura a 1120 y a 390 px y **compárala lado a lado con la referencia**. Enumera cada diferencia y corrígela antes de seguir. No pases de pantalla con diferencias pendientes.
4. Elimina todo el CSS del diseño anterior. No debe quedar ninguna sombra, ningún fondo amarillo de "pendiente", ninguna etiqueta en mayúsculas, ningún formulario visible en reposo.
5. No te detengas entre pasos salvo para el plan inicial o si necesitas una decisión mía. Si algo de este documento no lo implementas, dilo explícitamente en el resumen final en lugar de omitirlo.
