# API de Gastos

API REST sobre HTTP. Todo va en JSON, en UTF-8, y todos los textos —incluidos
los mensajes de error— están en castellano.

Base: `/api`. En desarrollo, `http://127.0.0.1:3003/api`. En producción,
`https://gastos.es-consultingdream.uk/api`.

Esta documentación existe porque las otras aplicaciones de la casa
(`listacompra`, `menusemanal`) van a consumir esta API en fases posteriores.

---

## Autenticación

Si el servidor arranca con la variable `APP_PIN` definida, **todo lo que cuelga
de `/api` salvo `/api/auth*` exige un token**:

```
Authorization: Bearer <token>
```

El token se obtiene con el PIN de la familia, dura 365 días y va firmado con
HMAC-SHA256. Un token caducado o falso devuelve `401`.

Sin `APP_PIN`, la aplicación arranca sin protección y lo avisa por consola.

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/auth/estado` | `{ protegido: boolean }`. Se puede llamar sin token. |
| `POST` | `/auth` | `{ pin }` → `{ token, protegido }`. Sin token. |
| `GET` | `/auth/comprobar` | `{ valido: boolean }` para el token que se envía. |

Hay un limitador de **5 intentos fallidos cada 15 minutos por IP**. Al agotarlos
se devuelve `429` con los minutos que faltan. Detrás de nginx hace falta pasar
`X-Forwarded-For`: sin esa cabecera, los fallos de un dispositivo bloquearían a
toda la familia.

---

## Errores

Todas las respuestas de error tienen la misma forma:

```json
{ "error": "Ese mes todavia no esta abierto." }
```

| Código | Cuándo |
| --- | --- |
| `400` | La petición no se entiende (importe ilegible, fecha con otro formato, hoja de Excel que no se puede leer). |
| `401` | Falta el token o ya no vale. |
| `404` | Lo que se pide no existe. |
| `409` | El estado actual no lo permite: el mes ya estaba abierto, el concepto tiene apuntes. |
| `413` | Lo subido pasa del límite: 20 MB la petición entera, 8 MB una imagen, 12 MB un PDF. |
| `429` | Demasiados intentos de PIN. |
| `500` | Fallo no controlado. Queda en el log del servidor. |

---

## Conceptos

Un **concepto** es una categoría de gasto. Su `tipo` decide cómo se comporta:

- `fijo` — se repite cada mes; al abrir un mes se genera solo, pendiente de cobro.
- `variable` — apunte suelto que se anota a mano.
- `sobre` — presupuesto mensual del que se va tirando (la comida).

Su `clasificacion` (`necesario` | `prescindible` | `ahorro`) es lo que usa la
regla 50/30/20. `esObjetivo` marca el concepto de ahorro: no es un gasto, es lo
que se querría apartar.

| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/conceptos` | Parámetros: `?tipo=fijo\|variable\|sobre`, `?activos=1`, `?detalle=1`. Con `detalle=1` añade `plantilla`, `previstoActual`, `alias` y el número de `movimientos`. |
| `POST` | `/conceptos` | `{ nombre, tipo, clasificacion, diaPrevisto?, importePrevisto?, vigenteDesde? }`. Los fijos y los sobres crean su entrada de plantilla. |
| `PATCH` | `/conceptos/:id` | `{ nombre?, tipo?, clasificacion?, activo?, esObjetivo? }`. Marcar `esObjetivo` desmarca el anterior. |
| `DELETE` | `/conceptos/:id` | `409` si tiene apuntes: en ese caso hay que desactivarlo, no borrarlo. |
| `PUT` | `/conceptos/orden` | `{ ids: [...] }` con **todos** los conceptos en el orden nuevo. |

Los nombres se comparan normalizados (sin acentos, sin mayúsculas, sin espacios
de más): `peaje`, `Peaje` y `PEAJE` son el mismo concepto.

### Plantilla de un fijo

El importe y el día previstos tienen histórico: cambiar el importe no reescribe
los meses ya abiertos, crea una entrada nueva vigente desde el mes que se elija.

| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/conceptos/:id/plantilla` | Del más reciente al más antiguo. |
| `POST` | `/conceptos/:id/plantilla` | `{ diaPrevisto, importePrevisto, vigenteDesde }`. `vigenteDesde` es `"AAAA-MM"`. Si ya había una entrada para ese mes, se sustituye. |
| `DELETE` | `/conceptos/:id/plantilla/:entradaId` | `400` si es la única que queda. |

`diaPrevisto` es **texto libre** a propósito: hay recibos que caen varios días
(`"30,13,23"`). Para ordenar y para fechar se usa el primer número que aparezca.

### Alias

Los otros nombres con los que un concepto aparece escrito en el Excel o, en la
fase 3, en el extracto del banco.

| Método | Ruta | Notas |
| --- | --- | --- |
| `POST` | `/conceptos/:id/alias` | `{ alias }`. Si el alias ya apuntaba a otro concepto, se reasigna. |
| `DELETE` | `/conceptos/:id/alias/:aliasId` | |

---

## Plantilla

| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/plantilla?desde=AAAA-MM` | La plantilla vista desde un mes. Sin `desde`, el mes que viene. |
| `PUT` | `/plantilla/valores` | `{ desde, ingresoPrevisto?, presupuestoComida?, objetivoAhorro? }`. |

