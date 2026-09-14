# Infra — strangler-fig routing

During the migration, `cms.node2cloud.com` is served by a single reverse
proxy that splits traffic by path between the legacy Laravel app and the
new Next.js/NestJS stack. Each phase in
`../docs/ARCHITECTURE-MIGRATION-PLAN.md` is really just a change to
`nginx.conf.sample`'s routing rules — no code deploy needed to shift traffic
back to Laravel if something regresses.

`nginx.conf.sample` is a starting sketch, not a deployable config — fill in
real upstream ports/hosts once the new stack has a home (see the "Hosting
target" open question in the migration plan).
