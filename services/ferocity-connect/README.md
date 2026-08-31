# Ferocity Connect device-plane service

This process exposes only the Android device endpoints and `/health`. It reuses the same reviewed handlers as the Ferocity web application, but can be deployed, scaled, monitored, and rolled back independently behind the `/api/ferocity-connect/device/*` route.

Required environment variables are the same database/TLS settings used by Ferocity. The service must run behind TLS and a reverse proxy with request-size, connection, and IP-level abuse controls. It does not expose workspace owner or platform-administrator routes.

Run locally from the repository root with `npm run ferocity-connect:service`. Build the container with `docker build -f services/ferocity-connect/Dockerfile .`. Do not expose the service directly before migration 193 is applied and the physical-device certification gates are complete.
