# Configurar la nube (Firebase)

Con Firebase configurado, los proyectos dejan de vivir en el navegador de cada persona. Quedan en una base de datos compartida:

- Todo el equipo ve y edita la misma cartera, desde cualquier computador o celular.
- Solo entran los correos que autorice un administrador.
- Cada proyecto registra quién lo creó y quién lo modificó por última vez.
- Eliminar un proyecto lo manda a una **papelera** desde donde se puede restaurar.
- Si dos personas editan el mismo proyecto a la vez, la herramienta pregunta antes de sobrescribir.
- Sin internet se puede seguir trabajando. Los cambios se suben solos al reconectar.

Mientras `js/firebase-config.js` esté vacío, la herramienta funciona como antes: proyectos guardados en el navegador.

La configuración se hace una sola vez y toma unos 15 minutos. Todo se hace en https://console.firebase.google.com con la cuenta Google de la empresa.

## 1. Crear el proyecto

1. **Crear un proyecto** → nombre `quempin-formulacion`.
2. Google Analytics: **desactívalo** (no se usa) → **Crear proyecto**.

## 2. Registrar la app web y copiar la configuración

1. En la página del proyecto, haz clic en el ícono **`</>`** (Web).
2. Apodo: `formulacion`. **No** marques Firebase Hosting → **Registrar app**.
3. Aparece un bloque `const firebaseConfig = { apiKey: "...", ... }`. Copia esos valores en `js/firebase-config.js`:

   ```js
   window.QPN_FIREBASE = {
     apiKey: 'AIza...',
     authDomain: 'quempin-formulacion.firebaseapp.com',
     projectId: 'quempin-formulacion',
     storageBucket: 'quempin-formulacion.firebasestorage.app',
     messagingSenderId: '1234567890',
     appId: '1:1234567890:web:abc123'
   };
   ```

   Estos valores **pueden ser públicos**, porque solo identifican el proyecto. La seguridad la dan el ingreso con correo y las reglas del paso 5.

## 3. Activar el ingreso

**Compilación → Authentication → Comenzar → Método de acceso**:

1. **Google** → Habilitar → elige el correo de asistencia → Guardar.
2. **Correo electrónico/contraseña** → Habilitar, y habilitar también «Vínculo del correo electrónico (acceso sin contraseña)» → Guardar. Sirve para quien no tenga cuenta Google: recibe un enlace de ingreso en su correo. La herramienta no usa contraseñas, y las reglas solo aceptan correos verificados.

Luego ve a **Authentication → Configuración → Dominios autorizados → Agregar dominio** y escribe `cristobal-monzo.github.io`.

## 4. Crear la base de datos

1. **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: **`southamerica-west1` (Santiago)**. No se puede cambiar después.
3. Modo: **producción** → Crear.

## 5. Publicar las reglas de seguridad

En **Firestore Database → Reglas**, borra lo que haya, pega el contenido completo del archivo [`firestore.rules`](../firestore.rules) y presiona **Publicar**.

Qué permiten las reglas:

| Rol | Puede |
|---|---|
| **Editor** | Ver todos los proyectos, crear, editar, duplicar, versionar y enviar a la papelera. |
| **Administrador** | Todo lo anterior, más agregar o quitar usuarios, cambiar los valores predeterminados del equipo (prefijo, IVA, tarifas, metas, catálogo) y eliminar definitivamente desde la papelera. |
| Cualquier otra persona | Nada. Ni siquiera puede leer. |

## 6. Crear el primer administrador

El primer administrador se crea a mano. Los demás se agregan desde la herramienta.

1. **Firestore Database → Datos → Iniciar colección** → ID de colección: `usuarios`.
2. ID del documento: **tu correo en minúsculas** (el mismo con que entrarás).
3. Agrega dos campos de tipo *string*:
   - `rol` = `admin`
   - `nombre` = tu nombre
4. **Guardar**.

## 7. Publicar y entrar

1. Publica el cambio de `js/firebase-config.js` (`git add`, `git commit`, `git push`). GitHub Pages lo actualiza en uno o dos minutos.
2. Abre la herramienta → **Continuar con Google**.
3. Si ese navegador tenía proyectos guardados de antes, la herramienta ofrece **subirlos a la nube**. La copia local no se borra.
4. Agrega al equipo en **tu nombre (arriba a la derecha) → Usuarios y permisos**.
5. Revisa **Configuración**: el prefijo y los parámetros predeterminados ahora son del equipo.

## Límites y costos

El plan gratuito de Firebase (*Spark*) alcanza de sobra para este uso:

| Recurso | Gratis | Consumo de la herramienta |
|---|---|---|
| Almacenamiento | 1 GiB | Un proyecto mediano pesa ~11 KB: caben unos **90.000**. |
| Lecturas | 50.000 por día | Al abrir, cada navegador lee solo los proyectos que cambiaron desde su última visita. El resto sale del caché del equipo. |
| Escrituras | 20.000 por día | Una por cada guardado automático (tras una pausa al escribir): unos cientos por persona al día. |

Si algún día se supera un límite del plan gratuito, Firebase bloquea esa operación hasta el día siguiente, pero no borra nada. Para evitarlo se puede pasar al plan *Blaze* (pago por uso), que para este volumen cuesta centavos de dólar al mes.

Un documento de Firestore admite hasta 1 MB. Un proyecto de 50 partidas y 500 líneas pesa ~80 KB, así que el límite no es una preocupación práctica. Si un proyecto lo supera, la herramienta avisa al guardar.

## Respaldo

Firestore no guarda copias históricas en el plan gratuito. Conviene que un administrador descargue cada mes **Más → Respaldar todos los proyectos** y guarde el archivo JSON en OneDrive. Ese archivo se puede volver a importar.

## Cómo funciona (para mantención)

- `js/cloud.js`: conexión con Firebase (ingreso, sincronización, usuarios). `js/store.js` mantiene la misma interfaz en modo local y en modo nube.
- Colecciones:
  - `usuarios/{correo}`: `{ rol, nombre }`.
  - `proyectos/{uid}`: campos de resumen (`codigo`, `titulo`, `estado`, `modificadoPor`, `actualizado`…) más `datos`, que es el proyecto completo en JSON.
  - `config/empresa`: valores predeterminados del equipo.
- Sincronización incremental: se escucha solo `actualizado >= último conocido − 5 min`. El resto se lee del caché de Firestore en el navegador (IndexedDB, sin límite de tamaño configurado).
- La papelera marca `eliminado: true`. «Eliminar definitivamente» reemplaza el documento por una lápida (`purgado: true`, sin datos), para que las demás sesiones lo quiten de su caché.
- Conflictos: si llega una versión de otra persona mientras hay cambios sin guardar, al guardar se ofrece **guardar los míos como copia**, **ver su versión** o **sobrescribir**.
- El SDK de Firebase 12.19.0 está copiado en `vendor/firebase/` (licencia Apache-2.0). Así la herramienta no depende de un CDN.
