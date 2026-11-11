# Pruebas del Formulador

Se versiona desde el 2026-11-11 (antes estaba en `.git/info/exclude`): así viaja
con cada rama y un worktree las tiene sin copiarlas. Lo que las pruebas generan
(`shots/`, `salida/`, `buzon-prueba/`) queda fuera, en `.prueba/.gitignore`.

## Correrlas

```
node .prueba/correr-todo.js        # desde la raíz del repositorio
```

Levanta los servidores locales que esperan las suites (puertos 8797, 8798 y
8799), corre las 10 suites principales **una tras otra** y resume. No las corras
en paralelo ni con la máquina ocupada en otra cosa pesada: las de punta a punta
esperan por tiempo y fallan con carga (el 2026-10-08, `integracion/e2e.js` falló
6 verificaciones corriendo junto a las suites de Python, y 38/38 sola).

Una suite suelta: servir la raíz en su puerto y `node .prueba/<suite>.js`.

## Playwright

Las pruebas usan el Chrome instalado
(`C:/Program Files/Google/Chrome/Application/chrome.exe`) a través de
`playwright-core`, que vive en una carpeta estable fuera de OneDrive:
`%LOCALAPPDATA%\quempin-pruebas\node_modules\playwright-core`. La variable de
entorno `PW` la cambia.

Si esa carpeta no existe (otro equipo, o se borró):

```
mkdir "%LOCALAPPDATA%\quempin-pruebas"
copy .prueba\package.json "%LOCALAPPDATA%\quempin-pruebas\"
npm install --prefix "%LOCALAPPDATA%\quempin-pruebas"
```

`package.json` fija la versión con la que pasan las suites (playwright-core 1.63.0,
2026-11-06): una versión nueva puede cambiar tiempos o selectores. Para subirla,
cámbiala ahí, instala y corre `node .prueba/correr-todo.js` antes de dejarla.

## Antes de empujar main

`.git/hooks/pre-push` corre `correr-todo.js` cuando se empuja `main` (lo que
GitHub Pages publica) y no lo deja salir si algo falla. Las otras ramas se
empujan sin pruebas. `QP_SIN_PRUEBAS=1 git push` lo salta a sabiendas. `main`
se empuja desde la carpeta principal: el hook exige que lo empujado sea lo que
hay ahí. Si el hook se pierde (un clon nuevo), está la copia en
`Formulación de proyectos/.prueba-hooks/pre-push`.

Hasta el 2026-10-08, 9 pruebas lo cargaban desde el scratchpad temporal de una
sesión antigua de Claude: si Windows limpiaba esa carpeta, dejaban de correr.