La plantilla es la hoja de la que sale cada mes nuevo. Se mira **siempre desde
un mes**, porque los importes tienen histórico en `plantilla_fijos`: la hipoteca
de enero no es la de octubre.

```jsonc
// GET /plantilla?desde=2026-10
{
  "desde": "2026-10",
  "fijos": [
    {
      "conceptoId": 2, "nombre": "Hipoteca", "orden": 1, "clasificacion": "necesario",
      "diaPrevisto": "31", "importePrevisto": 700,
      "vigenteDesde": "2026-09",  // de qué entrada sale el importe que se ve
      "heredado": true,           // ...que no es la del mes pedido: se arrastra
      "versiones": 2              // cuántas entradas tiene en el histórico
    }
  ],
  "valores": {
    "ingresoPrevisto": 3220,      // null = nunca se ha puesto
    "comida": { /* la misma forma que un fijo */ },
    "ahorro": { /* idem */ }
  },
  "resumen": {
    "cuantosFijos": 14, "totalFijos": 976.7, "presupuestoComida": 500,
    "objetivoAhorro": 0, "ingreso": 3220,
    "sobrante": 1743.3            // null si no hay nómina prevista
  }
}
```

Solo salen en `fijos` los conceptos **activos de tipo `fijo`**. El sobre y el
objetivo de ahorro van en `valores`, porque no generan movimiento: uno es un
presupuesto y el otro una intención.

**`sobrante` es `null`, nunca cero, cuando no hay nómina prevista.** La misma
regla que en la analítica: lo que no se sabe no se dibuja como un cero.

### Dónde vive cada cosa

| Valor | Dónde se guarda | Histórico |
| --- | --- | --- |
| Día e importe de un fijo | `plantilla_fijos` | Sí, por mes |
| Presupuesto de comida | `plantilla_fijos` del sobre | Sí, por mes |
| Objetivo de ahorro | `plantilla_fijos` del objetivo | Sí, por mes |
| Nómina prevista | `config.ingreso_previsto` | No |

La nómina no lleva histórico a propósito: no es un recibo, y cada mes ya guarda
su propio `meses.ingreso`. Lo que valga hoy no cambia lo que se cobró en marzo.

Para cambiar el día o el importe de un fijo se usa `POST
/conceptos/:id/plantilla` con `{ vigenteDesde, diaPrevisto, importePrevisto }`,
que crea una entrada nueva (o sustituye la de ese mismo mes) sin tocar las
anteriores. `GET /conceptos/:id/plantilla` devuelve el histórico y `DELETE
/conceptos/:id/plantilla/:entradaId` borra una entrada.

---

## Meses

| Método | Ruta | Notas |
| --- | --- | --- |
| `POST` | `/meses/asegurar` | **Abrir un mes.** `{ anio, mes }` obligatorio. Lo crea si no existía, con los que queden por medio, y devuelve el mes montado. Idempotente. |
| `GET` | `/meses` | Todos, del más reciente al más antiguo, cada uno con su `resumen`. |
| `GET` | `/meses/limites` | `{ primero, ultimo, hoy }`. Hasta dónde llega el histórico. |
| `GET` | `/meses/actual` | El mes de hoy si existe; si no, el último que haya. `null` si no hay ninguno. |
| `GET` | `/meses/abiertos` | Los meses en estado `abierto`, del más reciente al más antiguo. Es lo que avisa en Conceptos al tocar una plantilla. |
| `GET` | `/meses/por-abrir/:anio/:mes` | Qué pasaría al abrir ese mes, **sin crear nada**: `{ existe, intermedios }`. |
| `GET` | `/meses/:id/analisis` | La tarta, el peso de los fijos, el 50/30/20 y el ranking. |
| `GET` | `/meses/:id/regeneracion` | Vista previa de la regeneración: qué se añadiría, qué se actualizaría y qué se deja en paz. |
| `GET` | `/meses/:anio/:mes` | El mes completo con `fijos` y `variables`. `404` si no existe (no lo crea). |
| `POST` | `/meses` | `{ anio, mes }`. Creación explícita. `409` si ya existía. |
| `POST` | `/meses/:id/siguiente` | Atajo: abre el mes que va detrás de ese. |
| `POST` | `/meses/:id/regenerar` | Vuelve a aplicar la plantilla. `{ aplicarIngreso?, aplicarComida?, aplicarAhorro? }`. `409` si el mes está cerrado. |
| `POST` | `/meses/:id/reiniciar` | Borra todos los movimientos y regenera desde cero. Exige `{ confirmar: true }`. `409` si está cerrado. |
| `PATCH` | `/meses/:id` | `{ ingreso?, dineroEnCuenta?, presupuestoComida?, objetivoAhorro?, notas?, estado? }`. |

### Navegar no es abrir

