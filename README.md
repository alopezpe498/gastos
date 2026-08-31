# Gastos

Gestión de gastos domésticos para uso familiar. Sustituye la hoja de Excel que
llevamos años usando: los mismos conceptos, los mismos números y la misma forma
de trabajar, pero sincronizada entre el ordenador y el móvil.

Aplicación web instalable (PWA). Los datos viven en un SQLite en el servidor, no
en el navegador, así que se ven igual desde cualquier dispositivo.

**Fases 1, 2 y 3.** Lo que hay ahora: el mes en curso, el análisis del mes, la
visión anual, la analítica del histórico, el catálogo de conceptos, la
importación de las hojas del Excel —con ayuda opcional de IA—, la lectura de
fotos, textos pegados y facturas en PDF, los informes imprimibles y los ajustes.
Al final de este documento está lo que viene después.

---

## Cómo funciona

Cada mes tiene tres cosas:

**Gastos fijos.** Los que se repiten: hipoteca, comunidad, seguros, colegio de
las niñas… Cada uno tiene un día y un importe previstos. Al abrir un mes se
generan solos, **pendientes de cobro**, y durante el mes se van marcando según
los cobran, corrigiendo el importe cuando no coincide.

**Gastos variables.** Los apuntes sueltos: JustEat, Amazon, farmacia, gasolina.
Se eligen de un catálogo cerrado que se puede ampliar. **Pueden ser negativos**:
una devolución es un gasto negativo.

**La comida es un sobre**, no un recibo: un presupuesto mensual del que se va
tirando. La aplicación enseña lo gastado y lo que queda.

Aparte, dos cifras que se copian a mano cada mes: la **nómina** y el **dinero en
cuenta** que dice el banco.

Y una que no es un gasto: el **ahorro**, que es un objetivo —lo que gustaría
apartar— y se compara con el sobrante que queda de verdad.

### Los números

```
fijos     = apuntes de conceptos 'fijo' (sin el objetivo de ahorro)
extras    = apuntes de conceptos 'variable'
comida    = el sobre: su presupuesto, o lo gastado, según Ajustes
gastos    = fijos + extras + comida
sobrante  = ingresos − gastos
```

El **50/30/20** compara, sobre los ingresos: lo `necesario`, lo `prescindible` y
el ahorro (que es el sobrante). Los porcentajes ideales se cambian en Ajustes.

---

## Puesta en marcha

Hace falta **Node 22** (hay un `.nvmrc`).

```bash
npm install
npm run dev
```

Arranca las dos piezas a la vez:

- el backend en `http://127.0.0.1:3003` (o el puerto de `PORT`),
- el frontend en `http://localhost:5185`, que hace de proxy de `/api`.

La primera vez se crea `server/data/gastos.db` con el catálogo de conceptos ya
sembrado (los fijos, la comida como sobre, el ahorro como objetivo y los
variables de siempre).

En desarrollo no hace falta PIN: si no defines `APP_PIN`, la aplicación arranca
sin protección y lo avisa por consola.

| Orden | Qué hace |
| --- | --- |
| `npm run dev` | Backend y frontend, con recarga. |
| `npm run build` | Comprueba tipos y construye el frontend en `dist/`. |
| `npm start` | Solo el servidor. En producción sirve también `dist/`. |
| `npm test` | Las tres suites de pruebas. |
| `npm run copia-bd` | Copia de seguridad con fecha de la base de datos. |
| `npm run iconos` | Regenera los iconos PNG de la PWA. |
| `npm run typecheck` | Solo los tipos. |

---

## Las pantallas

### Mes

Lo primero es el cuadro resumen: ingresos, gastos, sobrante y dinero en cuenta,
y debajo el desglose en fijos, extras, comida y ahorro. **Los ingresos y el
dinero en cuenta se editan escribiendo encima**; el resto son consecuencia de
los apuntes.

Después, el sobre de la comida con su barra: pasa a ámbar al acercarse al
límite y a rojo al pasarse.

En **escritorio**, dos columnas: los fijos a la izquierda y los variables a la
derecha, con el alta rápida arriba. En **móvil**, tres pestañas (Fijos,
Variables, Resumen) y un botón flotante para apuntar un gasto desde cualquiera
de ellas.

Los fijos van ordenados por día previsto, como en el Excel. Los pendientes
llevan una banda ámbar a la izquierda —el amarillo de las casillas del Excel— y
se marcan con un toque en su casilla, que pone la fecha de hoy.

**Nada tiene botón de guardar.** Se escribe encima y se guarda al salir del
campo o al pulsar Intro; Escape deshace.

#### Moverse por los meses

Al entrar se abre el mes de hoy si existe; si no, el último que haya. Para
moverse, las flechas o los dos desplegables de mes y año, y el botón **Ir a hoy**
para volver de un salto.

