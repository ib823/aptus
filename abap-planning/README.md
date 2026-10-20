# abap-planning

Budget planning engine and application for SAP S/4HANA, written in ABAP Cloud.

It is developed side by side on the SAP BTP ABAP environment (system MY1, package `ZIKMAL_PLAN`
under `ZLOCAL`) and deployed on-stack into S/4HANA. Targets: S/4HANA Cloud Public Edition and
S/4HANA Private Edition / on-premise 2023 and 2025 (RISE).

This folder is the master copy of the code. `ZLOCAL` packages cannot be transported, so code moves
between systems through Git (abapGit), never through transports.

## Layout

| Path | What |
|---|---|
| `src/` | ABAP sources in abapGit layout (`.abapgit.xml`, starting folder `/src/`) |
| `tools/` | Release gate, test-data generators, emulator runner, reference-model check |
| `tools/templates/` | ABAP Unit templates the generators fill with cases |
| `sim/` | Python reference models: the oracle for generated test data, and the design simulations |
| `sim/results/` | Output of the design simulations quoted in `docs/DESIGN-RULES.md` |
| `docs/` | Architecture, design rules, source research |

## Current objects

| Object | Purpose |
|---|---|
| `ZCX_PLN_ERROR` | Exception with explicit reason codes |
| `ZCL_PLN_ALLOCATOR` | Conserving split, set total with locks, spreading, hierarchy node total |
| `ZCL_PLN_MONEY` | Integer minor units, SAP internal CURR format, conversion with rate snapshot |
| `ZCL_PLN_WORKFLOW_GUARD` | Decision for every workflow action; segregation of duties on the executing user |

Status on MY1: active, 33 ABAP Unit test methods passing (including the large-magnitude cases),
ATC `ABAP_CLOUD_DEVELOPMENT_DEFAULT` with no findings at any priority.

## Checks (run on every change; CI: `.github/workflows/abap-planning.yml`)

```bash
npm ci
python3 -I tools/portability_check.py            # release gate, profile core (BTP + Public + Private 2023/2025)
npx abaplint abaplint.json                        # ABAP Cloud syntax and lint
npx abaplint abaplint-s4.json                     # S/4HANA 2023 (7.58) syntax
python3 -I tools/check_reference_models.py        # reference models still hold
bash tools/emulator_tests.sh                      # ABAP Unit in the open-abap emulator
```

The release gate reads SAP's Cloudification Repository at a pinned commit and fails if any SAP
object referenced from `src/` is not released on every target. On-stack S/4 connector code will live
in its own folder and is checked with `--profile s4` (Public, Private 2023 and 2025; not BTP).

The emulator computes packed `DIV`, `MOD` and `/` in float64. Test data whose intermediate values
reach 2^53 is therefore generated only for real ABAP systems (`ltc_*_kernel` classes); those cases
run on MY1 and pass there.

## Regenerating tests

Test classes are generated from `tools/templates/` and the reference models; never edit
`src/*.testclasses.abap` by hand.

```bash
python3 -I tools/gen_alloc_tests.py && python3 -I tools/gen_money_tests.py && python3 -I tools/gen_guard_tests.py
```

Generation is deterministic; CI fails if the committed test classes differ from a fresh generation.

## Deploying to MY1

Objects are written with ARC-1 (`SAPWrite`, `batch_create` with `activateAtEnd`) into `ZIKMAL_PLAN`,
then activated, unit tested and checked with ATC. The MY1 login helper and ARC-1 wrapper come from
the MY1 starter kit.