Se puede ir a **cualquier** mes: a los importados del Excel, al de hoy y a los que
todavía no existen. Navegar **no crea nada**. El cliente pide
`/meses/:anio/:mes`; si responde `404`, pregunta a
`/meses/por-abrir/:anio/:mes` qué pasaría, y con eso pinta el botón «Abrir este
mes». Crear un mes es siempre un acto explícito de quien lo usa.

```jsonc
// GET /meses/por-abrir/2026/12
{
  "existe": false,
  "intermedios": [{ "anio": 2026, "mes": 10, "nombre": "Octubre" }]
}
```

### `/meses/asegurar`

Abre el mes que se le pida (`{ anio, mes }`, obligatorio: sin él responde `400`,
para que nadie cree un mes por descuido).

Si el mes pedido va **por delante** del último que hay, se crean también los que
quedaban por medio: si lo último es junio y se pide septiembre, julio y agosto
también existieron y sus recibos se cobraron. Hacia **atrás** solo se crea el mes
pedido: el pasado se importa del Excel, no se inventa.

```jsonc
{
  // ...el mes completo, igual que /meses/:anio/:mes
  "creados": [{ "anio": 2026, "mes": 7, "nombre": "Julio" }],
  "recortado": false
}
```

`creados` son los meses que se han creado **de paso** (nunca incluye el pedido).
`recortado` avisa de que el salto era de más de 24 meses y solo se han creado los
últimos: pedir un mes de dentro de diez años no debe generar ciento veinte meses
de fijos pendientes.

### Regenerar desde la plantilla

Un mes se monta con la plantilla del día en que se abre y ahí se queda. Si luego
sube la hipoteca o aparece un fijo nuevo, `/meses/:id/regenerar` vuelve a
aplicarla. La regla que manda:

- Un fijo **cobrado** (con `fechaCobro`) es un hecho: no se toca nunca, pase lo
  que pase con la plantilla.
- Un fijo **pendiente** es una previsión: se le actualiza el previsto, el día y
  también el importe.
- Un **variable** lo ha escrito una persona: no se toca nunca.
- Un fijo de la plantilla que **falta** en el mes se añade, pendiente.
- Un fijo que está en el mes pero **ya no está** en la plantilla se queda.

`GET /meses/:id/regeneracion` enseña antes lo que va a pasar:

```jsonc
{
  "anadir": [{ "conceptoId": 53, "nombre": "Seguro Bici", "importePrevisto": 12, "diaPrevisto": "20" }],
  "actualizar": [{ "movimientoId": 8, "nombre": "Hipoteca", "importeAntes": 622.53, "importeDespues": 700 }],
  "ignorar": [{ "nombre": "Gimnasio", "motivo": "cobrado" }],
  "variables": 3,
  "valores": {
    "presupuestoComida": { "actual": 600, "propuesto": 500, "origen": "la plantilla de Comida" }
  },
  "sinCambios": false
}
```

Los tres `valores` del mes (ingreso, presupuesto de comida y objetivo de ahorro)
**no se tocan salvo que se pidan** con `aplicarIngreso`, `aplicarComida` o
`aplicarAhorro`: el presupuesto de comida se ajusta a mano a menudo y venir a
actualizar los fijos no puede llevárselo por delante.

### Reiniciar

`/meses/:id/reiniciar` es el martillo: borra **todos** los movimientos del mes
—fijos cobrados y variables incluidos— y lo genera de nuevo desde la plantilla.
Exige `{ confirmar: true }` en el cuerpo (`400` sin él) y la interfaz pide dos
confirmaciones. El ingreso, el dinero en cuenta y las notas del mes se conservan.

### Meses cerrados

`estado` vuelve a significar algo: un mes **cerrado** se puede seguir editando
apunte a apunte, pero no se puede regenerar ni reiniciar (`409`). Se reabre con
`PATCH /meses/:id` y `{ estado: 'abierto' }`.

> **El orden de las rutas importa.** `/meses/:id/analisis` y
> `/meses/:id/regeneracion` están declaradas antes que `/meses/:anio/:mes`; al
> revés, Express haría casar `/meses/17/analisis` con la segunda y respondería
> 404.

### Qué pasa al abrir un mes

1. Se crea el mes.
2. Por cada concepto **fijo activo** se genera un movimiento **pendiente**
   (`fechaCobro: null`) con el importe y el día previstos vigentes para ese mes.
3. El **sobre** no genera movimiento: su importe pasa a `presupuestoComida`.
4. El **objetivo de ahorro** tampoco: pasa a `objetivoAhorro`.
5. El `ingreso` sale de la **nómina prevista** de la plantilla. Si no hay
   ninguna puesta, se hereda la del mes anterior. Los gastos variables **no**
   se heredan nunca.
6. `dineroEnCuenta` nace en `null`, que quiere decir «todavía no he mirado el
   banco» y no es lo mismo que cero.

### El campo `estado`

`abierto` | `cerrado`. La importación marca lo histórico como `cerrado`. Un mes
cerrado **se sigue pudiendo editar apunte a apunte**; lo que no admite es que se
le reescriba entero: `regenerar` y `reiniciar` responden `409` hasta que se
reabra con `PATCH /meses/:id`. El mes que se ve al entrar es el de hoy, no «el
último abierto».

### El resumen