**Se puede ir a cualquier mes**: a los importados del Excel, y también hacia
delante, a meses que todavía no existen. Pasar por delante de un mes no lo crea:
si no existe, la pantalla lo dice y ofrece **«Abrir este mes»**. Al abrirlo se
crean también los que quedaran por medio —si lo último era junio y se abre
septiembre, julio y agosto pasaron y sus recibos se cobraron—, y la pantalla
avisa de cuáles. **«Abrir mes siguiente»** está en la cabecera como atajo,
mientras ese mes no exista.

Al abrir un mes se copia la plantilla: todos los fijos activos, pendientes de
cobro, con su importe previsto vigente para ese mes, más la nómina prevista y el
presupuesto de comida. **«Abrir mes siguiente» avisa si ese mes ya existía** en
vez de no hacer nada.

#### El sobre de la comida

Con el criterio **«cuenta por el presupuesto»** (el de siempre, el del Excel), la
comida aporta a los gastos del mes **el presupuesto o lo gastado, lo que sea
mayor**: el sobre se reserva entero aunque no se agote, pero **pasarse es un
gasto**. Con 500 € de presupuesto y 620 € gastados, el mes suma 620.

Con el criterio **«cuenta por lo gastado»**, siempre lo gastado.

La regla vive en una sola función (`comidaQueCuenta`) y la usan el resumen del
mes, la tabla anual, el análisis, la analítica, los informes y la exportación,
para que todas las pantallas den el mismo número. En la barra del sobre, al
pasarse pone **«Te has pasado 120 €»** en rojo, no «Queda 0 €».

#### Regenerar y reiniciar

Un mes se monta con la plantilla del día en que se abre, y ahí se queda: si
después sube la hipoteca, el mes en curso sigue con el importe viejo. En el menú
del mes (el botón de la cabecera) hay dos formas de ponerlo al día.

**Regenerar desde la plantilla** vuelve a aplicarla sin perder nada. Enseña antes
un resumen de lo que va a pasar, y manda una sola regla: *lo que ya ha pasado no
se toca*.

| | Qué le pasa |
| --- | --- |
| Un fijo **cobrado** | Nada. Es un hecho: se cobró esa cantidad ese día. |
| Un fijo **pendiente** | Se le actualiza el previsto, el día y el importe. |
| Un fijo de la plantilla que **falta** | Se añade, pendiente. |
| Un fijo que **ya no está** en la plantilla | Se queda donde está. |
| Un gasto **variable** | Nada, nunca. Lo ha escrito una persona. |

Aparte, ofrece actualizar el **ingreso**, el **presupuesto de comida** y el
**objetivo de ahorro** con los valores por defecto. Los tres vienen apagados: el
presupuesto de comida se ajusta a mano a menudo («este mes viene una comunión») y
venir a actualizar los fijos no puede llevárselo por delante.

**Reiniciar el mes** es el martillo: borra todos los apuntes —cobros marcados y
gastos variables incluidos— y lo genera de nuevo desde cero. Pide dos
confirmaciones y dice cuántos variables se van a perder. El ingreso, el dinero en
cuenta y las notas se conservan.

También **deshace las importaciones de extracto de ese mes**, así que el mismo
archivo se puede volver a subir. La confirmación lo dice.

**Borrar el mes** lo elimina por completo: apuntes, importaciones y el propio
mes. Dos confirmaciones, y no se puede deshacer: hay que volver a abrirlo desde
la plantilla.

> **Un mes cerrado** se puede seguir editando apunte a apunte, pero no se puede
> regenerar ni reiniciar: las dos opciones salen apagadas hasta reabrirlo, desde
> ese mismo menú.

### Análisis

La tarta del reparto del mes, el peso de los fijos principales, el 50/30/20 con
su semáforo y el ranking de variables de mayor a menor.

En el 50/30/20, cada barra lleva una marca vertical en su porcentaje ideal: se
ve de un vistazo si el bloque se ha pasado o se ha quedado corto. El semáforo
nunca va solo; al lado están siempre el porcentaje real y el ideal.

### Año

La hoja anual del Excel, tal cual: conceptos en las filas, meses en las
columnas, y al final el total del año y la media mensual. La fila «Otros»
agrupa los variables y se despliega para ver el desglose por concepto.

En escritorio la primera columna se queda fija al desplazarse. **Al pulsar una
celda se va a ese mes.** En móvil, donde una tabla de doce columnas no se lee,
se elige un concepto y se ven sus doce meses en vertical.

### Analítica

Cinco vistas sobre todo el histórico, con un **selector de rango** en la
cabecera que manda sobre todas: un año, los últimos 12 o 24 meses, todo, o un
rango libre.

