# Security Policy

## Reporting a vulnerability

**Do not open a public GitHub issue for a suspected vulnerability.** This
repository is public; an issue describing a live weakness is a disclosure to
everyone who can read it, including before it is fixed.

Report privately, by either route:

- **GitHub Private Vulnerability Reporting** — the *Security* tab → *Report a
  vulnerability*. Preferred, because it keeps the report, the discussion and the
  fix in one place.
- **Direct contact** — `@ib823` on Telegram, as listed in [LICENSE](./LICENSE).

Please include what you observed, the URL or code path, and what an attacker
would gain. A proof-of-concept helps; testing beyond what is needed to
demonstrate the issue does not.

### What to expect

This is a small project without a staffed security team, so no response-time
guarantee is offered rather than one being offered and missed. Reports are read
and acted on; expect an acknowledgement within a week.

## Scope

Only the code in this repository. **Do not test against the live deployment** —
it carries real engagement data belonging to third parties. Run it locally
(see [README](./README.md)) and demonstrate findings there.

Out of scope: findings that require an already-compromised account or device;
missing hardening headers with no demonstrated impact; results from automated
scanners submitted without a working proof-of-concept; and denial of service.

## What this repository does not contain

No credentials, connection strings, API keys or tokens are committed. Every
credential-shaped value in the tree is a placeholder in `.env.example` or a
`postgres:postgres@localhost` fixture used by CI and the test suite. Real values
live only in the deployment environment.

If you believe you have found a genuine secret in the repository or its history,
treat it as a vulnerability and report it privately using the routes above.

## Licence note

This software is proprietary and all rights are reserved. Public readability is
not a licence to use, copy or modify it — see [LICENSE](./LICENSE). Reporting a
security issue in good faith is welcome regardless.