```jsonc
{
  "ingreso": 3220,
  "gastos": 3317.8,
  "sobrante": -97.8,          // ingreso − gastos
  "dineroEnCuenta": null,
  "fijos": 1874.63,           // conceptos 'fijo', sin el objetivo de ahorro
  "extras": 869.38,           // conceptos 'variable'
  "comida": {
    "presupuesto": 573.79,
    "gastado": 573.79,
    "queda": 0,
    "contada": 573.79,        // lo que suma en 'gastos'
    "criterio": "presupuesto" // o "gastado", según los ajustes
  },
  "objetivoAhorro": 0,
  "fijosPendientes": { "cuantos": 3, "importe": 250.4 },
  "ahorroReal": -97.8         // = sobrante; es lo que mide el 50/30/20
}
```

`gastos = fijos + extras + comida.contada`.

---

## Movimientos

Un movimiento es un apunte. Los fijos y los variables comparten tabla: lo que
los distingue es el tipo de su concepto.

| Método | Ruta | Notas |
| --- | --- | --- |
| `POST` | `/movimientos` | `{ mesId, conceptoId, importe, fechaCobro?, descripcion? }`. Sin `fechaCobro` se pone la de hoy. |
| `PATCH` | `/movimientos/:id` | `{ conceptoId?, importe?, fechaCobro?, diaPrevisto?, descripcion? }`. `fechaCobro: null` lo devuelve a pendiente. |
| `POST` | `/movimientos/:id/cobro` | `{ fecha? }`. Sin fecha, hoy. |
| `DELETE` | `/movimientos/:id/cobro` | Lo devuelve a pendiente. |
| `DELETE` | `/movimientos/:id` | |

- **`fechaCobro === null` quiere decir pendiente.** No hay ninguna columna
  «cobrado»: se deduce de si hay fecha.
- Las fechas van siempre en ISO (`AAAA-MM-DD`). Otro formato devuelve `400`.
- Los importes **pueden ser negativos**: una devolución es un gasto negativo.
- El campo `importe` acepta número o texto en formato español (`"1.234,56"`).
- `origen` dice de dónde salió el apunte: `manual`, `excel`, y —reservados para
  la fase 3— `extracto`, `foto`, `portapapeles`.

---

## Visión anual

| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/anual` | Los años que tienen datos, del más reciente al más antiguo. |
| `GET` | `/anual/:anio` | La matriz concepto × mes. `404` si ese año no tiene meses. |

```jsonc
{
  "anio": 2025,
  "meses": [{ "numero": 1, "nombre": "Enero", "mesId": 3, "estado": "cerrado" }],
  "filas": [
    {
      "nombre": "Hipoteca",
      "tipo": "fijo",           // 'fijo' | 'sobre' | 'otros' | 'total'
      "conceptoId": 2,
      "valores": [622.53, null],// una posición por mes; null = sin datos
      "total": 7470.36,
      "media": 622.53
    }
  ],
  "detalleVariables": { "1": [{ "concepto": "Amazon", "importe": 199.89 }] }
}
```

- Un fijo **sin ningún apunte en todo el año** no genera fila. Un cero sí la
  genera: un cero es un dato.
- La fila `Otros` agrupa todos los variables; `detalleVariables` trae su
  desglose por mes.
- Las tres filas `total` son `Gastos`, `Ingresos` y `Ahorro` (el sobrante).
- La **media** se divide entre los meses que existen en ese año, no siempre
  entre doce: en un año a medias, dividir entre doce daría una media falsa.

---

## Análisis del mes

`GET /meses/:id/analisis` devuelve:

- `reparto` — los trozos de la tarta con su `porcentaje` sobre los ingresos.
- `pesoFijos` — los grupos configurados, con lo que no entra en ninguno bajo
  «Resto».
- `regla` — los tres bloques del 50/30/20, cada uno con `importe`, `porcentaje`,
  `ideal`, `cumple` y `desvio`.
- `ranking` — los variables agrupados por concepto, de mayor a menor.

Si el mes no tiene ingresos, los porcentajes vienen a `null` en vez de a
infinito, y `cumple` también es `null`.

---

## Ajustes

| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/config` | |
| `PUT` | `/config` | `{ ideales?, comidaEnTotal?, gruposFijos? }`. |

```jsonc
{
  "ideales": { "necesario": 50, "prescindible": 30, "ahorro": 20 },
  "comidaEnTotal": "presupuesto",   // o "gastado"
  "gruposFijos": [{ "nombre": "Hipoteca", "conceptos": [2] }],
  "protegido": true
}
```

`comidaEnTotal` decide qué suma la comida en el total del mes: el sobre entero
(como en el Excel de siempre) o solo lo apuntado. Si `gruposFijos` está vacío se
usan los tres de siempre: Hipoteca; Luz, agua, gas y seguros; y Niñas.

---

## Importar del Excel

Tres pasos. El archivo viaja en **base64** dentro del JSON (se admite tanto el
base64 pelado como el `data:` URL que da el navegador). Límite: 20 MB, a la par
con el `client_max_body_size` de nginx.