- **Evolución** — un concepto (o una agrupación: todos los fijos, la comida, los
  gastos totales…) mes a mes, con la línea de la media del rango y, si el
  concepto tiene previsto, también la del previsto para ver desvíos. Con varios
  años se pueden **superponer**: una línea por año sobre el eje enero–diciembre.
- **Años** — cada concepto, con su total de cada año y la variación. Se ordena
  por importe o por variación; en rojo lo que sube más de un 10 %, en verde lo
  que baja. El selector «hasta el mes N» compara años incompletos con los mismos
  meses del anterior, que si no un año a medias parece más barato.
- **Reparto** — en qué conceptos se va el dinero, el reparto entre necesario,
  prescindible y ahorro, cómo cambia esa proporción mes a mes, y el ranking de
  variables con su **ticket medio**: para ver si algo cuesta caro por muchos
  gastos pequeños o por pocos grandes.
- **Ahorro** — el sobrante de cada mes en barras (verde arriba, rojo abajo) con
  el acumulado encima, y el 50/30/20 agregado por año.
- **Meses** — en qué meses se dispara cada cosa. Un mapa de calor concepto × mes
  en el que **cada fila se colorea contra su propio máximo**: así se ve que los
  regalos se disparan en diciembre aunque la hipoteca sea diez veces mayor todos
  los meses.

Los gráficos son SVG escrito a mano, sin librería. La aplicación entera pesa
menos de 100 KB comprimidos, y una librería de gráficos pesaría más que eso ella
sola además de traer su propio sistema visual.

> **Un mes sin datos es un hueco, nunca un cero.** Las líneas se cortan, las
> barras no se dibujan y las medias dividen solo entre los meses que existen.

### Informes

Botón **Informe** en el análisis del mes y en la visión anual. Abre una hoja
limpia, sin navegación, y con «Imprimir o guardar en PDF» sale el PDF por el
diálogo del navegador. En papel va en negro sobre blanco, con la cabecera de
cada tabla repetida en cada página.

### Conceptos

Dos pestañas sobre el mismo catálogo.

#### Conceptos

Se crean, se ordenan arrastrando, se activan y se desactivan, y se les cambia el
tipo y la clasificación.

Para los fijos, el **día y el importe previstos tienen histórico**: al cambiar
el importe se crea una entrada nueva vigente desde el mes que elijas (por
defecto, el siguiente). Los meses ya abiertos conservan lo que costaba entonces,
y por eso al guardar avisa de cuántos meses abiertos siguen con el importe
anterior, con un enlace a cada uno para regenerarlo.

Cada concepto puede tener **otros nombres**: las grafías con las que aparece
escrito en el Excel. Sin ellos, cada importación crearía un «Gimasio» al lado
del «Gimnasio».

> Un concepto con apuntes **no se puede borrar**, solo desactivar: borrarlo
> cambiaría meses ya cerrados.

#### Plantilla

Lo que costará un mes antes de que pase nada: la hoja de la que sale cada mes
nuevo. Arriba del todo, **desde qué mes se está mirando** —por defecto, el que
viene—, y eso manda sobre toda la pantalla: lo que se ve es lo que valdrá ese
mes, y lo que se cambie se guarda vigente **desde** ese mes, sin tocar lo
anterior. Si un importe se arrastra de antes, la fila lo dice («desde Enero de
2026»).

Una tabla con los **fijos activos**, editable escribiendo encima: orden (se
arrastra la fila), concepto, día, importe previsto y clasificación. El botón del
reloj abre el **histórico** de ese concepto, con lo que ha costado cada
temporada, y permite borrar una entrada suelta.

Debajo, los tres **valores del mes** con los que nace un mes nuevo:

- **Nómina prevista** — el ingreso. Si se deja vacía, cada mes hereda la del
  anterior, como antes de que la plantilla existiera.
- **Presupuesto de comida** — el sobre.
- **Objetivo de ahorro** — lo que se quiere apartar. No es un gasto: no resta.

Y al pie, la cuenta de la vieja: **ingreso previsto − fijos − comida =
sobrante previsto**. Sin nómina prevista no hay resta, así que pone «—» y no un
cero, que sería mentira.

> Cambiar la plantilla **no mueve los meses ya abiertos**: se quedaron con la
> foto de cuando se abrieron. Para ponerlos al día, «Regenerar desde la
> plantilla» en el menú del mes.

### Importar

Una entrada propia del menú, con tres pestañas. Aquí vive todo lo que es una
**acción**; en Ajustes solo queda lo que se configura.

#### Extracto del banco

La pestaña por defecto. También se llega desde el botón **Importar extracto** de
la pantalla del mes, que abre esta pestaña con **ese mes ya elegido** y el foco
puesto en «Elegir archivo». Es la función para la que existe el resto: cada mes subes el
extracto y en un par de minutos el mes está hecho.

