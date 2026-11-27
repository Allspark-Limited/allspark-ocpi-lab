# Repository governance

Allspark OCPI Lab is an open-source project. Anyone may propose a change through
a pull request, including people working from forks and automated dependency or
development tools. A contributor does not need to belong to an allowlist or use
a particular editor, agent, or workflow.

## Review and release control

Pull requests target `main`. Before merge, the repository final gate verifies
the exact head and base commits, reviews the complete diff, records a result,
and waits for required checks. Review covers protocol correctness, synthetic
fixture isolation, security, interoperability, migrations and configuration,
and public build stability.

Changes should include focused tests and, when applicable, pass:

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm audit`

Explicit human approval is required before merging, deploying, publishing a
package or release, changing hosted secrets or configuration, or performing
another operational mutation. Review completion alone is not approval for
those actions.

## Public safety boundary

This repository may contain only synthetic fixtures and evidence. Do not add:

- partner or production credentials;
- customer, payment, or other personal data;
- production endpoints or database state;
- commands capable of initiating or stopping real charging sessions; or
- retained evidence copied from an Allspark production environment.

Use clearly fictional identifiers and endpoints reserved for documentation or
local testing. Report suspected credential or data exposure privately as
described in `SECURITY.md`.

## Relationship to Allspark production

Lab validation is not production evidence. A change is escalated to the
Allspark production release gate only when it changes a shared contract, a
production-facing OCPI assumption, a cross-repository security boundary, or
evidence intended to support a production decision.

These controls govern review, merge, release, credentials, hosted environments,
and operational mutations. They do not restrict who may contribute.
