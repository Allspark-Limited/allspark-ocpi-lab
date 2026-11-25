# Security policy

## Supported versions

Until the first stable release, only the latest commit on the default branch will receive security fixes.

## Reporting

Do not open a public issue for a suspected vulnerability. Report it privately to the project maintainers with the affected version, impact, reproduction steps, and any suggested mitigation. A dedicated disclosure address will be added before publication.

Do not include real OCPI credentials, partner payloads, customer information, or production URLs in a report. Use synthetic replacements.

## Security model

The lab is synthetic-only. Credentials are encrypted with AES-256-GCM and environment-bound authenticated context. Token lookup uses non-reversible hashes. Administrative and protocol endpoints are separate.

Self-hosters are responsible for authentication, network egress controls, TLS, backups, key management, rate limits, updates, and data retention.