Admite el `.xls` que da el banco, `.xlsx`, `.csv`, o una tabla copiada de la web
del banco y pegada. Eliges el mes destino y **nada se guarda hasta que aceptas**.

> **El extracto define el mes.** El mes de esta casa no es el del calendario:
> empieza el día que se cobra la nómina y acaba el día antes de la siguiente. El
> extracto se descarga justo entre las dos, así que **todo lo que trae pertenece
> al mes**. No hay filtrado por fechas: un recibo del 31 de julio es de agosto si
> viene en el extracto de agosto.

#### La revisión

Arriba, pegado a la pantalla, la cabecera se explica sola:

```
Agosto 2026 · del 29/07 al 26/08 · nómina 3.124,21 €
Quedan 18 sin clasificar; cuando estén todos, Aceptar los mete en Agosto.

71 movimientos = 20 fijos + 10 comida + 10 variables + 1 ingreso + 30 sin clasificar
```

**Aceptar está bloqueado mientras quede uno sin clasificar**, dice cuántos
faltan, y un clic lleva al primero. Esa es toda la garantía: de un extracto no
se puede perder nada por el camino.

Debajo, los bloques:

- **Sin clasificar**, arriba y resaltado, que es donde se trabaja. La fila
  enseña lo justo: casilla, fecha, descripción limpia con la original debajo en
  gris, importe, desplegable de conceptos y un menú **«···»** con *Recordar*,
  *Dividir* y *Descartar*.

  Al clasificar una, **no desaparece**: se mueve al bloque que le toca con un
  resaltado de dos segundos, el contador de arriba baja, y hay cinco segundos
  para **deshacer** (o `Ctrl+Z`). Si hay más movimientos con la misma
  descripción, se clasifican solos.

  **La IA se pide sola** al abrir la revisión, en una única llamada con todo lo
  que las reglas no han reconocido. Su propuesta aparece **ya puesta en el
  desplegable** con una etiqueta lila; un clic la confirma, y al pasar el ratón
  se lee por qué. El botón «Pedir ayuda a la IA» queda solo para reintentar.

  **Recordar** crea la regla para el mes que viene. Para las descripciones sin
  nombre fijo —un pago por móvil llega como `13AUG B7DG2ZYM-Barcelona`, con un
  código distinto cada vez— propone una **expresión regular** en vez de un texto
  que no se repetirá, y dice **cuántos movimientos de este mismo extracto
  encajarían** antes de crearla.

- **Variables y comida**, por importe, con una etiqueta de color según de dónde
  salió la asignación: verde regla, azul aprendida, lila IA.
- **Fijos**: informativo, sin botones. Concepto, previsto, real, diferencia y
  qué va a pasar. Debajo, **«Actualizar la plantilla con estos importes»** con
  una casilla premarcada por cada fijo cuyo importe real difiera del previsto;
  al aceptar, los marcados pasan a la plantilla desde el mes siguiente.
- **Duplicados y descartados**, plegados y recuperables, con un **«Forzar
  todos»** además del botón por fila. Si el extracto entero ya se había
  importado, la cabecera lo dice —*«Este extracto ya se importó en Agosto 2026 el
  29/08»*— con un enlace al historial para deshacer aquella importación.

Con selección múltiple, buscador, y el borrador se guarda solo: puedes cerrar y
volver mañana. En escritorio las flechas mueven por lo pendiente y **D**
descarta.

> **La nómina va al ingreso del mes**, no crea un apunte. Cualquier otro abono
> —una devolución, un Bizum recibido— **entra como gasto variable en negativo**:
> nunca se omite nada.

Debajo, el **historial de importaciones de ese mes** con su botón de deshacer, y
un enlace discreto **«Ver reglas»** que lleva a `Ajustes → Reglas`.

#### Excel histórico

Las hojas anuales de Cuentas20XX, que es lo que se hace una vez al empezar.

#### Copia de seguridad

Descargar todo en JSON (la copia completa) o en Excel (una hoja por año, con el
mismo formato de siempre, así que se puede volver a importar).

#### Deshacer

Toda importación se deshace entera, desde el historial: borra lo que creó,
devuelve los fijos a pendiente con su importe previsto y deja el mes exactamente
como estaba. Las reglas que aprendiste se quedan.

### Ajustes

Solo configuración, en cuatro pestañas: **General** (los porcentajes del
50/30/20, cómo cuenta la comida, los grupos de fijos del análisis y el PIN),
**Inteligencia artificial**, **Reglas de clasificación** y **Formato del banco**.

#### Reglas de clasificación Cómo se reconoce cada movimiento del banco: un texto, un
concepto, y **el orden**, que manda tanto como el texto porque gana la primera
regla que encaja. Se reordenan arrastrando.

