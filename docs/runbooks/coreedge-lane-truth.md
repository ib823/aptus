# Runbook: Lanes that agree with the broker (P0.2)

Roadmap item P0.2 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2): audit findings A14, A15, A16, A17, A18, A19, A50, A60 and A70.

## What changed, in one paragraph each

**One authorisation predicate (A14).** The lane board kept its own copy of the
broker's rules, and the copy had drifted: a feed decided SANDBOX_ONLY for
PROD, a feed deprecated by its builder, an UPDATE feed and a legacy grant that
strict binding refuses all read "Live · Every hop proved" while the broker
refused every call. `src/lib/northbound/authorisation.ts` now holds the
decision: `authorisesHere` (the interface's mode and status, every grant
fetched for it, grant binding under `COREEDGE_GRANT_BINDING`, SANDBOX_ONLY and
READ_ONLY, revocation and expiry), `bindingFor` (which one connection) and the
write route's per-connection gates. The read route, the write route,
discovery's `callable`, the Test Console's dry run, the lane board
(`src/lib/coreedge/lane-authorisation.ts`) and the lane sweep all call them. The
key hop is `keyRefusal` in `key-policy.ts`, the rule authentication applies. A
write lane with no write key issued is drawn "No key". A write lane whose
sealed write key will not open (sealed under a data key that is gone, or
corrupt) is drawn "Key not valid": the board opens it with `writeKeyOpens`
(`write-credential.ts`), the same open the write route makes on every call,
only for apps with a feed that writes, and the key never leaves that
function.

**Binding on product and SAP client (A15).** The board counted the
organisation's connections by environment, so two products in one environment
read "Binding refused" while the broker served both, and a key bound to client
080 read Live on a read through client 100. The board and the sweep now bind
with `bindingFor` on the feed's product and the key's SAP client, and the
sweep reads through the connection the broker would use. The board opens the
product's connections as the broker does (one open per product per page, the
secrets never leave the server), which is how a connection whose secret will
not open is drawn "Secret unreadable".

**Unproven hops are drawn unproven (A16).** An Unknown lane used to draw six
green checks. The hops before the one that could not be proven pass; that hop
and every hop after it read "not checked". A lane nobody has started draws all
six as not checked.

**Every ledger status is read (A17).** The reader dropped NOT_FOUND and
UNAUTHORIZED, so a 404 or 401 read showed "no read has been proven". A 401 read
is now "401 · could not sign in"; a 404 is Unknown with the reason "SAP has no
such dataset (HTTP 404)" (the vocabulary has no chip for a 404 yet, the same
call the SAP systems matrix makes). Its gate strip draws the read hop failed
and the app hop not reached, not "not checked": the read was checked, and SAP
answered 404.

**Evidence says what it proved (A18).** A check is used only while it was made
through the connection the broker binds today, against the feed's entity set,
at the feed's current version (`LaneCheck.connectionId`, `entitySet`,
`interfaceVersion`; the version is bumped by every change to the feed's operation, dataset or service).
Re-saving a connection deletes the checks made through it, in the same
transaction, because a re-save can change the host, client or secret under the
same id. Such a lane reads Unknown, "not checked since it changed", until the
next check.

