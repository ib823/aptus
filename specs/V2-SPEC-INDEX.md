# V2 Specification Index — Aptus Platform Enhancement

## Document Control
- Version: 1.0
- Created: 2026-02-21
- Source: V2-MASTER-BRIEF.md (Parts A-D + Addendums 1-3)
- Total Phases: 22 (Phase 10 through Phase 31)
- Total Spec Files: 22

## Phase Summary Table

| Phase | Title | Size | Wave | Dependencies | Status |
|-------|-------|------|------|-------------|--------|
| 10 | Company Profile Enrichment | M | 1 | None | Spec Complete |
| 11 | Scope Selection Enhancement | M | 1 | Phase 10 | Spec Complete |
| 12 | Step Response Enrichment & Content Presentation | L | 1 | Phase 10-11 | Spec Complete |
| 13 | Gap Resolution Enhancement | L | 1 | Phase 12 | Spec Complete |
| 14 | Integration Register | M | 2 | Phase 13 | Spec Complete |
| 15 | Data Migration Register | M | 2 | Phase 13 | Spec Complete |
| 16 | OCM Impact Register | M | 2 | Phase 13 | Spec Complete |
| 17 | Role System & Organization Model | XL | 3 | Phase 14-16 | Spec Complete |
| 18 | Assessment Lifecycle | M | 3 | Phase 17 | Spec Complete |
| 19 | Notifications & Real-Time Infrastructure | L | 4 | Phase 18 | Spec Complete |
| 20 | Process Visualization | M | 5 | Phase 19 | Spec Complete |
| 21 | Workshop Management | L | 5 | Phase 19, 28 | Spec Complete |
| 22 | Conversation Mode | L | 6 | Phase 12 | Spec Complete |
| 23 | Intelligent Dashboard | L | 6 | Phase 19, 28 | Spec Complete |
| 24 | Onboarding System | M | 6 | Phase 17 | Spec Complete |
| 25 | Report Generation V2 | M | 7 | Phase 14-16 | Spec Complete |
| 26 | Analytics, Benchmarking & Templates | XL | 9 | Phase 29, 31 | Spec Complete |
| 27 | Production Hardening & PWA | L | 10 | All phases | Spec Complete |
| 28 | Real-Time Collaboration | XL | 4 | Phase 19 | Spec Complete |
| 29 | Platform Commercial & Self-Service | XL | 7 | Phase 17 | Spec Complete |
| 30 | Assessment Handoff, Sign-Off & ALM Integration | XL | 8 | Phase 18, 25 | Spec Complete |
| 31 | Assessment Lifecycle Continuity | L | 8 | Phase 30 | Spec Complete |

## Dependency Graph

```
Phase 10 (Company Profile Enrichment)
  └──→ Phase 11 (Scope Selection Enhancement)
       └──→ Phase 12 (Step Response & Content Presentation)
            ├──→ Phase 13 (Gap Resolution Enhancement)
            │    ├──→ Phase 14 (Integration Register)
            │    ├──→ Phase 15 (Data Migration Register)
            │    └──→ Phase 16 (OCM Impact Register)
            │         └──→ Phase 17 (Role System & Organization Model)
            │              ├──→ Phase 18 (Assessment Lifecycle)
            │              │    └──→ Phase 19 (Notifications + WebSocket + Presence)
            │              │         ├──→ Phase 28 (Real-Time Collaboration)
            │              │         │    ├──→ Phase 21 (Workshop Management)
            │              │         │    └──→ Phase 23 (Intelligent Dashboard)
            │              │         └──→ Phase 20 (Process Visualization)
            │              ├──→ Phase 24 (Onboarding System)
            │              └──→ Phase 29 (Platform Commercial & Self-Service)
            │                   └──→ Phase 26 (Analytics, Benchmarking & Templates)
            └──→ Phase 22 (Conversation Mode)

Phase 14-16 ──→ Phase 25 (Report Generation V2)
                  └──→ Phase 30 (Handoff, Sign-Off & ALM Integration)
                       └──→ Phase 31 (Assessment Lifecycle Continuity)
                            └──→ Phase 26 (Analytics — also depends on Phase 29)

Phase 27 (Production Hardening & PWA) ← depends on ALL other phases
```

## Implementation Waves

### Wave 1: Foundation Enrichments (4-6 weeks)
| Phase | Title | Size | Key Deliverables |
|-------|-------|------|-----------------|
| 10 | Company Profile Enrichment | M | Operating model, regulatory fields, SAP landscape, multi-country |
| 11 | Scope Selection Enhancement | M | Industry-guided selection, dependency warnings, bulk operations |
| 12 | Step Response & Content Presentation | L | Step type classification, content parsing, decision-first layout, step grouping |
| 13 | Gap Resolution Enhancement | L | Cost model, risk scoring, "what-if" scenarios, resolution tracking |

### Wave 2: New Registers (4-6 weeks)
| Phase | Title | Size | Key Deliverables |
|-------|-------|------|-----------------|
| 14 | Integration Register | M | IntegrationPoint model, CRUD, middleware categorization |
| 15 | Data Migration Register | M | DataMigrationObject model, volume/effort estimation |
| 16 | OCM Impact Register | M | OcmImpact model, training needs, readiness tracking |