Cada regla dice además **cómo encaja**: *empieza palabra* (la normal: la regla
`AUTOPISTA` tiene que pillar el `AUTOPISTAS` que escribe el banco) o *palabra
completa*, que hace falta para las cortas — sin ella, `BAR` encaja dentro de
BARCELONA y se lleva medio extracto.

**Probar** es el botón importante: pegas una descripción y te dice qué regla
gana, a qué concepto va y cuántas se han descartado antes. Si no encaja ninguna,
te ofrece crear la regla ahí mismo.

Abajo, las **propuestas**: las reglas aprendidas al revisar un extracto, para
confirmar o rechazar. Y exportar e importar las reglas en JSON.

#### Formato del banco

Cómo se lee el fichero: columnas, texto que delata la cabecera, separador
decimal y los trozos que se quitan de la descripción. Con un **«Probar con un
archivo»** que enseña las diez primeras filas ya interpretadas, que es la única
forma de saber si el formato está bien sin importar de verdad.

---

## Importar del Excel

En **Importar → Excel histórico**. Tres pasos: se sube el libro `.xlsx`, se
elige la hoja anual y **se ve exactamente lo que va a entrar antes de tocar
nada**.

### Qué espera encontrar

El formato de las hojas anuales de siempre (`Cuentas2024`, `Cuentas2025`…):

```
fila 4    B=Enero  C=Enero  D=Febrero  E=Febrero  …  X=Diciembre  Y=Diciembre
fila 5    A=Telf BCN   C=44   E=44   G=44 …        Z=total anual  AA=media
…
fila 19   A=Otros      ← suma de los variables del mes
fila 20   A=Gastos
fila 21   A=Ingresos
fila 22   A=Ahorro     ← el saldo del mes
…
fila 43+  B=Prestamo C=300   D=Prestamo E=355,58 …  ← detalle de variables
```

Tres cosas del formato real que conviene saber, porque son las que hacen que el
parser sea como es:

1. **Cada mes ocupa dos columnas** y el nombre del mes está en las dos. El
   importe de los fijos va en la **segunda**; la primera solo se usa abajo, en
   el detalle de variables, donde el par es (concepto, importe).
2. **«Ahorro» aparece dos veces**: como concepto fijo y como fila de saldo al
   final. Se distinguen por posición: el saldo es el que va detrás de
   «Ingresos».
3. **Los fijos cambian de un año a otro** (2024 tiene «Piso Vinaros» y no
   «Gatos»; 2026 tiene «Gimasio» y no «Ahorro»), así que el bloque de fijos se
   reconoce por posición —de la cabecera hasta «Otros»— y nunca por una lista
   de nombres.

### Qué hace con lo que encuentra

- Los conceptos que no existan **se crean**, y salen listados en la vista previa
  para poder mandarlos a uno que ya exista. Ese mapeo **se recuerda** como
  alias.
- Los fijos entran **cobrados**, con fecha en su día previsto (o el día 1).
- Los variables se fechan el **día 1**: el Excel solo guarda el mes.
- La fila «Otros» **no se importa**, se recalcula. Si no cuadra con la suma de
  sus apuntes se avisa y se ofrece crear un apunte «Ajuste importación» por la
  diferencia.
- «Comida» pasa a ser el presupuesto del mes.
- Los meses importados quedan **cerrados**.
- Reimportar un año pide confirmación explícita y **sobrescribe**, no duplica.

### Lo que la vista previa avisa

- Celdas que son fórmulas y el archivo no guarda su resultado: se importan
  vacías, no como cero.
- El **ahorro dentro de la fila «Gastos»**. La hoja lo suma ahí; aquí el ahorro
  es un objetivo, no un recibo, así que el total calculado sale más bajo en esa
  misma cantidad. No es un fallo.
- Nombres que salen en el detalle de variables pero que aquí son un **concepto
  fijo** (pasa con «Gatos»). Ese importe se suma a su concepto en vez de a
  «Otros»: el total del mes es el mismo, pero las dos filas no salen igual que
  en la hoja.
- Meses cuyo total calculado no coincide con la fila «Gastos» por cualquier otro
  motivo.

---

## La IA (opcional)

En **Ajustes → Inteligencia artificial**: proveedor (Anthropic u OpenAI),
modelo, clave y un botón para **probar la conexión**. La clave se guarda en el
servidor y nunca llega al navegador; en la aplicación solo se ve enmascarada.

**Sin clave, todo lo demás funciona igual.** Lo único que desaparece son las
sugerencias y la lectura de fotos y PDF.

Tres reglas que cumple todo lo que usa IA:

1. **Nunca escribe sola.** Todo pasa por una pantalla de revisión donde se
   corrige el concepto, el importe y la fecha, y se descarta lo que sobre.
2. **Lo que propone se valida contra el catálogo.** Un concepto inventado se
   descarta; uno que no existe se marca como nuevo y hay que decidirlo a mano.