The same re-save also drops the connection's per-service health
(`SapServiceHealth`, the SAP system page's "readable N of N") and clears its
probe status and last success, so it reads "never tested" rather than healthy
on the old tenant's 200 until the next probe. And it bumps
`SapConnection.revision`: a lane check records its evidence only while the
connection row still carries the revision the check read through
(`recordLaneCheck` in `lane-check-sweep.ts`, a `SELECT ... FOR SHARE` in the
write's transaction). Without it, a sweep or Re-check already reading through
the old settings wrote the old system's answer under the connection's id
after the re-save had deleted the checks. Such an answer is discarded and
counted (`discardedConnectionChanged` on the run log; Re-check says "Not
recorded" and asks to re-check).

Probes are guarded the same way. The nightly probe, "Probe now" and Studio's
"Test connectivity" write a status only onto the revision they probed
(`swapProbeStatus` in `connection-probe-sweep.ts`, and the Studio test route).
A probe still running when the connection is re-saved records nothing about
the new settings: no status, no success time, no drift email. "Probe now" and
"Test connectivity" answer 409, "the connection changed while it was being
probed", and ask to run it again. The request did reach SAP, so it still
leaves its trace: a `SapConnectionProbeEvent` whose `source` ends in
`:superseded` (`test:superseded`, `manual:superseded`, `cron:superseded`),
and for "Test connectivity" a `TEST_CONNECT` audit row naming the builder,
with `superseded: true`. The drift baseline and the connection-drift incident
skip superseded events (`countedProbeEvents` in
`src/lib/ops/probe-event-source.ts`).

The drift email still fires on the first failing probe after a re-save. A
re-save clears the stored status, so the probe sweep judges the transition
against the last probe that actually ran for the connection (its latest
`SapConnectionProbeEvent` that is not superseded). A password rotation that was mistyped, on a
connection that last probed OK, is mailed as healthy-to-failing, as it was
before P0.2. A connection that has never been probed still has no baseline,
and its first failure is not mailed.

Two refusals are not "changes". A check written before checks recorded their
dataset and feed version reads "not checked since CoreEdge was upgraded",
not "not checked since it changed": nothing changed, only what it proved is
unknown. And a write lane refused by its connection's write gates (writes
switched off, or the feed's own service not verified through it) reads "a
setting, not a check": the sweep still reads through that connection, and
its check is not set aside.

**"Never checked" (A19).** The SAP systems screen decided "Never" from
`lastValidatedAt`, which moves only on a 200, so a connection failing every
night read "Never" with its status hidden. The column is now "Last probe": the
status the last probe recorded, and under it when the connection last
succeeded.

**Health decays (A50).** An "OK" counted as healthy whatever its age. It now
counts as healthy for 48 hours (`CONNECTION_PROOF_TTL_MS`,
`connectionHealthVerdict` in `src/lib/coreedge/freshness.ts`), after which the
connections-health route counts it `stale` and the topology lens draws it "not
observed" with a STALE badge. When a connection's secret will not open, the
nightly probe and "Probe now" record `UNREADABLE` as its status (it counts as
needing attention and in the unhealthy-connections incident); no probe event
is written and `lastValidatedAt` is left alone. The broker refuses the whole
product when any one of its connections will not open, so each row is opened
on its own to find which one is at fault. That row reads `UNREADABLE`; a
sibling whose own secret opens reads `GROUP_UNREADABLE` ("another connection
for this product will not open"), which counts the same way. The fix is to
re-save or deactivate the row marked `UNREADABLE`; re-saving a
`GROUP_UNREADABLE` row changes nothing. If every row opens on its own, the
failure was not a secret and nothing is written. Neither status is a probe
outcome, so neither counts as "was healthy" for the drift email.

**"Services readable" counts fresh proof only (A60).** The SAP system page
counted every OK or EMPTY read of any age. It now counts a service readable
only when its verdict is Live or No data (fresh metadata and a fresh read, 24
hours), and says how many have no fresh proof. A read that ran and failed is
never counted as "not proven": a fresh 401 on the read is Sign-in refused (the
read can ask a different service from the connection's metadata probe), and a
fresh 404 counts as failing, as the per-service row draws it. The reader takes
its read statuses from the writer (`LEDGER_READ_STATUSES`), so a status the
sweep records cannot be dropped to "unknown".

**Retired apps are not re-checked (A70).** Re-check on a retired or draft
app's lane read the client's SAP system although the nightly sweep never does.
The sweep and Re-check now follow one plan (`planLaneCheck`): app not live, no
dataset, access refused by the broker, no binding. A refused Re-check is
audited with its reason and no secret is opened for it; the lane page shows the
reason before the button is pressed. The nightly sweep also stops reading SAP
for lanes the broker refuses on access (`skippedNoAccess` on the jobs strip).

## What happens on deploy

Nothing that works today stops. No call-path behaviour changes and no setting
is added: the broker's routes ask the same questions in the same order (the
governance property test pins every answer), now through the shared functions.

- **Migration** `20261025000000_lane_check_evidence_key` adds two nullable
  columns to `LaneCheck` and `SapConnection.revision` (`NOT NULL DEFAULT 1`,
  a metadata-only change on PostgreSQL 11+). Additive; no backfill. Backout:
  `pnpm migrations:backout-sql 20261025000000_lane_check_evidence_key`.
- **Lanes read Unknown until the next lane check.** A check written before
  P0.2 does not say which dataset or feed version it read, so it proves
  nothing and is not used. Lanes that were Live read Unknown, "not checked
  since CoreEdge was upgraded", until the nightly sweep at 04:30 UTC rewrites
  them. To restore them at once, run the sweep after the deploy:
  `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/lane-checks`.
  Nothing that gates a call reads a lane.
- **Lanes the broker refuses now say so.** A lane that read Live on a grant
  that does not authorise it, a deprecated or UPDATE feed, another client's
  connection or an unreadable secret now reads the refusal. That is the board
  catching up with what the broker already did.
- **Fewer SAP reads at night.** The sweep no longer reads lanes the broker
  refuses on access, and reads each lane through the connection the broker
  binds (by product and SAP client) rather than whichever declared the
  environment.
- **Connection health.** Connections whose last OK is older than 48 hours move
  from Healthy to the new Stale tile on the Operations connections view (the
  row reads "OK · stale"), and draw "not observed · STALE" on the topology
  lens, until the next nightly probe (04:00 UTC) succeeds. `UNREADABLE` reads
  "the stored secret would not open — ours to fix" there, and "Needs setup"
  in Studio, with a line saying whose secret to re-save. Connections whose
  secret does not open read `UNREADABLE` after the next probe sweep, and
  their siblings for the same product read `GROUP_UNREADABLE`; both count
  toward the unhealthy-connections incident. No email is sent for that change
  of status.
- **Re-saving a connection** clears its lanes' checks, its service health and
  its probe status; they read Unknown, unproven and "never tested" until the
  next check and probe. If the first probe after a re-save fails, and the
  connection's last probe before it was OK, the admins get the
  healthy-to-failing drift email, as they did before P0.2. "Probe now" right
  after a save is how to see the new settings' health at once.

## Rolling back

Roll back the code; the columns can stay (the code before P0.2 ignores them,
and `revision` has a default, so its inserts need not name it).
`UNREADABLE` and `GROUP_UNREADABLE` statuses written by the sweep are
unrecognised values to the code before P0.2 (counted "unknown" on the connections view, drawn failing on the
topology lens) and are replaced by the next successful probe.

## Open decisions

- **A chip for a 404 on a dataset.** The eighteen statuses have none; lanes and
  the SAP systems matrix report Unknown with the reason. A status owned by the
  builder ("No such dataset") needs a product decision.
- **Statuses for refusals the vocabulary has no word for.** A deprecated feed,
  an UPDATE feed and a grant needing re-approval are drawn "No access" (owner:
  reviewer) with the exact reason; an unverified custom service on a write is
  "Binding refused"; a feed with no dataset or an unresolvable service is
  "Unknown" with the reason. Each could earn its own status and owner.
- **Alerting on UNREADABLE.** The probe sweep records it but does not email
  the organisation's admins as it does on a healthy-to-failing transition: the
  first sweep after deploy would email about every connection already in that
  state. Whether to add it to the drift alert is a decision for the product
  owner.
- **An incident for stale connections.** A connection with no successful probe
  in 48 hours is counted `stale`, but no incident rule fires on it.
- **A drift email after a re-save.** It is sent, judged against the last probe
  before the re-save, because it was sent before P0.2 and a re-save is when a
  working integration is most likely to break. Whether it should instead say
  "the new settings fail" rather than "started failing" is a decision for the
  product owner.
