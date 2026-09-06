# NE-SHIELD Mobile

A mobile-first field app for landslide risk awareness, community reports, alerts, and safer routing. It is a standalone Vite React client using demo data so it can be previewed without credentials or backend services.

## Run

```powershell
cd mobile-app
npm install
npm run dev
```

## Next integration points

- Replace the demo district and alert arrays in `src/App.jsx` with the existing `/api/risk`, `/api/alerts`, `/api/routes`, and `/api/incidents` services.
- Register device notifications through the existing Firebase flow only after mobile client configuration is set up.
- Keep Firebase service-account JSON server-side and outside the repository.
