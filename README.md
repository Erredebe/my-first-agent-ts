# Agente IA CLI (TypeScript)

CLI sencilla en TypeScript para chatear con un servidor OpenAI-compatible (ej. `lm-studio`, `llama.cpp` HTTP) usando el modelo `openai/gpt-oss-20b` en `http://127.0.0.1:1234/v1`.

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

## Uso
```bash
npm start
```

- Escribe tu mensaje y pulsa Enter.
- Comandos:
  - `/borrar` : limpia el contexto manteniendo el system prompt.
  - `/salir`  : cierra la sesión.

## Scripts útiles
- `npm start` : ejecuta el agente con `tsx` (sin build previo).
- `npm run build` : compila a `dist/` con `tsc`.

## Notas
- El modelo configurado es `openai/gpt-oss-20b`. Cámbialo en `src/index.ts` si necesitas otro.
- El streaming se muestra en tiempo real en la consola.