3. **El lector de hojas manda.** La IA solo entra donde el parser no llega.

### Qué hace

**Proponer a qué concepto va cada nombre nuevo al importar.** «Amazn» → Amazon,
«Gimasio» → Gimnasio, «Loteria/Qui» → Lotería/Quinielas. Las sugerencias salen
preseleccionadas y marcadas con su nivel de confianza, pero hay que confirmarlas.
Lo que se acepte se guarda como alias y la próxima importación ya no pregunta.

**Leer una hoja que el lector no reconoce.** Si el formato no es el de las hojas
anuales (la del mes en curso, por ejemplo), el error ofrece «Probar a leerla con
IA» y el resultado pasa por la misma vista previa de siempre.

**Apuntar desde una foto, un texto pegado o un PDF.** Desde el botón de alta
rápida del mes:

- **Foto de un ticket** — se propone **un solo apunte** de Comida con el total,
  con un botón para desglosarlo por productos si hace falta. Un ticket de
  cuarenta líneas en el historial no dice nada que no diga el total.
- **Factura en PDF** — la del comedor, la de la luz, la del gimnasio. El
  servidor le **saca el texto** y lo manda como texto: sale más exacto que
  fotografiarla y gasta muchísimos menos tokens. Se propone el **total a pagar**
  en una sola línea, sin desglosar base, IVA ni conceptos internos. Un PDF
  escaneado (sin capa de texto) se detecta y se pide una foto en su lugar.
- **Pegar** — Ctrl+V sobre la zona de pegado: una captura de pantalla, una tabla
  copiada del Excel, una lista «concepto importe», o una frase suelta como
  «Amazon 63,99 y farmacia 4,72». También se pueden arrastrar imágenes y PDF.

De la captura de una hoja del mes se leen además el **ingreso** y el **dinero en
cuenta**, y el estado cobrado/pendiente de los fijos.

Los apuntes creados así quedan con `origen` `foto` o `portapapeles`, así que
siempre se sabe de dónde salieron.

---

## Copias de seguridad

**Desde la aplicación**, en Ajustes: JSON (la copia completa) y Excel (una hoja
por año, con el mismo formato que las hojas originales, así que se puede volver
a importar).

**Desde el servidor:**

```bash
npm run copia-bd
```

Deja una copia con fecha en `server/data/copias/` usando el `.backup` de SQLite,
así que **funciona con el servidor en marcha**: no hay que pararlo. Guarda las
30 últimas y va borrando las viejas (se cambia con `COPIAS_A_GUARDAR`).

Para que se haga sola cada noche, en el servidor:

```bash
crontab -e
```

```cron
# Copia de la base de datos de Gastos, todos los días a las 4:10.
10 4 * * * cd /opt/gastos && /home/USUARIO/.nvm/versions/node/v22.*/bin/node pruebas/copia-bd.mjs >> /var/log/gastos-copia.log 2>&1
```

Para **restaurar**: para el proceso, sustituye `gastos.db` por la copia, borra
los `-wal` y `-shm` que hubiera, y arranca de nuevo.

---

## La base de datos

Vive en **`server/data/gastos.db`** (más los archivos `-wal` y `-shm` del modo
WAL). La carpeta `server/data/` está en el `.gitignore`: ni se sube al
repositorio ni la toca `deploy.sh`.

> **Es persistente y no se borra nunca.** Ni al arrancar el servidor (que solo
> hace `CREATE TABLE IF NOT EXISTS`), ni al reiniciar en desarrollo, ni al
> ejecutar las pruebas.

Se puede apuntar el servidor a otro archivo con **`GASTOS_DB`**, que es lo que
hacen las pruebas.

La carpeta `importaciones/` también está fuera de git: es donde dejar los `.xlsx`
con los datos reales.

### Esquema

| Tabla | Para qué |
| --- | --- |
| `conceptos` | El catálogo: nombre, tipo, clasificación, orden, si es el objetivo de ahorro. |
| `conceptos_alias` | Los otros nombres con los que aparece escrito cada concepto. |
| `plantilla_fijos` | Día e importe previstos de cada fijo, con histórico por mes. |
| `meses` | Un mes: ingreso, dinero en cuenta, presupuesto de comida, objetivo de ahorro, notas, estado. |
| `movimientos` | Los apuntes. Fijos y variables comparten tabla. |
| `reglas_clasificacion` | **Fase 3**: creada, sin uso todavía. |
| `config` | Ajustes. |

Tres decisiones que no son evidentes leyendo el esquema:

- **`movimientos.dia_previsto` se copia de la plantilla al abrir el mes.** Así
  la tabla de fijos se ordena sin rehacer la búsqueda de vigencia, y cambiar hoy
  el día previsto no reescribe el pasado.
