# CoreEdge copy deck — the words to use

**Tone.** Direct and calm, written from the user's side of the screen. Say what happened, why, and the one thing to do next. Don't apologise, don't be vague, and don't pack in jargon.

## Primary actions (buttons)

| Context | Button | After success (toast) |
|---|---|---|
| New app | **Create app** | "App created" |
| Add data | **Add data feed** | "Purchase orders added · Sandbox lane is live" |
| Move a lane right | **Promote to Test** | "Review requested · Nadia and 2 others notified" |
| Review | **Approve** / **Approve for Sandbox only** / **Approve read-only** / **Request changes** / **Reject…** | "Approved · key issued to Ikmal" |
| Key | **Collect key** | "Key collected · ends …Gu4" |
| Replace key | **Replace key…** (red, confirm) | "Key replaced · the old key stopped working" |
| Revoke | **Revoke key…** (red, confirm, reason) | "Key revoked" |
| Try | **Run** | — (result shows inline) |
| SDK | **Download SDK** | "SDK downloaded" |
| Re-check | **Re-check now** | "Checked just now" |
| Handoff | **Send to SAP admin** | "Note sent to the client's SAP admin" |
| Renew | **Renew access** | "Access renewed until 9 Mar 2027" |

## Lane states (the chip on a lane cell)

| State | Chip | Line under it |
|---|---|---|
| All gates proven | **Live** | "5 rows · checked 2 m ago" |
| SAP answered with no data | **No data** | "0 rows · checked 4 m ago · not an error" |
| Waiting on a review | **In review** | "Waiting on Nadia · 2 h" |
| SAP refuses reads | **SAP refused** | "Metadata OK · data read 403 · 4 m ago" |
| No access for this environment | **No access** | "Request access to use this lane" |
| Key missing, expired or revoked | **No key** | "Collect or renew the key" |
| No SAP system for this environment | **No SAP system** | "Platform admin has been asked" |
| Checks too old | **Unknown** | "Last proven 12 d ago · re-check" |
| Not started | **Promote →** | — |

## Why? trace: explanation per broken hop

| Broken hop | Headline | Body | Owner | Action |
|---|---|---|---|---|
| Key | "This key isn't valid." | "It's missing, expired, revoked, or belongs to a retired app." | App owner | Collect / renew key |
| Access | "No access approved for {env}." | "Access is approved per data feed and per environment." | Reviewer | Request access |
| Access (expired) | "Access ended on {date}." | "Renewing keeps the same key and fields." | Builder | Renew access |
| Binding | "No SAP system is set up for {env}." | "This lane can't reach SAP until a {env} system is connected." | Platform admin | Ask platform admin |
| Binding (ambiguous) | "Two SAP systems claim {env}." | "CoreEdge won't guess which one to use." | Platform admin | Open SAP systems |
| SAP metadata 401 | "SAP rejected CoreEdge's sign-in." | "The communication user's password or certificate is wrong or has expired." | Platform admin | Update SAP credentials |
| SAP data read 403 | "SAP refused the read, so the fix is in SAP, not in CoreEdge." | "The communication user can open the service but isn't authorised to read {dataset}." | Client SAP admin | Send to SAP admin |
| SAP 404 | "{dataset} doesn't exist on {system}." | "The service or dataset isn't active on this SAP system." | Builder | Choose another dataset |
| SAP timeout / 5xx | "SAP didn't answer in time." | "Nothing is wrong with your app. CoreEdge will retry the check." | Operator | Re-check now |
| Rate limit | "This key hit its limit." | "60 calls per minute per key. Try again in {n} s." | Builder | — |

## Empty states

- **Home, first visit:** "Nothing needs you yet. Create an app, or ask your platform admin to connect the client's SAP system." [Create app]
- **Requests, none waiting:** "No reviews waiting on you."
- **Operations, all healthy:** "All 11 lanes are live and checked within the last 15 minutes."
- **SAP systems, none:** "No SAP systems yet. Connect one per environment: Sandbox, Dev, Test, Prod." [Connect SAP system]
- **Try it, no records:** "No records. SAP answered successfully and had nothing to return."

## Rules and disabled reasons

- Own request: "You asked for this, so a colleague has to approve it."
- Own app: "You own this app, so a colleague has to approve its access."
- Missing expiry: "Set an end date. Access can't be approved without one."
- No Prod system: "There's no Prod SAP system yet, so a Prod key would connect to nothing. Platform admin has been asked."
- No permission: "Only consultants can change this. Ask in #coreedge-support."

## Confirmations (red actions)

- **Replace key?** "The current key stops working immediately. Anything still using it will fail. The new key goes only to the app owner." [Replace key] [Cancel]
- **Revoke key?** "This can't be undone. Calls with this key will fail from now on." Reason (required). [Revoke key] [Cancel]
- **Deactivate SAP system?** "4 lanes use this system and will stop reading: Purchase orders · Test, …" [Deactivate] [Cancel]
