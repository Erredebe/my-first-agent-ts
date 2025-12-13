# Agente IA CLI (TypeScript)

CLI en TypeScript para chatear con un servidor compatible con la API de OpenAI (por ejemplo `lm-studio` o `llama.cpp` HTTP) usando el modelo por defecto `deepseek/deepseek-r1-0528-qwen3-8b` en `http://127.0.0.1:1234/v1`.

Estructura:
- `src/config/` : configuración base (modelo, URL, prompts).
- `src/core/` : lógica del agente y tipos (`chatAgent.ts`, `types.ts`).
- `src/tools/` : herramientas locales (`fileTools.ts`).
- `src/cli/` : entrada de consola (`index.ts`).
- `src/server/` : servidor Express que expone la API y sirve la UI.
- `public/` : frontal web (HTML/CSS/JS).

## Prerrequisitos
- Node.js 18+ y npm
- Servidor HTTP compatible con la API de OpenAI corriendo en `http://127.0.0.1:1234/v1` (ajustable vía variable de entorno)

## Instalación
```bash
npm install
```

## Variables de entorno
- `OPENAI_BASE_URL` (opcional): URL base del servidor. Por defecto `http://127.0.0.1:1234/v1`.
- `OPENAI_API_KEY` (opcional): clave si tu servidor la requiere. Se usa `"not-needed"` por defecto.
- `MODEL` (opcional): modelo a usar. Por defecto `deepseek/deepseek-r1-0528-qwen3-8b`.
- `SYSTEM_PROMPT` (opcional): prompt del sistema.

### Variables de despliegue
- `FRONTEND_URL` (backend): URL del frontend para configurar CORS. Por defecto `http://localhost:3000`.
- `PORT` (backend): Puerto del servidor backend. Por defecto `3000`.
- `window.API_URL` (frontend): URL del backend. Definir en `public/config.js` antes de cargar `main.js`.

## Uso
```bash
npm start
```

- Escribe tu mensaje y pulsa Enter.
- Comandos CLI:
  - `/borrar` : limpia el contexto manteniendo el system prompt.
  - `/salir`  : cierra la sesión.
- Herramientas disponibles (el modelo decide llamarlas):
  - `read_file(file_path, max_bytes?)` : lee archivos (limita a 200 KB por defecto).
  - `write_file(file_path, content, mode=replace|append)` : sobrescribe o añade.
  - `prepare_file_download(file_path, content, mode=replace|append)` : escribe y genera enlace de descarga.
  - `prepare_download(file_path)` : genera enlace de descarga de un archivo existente.

### Frontal web
```bash
npm run start:web
```
- Abre `http://localhost:3000` y chatea desde el navegador (la sesión se conserva en `localStorage`).
- El selector superior se llena con `/api/models` (proxy de `/v1/models` del backend configurado) y reinicia el contexto al cambiar de modelo.
- El system prompt actual se muestra y se puede actualizar desde la barra superior; al guardarlo se reinicia la conversaci?n.

## Scripts útiles
- `npm start` : ejecuta el agente con `tsx` (sin build previo).
- `npm run start:web` : lanza el servidor Express + frontal web.
- `npm run build` : compila a `dist/` con `tsc`.
- `npm test` : ejecuta la batería de pruebas con Vitest.

## Notas
- Cambia modelo/URL/prompt en `src/config/index.ts` o vía variables de entorno.
- El streaming se muestra en tiempo real en la consola.

## Despliegue separado (Frontend + Backend)

El proyecto está configurado para poder desplegar el frontend y backend por separado:

### Backend
```bash
# Servidor API (por defecto en puerto 3000)
FRONTEND_URL=https://mi-frontend.com npm run start:web
```

### Frontend
Servir los archivos de `public/` con cualquier servidor estático. Antes de servir, editar `public/config.js`:
```javascript
window.API_URL = "https://mi-backend.com";
```

**Ejemplo con servidor estático:**
```bash
cd public
npx serve -p 8080
```
