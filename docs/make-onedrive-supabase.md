# Flujo Make: OneDrive → Edge Function → Supabase

Automatiza la carga de archivos bancarios desde OneDrive directamente a la
base de datos sin ninguna limpieza manual.

---

## Resumen del flujo

```
OneDrive (carpeta) ──► HTTP POST (archivo) ──► Edge Function ──► Supabase
     Watch Files              procesar-archivo          transacciones
```

---

## Requisitos previos

| Qué | Dónde obtenerlo |
|-----|-----------------|
| URL del proyecto Supabase | Dashboard Supabase → Settings → API → Project URL |
| Service Role Key | Dashboard Supabase → Settings → API → `service_role` key |
| Cuenta Make.com | make.com |
| Cuenta Microsoft 365 / OneDrive conectada en Make | Make → Connections → Microsoft OneDrive |

---

## Paso 1 — Crear el escenario en Make

1. Entra a **make.com** → **Scenarios** → **Create a new scenario**.
2. Elige **Start from scratch**.

---

## Paso 2 — Módulo 1: Watch Files (OneDrive)

1. Haz clic en el primer círculo (trigger) → busca **OneDrive** → selecciona
   **Watch Files**.
2. Configura la conexión con tu cuenta Microsoft si aún no existe.
3. Parámetros:

   | Campo | Valor |
   |-------|-------|
   | **Connection** | Tu conexión Microsoft 365 |
   | **Drive** | OneDrive for Business (o Personal, según tu caso) |
   | **Folder** | Selecciona la carpeta donde el banco deposita los archivos, por ejemplo `/Finanzas/Banco/Pendientes` |
   | **Watch** | New files only |
   | **Limit** | 1 (procesa un archivo a la vez para mayor control) |

4. Haz clic en **OK**.
5. Para definir cuándo se dispara: haz clic en el ícono de reloj del módulo →
   **Scheduling** → elige el intervalo (recomendado: **Every 15 minutes**).

---

## Paso 3 — Módulo 2: HTTP - Make a Request

1. Haz clic en el **+** después del módulo de OneDrive → busca **HTTP** →
   selecciona **Make a Request**.
2. Configura así:

### URL del endpoint

```
https://<TU_PROJECT_REF>.supabase.co/functions/v1/procesar-archivo
```

> Reemplaza `<TU_PROJECT_REF>` con el identificador de tu proyecto Supabase.
> Lo encuentras en **Settings → API → Project URL**,
> ejemplo: `https://xyzabcdefgh.supabase.co` → el ref es `xyzabcdefgh`.

### Método

```
POST
```

### Headers

| Header | Valor |
|--------|-------|
| `Authorization` | `Bearer <TU_SERVICE_ROLE_KEY>` |
| `apikey` | `<TU_SERVICE_ROLE_KEY>` |

> La `service_role` key tiene privilegios completos. Nunca la expongas en el
> frontend. Aquí es seguro usarla porque Make es un servicio backend.

### Body type

Selecciona **Form data (multipart/form-data)**.

### Body — campos

| Key | Value | Type |
|-----|-------|------|
| `file` | `{{1.data}}` | File |

> `{{1.data}}` es el contenido binario del archivo devuelto por el módulo
> OneDrive (módulo número 1). El nombre del campo **debe ser exactamente**
> `file`.

### Configuración adicional

| Campo | Valor |
|-------|-------|
| **Parse response** | Sí (toggle ON) |
| **Timeout** | 60 segundos |
| **Follow redirect** | Sí |

3. Haz clic en **OK**.

---

## Paso 4 — Módulo 3 (opcional): Notificación por correo / Slack

Para saber cuándo se insertaron filas o si hubo errores, agrega un módulo de
notificación después del HTTP.

**Si usas Gmail / Outlook:**
- Módulo: **Email → Send an Email**
- Asunto: `Archivo bancario procesado`
- Cuerpo:
  ```
  Archivo: {{1.name}}
  Insertadas: {{2.inserted}}
  Total parseadas: {{2.total_parsed}}
  Después de filtro: {{2.after_filter}}
  Errores: {{2.errors}}
  ```

**Si usas Slack:**
- Módulo: **Slack → Create a Message**
- Mensaje: igual que el cuerpo de arriba.

---

## Paso 5 — (Opcional) Mover el archivo a carpeta "Procesados"

Para evitar que el mismo archivo se procese dos veces, muévelo tras la carga.

1. Agrega un módulo **OneDrive → Move/Copy a File**.
2. Parámetros:

   | Campo | Valor |
   |-------|-------|
   | **File ID** | `{{1.id}}` |
   | **New Folder** | `/Finanzas/Banco/Procesados` |
   | **Conflict behavior** | Rename |

---

## Paso 6 — Activar el escenario

1. Verifica que el escenario no tenga errores (todos los módulos deben
   mostrar palomita verde al hacer **Run once** con un archivo de prueba).
2. Activa el toggle **ON/OFF** en la esquina superior derecha.
3. Make ejecutará el flujo automáticamente según el intervalo configurado.

---

## Respuesta esperada de la Edge Function

```json
{
  "inserted": 47,
  "total_parsed": 52,
  "after_filter": 47,
  "errors": []
}
```

| Campo | Significado |
|-------|-------------|
| `inserted` | Filas nuevas guardadas en Supabase |
| `total_parsed` | Total de filas encontradas en el archivo |
| `after_filter` | Filas INGRESO no duplicadas, listas para insertar |
| `errors` | Array vacío = todo bien; si hay elementos, revisar el mensaje |

---

## Solución de problemas frecuentes

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| Error 401 Unauthorized | Header `Authorization` incorrecto | Verifica que uses `Bearer <key>` con la Service Role key |
| Error 415 Unsupported | El archivo no es .xlsx, .xls o .csv | Confirma el formato del archivo bancario |
| `inserted: 0` con `errors: []` | No hay filas con EFECTO=INGRESO | Revisa que la columna EFECTO exista en el archivo y tenga el valor correcto |
| Timeout | Archivo muy grande | Divide el archivo o aumenta el timeout del módulo HTTP a 120 s |
| `errors` con mensaje de Supabase | Conflicto de tipos de dato | Revisa que las columnas numéricas no traigan texto; el parser limpia comas pero no símbolos de moneda ($) |
