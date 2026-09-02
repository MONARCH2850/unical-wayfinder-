# Optional Django/PostGIS backend

This folder is intentionally independent from the browser-only PWA. Copy the modules into a Django project, add `backend` to `INSTALLED_APPS`, enable `rest_framework.authtoken`, and include `backend.urls` at the project root.

Use PostgreSQL with PostGIS enabled:

```sql
CREATE EXTENSION postgis;
```

Configure `ENGINE=django.contrib.gis.db.backends.postgis` and set `UNICAL_API_BASE` in the frontend to the deployed API origin. Run `makemigrations backend` and `migrate`; migrations are additive and do not touch localStorage pins.
