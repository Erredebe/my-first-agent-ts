# Agente IA CLI (TypeScript)

CLI en TypeScript para chatear con un servidor OpenAI-compatible (ej. `lm-studio`, `llama.cpp` HTTP) usando el modelo `openai/gpt-oss-20b` en `http://127.0.0.1:1234/v1`.

Estructura:
- `src/config/` : configuración base (modelo, URL, prompts).
- `src/core/` : lógica del agente y tipos (`chatAgent.ts`, `types.ts`).
- `src/tools/` : herramientas locales (`fileTools.ts`).
- `src/cli/` : entrada de consola (`index.ts`).
- `src/server/` : servidor Express que expone API y sirve la UI.
- `public/` : frontal web (HTML/CSS/JS).

## Prerrequisitos
- Node.js 18+ y npm
- Servidor HTTP compatible con la API de OpenAI corriendo en `http://127.0.0.1:1234/v1` (puedes ajustar la URL con una variable de entorno)

## Instalación
```bash
npm install
```

## Variables de entorno
- `OPENAI_BASE_URL` (opcional): URL base del servidor. Por defecto `http://127.0.0.1:1234/v1`.
- `OPENAI_API_KEY` (opcional): clave si tu servidor la requiere. Se usa `"not-needed"` por defecto.
- `MODEL` (opcional): modelo a usar. Por defecto `openai/gpt-oss-20b`.
- `SYSTEM_PROMPT` (opcional): prompt del sistema.

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

### Frontal web
```bash
npm run start:web
```
- Abre `http://localhost:3000` y chatea desde el navegador (la sesión se conserva en localStorage).

## Scripts útiles
- `npm start` : ejecuta el agente con `tsx` (sin build previo).
- `npm run start:web` : lanza el servidor Express + frontal web.
- `npm run build` : compila a `dist/` con `tsc`.

## Notas
- Cambia modelo/URL/prompt en `src/config/index.ts` o vía variables de entorno.
- El streaming se muestra en tiempo real en la consola.
