# Conectar la herramienta con SharePoint

Con SharePoint conectado, los proyectos dejan de vivir en el navegador de cada persona. Quedan en la biblioteca **Formulación de proyectos**, dentro de la carpeta de cada oferta:

```
0 OFERTAS PRESENTADAS/
  301. Mantención calderas hospital/
    ANTECEDENTES/
    Excel General Proyectos_CLP.xlsm        ← lo de siempre, la herramienta no lo toca
    Formulación 301 v1.json                  ← la formulación (lo escribe la herramienta)
    Formulación 301 v1.xlsx                  ← copia en Excel, si alguien la pide
```

- Cada persona entra con su cuenta Microsoft de QUEMPIN y ve lo mismo que ve en SharePoint.
- Todo el equipo ve y edita la misma cartera, en momentos distintos o a la vez.
- **Nuevo proyecto** pide la carpeta de la oferta y toma de la *Planilla de Ingreso de Requerimientos* el título, la ubicación, la referencia, la fecha de cierre y el presupuesto.
- Si la carpeta se mueve (a Adjudicadas o a Cerradas), el proyecto la sigue.
- Si dos personas guardan el mismo proyecto, la herramienta pregunta antes de sobrescribir. Nunca pisa en silencio.
- SharePoint guarda el historial de versiones de cada archivo (quién cambió qué y cuándo) y tiene papelera propia.

Mientras `clientId` esté vacío en `js/m365-config.js`, la herramienta funciona como antes: proyectos guardados en el navegador.

## Qué puede y qué no puede hacer la herramienta en la biblioteca

Estas reglas están en el código (`js/cloud.js`), no dependen de que alguien se acuerde:

| Puede | No puede |
|---|---|
| Crear y actualizar sus archivos `Formulación … .json` y `Formulación … .xlsx` | Modificar, mover, renombrar o borrar cualquier otro archivo o carpeta |
| Crear y actualizar `Formulador - configuración.json` (tarifas, IVA y metas del equipo) | Sobrescribir un archivo por tener el mismo nombre. Si el nombre está ocupado, usa otro |
| Crear una carpeta de oferta nueva («N°. Título»), si se lo piden | Reemplazar un archivo que cambió desde que lo leyó. Primero pregunta |
| Leer la planilla de ingreso y la lista de carpetas | Escribir en la planilla de ingreso |

**Eliminar** un proyecto en la herramienta solo lo marca como eliminado dentro de su archivo. El archivo sigue en la carpeta y se puede restaurar desde *Más → Papelera*. Para borrarlo del todo, hay que hacerlo en SharePoint.

## 1. Registrar la herramienta en Microsoft (una vez, unos 10 minutos)

Se hace en https://entra.microsoft.com con una cuenta **administradora** del Microsoft 365 de QUEMPIN.

1. **Identidad → Aplicaciones → Registros de aplicaciones → Nuevo registro**.
2. Nombre: `Formulador QUEMPIN`.
3. Tipos de cuenta: **Solo las cuentas de este directorio organizativo (QUEMPIN SPA: inquilino único)**.
4. URI de redirección: plataforma **Aplicación de página única (SPA)**, dirección:
   ```
   https://cristobal-monzo.github.io/formulacion-proyectos-quempin/redirect.html
   ```
5. **Registrar**. En la página que aparece, copia el **Id. de aplicación (cliente)**.
6. **Permisos de API → Agregar un permiso → Microsoft Graph → Permisos delegados**. Marca:
   - `Files.ReadWrite.All`
   - `Sites.Read.All`

   (`User.Read` ya viene). Luego presiona **Conceder consentimiento de administrador para QUEMPIN SPA**, para que tus colegas no tengan que aceptar nada al entrar.

*Delegados* significa que la herramienta actúa como la persona que entró, con sus mismos permisos. Quien no tiene acceso a la biblioteca en SharePoint tampoco lo tiene en la herramienta.

## 2. Piloto en una carpeta de prueba

Antes de usarla con las ofertas reales, conviene probarla en una carpeta aparte:

1. En la biblioteca *Formulación de proyectos*, crea la carpeta `ZZ Pruebas formulador` y dentro, una o dos carpetas de oferta de prueba, por ejemplo `901. Prueba calderas`.
2. En `js/m365-config.js` escribe el Id. de aplicación en `clientId` y el nombre de la carpeta en `raiz`:
   ```js
   clientId: '00000000-0000-0000-0000-000000000000',
   ...
   raiz: 'ZZ Pruebas formulador',
   ```
   Con `raiz` escrita, la herramienta **no ve ni escribe nada fuera de esa carpeta**. La planilla de ingreso se sigue leyendo, sin modificarla.
