# Delicious Burger — Sistema de comandas

POS y panel operativo para restaurante: mesas, domicilios, cocina, caja, inventario y reportes.

## Requisitos

- Node.js >= 22.12
- pnpm
- Base de datos [Turso](https://turso.tech/) (libSQL)

## Configuración local

1. Clona el repositorio e instala dependencias:

```bash
pnpm install
```

2. Copia las variables de entorno:

```bash
cp .env.example .env
```

3. Completa `.env`:

| Variable | Descripción |
|----------|-------------|
| `TURSO_URL` | URL de la base Turso (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Token de autenticación Turso |
| `JWT_SECRET` | Secreto para sesiones (mín. 32 caracteres aleatorios) |

4. Inicializa la base de datos:

```bash
pnpm db:migrate
```

Esto crea el esquema desde `src/lib/db/db.sql` en bases nuevas y aplica migraciones incrementales en bases existentes.

5. (Opcional) Datos iniciales — mesas y usuario admin:

```bash
pnpm db:seed
```

6. Inicia el servidor de desarrollo:

```bash
pnpm dev
```

Abre `http://localhost:4321/login`.

## Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de producción |
| `pnpm preview` | Vista previa del build |
| `pnpm db:migrate` | Migraciones / esquema inicial |
| `pnpm db:seed` | Mesas + usuario admin |
| `pnpm test` | Tests automatizados |

## Despliegue en Netlify

### 1. Crear base Turso

1. Crea una base en [Turso](https://turso.tech/).
2. Obtén `TURSO_URL` y `TURSO_AUTH_TOKEN`.

### 2. Conectar repositorio en Netlify

1. Importa el repositorio en [Netlify](https://app.netlify.com/).
2. El archivo `netlify.toml` ya define:
   - **Build command:** `pnpm run build`
   - **Publish directory:** `dist`
   - **Node:** 22

### 3. Variables de entorno en Netlify

En **Site settings → Environment variables**, agrega:

```
TURSO_URL=libsql://tu-base.turso.io
TURSO_AUTH_TOKEN=tu-token
JWT_SECRET=un-secreto-largo-y-aleatorio
```

### 4. Migrar la base de datos

Desde tu máquina local (con el `.env` apuntando a la base de producción):

```bash
pnpm db:migrate
```

En el primer deploy, esto crea todas las tablas automáticamente.

### 5. Deploy

Haz push a la rama conectada o ejecuta deploy manual. Netlify usará el adapter `@astrojs/netlify` para SSR.

### Deploy manual con CLI

```bash
pnpm build
npx netlify deploy --prod
```

> **Nota Windows:** el build local puede fallar al crear symlinks en `.netlify/`. En Netlify (Linux) no ocurre. Usa `netlify deploy` o CI para builds de producción.

## Roles del sistema

| Rol | Acceso |
|-----|--------|
| **Admin** | Panel completo: catálogo, inventario, reportes, usuarios, tasas |
| **Cajero** | Caja, facturas, comandas, mesas, domicilios |
| **Mesero** | Mesas, domicilios, comandas y tablero de cocina (marcar listo y entregado) |
| **Cocina** | Tablero de cocina (redirige automáticamente a `/panel/cocina`) |

## White-label

Edita `src/data/brand.ts` para cambiar nombre, colores, logo y textos. Los assets van en `public/brand/`.

## Seguridad

- Sesiones JWT en cookie `httpOnly` (8 horas).
- Rate limit en login: 5 intentos por IP cada 15 minutos.
- Usuarios desactivados pierden acceso inmediato (validación en cada request).
- Cambia las credenciales por defecto del seed antes de producción.

## Tests

```bash
pnpm test
```

Incluye smoke tests del flujo operativo: comanda → cocina → cobro → cierre de caja.
