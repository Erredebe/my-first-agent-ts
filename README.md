# Agente IA CLI (TypeScript)

CLI en TypeScript para chatear con un servidor compatible con la API de OpenAI (por ejemplo `lm-studio`, `ollama` o `llama.cpp` HTTP) usando por defecto el modelo `openai/gpt-oss-20b` en `http://127.0.0.1:1234/v1`. Incluye un agente orquestador que decide dinámicamente qué agente especializado debe actuar (chat, ficheros o web), siguiendo el patrón multi-agente para dividir el trabajo en piezas sencillas.

Estructura:
- `src/agents/` : orquestador y agentes especializados (`orchestratorAgent.ts`, `fileAgent.ts`, `webAgent.ts`).
- `src/config/` : configuración base (modelo, URL, prompts).
- `src/core/` : lógica del agente y tipos (`chatAgent.ts`, `types.ts`).
- `src/tools/` : herramientas locales (`fileTools.ts`).
- `src/cli/` : entrada de consola (`index.ts`).
- `src/server/` : servidor Express que expone la API y sirve la UI.
- `public/` : frontal web (HTML/CSS/JS).

## Funcionalidades principales

- **Orquestación multi-agente**:
  - El `OrchestratorAgent` enruta cada mensaje al agente adecuado: conversación general (`ChatAgent`), acciones directas sobre ficheros (`FileAgent`) o lecturas rápidas de URLs (`WebAgent`).【F:src/agents/orchestratorAgent.ts†L15-L123】
  - Historial unificado y propagación de cambios de modelo o system prompt a todos los sub-agentes.

- **CLI interactiva** (`npm start`):
  - Detecta el backend disponible (LM Studio u Ollama) y muestra el estado de conexión.
  - Comandos integrados: `/model` (lista modelos desde el backend detectado), `/model <idx|nombre>` (cambia de modelo y reinicia el agente), `/system` (muestra o actualiza el system prompt), `/borrar` (limpia el contexto) y `/salir` (cierra la sesión).【F:src/cli/index.ts†L15-L121】
  - Rutas rápidas: `/file ...` para leer/escribir/preparar descargas y `/web <url>` para recuperar contenido sin pasar por el modelo.【F:src/agents/fileAgent.ts†L65-L126】【F:src/agents/webAgent.ts†L3-L33】

- **Servidor Express + API REST** (`npm run start:web`):
  - Endpoints clave: `/api/chat` (chat con sesiones por `sessionId`), `/api/models` (lista modelos detectando backend), `/api/model` y `/api/model/load` (actualiza modelo/baseURL y limpia sesiones), `/api/system-prompt` (lee/actualiza prompt) y `/api/download/:token` (descarga archivos generados por las herramientas).【F:src/server/index.ts†L35-L205】
  - Genera tokens de descarga efímeros para archivos creados desde herramientas (`prepare_file_download`/`prepare_download`).【F:src/server/downloads.ts†L1-L14】
  - Abre automáticamente el navegador local y aplica CORS configurables mediante `FRONTEND_URL`.【F:src/server/index.ts†L20-L31】【F:src/server/index.ts†L232-L252】

- **Herramientas del modelo** (`tools/`):
  - Archivos: leer (`read_file`), escribir (`write_file`), preparar descargas para archivos existentes o generados (`prepare_download`, `prepare_file_download`) con límites de tamaño configurables y enlaces listos para el navegador.【F:src/tools/fileTools.ts†L1-L158】【F:src/config/index.ts†L9-L63】
  - Web: obtener contenido de URLs HTTP/HTTPS con validación básica y truncado configurable (`fetch_url`).【F:src/tools/webTools.ts†L1-L92】

- **Frontend web ligero** (`public/`):
  - Selector de modelos alimentado por `/api/models`, con información adicional (familia/tamaño), estado de conexión y controles de recarga.【F:public/main.js†L23-L115】
  - Persistencia en `localStorage` de sesión, modelo activo y estado del toolbar colapsable; muestra indicador de “pensando”, manejo de envío con Enter y reacciones al cambiar modelo o system prompt (reinicia conversación).【F:public/main.js†L14-L31】【F:public/main.js†L124-L277】
  - Editor del system prompt con carga/guardado vía API y feedback inline; historial de mensajes con renderizado especial para respuestas del asistente.【F:public/main.js†L117-L214】【F:public/main.js†L278-L384】

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
- `MODEL` (opcional): modelo a usar. Por defecto `openai/gpt-oss-20b`.
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
- Comandos CLI disponibles:
  - `/model` : lista los modelos disponibles detectando el backend activo.
  - `/model <idx|nombre>` : cambia al modelo indicado y reinicia el agente.
  - `/system` : muestra o actualiza el system prompt.
  - `/borrar` : limpia el contexto manteniendo el system prompt.
  - `/salir` : cierra la sesión.
  - Comandos directos del orquestador: `/file` (leer, escribir, preparar descargas) y `/web <url>` para consultas rápidas sin pasar por el modelo.【F:src/agents/fileAgent.ts†L65-L126】【F:src/agents/webAgent.ts†L3-L33】
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
