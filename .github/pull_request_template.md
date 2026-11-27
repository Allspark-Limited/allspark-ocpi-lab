## Summary

Describe the change and why it is needed.

## Validation

- [ ] Focused tests cover changed behavior and failure modes
- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm audit` reviewed

Mark a gate not applicable only with a short explanation:

## Safety and compatibility

- [ ] Fixtures and retained evidence are synthetic
- [ ] No production credentials, endpoints, customer/payment data, database state, or real charging commands are included
- [ ] OCPI role and sender/receiver direction were reviewed where applicable
- [ ] Migration and configuration effects are documented where applicable
- [ ] Security and interoperability effects are documented where applicable

## Operational impact

- Hosted configuration or secrets changed: yes / no
- Database migration included: yes / no
- Deployment or package publication expected: yes / no
- Shared Allspark production contract or assumption changed: yes / no

Opening this pull request does not authorize merge, deployment, publication, or
another operational action. See `GOVERNANCE.md`.