- **`fecha_cobro = NULL` quiere decir pendiente.** No hay columna «cobrado».
- **El objetivo de ahorro vive en `meses.objetivo_ahorro`, no como movimiento.**
  Si fuera un apunte, tarde o temprano acabaría contando como gasto.

---

## Despliegue

En el servidor, la aplicación corre con **pm2** detrás de **nginx**, en el
subdominio `gastos.es-consultingdream.uk`, en el **puerto 3003** (el 3000 es
`listacompra` y el 3011 es `menusemanal`).

### Primer arranque

```bash
git clone https://github.com/alopezpe498/gastos.git /opt/gastos
cd /opt/gastos
nvm use 22
npm ci
npm run build
# Cambia APP_PIN en ecosystem.config.cjs antes de esto.
pm2 start ecosystem.config.cjs && pm2 save
```

### Actualizaciones

```bash
./deploy.sh
```

Descarta los cambios locales (`git reset --hard origin/main`), actualiza, carga
nvm, usa Node 22, instala con `npm ci`, construye y reinicia pm2.

### Variables de entorno

Se definen en el bloque `env` de `ecosystem.config.cjs`:

| Variable | Por defecto | Para qué sirve |
| --- | --- | --- |
| `PORT` | `3003` | Puerto donde escucha Express. |
| `APP_PIN` | *(sin definir)* | PIN de la familia. Sin él, la aplicación queda **sin protección**. |
| `APP_SECRET` | *(se genera solo)* | Secreto para firmar los tokens de sesión. |
| `GASTOS_DB` | `server/data/gastos.db` | Ruta de la base de datos. |
| `COPIAS_A_GUARDAR` | `30` | Cuántas copias de seguridad se conservan. |
| `ANTHROPIC_BASE_URL` | *(sin definir)* | Apunta las llamadas a Anthropic a otra pasarela. Lo usan las pruebas. |
| `OPENAI_BASE_URL` | *(sin definir)* | Lo mismo para OpenAI. |

La clave de IA **no** es una variable de entorno: se guarda en la base de datos
desde la propia aplicación, para poder cambiarla sin tocar el servidor.

### Nginx

