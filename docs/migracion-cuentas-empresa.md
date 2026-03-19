# Migración a cuentas de empresa

Guía para transferir el repositorio de GitHub a una organización nueva y
migrar el proyecto de Supabase a una cuenta nueva, sin perder datos ni
configuración.

---

## Parte 1 — Transferir el repositorio GitHub a una organización

### Requisitos previos

- Ser **Owner** del repositorio en la cuenta personal.
- Ser **Owner** (o tener permiso de creación de repositorios) en la
  organización destino.
- Avisar al equipo con anticipación: las URLs clonas cambian.

---

### Paso 1 — Crear la organización (si no existe)

1. Ve a **github.com** → clic en tu avatar → **Your organizations** →
   **New organization**.
2. Elige el plan (Free es suficiente para empezar).
3. Anota el nombre exacto de la organización, por ejemplo: `alfa-quattro-mx`.

---

### Paso 2 — Transferir el repositorio

1. Entra al repositorio: `github.com/salamesoni8-lab/alfa-quattro-finance`.
2. Ve a **Settings** (pestaña en la barra superior del repo).
3. Baja hasta la sección **Danger Zone** → **Transfer ownership**.
4. Haz clic en **Transfer**.
5. Escribe el nombre del repositorio para confirmar: `alfa-quattro-finance`.
6. En **New owner**, escribe el nombre de la organización: `alfa-quattro-mx`
   (o como la hayas llamado).
7. Haz clic en **I understand, transfer this repository**.

> GitHub crea automáticamente un **redirect** desde la URL anterior a la
> nueva durante ~3 meses. Aun así, actualiza los clones locales.

---

### Paso 3 — Actualizar clones locales

En cada máquina del equipo que tenga el repo clonado:

```bash
git remote set-url origin https://github.com/alfa-quattro-mx/alfa-quattro-finance.git
git remote -v   # verifica
```

---

### Paso 4 — Actualizar integraciones

| Servicio | Qué actualizar |
|----------|---------------|
| **Vercel** | En el proyecto de Vercel: Settings → Git → cambiar el repositorio conectado al nuevo `alfa-quattro-mx/alfa-quattro-finance` |
| **GitHub Actions** (si hay) | Los workflows siguen funcionando, pero los secrets se deben re-agregar en la nueva org si estaban a nivel repo |
| **Make.com** (si hay webhooks de GitHub) | Actualizar la URL del repo en cada módulo |

---

### Paso 5 — Revocar acceso anterior (opcional)

Si la cuenta personal `salamesoni8-lab` no debe mantener acceso:

1. En la organización → **Settings** → **Members** → elimina o cambia el rol
   del usuario.

---

## Parte 2 — Migrar el proyecto Supabase a una cuenta nueva

Supabase no tiene una función de "transferencia directa" de proyecto entre
cuentas. La migración se hace en dos pasos: exportar datos + estructura, y
luego importar en un proyecto nuevo.

### Requisitos previos

