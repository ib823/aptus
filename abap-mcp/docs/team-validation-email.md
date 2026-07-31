# Team validation email — two drafts

Audience: senior ABAP colleagues, 20+ years each. They have seen a lot of tools
arrive with a lot of claims. The framing that works with them is **"help me
break this"**, not "look what I built".

Rules applied to both drafts:

- No "AI-powered", no "revolutionise", no adjectives doing work that evidence
  should do.
- State the known weaknesses **before** they find them. It buys the right to be
  taken seriously, and they will find them anyway.
- Ask for a specific, bounded thing with a date. An open-ended "have a look
  when you get a chance" gets nothing.
- Make it clear this cannot touch a client system yet, so nobody has to worry
  they are being asked to authorise something.

Fill the brackets before sending.

---

## Draft A — peer review ask (lower commitment, use first)

**Subject:** Asking you to poke holes in a custom-code remediation tool before I take it further

Hi [names],

I have built a small internal tool for ABAP custom-code remediation on
brownfield S/4HANA conversions, and I would rather you tried to break it now
than have a client do it later.

**What it is, precisely.** About 700 lines of Python that sits on a
consultant's laptop and lets Claude Code call the standard ADT REST services
(`/sap/bc/adt/...`) — the same APIs Eclipse ADT uses. It reads source, runs an
ATC check, runs a syntax check, and returns the results as text. There is no
AI inside it; the model runs in Claude Code under the operator's own
subscription. The adapter only translates tool calls into HTTPS requests.

It does not replace ATC, the Custom Code Migration app, SUM/DMO, or transport
discipline. It reads through a display-only service user and nothing else. It
has no write, activate, or transport capability, and that is a design rule, not
a current limitation.

**What I know is weak.** I would rather tell you than have you find it:

- Nothing here has met a live SAP system yet. The XML parsing is written
  against response formats I reconstructed from two release generations and
  covered with 37 offline tests. Fixtures are not a sandbox.
- Basic auth over HTTPS only. No SSO, no SNC.
- The ATC implementation was wrong in the first version — a single POST, which
  cannot work. It now does the real worklist protocol, but "correct according
  to my reading of two open-source clients" is not the same as "correct against
  your system".
- Whether the ADT endpoints behave the same on ECC 6 EhP7 as on S/4HANA 2023 is
  exactly the thing I cannot answer from a desk.

**What I am asking for.** Not a pilot. Just your reading, on two things:

1. **The remediation playbooks** (`playbooks/`) — KONV → PRCD_ELEMENTS, MATNR
   field length, VBUK/VBUP/VBFA, and ABAP SQL strict mode. Each one splits fix
   patterns into "mechanical" and "escalate to a human". **Is that split right?**
   From your project experience, what have I put in the mechanical column that
   should never be there? That question matters more to me than any of the code.
2. **The governance checklist** (`docs/client-onboarding-checklist.md`) — would
   it survive a real client security review, or is it a list that reads well and
   collapses on contact?

Half an hour each would already be worth a lot. If you would rather talk than
read, I will take fifteen minutes on a call.

If you have a sandbox you would be willing to point it at, that is the next
step and I will come back with a proper test plan — but I did not want to ask
for system access before you had told me whether the thing is sound.

Repo / files: [link]
Happy to walk anyone through it: [your availability]

Thanks,
Ikmal

---

## Draft B — structured pilot (use once someone has said yes to a sandbox)

**Subject:** Sandbox test request: ABAP remediation tooling, ~90 minutes, display-only

Hi [names],

Following on from [the review / our conversation on DATE] — I would like to run
the custom-code remediation tool against [SANDBOX SYSTEM ID] and find out where
it breaks on a real release level.

**What it needs from Basis, once:**

- A dialog-less service user with **display-only** authorizations: `S_ADT`,
  `S_DEVELOP` with ACTVT 03, ATC display. No change authorizations — please do
  not grant them "to see what happens".
- SICF node `/sap/bc/adt` active and reachable over HTTPS from [network path]
- One ATC check variant available (a readiness variant if we are testing that
  flow)

**What it needs from you:** roughly 90 minutes, in two parts.

*Part 1 — the capture (~30 min, mostly waiting).* One command:

```
python scripts/adt_probe.py --profile [ID] --object-type PROG \
    --object-name [A KNOWN Z-PROGRAM] --out captures/
```

It walks ten steps — reachability, search, object metadata, source, outline,
syntax check, ATC customizing, ATC worklist creation, ATC run, ATC findings —
stops at the first failure, and saves every raw response. **I expect it to fail
somewhere.** The output tells me exactly where, with the bytes to fix it. Send
me `captures/` (sanitize object names if you need to) and I will turn each
failure into a regression test.

*Part 2 — the judgment call (~60 min).* Pick one Z-object you know well and has
real remediation findings. Run the ATC tool on it, read what the model proposes
against the playbook, and tell me:

- Would you have transported that change?
- What did it call mechanical that needed a functional decision?
- What did it miss entirely?

That second question is the one I care about. A tool that proposes a wrong fix
confidently is worse than no tool, and you are better placed than I am to spot
it.

**Ground rules, non-negotiable:**

- Sandbox or internal systems only. No client systems until we have written
  data-governance consent per engagement — client ABAP source transits to an
  external LLM provider and that needs to be signed off, not assumed.
- Display-only service user throughout.
- The AI proposes, humans review, humans transport. Permanently, not just for
  this test.

**What I would like back**, in whatever form is easiest:

1. Which release level you tested against, and which of the ten steps passed
2. The `captures/` directory (or the failing responses)
3. Any authorization object needed beyond the documented set — I would rather
   the onboarding checklist be right than short
4. Your verdict on the fix patterns and the escalation rules in `playbooks/`
5. Anything in the governance checklist that would not survive a client's
   security review

Proposed window: [DATE RANGE]. I will do the setup and be on the call for the
first run so nobody loses an afternoon to a VPN problem.

Thanks,
Ikmal

---

## Notes for the sender

- **Send Draft A first**, even if you are confident. The people you want on
  Draft B are the ones who engaged with A.
- Do not attach a slide deck. This audience reads code and READMEs.
- If someone comes back with "why not just use the Custom Code Migration app /
  ATC directly?" — that is the right question and the honest answer is: this
  does not replace them, it reads their output and applies a versioned fix
  pattern to it. Say that plainly. Do not defend the tool as more than it is.
- If someone raises SAP's own Custom Code Migration Agent, take it seriously
  rather than deflecting — see `docs/build-vs-adopt.md`. It is a real strategic
  question and pretending otherwise will cost you the room.
- **Never write, in an email or a deck:** "automated conversion", "automated
  remediation", or any claim of SDT execution capability. The defensible phrase
  is "AI-accelerated, human-reviewed".