3. Publica el cambio (`git add`, `git commit`, `git push`). GitHub Pages lo actualiza en uno o dos minutos.
4. Prueba con un colega:
   - Entrar con Microsoft.
   - Crear un proyecto en 901 y editarlo.
   - Que el colega lo vea y lo edite en otro momento.
   - Que los dos lo editen a la vez, para ver el aviso de conflicto.
   - *⋯ → Guardar Excel en la carpeta*.
   - Revisar en SharePoint los archivos y su historial de versiones.

## 3. Uso con las ofertas reales

Cuando el piloto funcione, deja `raiz: ''` en `js/m365-config.js` y publica. Desde ese momento:

- La herramienta ve todas las carpetas de oferta de la biblioteca: las de la raíz (en curso), las de `0 OFERTAS PRESENTADAS`, las de `0 OFERTAS ADJUDICADAS` y las cerradas por año. No ofrece `1 CARPETA MODELO` ni `2 ARCHIVOS Y INFORMACION FRECUENTE`.
- Los proyectos que alguien tenga guardados en su navegador aparecen en *cuenta → Proyectos de este navegador*, para guardarlos en la carpeta de su oferta.
- Carpeta de prueba: se puede borrar o dejar. La herramienta no la trata distinto de otra oferta sin número.

## Quién puede entrar

Lo decide SharePoint, igual que para el resto de los documentos:

- **Miembros** del sitio *Formulación de proyectos*: ven, crean y editan proyectos.
- **Visitantes** (solo lectura): ven los proyectos. Si intentan guardar, la herramienta avisa que no tienen permiso y los cambios quedan solo en su navegador.
- Alguien que deja la empresa pierde el acceso al desactivar su cuenta de Microsoft 365.

Para que solo algunas personas cambien las tarifas y metas del equipo, limita en SharePoint quién puede editar el archivo `Formulador - configuración.json`.

## Cómo funciona, en detalle

- **Guardado.** Los cambios se suben tras 8 segundos sin editar, al volver a la lista o al cerrar la pestaña. Mientras tanto quedan también en el navegador: si se corta internet o se cierra la pestaña, se suben al volver a abrir. Cada subida es una versión en el historial de SharePoint.
- **Cambios de otros.** La herramienta revisa cada 30 segundos (y al volver a la pestaña) qué cambió en la biblioteca. La primera vez que alguien entra lee la lista completa, unos 4.000 elementos, en pocos segundos. Después lee solo lo que cambió.
- **Conflictos.** Si otra persona guardó el proyecto mientras tú lo editabas, puedes guardar lo tuyo como versión nueva, ver la versión del otro o sobrescribir. Si el choque ocurre con el proyecto cerrado, tus cambios quedan como versión nueva «(cambios sin subir)».
- **Código y versión.** El código es el N° de la oferta en la planilla (el de la carpeta). *Crear nueva versión* deja v2, v3… en la misma carpeta. El nombre del archivo se fija al crearlo: cambiar el código o la versión en la ficha no lo renombra.
- **Planilla de ingreso.** Solo se lee. Si el número de una carpeta corresponde a otra oferta en la planilla (la carpeta dice una cosa y la planilla, con ese mismo número, otra), el selector lo marca con ▲ y no copia los datos de la planilla.
- **Excel en la carpeta.** *⋯ → Guardar Excel en la carpeta* deja `Formulación 301 v1.xlsx` junto a la formulación, para verlo o imprimirlo sin abrir la herramienta. Es una copia: editarlo en Excel no cambia la formulación.

## Cuidados

- No copies ni muevas a mano un archivo `Formulación …json` a otra carpeta de oferta. La copia tendría el mismo identificador y la herramienta la ignoraría. Para eso está *⋯ → Duplicar como proyecto nuevo*.
- Si renombras un archivo de modo que ya no empiece con «Formulación», la herramienta deja de verlo.
- Para recuperar una versión anterior: en SharePoint, en el archivo, *Historial de versiones → Restaurar*. La herramienta la toma en la siguiente revisión.

## Pruebas

Las pruebas viven en `.prueba/`, en el computador de desarrollo y fuera del repositorio, porque usan nombres de ofertas reales:

- `.prueba/fake-graph.js` simula Microsoft Graph en memoria, a partir de la lista de nombres de carpetas y archivos, y registra cada escritura. Nunca apunta a la biblioteca real.
- `.prueba/sharepoint/generar-datos.py` arma esa lista leyendo la biblioteca sincronizada, sin modificarla.
- `.prueba/sharepoint/sp-test.js` es la prueba de punta a punta. Recorre:
  - dos colegas trabajando el mismo proyecto;
  - conflictos al editar a la vez y al subir;
  - carpetas movidas y creadas;
  - números cruzados con la planilla;
  - el piloto y el modo local.

  Al final audita que solo se hayan escrito archivos propios.
