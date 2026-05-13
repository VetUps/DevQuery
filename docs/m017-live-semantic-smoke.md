# M017 Optional live provider smoke

This runbook is a manually gated supplement for M017 semantic knowledge graph readiness. It is optional live provider smoke, not part of default completion, CI, or agent verification. The deterministic gate is `bash scripts/verify-m017-semantic-readiness.sh` and must remain provider-free.

Run live GigaChat/DeepSeek checks only when valid credentials, outbound network, quota, and TLS trust are intentionally available. Do not paste secret values into chat, tickets, logs, or committed files; reference environment variable names only.

## Preconditions

- The default M017 readiness gate has passed locally.
- Provider credentials are already present in the intended secure environment, for example `GIGACHAT_CREDENTIALS`, `GIGACHAT_SCOPE`, `DEEPSEEK_API_KEY`, and related endpoint/model variables used by the backend settings.
- The operator accepts that live calls may consume quota and may fail because of provider, network, DNS, proxy, or TLS conditions.

## Safe command examples

From the repository root, run focused backend checks with live-provider settings intentionally enabled by the operator environment:

```bash
# Keep secret values out of shell history and logs; export names only here as documentation.
cd src/backend
DJANGO_TEST_SQLITE=1 ./venv/bin/python manage.py test apps.knowledge.tests.test_m016_live_semantic_providers
```

If the virtualenv is unavailable, use the same fallback pattern as the readiness gate:

```bash
cd src/backend
DJANGO_TEST_SQLITE=1 python3 manage.py test apps.knowledge.tests.test_m016_live_semantic_providers
```

To inspect semantic rebuild behavior through application logs or API responses, prefer owner/admin-only diagnostic surfaces and record only non-sensitive fields.

## Expected safe signals

Successful or safely degraded live smoke should expose diagnostic shape, not provider internals:

- `status`: stable success/degraded/error state for the rebuild or provider attempt.
- `reason_code`: bounded reason such as timeout, provider error, malformed response, missing credentials, or TLS/network failure.
- `phase`: the stage where the live attempt succeeded or failed, for example embedding, clustering, persistence, or graph response assembly.
- Aggregate counters: attempted items, succeeded items, failed items, reused stable groups, preserved stable groups, or skipped items.

Timeout, provider-error, or malformed-response outcomes are acceptable smoke findings when they preserve existing stable semantic groups and report bounded diagnostics. They must not erase stable groups or leak raw provider payloads.

## Redaction checks

Before copying output into a summary or issue, verify that public DTOs, logs, and screenshots do not include:

- provider names/models when the surface is public rather than owner/admin diagnostic;
- raw vectors, embeddings, prompts, source ids, source text, tracebacks, secrets, tokens, emails, or authorization headers;
- full live request/response bodies from GigaChat, DeepSeek, or transport adapters.

Record only the command, exit code, high-level `status`, `reason_code`, `phase`, aggregate counters, and whether stable groups were preserved.

## Default gate relationship

Do not add these live commands to `scripts/verify-m017-semantic-readiness.sh`, CI, or autonomous agent completion checks. The live smoke is intentionally manual so future agents can complete M017 readiness without credentials, live network, provider quota, or TLS dependencies.