- Acceso a la cuenta Supabase actual (con permiso de Owner o Admin).
- Cuenta nueva de Supabase creada (supabase.com → Sign Up).
- `psql` instalado en tu máquina local (viene incluido con PostgreSQL).
- Supabase CLI instalado: `npm install -g supabase` o ver
  [supabase.com/docs/guides/cli](https://supabase.com/docs/guides/cli).

---

### Paso 1 — Exportar la estructura (schema)

```bash
# Reemplaza los valores con los de TU proyecto actual
PGPASSWORD="<db_password>" pg_dump \
  --host=db.<TU_PROJECT_REF_ACTUAL>.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --schema-only \
  --no-owner \
  --no-acl \
  -f schema_export.sql
```

> La contraseña y el host los encuentras en:
> Supabase Dashboard → Settings → Database → Connection string.

---

### Paso 2 — Exportar los datos

```bash
PGPASSWORD="<db_password>" pg_dump \
  --host=db.<TU_PROJECT_REF_ACTUAL>.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --data-only \
  --table=transacciones \
  --table=usuarios \
  -f data_export.sql
```

> Si el proyecto tiene más tablas, agrega un `--table=nombre_tabla` por cada
> una, o elimina los flags `--table` para exportar todo.

---

### Paso 3 — Crear el proyecto nuevo en Supabase

1. Entra con la **cuenta nueva** en supabase.com.
2. **New Project** → elige nombre, contraseña de BD y región.
3. Espera a que el proyecto esté **Ready** (tarda ~2 minutos).
4. Anota:
   - **Project URL**: `https://<NUEVO_REF>.supabase.co`
   - **anon key** y **service_role key** (Settings → API)
   - **DB password** que elegiste al crear

---

### Paso 4 — Importar schema y datos al proyecto nuevo

```bash
# 1. Importar estructura
PGPASSWORD="<nueva_db_password>" psql \
  --host=db.<NUEVO_REF>.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  -f schema_export.sql

# 2. Importar datos
PGPASSWORD="<nueva_db_password>" psql \
  --host=db.<NUEVO_REF>.supabase.co \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  -f data_export.sql
```

---

### Paso 5 — Re-desplegar las Edge Functions

Las Edge Functions **no se exportan con pg_dump**. Hay que desplegarlas
manualmente en el proyecto nuevo.

```bash
# Asegúrate de tener Supabase CLI y estar logueado
supabase login

# Vincula el nuevo proyecto
supabase link --project-ref <NUEVO_REF>

# Despliega la Edge Function
supabase functions deploy procesar-archivo
```

> Si la CLI pide el `db-password`, usa el de la cuenta nueva.

---

### Paso 6 — Configurar las variables de entorno de la Edge Function

Las Edge Functions necesitan `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
Supabase las inyecta automáticamente cuando la función corre en el mismo
proyecto, pero si usas secrets adicionales:

```bash
supabase secrets set MI_SECRET=valor --project-ref <NUEVO_REF>
```

---

### Paso 7 — Actualizar las credenciales en Vercel

1. Ve a tu proyecto en **vercel.com** → **Settings** → **Environment
   Variables**.
2. Actualiza:
   - `SUPABASE_URL` → nueva URL
   - `SUPABASE_ANON_KEY` → nuevo anon key
3. Redespliega el proyecto: en Vercel → **Deployments** → **Redeploy** sobre
   el último deploy.

---

### Paso 8 — Actualizar Make.com

1. Abre el escenario en Make.
2. En el módulo **HTTP → Make a Request**, cambia la URL del endpoint:
   ```
   https://<NUEVO_REF>.supabase.co/functions/v1/procesar-archivo
   ```
3. Actualiza el header `Authorization` con la nueva `service_role` key.
4. Guarda y ejecuta un escenario de prueba.

---

### Paso 9 — Verificar integridad de datos

```sql
-- Ejecuta en el SQL Editor del proyecto NUEVO en Supabase Dashboard
SELECT COUNT(*) FROM transacciones;
SELECT COUNT(*) FROM usuarios;
```

Compara con los mismos counts en el proyecto original.

---

### Paso 10 — Desactivar el proyecto antiguo (cuando estés listo)

1. Supabase Dashboard (cuenta anterior) → proyecto → **Settings** →
   **General** → **Delete project**.
2. Escribe el nombre del proyecto para confirmar.

> No elimines hasta haber verificado que todo funciona en el proyecto nuevo
> y que ya no hay tráfico hacia el proyecto antiguo.

---

## Checklist de migración completa

### GitHub
- [ ] Organización creada
- [ ] Repositorio transferido
- [ ] Clones locales actualizados
- [ ] Vercel reconectado al nuevo repo
- [ ] CI/CD secrets re-configurados (si aplica)

### Supabase
- [ ] Schema exportado (`schema_export.sql`)
- [ ] Datos exportados (`data_export.sql`)
- [ ] Proyecto nuevo creado en cuenta empresa
- [ ] Schema importado sin errores
- [ ] Datos importados y verificados (conteos coinciden)
- [ ] Edge Function `procesar-archivo` desplegada
- [ ] Variables de entorno configuradas
- [ ] Vercel actualizado con nuevas credenciales
- [ ] Make.com actualizado con nueva URL y key
- [ ] Prueba end-to-end: subir archivo → datos aparecen en Supabase
- [ ] Proyecto antiguo eliminado
