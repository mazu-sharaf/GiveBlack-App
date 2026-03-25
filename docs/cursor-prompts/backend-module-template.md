# Cursor prompt: backend module generation

Use this prompt to generate a new API module in `apps/api/src/modules/<module-name>/`.

Requirements:
- Create `schema.ts`, `service.ts`, `repository.ts`, and `routes.ts`.
- Use `zod` for request/response validation.
- Route handlers must use Fastify and include auth guard when needed.
- Repository must use parameterized SQL queries through `pg`.
- Add unit test stubs in `apps/api/src/modules/<module-name>/__tests__/`.
- Update OpenAPI docs when adding endpoints.

Quality gates:
- `npm run -w @giveblack/api typecheck`
- `npm run lint` (workspace)
- Tests for happy path + validation failures