| Método | Ruta | Notas |
| --- | --- | --- |
| `POST` | `/importar/excel/hojas` | `{ archivo }` → `{ hojas: [{ nombre, anio, esCandidata }] }`. |
| `POST` | `/importar/excel/vista-previa` | `{ archivo, hoja }` → lo que va a pasar, sin tocar nada. |
| `POST` | `/importar/excel/confirmar` | `{ archivo, hoja, mapeos?, sobrescribir?, crearAjustes? }`. |

`esCandidata` marca las hojas que empiezan por «Cuentas» y traen año en el
nombre.

La vista previa devuelve, además de los meses y los conceptos detectados, un
array `avisos` con lo que conviene mirar antes de confirmar: fórmulas sin
resultado guardado, el ahorro que la hoja suma dentro de «Gastos», nombres del
detalle de variables que aquí son conceptos fijos, y meses cuyo total no cuadra.

`mapeos` es `{ "<nombre en el Excel>": <id de concepto> }`. Lo que no venga se
crea como concepto nuevo. Un mapeo hacia un concepto con otro nombre **se
guarda como alias**, así que la próxima importación ya no pregunta.

Reimportar un año que ya existe devuelve `400` salvo que se pase
`sobrescribir: true`, que borra sus meses y los vuelve a crear.

Detalles del comportamiento:

- Los fijos importados entran **cobrados**, con fecha en su día previsto (o el
  día 1 si no tiene).
- Los variables se fechan el **día 1** del mes: el Excel solo guarda el mes, y
  en un mes cerrado tiene más sentido que estén cobrados que pendientes.
- La fila «Otros» **no se importa**: se recalcula. Si no cuadra y se pasa
  `crearAjustes: true`, se crea un apunte «Ajuste importación» por la diferencia.
- La fila «Ingresos» alimenta `meses.ingreso`; la fila «Ahorro» del final (el
  saldo) se ignora.
- «Comida» pasa a `presupuestoComida` y, si ese mes no tiene apuntes de comida
  en el detalle, también como un movimiento único del sobre.
- Los meses importados quedan en estado `cerrado` y con `origen: "excel"`.

---

## Exportar

| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/exportar/json` | Copia completa: ajustes, conceptos con sus plantillas y alias, meses con sus movimientos. |
| `GET` | `/exportar/excel` | Una hoja por año. Con `?anio=2025`, solo ese. |

El Excel sale con el **mismo formato que las hojas anuales originales**, así que
se puede volver a importar aquí sin tocar nada. Hay una prueba automática que
comprueba justo eso.

Las dos respuestas llevan `Content-Disposition: attachment` con el nombre del
archivo. Como el token va en la cabecera y no en la URL, desde un navegador hay
que pedirlas con `fetch` y convertir la respuesta en blob.

---

## Inteligencia artificial

Opcional. Sin clave configurada, **todo lo demás funciona igual**: solo
desaparecen las sugerencias, la lectura de fotos y la de PDF.

La clave vive en el servidor (tabla `config`) y **nunca sale entera** hacia el
navegador: las respuestas llevan solo la versión enmascarada. Todas las llamadas
al proveedor pasan por `server/services/ia.js`, que es el único punto del
sistema que las hace.

| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/config/ia` | `{ proveedor, modelo, claveEnmascarada, configurada }`. |
| `PUT` | `/config/ia` | `{ proveedor?, modelo?, clave? }`. Si la clave que llega contiene `*` se ignora: es la enmascarada devuelta por el `GET`. |
| `DELETE` | `/config/ia/clave` | Borra la clave guardada. |
| `POST` | `/config/ia/probar` | Hace una llamada real, la más barata posible. **Responde `200` aunque falle**, con `{ ok: false, mensaje }`: que la prueba salga mal es información, no un error del servidor. |

Proveedores: `anthropic` (SDK oficial) y `openai` (HTTP). `ANTHROPIC_BASE_URL` y
`OPENAI_BASE_URL` permiten apuntar a otra pasarela; es lo que usan las pruebas
para hablar con un proveedor simulado.

Los errores del proveedor llegan traducidos al castellano (`La clave de API no
es válida…`, `Has llegado al límite de uso…`), y el detalle técnico —código
HTTP, cuerpo de la respuesta y traza— queda en el log del servidor, nunca en la
respuesta.

### Tres reglas que cumple todo lo que usa IA

1. **La IA nunca escribe en la base de datos.** Todo lo que devuelve son
   propuestas que pasan por una pantalla de revisión.
2. **Lo que propone se valida contra el catálogo real.** Un concepto que no
   exista se descarta o se marca como nuevo; nunca se inventa un `conceptoId`.
3. **El parser determinista manda.** La IA solo entra donde el parser no llega.

---

## Importar con IA

### Sugerencias de concepto

| Método | Ruta | Notas |
| --- | --- | --- |
| `POST` | `/importar/excel/sugerir` | `{ nuevos: ["Amazn", "Gimasio"] }` → `{ sugerencias: [{ nombreExcel, conceptoId, conceptoNombre, confianza, motivo }] }`. |

Solo devuelve sugerencias que apunten a un concepto que existe de verdad y con
confianza ≥ 0,5. Una sugerencia floja cuesta más de revisar que de hacer a mano.

