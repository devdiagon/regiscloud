## Fase 0: Completada

Se configuró IAM en la consola y se guardaron las credenciales en el equipo local. Se comprobaron las dependencias a utilizar.

---

## Fase 1: Completada

Creación de repositorio y archivos de documentación. Se aclara que se utilizará el manejador de paquetes PNPM, lo que obligó a especificar un pnpm-workspace.

El stage se mantiene como *"prod"*, se cambió de la template de sst.

Especificación de nombre de app como `regiscloud`, con eso la convención SSM pasa a ser:

```
/regiscloud/<stage>/topics/movimientos-events-arn
/regiscloud/<stage>/topics/inventario-events-arn
```

se usará --stage dev

---

## Fase 2: En curso

### Problema en Windows: SST/esbuild no resuelve dependencias

Al desplegar `services/movimientos` apareció:

```
Could not resolve "aws4fetch" node_modules/sst/dist/aws/client.js
Cannot read file "node_modules/@aws-sdk/client-dynamodb": Función incorrecta.
```

**Causa:** pnpm instala por defecto con junctions hacia `node_modules/.pnpm`, que esbuild no puede leer en Windows. Además, pnpm 11 ya no lee `node-linker` desde `.npmrc` (solo credenciales/registry), por lo que la opción `node-linker=hoisted` se ignoraba.

**Solución:**
- Se agregó `nodeLinker: hoisted` a `pnpm-workspace.yaml` y se eliminó `.npmrc`.
- Se borraron los `node_modules` (raíz, `packages/infra`, `services/movimientos`) y se ejecutó `pnpm install` de nuevo.
- Si SST sigue con errores de caché, borrar `services/movimientos/.sst` y reintentar.

