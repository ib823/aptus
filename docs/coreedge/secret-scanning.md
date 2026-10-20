# CoreEdge secret-scanning patterns

Every CoreEdge credential has a fixed, recognisable shape, so a leaked one can
be caught by a scanner before anyone uses it. This page publishes the patterns.
Load them into whatever scans your code, CI logs and chat exports: GitHub
secret scanning (custom patterns), gitleaks, trufflehog, a SIEM rule, or a log
filter.

The patterns are kept in code (`src/lib/northbound/secret-patterns.ts`), and a
test (`tests/unit/northbound/secret-patterns.test.ts`) proves three things on
every run:

- each pattern matches the credentials CoreEdge generates, with exactly one
  pattern per credential;
- they match nothing else in the CoreEdge repository, so loading them does not
  bury you in false positives;
- this page lists exactly the patterns the code holds.

## The shapes

Every credential is a prefix followed by 32 random bytes in unpadded
base64url: exactly 43 characters from `A-Z a-z 0-9 _ -`.

| Prefix | What it is | Since |
|---|---|---|
| `ce_live_` | A runtime key for **PROD**. It reaches production data. | P0.11 |
| `ce_test_` | A runtime key for SANDBOX, DEV or TEST. | P0.11 |
| `ce_` | A runtime key minted before P0.11, for any environment. These keep working until they expire. | first release |
| `cew_` | A write key, sent as `X-CoreEdge-Write-Key` beside a runtime key. | first release |
| `cec_` | A one-time claim-link token (the secret in a `/claim/...` URL). | first release |

`ce_live_` and `ce_test_` both begin with `ce_`, so a grep for `ce_` still
finds every runtime key. The patterns below are stricter than that grep: each
needs the exact length and a non-token character (or the start or end of the
text) on both sides. As a result the legacy `ce_` pattern never fires inside a
`ce_live_` key, and an identifier such as `ce_test_helper` matches nothing.

## The patterns

For engines with lookaround (PCRE, JavaScript, Python, .NET, ripgrep with
`-P`):

| Id | Severity | Pattern |
|---|---|---|
| `coreedge-live-key` | critical | `(?<![A-Za-z0-9_-])ce_live_[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])` |
| `coreedge-test-key` | high | `(?<![A-Za-z0-9_-])ce_test_[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])` |
| `coreedge-legacy-key` | critical | `(?<![A-Za-z0-9_-])ce_[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])` |
| `coreedge-write-key` | critical | `(?<![A-Za-z0-9_-])cew_[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])` |
| `coreedge-claim-link` | medium | `(?<![A-Za-z0-9_-])cec_[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])` |

A legacy key is rated critical because nothing in it says which environment it
is for: treat it as PROD until its lane says otherwise.

### Engines without lookaround

Some engines have no lookaround: RE2 (Go, gitleaks) and Hyperscan (GitHub
secret scanning). For these, use the pattern body and supply the boundaries
separately.

| Id | Body |
|---|---|
| `coreedge-live-key` | `ce_live_[A-Za-z0-9_-]{43}` |
| `coreedge-test-key` | `ce_test_[A-Za-z0-9_-]{43}` |
| `coreedge-legacy-key` | `ce_[A-Za-z0-9_-]{43}` |
| `coreedge-write-key` | `cew_[A-Za-z0-9_-]{43}` |
| `coreedge-claim-link` | `cec_[A-Za-z0-9_-]{43}` |

**GitHub custom patterns** (Settings > Code security > Secret scanning >
Custom patterns > New pattern; open "More options"):

- Secret format: the body, for example `ce_live_[A-Za-z0-9_-]{43}`
- Before secret: `\A|[^A-Za-z0-9_-]`
- After secret: `\z|[^A-Za-z0-9_-]`

Use the test-string box to check a pattern against a key from your own TEST
environment before you publish it. Never paste a PROD key.

**gitleaks** (`.gitleaks.toml`). Capture the key in a group and point
`secretGroup` at it:

```toml
[[rules]]
id = "coreedge-live-key"
description = "CoreEdge PROD runtime key (ce_live_)"
regex = '''(?:^|[^A-Za-z0-9_-])(ce_live_[A-Za-z0-9_-]{43})(?:[^A-Za-z0-9_-]|$)'''
secretGroup = 1
keywords = ["ce_live_"]
```

Repeat for each id in the table above, with that id's body and prefix keyword.

## What to do with a hit

| Id | Remedy |
|---|---|
| `coreedge-live-key` | Revoke it in CoreEdge (Operations > Keys, or Developer Studio > API Access). Revoking ends this key and any key a rotation left overlapping it, in the same moment. Then issue a new key. |
| `coreedge-test-key` | Revoke it, then issue a new one. It cannot reach production data, but TEST may hold copies of production data. |
| `coreedge-legacy-key` | Revoke it, then issue a new one. The new key will carry `ce_live_` or `ce_test_`. |
| `coreedge-write-key` | Revoke the runtime key it sits beside. That destroys the write key too. Then issue both again. |
| `coreedge-claim-link` | If nobody has collected the key yet, send a new link: that revokes this one. If the key has been collected, the link is spent and nothing is left behind it. |

**Do not rotate a leaked key.** Rotation keeps the replaced key working for the
overlap window (24 hours by default), so that a planned rotation causes no
failed calls. That is the opposite of what a leak needs. Revoke the key, which
ends both the current and the previous key at once.

## GitHub partner programme

CoreEdge is not yet registered with GitHub's secret-scanning partner programme,
so GitHub does not report CoreEdge keys found in public repositories to us.
Until it is, the custom patterns above are how an organisation catches its own
leaks. Registration is tracked in the roadmap (P0.11, [E56] in
`CoreEdge-Gap-Study-and-Roadmap.md`).