### Wave 3: Roles & Lifecycle (3-4 weeks)
| Phase | Title | Size | Key Deliverables |
|-------|-------|------|-----------------|
| 17 | Role System & Organization Model | XL | 11 roles, Organization model, SSO/SCIM, RBAC policies |
| 18 | Assessment Lifecycle | M | Extended status machine, parallel workstreams, workshop sessions |

### Wave 4: Real-Time Infrastructure (4-6 weeks)
| Phase | Title | Size | Key Deliverables |
|-------|-------|------|-----------------|
| 19 | Notifications & Real-Time | L | WebSocket, in-app notifications, email digest, Web Push, presence |
| 28 | Real-Time Collaboration | XL | Comments, @mentions, field locks, conflict detection, activity feed |

### Wave 5: Visualization & Workshops (4-6 weeks)
| Phase | Title | Size | Key Deliverables |
|-------|-------|------|-----------------|
| 20 | Process Visualization | M | Interactive flow diagrams, heatmaps, BPMN-style rendering |
| 21 | Workshop Management | L | Workshop Mode, synchronized navigation, live polling, QR join, minutes |

### Wave 6: UX Innovation (6-8 weeks)
| Phase | Title | Size | Key Deliverables |
|-------|-------|------|-----------------|
| 22 | Conversation Mode | L | Chat-like classification, decision tree, derived classifications |
| 23 | Intelligent Dashboard | L | Role-aware widgets, attention engine, KPIs, activity feed |
| 24 | Onboarding System | M | Per-role wizards, contextual tooltips, sample assessment |

### Wave 7: Reports & Commercial (4-6 weeks)
| Phase | Title | Size | Key Deliverables |
|-------|-------|------|-----------------|
| 25 | Report Generation V2 | M | Integration/DM/OCM reports, readiness scorecard, branding |
| 29 | Platform Commercial | XL | Self-service signup, Stripe billing, partner admin, trial flow |

### Wave 8: Sign-Off & Continuity (4-6 weeks)
| Phase | Title | Size | Key Deliverables |
|-------|-------|------|-----------------|
| 30 | Handoff & Sign-Off | XL | Multi-layer validation, crypto sign-off, ALM adapters, certificate |
| 31 | Lifecycle Continuity | L | Versioning, cloning, change control, re-baseline, delta reports |

### Wave 9: Analytics (3-4 weeks)
| Phase | Title | Size | Key Deliverables |
|-------|-------|------|-----------------|
| 26 | Analytics & Benchmarking | XL | Portfolio dashboard, templates, benchmarking, cross-phase analytics |

### Wave 10: Hardening (4-6 weeks)
| Phase | Title | Size | Key Deliverables |
|-------|-------|------|-----------------|
| 27 | Production Hardening | L | PWA, service worker, offline sync, mobile responsive, performance |

## Cross-Phase Concerns

### Shared Infrastructure
- **WebSocket Server**: Built in Phase 19, used by Phases 21, 23, 28
- **Organization Model**: Built in Phase 17, used by Phases 24, 26, 29
- **Notification System**: Built in Phase 19, used by all subsequent phases
- **Comment Model**: Built in Phase 28, integrated into Phases 14-16, 21, 23

### Data Model Growth
- V1 (current): ~20 models (673 lines in schema.prisma)
- V2 estimated: ~45+ models (est. 1500+ lines)
- Key new models: Organization (extended), IntegrationPoint, DataMigrationObject, OcmImpact, Comment, Conflict, Notification, WorkshopSession, ConversationTemplate, AssessmentSnapshot, ChangeRequest, SignatureRecord, SubscriptionPlan

### Role System Evolution
- V1: 5 roles (process_owner, it_lead, executive, consultant, admin)
- V2: 11 roles (platform_admin, partner_lead, consultant, project_manager, solution_architect, process_owner, it_lead, data_migration_lead, executive_sponsor, viewer, client_admin)

## Open Questions (Consolidated)

1. **Phase 17**: Should client organizations support SSO in V2, or defer to V3?
2. **Phase 22**: How are conversation templates authored — manually or AI-generated?
3. **Phase 26**: Does benchmarking require cross-partner data? Privacy/competitive concerns.
4. **Phase 29**: Is the marketing site part of V2 scope or separate?
5. **Phase 29**: Should Type B (direct enterprise client) be fully supported in V2?
6. **Phase 30**: Can SAP Cloud ALM scope item ID mapping be automated via Best Practice content IDs?
7. **Phase 31**: How to handle delta when SAP removes scope items in new version?

## Risk Register

| Risk | Impact | Mitigation | Affected Phases |
|------|--------|-----------|----------------|
| WebSocket scaling under load | High | Single server sufficient for V2; Redis pub/sub for multi-server if needed | 19, 28, 21 |
| Stripe integration complexity | Medium | Start with simple subscription; add metered billing incrementally | 29 |
| SAP Cloud ALM API limitations | Medium | Build Universal JSON Package first; adapters are optional | 30 |
| Offline sync conflicts | High | Last-write-wins with conflict queue for manual resolution | 27 |
| Schema migration complexity | Medium | Incremental migrations per phase; avoid breaking changes | All |
| Role system backward compatibility | High | Migration script to map existing 5 roles to new 11; dual-write period | 17 |

## Spec File Locations

All spec files are in `/specs/v2/`:
- PHASE-10.md through PHASE-31.md (22 files)
- V2-SPEC-INDEX.md (this file)
- V2-CROSS-VERIFICATION-REPORT.md
