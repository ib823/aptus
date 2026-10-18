# Runbook: Moving a SuccessFactors connection to signed SAML bearer

## When to run

When a SuccessFactors connection still authenticates with HTTP Basic. The
probe sweep says so in the server log:

```
[sf-basic-auth] connection <key> authenticates to SuccessFactors with HTTP Basic.
SAP retires it on 2026-11-20 …
```

Do it **before 20 November 2026**. Sources disagree on whether Basic stops
working that day or a year later; treat 20 November as the deadline.

## What changes

CoreEdge holds the RSA private key from the SuccessFactors OAuth client
registration, and **signs a fresh, ten-minute SAML assertion for every token
request** (`src/lib/sap-public/saml-assertion.ts`). Nothing long-lived or
replayable is stored, and no-one pastes assertions again.

The older option, pasting a pre-signed assertion, is still accepted. It stops
working when that assertion expires, which is ten minutes by default with SAP's
offline generator.

## 1 · In SuccessFactors (an SF administrator)

1. **Admin Center → Manage OAuth2 Client Applications → Register Client
   Application.**
   - **Application Name**, e.g. `CoreEdge`.
   - **Application URL**: `https://ab-workbench.vercel.app`.
   - **X.509 Certificate**: either option below works.
     - **Generate X.509 Certificate**, then **Download**. This gives you
       `Certificate.pem`. Keep that file, and only then click **Register**.
     - Or register a certificate you generated yourself. SAP recommends this
       (KBA 2850646):
       ```bash
       openssl req -nodes -x509 -sha256 -newkey rsa:2048 \
         -keyout private.pem -out public.pem -days 730 -subj "/CN=CoreEdge"
       ```
       Paste the base64 body of `public.pem` into the registration, without
       the BEGIN/END lines. Keep `private.pem`.
   - **Bind to Users** is optional. SAP's documented rules:
     - No users bound: any business user can request tokens, technical users
       cannot.
     - Business users bound: only those users can.
     - Only technical users bound: those users and any business user can.
     - A binding added to an *existing* client can take up to about a day to
       take effect (KBA 3146449).
2. **Write down**:
   - the **API Key** shown for the registered application;
   - your **company id**;
   - your **API server host**, e.g. `api4.successfactors.com`. This must be the
     API host, not the UI or login host.
3. **Choose the user** the tokens are issued for.
   - Use its **user ID**, not its username or e-mail address.
   - The user must be active and allowed to log in.
   - It needs role-based permissions for the APIs CoreEdge will call. The token
     acts as this user.
4. **Check IP restrictions.** If the instance restricts API access by IP
   address, `/oauth/token` is restricted too. CoreEdge runs on Vercel, whose
   outbound addresses are not fixed.

## 2 · In CoreEdge

**Studio → Connections.** Save the connection again under the **same key**
(e.g. `zvcsf`), with the same product, base URL and environment. Saving under
an existing key replaces that connection; it does not create a second one.

| Field | Value |
|---|---|
| Auth | OAuth SAML bearer — SuccessFactors |
| API key (client id) | the API Key from step 1 |
| Company id | your company id |
| Token URL | `https://<api-host>/oauth/token`, exactly. It is also the assertion's Recipient. |
| Assertion | **CoreEdge signs a fresh one for each token** |
| SuccessFactors user id | the user ID from step 1.3 |
| Private key | the **whole** `Certificate.pem`, or your `private.pem` |

Notes on the private key:

- SuccessFactors labels the key block in `Certificate.pem` `ENCRYPTED PRIVATE
  KEY`. **It is not encrypted.** CoreEdge reads that format as it is.
- When the pasted file also contains the certificate, CoreEdge checks that the
  key belongs to it before saving.
- A key that really is passphrase-protected is refused, with a sentence
  saying so.

The key is sealed (AES-256-GCM, bound to this connection) and is never shown
again. To rotate it, save the connection again with the new key.

Then press **Test**.

## 3 · Reading the Test result

When SuccessFactors refuses, the Test result quotes its own message, with long
tokens removed. These messages are confirmed in SAP's documentation:

| SuccessFactors says | Usually means |
|---|---|
| `Unable to verify the signature of the SAML assertion` | The key does not belong to the certificate registered for this API key. |
| `Unable to validate "Recipient"` | The token URL is not the API host's `/oauth/token`. |
| `Unable to validate "api_key"` | The API key field does not match the registered application. |
| `Login failed - invalid user` | The user ID is unknown, inactive or not allowed. Check that you used the user ID, not the username. |
| `OAUTH2_ERROR_SAML_ASSERTION_EXPIRED` | Clock trouble. CoreEdge backdates NotBefore by ten minutes, as SAP's tool does. |
| Company does not exist / is inactive | The company id is wrong. |

If binding is enabled and the user is not bound, SuccessFactors refuses the
token as well. The exact wording of that message is unconfirmed.

Two fallbacks exist if the live tenant rejects a correct key pair. Both are
code changes, not settings:

- `Unable to validate "Issuer"`: set the Issuer to the API key instead of
  `www.successfactors.com`.
- A signature failure with a key pair known to match: add
  `InclusiveNamespaces PrefixList="xs"`, which is what SAP's offline tool emits.

## The env-var tenant

The deployment's own SuccessFactors tenant (`SF_TDD_*`, used by
`/sap-explorer`) takes the same two values:

```
SF_TDD_AUTH_TYPE="oauth-saml-bearer"
SF_TDD_SAML_PRIVATE_KEY="<Certificate.pem or private.pem>"   # "\n" escapes are decoded
SF_TDD_SAML_USER_ID="<user id>"
```

## How the signer is verified

The test suite checks the signer in three ways:

- `xmlsec1`, the reference XML-DSig implementation, verifies every assertion
  wherever it is installed. A tampered copy is the control that it can reject.
- The canonical bytes for fixed inputs are pinned. `xmlsec1`'s own pre-digest
  buffer was byte-identical to them.
- CI checks the enveloped-signature relationship on every run.

The end-to-end check is pressing **Test** on a real connection.

Sources: SAP Help Portal, *Registering Your OAuth2 Client Application*,
*Generating a SAML Assertion* and *OAuth 2.0 Errors*; SAP KBAs 3031657,
3146449, 2850646 and 2668018.
