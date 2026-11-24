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