```nginx
server {
    listen 80;
    server_name gastos.es-consultingdream.uk;

    # Redirección a HTTPS; certbot suele añadir este bloque por su cuenta.
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gastos.es-consultingdream.uk;

    ssl_certificate     /etc/letsencrypt/live/gastos.es-consultingdream.uk/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gastos.es-consultingdream.uk/privkey.pem;

    # La importación sube el .xlsx o la foto en base64. Tiene que ir a la par
    # con el límite de Express en server/index.js.
    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Importar un año entero tarda unos segundos.
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

`X-Forwarded-For` importa: Express está configurado con `trust proxy`, y sin esa
cabecera el limitador de intentos vería todas las peticiones como una sola IP y
bloquearía a toda la familia por los fallos de un único dispositivo.

Detrás de Cloudflare, con el proxy naranja activado, conviene subir también el
límite de tamaño de subida en el panel si el `.xlsx` es grande.

---

## Pruebas

```bash
npm test
```

Tres suites, cada una en su proceso:

| Suite | Qué cubre |
| --- | --- |
| `pruebas/calculos.mjs` | Sobrante, sobre de la comida, 50/30/20, peso de los fijos, ranking, orden de las listas y matriz anual. Sin servidor: `calculos.js` es puro. |
| `pruebas/api.mjs` | PIN y limitador, catálogo, la plantilla y sus valores, apertura de meses, navegación sin crear, regenerar y reiniciar, apuntes, cobros, visión anual, ajustes y exportación. |
| `pruebas/importacion-excel.mjs` | El parser y la importación contra un libro generado con el formato real, y la ida y vuelta exportar → importar. |
| `pruebas/ia.mjs` | Todo lo que usa IA, contra un proveedor **simulado**: sugerencias, hoja libre, ticket, texto, factura en PDF y los fallos del proveedor. |
| `pruebas/extracto.mjs` | El parser con un extracto de ejemplo calcado del real, el periodo que define el mes, la nómina al ingreso, los abonos en negativo, el orden de las reglas, conciliar y actualizar fijos, la propuesta de plantilla, las reglas por expresión regular, duplicados, dividir, la validación de cuentas y deshacer. |
| `pruebas/analitica.mjs` | Las agregaciones, y sobre todo los huecos: que un mes sin datos valga `null` y que las medias no dividan entre meses que no existen. |

**Nunca tocan la base de datos de desarrollo.** Cada suite levanta su propio
servidor en el puerto 3098 con `GASTOS_DB=server/data/test-<suite>.db`, que crea
al empezar y borra al terminar. `pruebas/entorno.mjs` aborta la ejecución si
alguien apunta una prueba a `gastos.db`, y el lanzador compara el tamaño y la
fecha del archivo antes y después: si hubieran cambiado, falla.

El libro de pruebas lo genera `pruebas/fixtures/hojaEjemplo.mjs`, que reproduce
el formato real **con sus rarezas puestas a propósito**: las dos columnas por
mes, el «Ahorro» duplicado, las etiquetas sueltas entre bloques, un importe
negativo, una fórmula sin resultado guardado y un mes en el que la fila «Otros»
no cuadra. La factura de prueba la genera `pruebas/fixtures/facturaEjemplo.mjs`,
que escribe un PDF con capa de texto sin depender de nada. **No hay datos reales
en el repositorio.**

La IA se simula en `pruebas/mock-ia.mjs`, un servidor que habla el protocolo de
OpenAI y al que el servidor se apunta con `OPENAI_BASE_URL`. Así se prueba la
tubería entera sin gastar clave y, sobre todo, sin depender de que un modelo
conteste hoy lo mismo que ayer. Lo que se comprueba no es que el modelo acierte
—eso no se puede probar— sino que **la aplicación se defiende de lo que
devuelva**: conceptos inventados, filas de totales, importes ilegibles,
respuestas cortadas y errores del proveedor.

---

## Estructura del proyecto

```
server/
  index.js              arranque de Express, estáticos y manejo de errores
  lib/                  ayudas HTTP, fechas, autenticación por PIN
  db/                   esquema, semilla y acceso a datos, un módulo por entidad
  services/
    calculos.js         TODOS los números del mes salen de aquí
    analitica.js        las agregaciones del histórico
    aperturaMes.js      abrir un mes y generar sus fijos
    plantilla.js        la hoja de la que sale cada mes nuevo
    lecturaXls.js       lector propio de .xls (OLE + BIFF): exceljs no lee ese formato
    lecturaExtracto.js  el fichero del banco -> movimientos
    reglas.js           que regla reconoce un movimiento (la usan clasificar y "Probar")
    clasificacionExtracto.js  repartir el extracto entre los conceptos
    aplicarExtracto.js  aceptar y deshacer, en una transaccion
    iaExtracto.js       una sola llamada para lo que ninguna regla reconoce
    regenerarMes.js     volver a aplicar la plantilla sin pisar lo ya cobrado
    lecturaExcel.js     leer una hoja anual (solo lee, no decide)
    lecturaPdf.js       sacar el texto de una factura en PDF
    importacionExcel.js vista previa e importación
    ia.js               el único punto que habla con Anthropic u OpenAI
    iaImportacion.js    sugerencias de concepto y lectura de hojas con IA
    iaCaptura.js        tickets, facturas, capturas y textos pegados
    exportacion.js      JSON y Excel
  routes/               rutas HTTP, una por área
  data/                 la base de datos (fuera del repositorio)
pruebas/
  entorno.mjs           levanta un servidor con su propia base de datos
  ejecutar.mjs          lanza las suites y comprueba que gastos.db no cambia
  reparto.mjs           pagado, comprometido y libre, con el caso que falló
  interfaz.mjs          pulsa la aplicación de verdad en un navegador
  copia-bd.mjs          copia con fecha, con rotación
  fixtures/             el libro de ejemplo con el formato real
src/
  lib/                  cliente de API, tipos, formato español, colores
  components/ui/        la caja de componentes: TODO lo visual sale de aquí.
                        Ninguna pantalla escribe CSS ni HTML nativo suelto; si
                        le falta algo, se añade a la caja y se reutiliza.
                        En desarrollo, `#kit` las enseña todas juntas.
    graficos/           líneas, barras, área apilada, mapa de calor, sparkline
  features/
    auth/               pantalla del PIN
    mes/                el mes en curso, sus bloques y el análisis plegado
    anual/              matriz (escritorio) y vista por concepto (móvil)
    analitica/          evolución, años, reparto, ahorro y estacionalidad
    informe/            la hoja imprimible del mes y del año
    conceptos/          catálogo, ficha y plantilla
    ajustes/            cálculo, IA, importación, exportación y PIN
  styles/               tokens.css (los valores), kit.css (la caja) y alias.css
                        (nombres viejos, solo puede encoger)
disenio/                las referencias visuales aprobadas
```

---

## Lo que viene después

- **Fase 3** — importar el extracto del banco (CSV/Excel) con clasificación
  automática por reglas aprendidas y detección de fijos ya cobrados.
- **Fase 4** — simulación de mínimos, presupuestos de Navidad y vacaciones, y
  conexión con `listacompra` y `menusemanal`.

El modelo de datos ya lo admite: `movimientos.origen` tiene reservado el valor
`extracto` y la tabla `reglas_clasificacion` está creada, sin uso todavía.