En la pantalla salen preseleccionadas y marcadas, pero **no se aplican solas**:
hay que confirmar la importación.

### Plan B: leer una hoja con IA

| Método | Ruta | Notas |
| --- | --- | --- |
| `POST` | `/importar/excel/hoja-libre` | `{ archivo, hoja }` → la **misma forma** que `/excel/vista-previa`, más `sesionId` y `leidaPorIa: true`. |

Para hojas que no tienen el formato anual (la del mes en curso, por ejemplo). La
hoja se vuelca a texto, la lee el modelo y el resultado entra por la misma
tubería: mismo emparejado de conceptos, mismos avisos, misma pantalla.

**El `sesionId` importa**: el parser es determinista y se puede repetir, pero la
IA no. Lo que se enseña en la vista previa se guarda en memoria treinta minutos
y es exactamente eso lo que se importa al confirmar con
`POST /importar/excel/confirmar { sesionId }`. La sesión se gasta al usarla;
reutilizarla devuelve `410`.

### Foto, portapapeles y PDF

| Método | Ruta | Notas |
| --- | --- | --- |
| `POST` | `/importar/captura` | `{ mesId, imagen?, tipoImagen?, texto?, pdf?, pista? }` → lo leído, sin guardar nada. |
| `POST` | `/importar/captura/aplicar` | `{ mesId, origen, movimientos: [...] }` → crea los apuntes. |

Entradas admitidas:

- **`imagen`** en base64 (JPEG, PNG o WEBP; hasta 8 MB). La foto de un ticket o
  una captura de pantalla.
- **`texto`**: una tabla copiada del Excel, una lista «concepto importe», o una
  frase suelta.
- **`pdf`** en base64 (hasta 12 MB). Se le **extrae el texto en el servidor** y
  se manda como texto: sale más exacto que fotografiarlo, gasta muchos menos
  tokens y funciona con cualquier proveedor. Un PDF escaneado (sin capa de
  texto) se rechaza con un mensaje que propone mandar una foto.

La respuesta trae `tipo`, que dice qué era:

| `tipo` | Qué es | Qué se propone |
| --- | --- | --- |
| `ticket` | Un ticket de compra | **Un solo apunte** del sobre Comida con el total, más el `desglose` por producto por si se quiere abrir. |
| `factura` | Una factura o recibo (comedor, luz, gimnasio) | **Un solo apunte** con el total a pagar, en el concepto que corresponda. No se desglosan base, IVA ni líneas internas. |
| `hoja` | La captura de una hoja de cuentas | Los apuntes que se lean, más `ingreso` y `dineroEnCuenta` si aparecen. |
| `lista` | Texto suelto | Los apuntes que se lean. |

Cada movimiento propuesto trae `conceptoId` (o `null` con `nuevo: true` si no
está en el catálogo), `importe`, `fecha`, `descripcion`, `tipo` y `cobrado`.

**Una fecha fuera del mes de destino se descarta**, no el apunte: un modelo se
inventa el año con facilidad y un gasto de agosto fechado en marzo se pierde de
vista para siempre.

`origen` queda como `foto` o `portapapeles` en los movimientos creados.

---

## Analítica

Agregaciones del histórico. Todas se calculan sobre los movimientos del rango
con las mismas reglas que ve el usuario en la pantalla del mes (`calculos.js`),
no con SQL aparte: tener dos verdades acabaría en discrepancias.

**Regla de oro: un mes sin datos vale `null`, nunca `0`.** Un cero baja las
medias y dibuja un valle donde en realidad no hay nada.

### El rango

Todas las rutas salvo `/comparativa` aceptan los mismos parámetros:

| Parámetro | Ejemplo | Qué hace |
| --- | --- | --- |
| `desde` y `hasta` | `?desde=2024-01&hasta=2025-06` | Rango libre. |
| `anio` | `?anio=2025` | De enero a diciembre de ese año. |
| `ultimos` | `?ultimos=12` | Los últimos N meses **de calendario** contando desde el último mes con datos, tengan o no datos. |
| *(nada)* | | De la primera a la última fecha con datos. |

| Método | Ruta | Devuelve |
| --- | --- | --- |
| `GET` | `/analitica/rango` | `{ primero, ultimo, anios, agrupaciones, conceptos }`. Las dos últimas llegan aunque no haya ni un mes: la pantalla las necesita para su desplegable. |
| `GET` | `/analitica/serie?clave=` | Serie mensual, con media del rango, previsto, comparación con el periodo anterior y los años separados para superponerlos. |
| `GET` | `/analitica/comparativa?anios=&hastaMes=` | Totales de cada año por concepto, con diferencia y variación. |
| `GET` | `/analitica/reparto` | Top 15 por concepto, reparto por clasificación, su evolución mensual, y el ranking de variables con ticket medio. |
| `GET` | `/analitica/estacionalidad` | Matriz concepto × mes con la media de los años del rango, y el gasto medio de cada mes del año. |
| `GET` | `/analitica/ahorro` | Sobrante mensual, acumulado y el 50/30/20 agregado por año. |
| `GET` | `/analitica/contexto/:mesId` | Comparación con el mismo mes del año anterior y con la media de doce meses, más la posición histórica de sus conceptos. |
| `GET` | `/analitica/anual/:anio` | Totales de un año por concepto. Lo usa la columna «año anterior» de la visión anual. |

