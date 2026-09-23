# CMA Flux

Local workflow map for Homes by CMA. The whole client journey sits on a node canvas so the team can see the work, mark where apps and automations should land later, and export a Gantt once tasks have a number of days on them.

No logins. It runs on your machine, saves to SQLite, and anyone on the same map can edit live.

## Run it

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

The API and live socket sit on port 8787. Vite proxies `/api` and `/live` during development.

## What you get

The canvas is React Flow (MIT), not a paid Pro build. Palette on the left, inspector on the right, live save into SQLite, undo and copy-paste, and a Gantt view that walks the graph as finish-to-start dependencies.

Node types cover stages, tasks, decisions, roles, future applications, future automations, documents and external parties. Tasks with duration days feed the Gantt and the CSV export.

A starter map of the client journey (enquiry through to handover) is seeded on first run.

## Production

```bash
npm run build
npm start
```

That serves the built UI from the same Express process on port 8787.

## Database

SQLite file at `data/flux.sqlite` by default. Copy `.env.example` to `.env` if you want to change the path or port. Postgres can wait until the map gets more complex.

## Rollback

The schema is a single `workflows` table plus `meta`. Delete `data/flux.sqlite` and restart to rebuild from seed.
