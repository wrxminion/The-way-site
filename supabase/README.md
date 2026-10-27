# Database SQL (Supabase)

These files describe the database behind the member area, the review tools and the commons. They are reference and setup material only. **Nothing in this folder is deployed to the website**: the deploy recipe (`.cpanel.yml`) copies only the `site/` folders it lists.

There are no secret values here. The site itself carries only the project URL and a publishable key (`site/members/config.js`), which are public by design. Row-level security in the database is what protects the data. Service keys, the database password and email settings live in the Supabase dashboard and are never committed.

## What is here

| Folder | Contents |
|---|---|
| `migrations/` | `0001` to `0016`, in order. Each file is one change to the database (tables, functions, policies). |
| `run-once/` | Combined "run once" scripts that bring a project up to a given migration. They repeat what the numbered migrations do. |
| `members-backend/` | A one-paste setup script (`run-once-join-setup.sql`), the same script split into seven parts (`run-parts/`) for the SQL editor's size limit, the steps (`JOIN-STEPS.md`) and the design note for roles, karma, review and commons. |
| `members-backend/draft-unapproved/` | `0017_roles_profiles_karma.DRAFT.sql`. **A draft that has not been approved and must not be run.** It is kept so the design can be reviewed. |

## Rules

- The SQL is applied by hand, by the maintainer, in the Supabase SQL editor. Which of these files have been applied to the live project is not recorded in git. Do not assume a file here is live.
- Never edit an applied migration. Add a new numbered file instead.
- Migrations that write review records are append-only by design: reviews, corrections and audit events are never updated or deleted. Keep it that way.
- There are no tests in this folder yet. A change to a migration should say how it was checked.
- Do not add real member data, exports or backups here.