### `clave` en `/serie`

Un concepto (`concepto:12`) o una de estas agrupaciones: `gastos`, `fijos`,
`variables`, `comida`, `ingresos`, `sobrante`.

```jsonc
{
  "clave": "concepto:12",
  "nombre": "Luz/Gas/Agua/IBI",
  "puntos": [
    { "anio": 2025, "mes": 7, "clave": "2025-07", "valor": 165.24, "previsto": null, "mesId": 14 },
    { "anio": 2025, "mes": 8, "clave": "2025-08", "valor": null, "previsto": null }
  ],
  "resumen": { "total": 2272.33, "media": 189.36, "mesesConDatos": 12, "maximo": {}, "minimo": {} },
  "comparacion": { "desde": "2024-07", "hasta": "2025-06", "total": 1949.96, "variacion": 16.53, "comparable": true },
  "porAnio": [{ "anio": 2025, "valores": [/* doce posiciones, null donde falte */] }]
}
```

`comparacion.comparable` avisa de si los dos periodos tienen el mismo número de
meses con datos. Cuando es `false`, comparar los totales engaña y la pantalla lo
dice.

### `/comparativa`

`?anios=2024,2025` (de dos a cuatro) y `?hastaMes=8` para comparar años
incompletos con los mismos meses del anterior. Si se piden años que no tienen
datos responde `400` en vez de resolverlo en silencio con otros.

La **media** de un rango divide siempre entre los meses **que tienen datos**, no
entre los del calendario.

---

## Reglas de clasificación

| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/reglas` | Todas, **en orden de evaluación**. `?activas=1`, `?estado=propuesta`. |
| `POST` | `/reglas` | `{ texto, conceptoId?, tipo?, coincidencia? }`. Se añade la última. |
| `PATCH` | `/reglas/:id` | Cambia texto, concepto, encaje, estado o si está activa. |
| `DELETE` | `/reglas/:id` | |
| `PUT` | `/reglas/orden` | `{ ids }` con la lista entera. El orden **es** la regla. |
| `POST` | `/reglas/probar` | `{ descripcion }` → qué regla gana y cuántas se descartaron. |
| `GET` | `/reglas/exportar` | JSON con todas. |
| `POST` | `/reglas/importar` | `{ reglas }`. Busca los conceptos **por nombre**; salta las repetidas. |

Una regla dice «si la descripción del banco contiene este texto, es esto». Se
evalúan por `prioridad` y **gana la primera que encaja**, así que reordenar
cambia el resultado tanto como cambiar el texto.

```jsonc
{
  "id": 33, "texto": "PRIME", "concepto": "Netflix etc", "conceptoId": 13,
  "tipo": "fijo",            // fijo | sobre | variable | manual
  "coincidencia": "exacta",  // empieza | exacta
  "prioridad": 33,
  "estado": "confirmada",    // confirmada | propuesta (aprendida, sin confirmar)
  "activa": true, "vecesAplicada": 5, "origen": "seed"
}
```

### Cómo encaja el texto

Esto no es un detalle de implementación, es la diferencia entre que funcione y
que no. Comprobado contra un extracto real:

- **`empieza`** (por defecto) — al principio de una palabra, y puede seguir. Es
  lo que hace falta casi siempre: el banco escribe `AUTOPISTAS` y la regla es
  `AUTOPISTA`; `PRESTAMOS` y la regla es `PRESTAM`.
- **`exacta`** — la palabra entera. Imprescindible para las cortas: sin esto,
  la regla `BAR` encajaba dentro de **BAR**CELONA y se llevaba siete
  movimientos que no tenían nada que ver (el túnel del Cadí, una frutería y
  cuatro pagos de Glovo).

**Se compara siempre contra la descripción ORIGINAL**, no contra la limpia.
Limpiar quita prefijos, y esos prefijos son justo lo que identifica el
movimiento: `REINTEGRO CAJERO AUTOMATICO 5402XXXX4010` limpio se queda en `0`, y
un reintegro de 800 € se perdía.

`conceptoId: null` con `tipo: "manual"` es una regla que **reconoce pero no
clasifica**: los Bizum siempre pasan por revisión, porque pueden ser cualquier
cosa.

Editar una regla `origen: "seed"` la convierte en `"usuario"`, y a partir de ahí
las actualizaciones del catálogo de fábrica ya no la tocan.

---

## Importar el extracto del banco

| Método | Ruta | Notas |
| --- | --- | --- |
| `GET` | `/extracto/formatos` | Los formatos guardados y el que se usa por defecto. |
| `PATCH` | `/extracto/formatos/:id` | Columnas, texto de la cabecera, separador decimal, prefijos. |
| `POST` | `/extracto/leer` | `{ archivo }` (base64) o `{ texto }`. Lee y enseña, **sin guardar nada**. |
| `POST` | `/extracto/clasificar` | `{ mesId, archivo\|texto }`. Crea la importación en borrador y devuelve la propuesta. |
| `POST` | `/extracto/:id/sugerir` | `{ lineas }`. Una sola llamada a la IA para lo que no reconoce. |
| `GET` | `/extracto/:id` | Retomar una revisión a medias. |
| `PATCH` | `/extracto/:id/borrador` | Autoguardado de la revisión. |
| `POST` | `/extracto/:id/previsualizar` | Qué entra en cada concepto, antes de confirmar. |
| `POST` | `/extracto/:id/aceptar` | `{ lineas, conciliaciones, reglasNuevas }`. Todo o nada. |
| `POST` | `/extracto/:id/deshacer` | Deshace una importación aplicada, entera. |
| `DELETE` | `/extracto/:id` | Tira un borrador. Lo aceptado se deshace, no se borra. |
| `GET` | `/extracto/historial` | `?mesId=` opcional. |

### El parser

Acepta `.xls` (el formato antiguo de Excel, que es el que da el banco), `.xlsx`,
`.csv` y **texto pegado** de la web del banco.

- La **fila de cabecera no está en un sitio fijo**: se busca la que contenga el
  texto configurado (`Importe` por defecto), porque encima hay un número
  variable de filas de título, cuenta y periodo.
- Las **columnas se buscan por nombre**, no por posición.
- **Solo son movimientos las filas con importe numérico.** Así se caen solas las
  de título, la de saldo final y las notas del pie.
- La descripción viene **cortada** a unos 46 caracteres (`WWW.AMAZON-LUXEM`).

> **Sobre el `.xls`:** hay un lector propio (`lecturaXls.js`) porque `exceljs` no
> lee ese formato, y no lo dice: acepta el fichero, no lanza ningún error y
> devuelve **cero hojas**. La librería habitual para `.xls` está retirada de npm
> con vulnerabilidades conocidas, así que se leen a mano las dos capas (OLE y
> BIFF), solo lo justo para sacar valores.

### La huella

De cada línea se guarda un hash de **(fecha, importe, descripción original)**.
Es lo que hace que subir dos veces el mismo extracto no duplique nada: si la
huella ya está en una importación **aceptada**, la línea sale marcada como
`duplicado` y no se procesa. Al deshacer, la importación pasa a `deshecha` y sus
huellas dejan de contar, así que el extracto se puede volver a importar.

### El orden de la clasificación

Se para en la primera que aplica:

1. **Duplicado** — la huella ya entró en una importación aceptada.
2. **Omitido** — el importe es positivo. **Solo entra lo que resta**: la nómina
   sale de la plantilla, y los abonos y devoluciones se quedan fuera. Se ven en
   su bloque y se pueden rescatar de uno en uno.
3. **Regla** — la primera activa que encaje. Según su tipo: conciliar un fijo,
   comida, variable, o `manual` (reconocido pero a revisión).
4. **IA** — a petición, en una sola llamada con todos los que queden.
5. **Sin clasificar**.

**Fuera de mes no es un paso**: se marca aparte. Un movimiento de otro mes se
clasifica igual, para que incluirlo sea un clic.

### Conciliar un fijo

Un movimiento que cae en un fijo **no crea un apunte nuevo**: busca el fijo
pendiente de ese concepto en el mes y lo marca cobrado con el importe real y la
fecha del banco. Si varias líneas caen en el mismo fijo (dos facturas de gas y
una de agua), **se suman** y el detalle de cada una se guarda en la descripción.

| `situacion` | Qué pasa |
| --- | --- |
| `pendiente` | Lo normal: se marca cobrado con el importe real. |
| `ya-cobrado` | Posible duplicado: hay que elegir sustituir, crear aparte o no tocarlo. |
| `no-existe` | El fijo no está en el mes: se ofrece crearlo. |

### El marcador tiene que cuadrar

```
N movimientos = fijos + comida + variables + omitidos
              + descartados + fuera de mes + duplicados + sin clasificar
```

`/aceptar` valida **antes de escribir una sola fila**, y si algo no cuadra
devuelve `400` con el detalle y no guarda nada:

- El número de **huellas distintas** tiene que ser el del fichero. Se cuentan
  huellas y no líneas porque dividir un movimiento crea dos líneas que siguen
  siendo el mismo apunte del banco.
- Los trozos de un movimiento **dividido** tienen que sumar exactamente lo que
  cobró el banco. Sin esto, partir 379,99 en 300 y 50 entraría tan campante.
- No puede quedar nada **sin clasificar**.
- El dinero: lo que entra más lo que se queda fuera tiene que ser el total.

### Deshacer

Borra los movimientos que creó, devuelve los fijos conciliados a **pendiente**
con su importe previsto, restaura el ingreso anterior y marca la importación
como `deshecha`. **Las reglas aprendidas se quedan**: lo aprendido sigue
valiendo.

### La IA aquí

Una sola llamada por extracto con todos los que ninguna regla ha reconocido.
Cumple las tres reglas de siempre: no escribe nada, los conceptos se validan
contra el catálogo real (lo inventado se descarta) y si falla, los movimientos
se quedan sin clasificar y se avisa.
