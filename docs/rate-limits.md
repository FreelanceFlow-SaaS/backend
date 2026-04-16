# Rate limiting — API FreelanceFlow

Préfixe global : **`/api/v1`** (toutes les URLs ci-dessous sont relatives à ce préfixe).

## Comportement général

| Élément             | Détail                                                                                                                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bibliothèque        | `@nestjs/throttler` v6                                                                                                                                                                                                                                                     |
| Garde utilisée      | `RouteUserThrottlerGuard` — clé de comptage : **`userId:route`** si JWT présent, sinon **`ip:route`** (ex. login anonyme)                                                                                                                                                  |
| Fenêtre             | **`ttl`** en millisecondes ; ci-dessous exprimée en **requêtes / minute** quand `ttl = 60_000`                                                                                                                                                                             |
| Stockage            | Si `REDIS_URL` est défini, compteurs partagés via `RedisThrottlerStorage` (plusieurs instances)                                                                                                                                                                            |
| Réponse dépassement | **429** — message configuré : _« Trop de requêtes. Réessayez plus tard. »_ (voir `GoldenRuleExceptionFilter` pour l’enveloppe JSON)                                                                                                                                        |
| Module racine       | `ThrottlerModule` enregistre un throttler `default` avec une limite très haute (`999_999` / 60 s) : **aucun garde throttler global** n’est appliqué ; seules les routes décorées avec `@Throttle` **et** `@UseGuards(RouteUserThrottlerGuard)` sont réellement plafonnées. |

> **Maintenance :** toute nouvelle route avec `@Throttle` doit être ajoutée ici et idéalement garder les décorateurs sur le handler concerné (`auth.controller.ts`, `pdf.controller.ts`, `invoices.controller.ts` aujourd’hui).

---

## Routes avec limite explicite

| Méthode | Chemin                     | Limite     | Fenêtre | Garde                     | Fichier source                                |
| ------- | -------------------------- | ---------- | ------- | ------------------------- | --------------------------------------------- |
| `POST`  | `/auth/login`              | **30** req | 60 s    | `RouteUserThrottlerGuard` | `src/modules/auth/auth.controller.ts`         |
| `GET`   | `/pdf/invoices/:id`        | **60** req | 60 s    | `RouteUserThrottlerGuard` | `src/modules/pdf/pdf.controller.ts`           |
| `POST`  | `/invoices/:id/send-email` | **20** req | 60 s    | `RouteUserThrottlerGuard` | `src/modules/invoices/invoices.controller.ts` |

---

## Autres routes (pas de `@Throttle` / pas de `RouteUserThrottlerGuard`)

Ces endpoints **ne sont pas** limités par `@nestjs/throttler` dans l’état actuel du code (protection éventuelle : reverse proxy, WAF, etc.).

### Auth

| Méthode | Chemin           |
| ------- | ---------------- |
| `POST`  | `/auth/register` |
| `POST`  | `/auth/logout`   |
| `POST`  | `/auth/refresh`  |

### Utilisateurs

| Méthode | Chemin                |
| ------- | --------------------- |
| `GET`   | `/users/profile`      |
| `PATCH` | `/users/profile`      |
| `POST`  | `/users/profile/logo` |
| `GET`   | `/users/profile/logo` |

### Clients

| Méthode  | Chemin            |
| -------- | ----------------- |
| `POST`   | `/clients`        |
| `GET`    | `/clients`        |
| `GET`    | `/clients/export` |
| `GET`    | `/clients/:id`    |
| `PATCH`  | `/clients/:id`    |
| `DELETE` | `/clients/:id`    |

### Prestations (services)

| Méthode  | Chemin          |
| -------- | --------------- |
| `POST`   | `/services`     |
| `GET`    | `/services`     |
| `GET`    | `/services/:id` |
| `PATCH`  | `/services/:id` |
| `DELETE` | `/services/:id` |

### Factures (hors envoi email)

| Méthode  | Chemin                 |
| -------- | ---------------------- |
| `POST`   | `/invoices`            |
| `GET`    | `/invoices`            |
| `GET`    | `/invoices/export`     |
| `GET`    | `/invoices/:id`        |
| `PATCH`  | `/invoices/:id`        |
| `PATCH`  | `/invoices/:id/lines`  |
| `PATCH`  | `/invoices/:id/status` |
| `DELETE` | `/invoices/:id`        |

### Tableau de bord

| Méthode | Chemin               |
| ------- | -------------------- |
| `GET`   | `/dashboard/summary` |

### Santé

| Méthode | Chemin    |
| ------- | --------- |
| `GET`   | `/health` |

---

## Tests

Le module de test `src/common/testing/throttler-test.module.ts` fixe des limites très hautes pour ne pas provoquer de **429** dans les specs d’intégration.
