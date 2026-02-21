# Screen Specifications — Bound Fit Portal

Every screen, every component, every state, every data source. No assumptions.

---

## Screen Index

| # | Screen | Route | Layout | Primary User |
|---|--------|-------|--------|-------------|
| 0 | Login | `/login` | Centered narrow | All |
| 0.5 | MFA Setup | `/mfa/setup` | Centered narrow | External users (first login) |
| 0.6 | MFA Verify | `/mfa/verify` | Centered narrow | External users (every login) |
| 1 | Assessment List | `/assessments` | Centered wide | Consultant, Admin |
| 1.5 | Company Dashboard | `/dashboard` | Centered wide | All (role-filtered) |
| 2 | Company Profile | `/assessment/[id]/profile` | Centered narrow wizard | Client, Consultant |
| 3 | Scope Selection | `/assessment/[id]/scope` | Centered wide | Client, Consultant |
| 4 | Process Deep Dive | `/assessment/[id]/review` | Sidebar + main | Client, Consultant |
| 5 | Gap Resolution | `/assessment/[id]/gaps` | Sidebar + main | Consultant |
| 6 | Configuration Matrix | `/assessment/[id]/config` | Full width table | Consultant |
| 7 | Executive Report | `/assessment/[id]/report` | Full width print | All |
| 7.5 | Process Flow Atlas | `/assessment/[id]/flows` | Full width | All |
| 7.6 | Remaining Items | `/assessment/[id]/remaining` | Full width table | Consultant, Admin |
| 8 | Admin Dashboard | `/admin` | Sidebar + main | Admin |

---

## Screen 0: Login

### Route
`/login`

### Layout
Centered narrow column (`max-w-md`, 448px). Vertically centered on viewport.

### Component Hierarchy

```
<LoginPage>
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="w-full max-w-md px-6">
      <LogoMark />                    // ≈ mark, 48px, centered
      <h1 className="display">Bound</h1>  // 34px, centered, gray-950
      <p className="body text-gray-600">Enterprise Fit Assessment</p>

      <LoginCard>                     // bg-white, rounded-lg, shadow-sm, border
        <EmailInput />               // h-11, placeholder "Work email address"
        <SubmitButton />             // Primary, full width, "Continue with email"
      </LoginCard>

      <FooterLinks>                  // footnote, text-gray-400
        <span>Powered by Bound</span>
      </FooterLinks>
    </div>
  </div>
</LoginPage>
```

### States

| State | Trigger | UI Change |
|-------|---------|-----------|
| Default | Page load | Email input focused, button enabled |
| Loading | Form submit | Button shows "Sending..." with disabled state, opacity-50 |
| Success | 200 response | Replace form with "Check your email" message + email icon |
| Error (rate limit) | 429 response | Inline error: "Too many attempts. Try again in X minutes." |
| Error (invalid) | 400 response | Input border-red-500, error text below |

### Data Sources
- POST `/api/auth/login` — `{ email: string }`
- No pre-loaded data

### Validation
- Email: valid format, required
- Client-side Zod: `z.string().email()`

---

## Screen 0.5: MFA Setup (TOTP Enrollment)

### Route
`/mfa/setup`

### Layout
Centered narrow column (`max-w-md`, 448px). Vertically centered. No navigation bar (pre-auth flow).

### When Shown
Redirected here after magic link verification when `user.totpVerified === false` AND user role is external (process_owner, it_lead, executive).

### Component Hierarchy

```
<MfaSetupPage>
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="w-full max-w-md px-6">
      <LogoMark />
      <h1 className="display">Set Up Two-Factor Authentication</h1>
      <p className="body text-gray-600">
        Scan the QR code with your authenticator app (Google Authenticator, Authy, or 1Password).
      </p>

      <SetupCard>
        <Step number={1} label="Scan QR Code">
          <QrCodeDisplay src={qrCodeDataUrl} />
          <ManualEntryToggle>
            <p className="caption-1 text-gray-400">Can't scan? Enter this code manually:</p>
            <code className="font-mono text-sm bg-gray-100 p-2 rounded select-all">{base32Secret}</code>
          </ManualEntryToggle>
        </Step>

        <Step number={2} label="Enter Verification Code">
          <p className="callout text-gray-600">Enter the 6-digit code from your authenticator app.</p>
          <OtpInput length={6} autoFocus />
          <CountdownTimer seconds={30} label="Code refreshes in" />
        </Step>

        <VerifyButton>Verify & Enable</VerifyButton>
      </SetupCard>

      <HelpText className="footnote text-gray-400 mt-4">
        Two-factor authentication protects your account. You'll need your authenticator app each time you sign in.
      </HelpText>
    </div>
  </div>
</MfaSetupPage>
```

### States

| State | Trigger | UI Change |
|-------|---------|-----------|
| Loading | Page load | QR code skeleton |
| Ready | QR code loaded | QR displayed, code input focused |
| Verifying | Code submitted | Button loading, input disabled |
| Invalid code | 401 response | Input border-red-500, "Invalid code. Try again." |
| Rate limited | 429 response | "Too many attempts. Wait 15 minutes." |
| Success | 200 response | Green checkmark animation → redirect to assessment |

### Data Sources
- POST `/api/auth/mfa/setup` — get QR code and secret
- POST `/api/auth/mfa/verify` — verify code

---

## Screen 0.6: MFA Verify (Login Verification)

### Route
`/mfa/verify`

### Layout
Centered narrow column (`max-w-md`, 448px). Vertically centered. No navigation bar.

### When Shown
Redirected here after magic link verification when `user.mfaEnabled === true` AND `session.mfaVerified === false`.

### Component Hierarchy

```
<MfaVerifyPage>
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="w-full max-w-md px-6">
      <LogoMark />
      <h1 className="display">Verify Your Identity</h1>
      <p className="body text-gray-600">
        Enter the 6-digit code from your authenticator app.
      </p>

      <VerifyCard>
        <OtpInput length={6} autoFocus />
        <CountdownTimer seconds={30} label="Code refreshes in" />
        <VerifyButton>Verify</VerifyButton>
      </VerifyCard>

      <AttemptCounter className="footnote text-gray-400">
        {attempts} of 5 attempts used
      </AttemptCounter>

      <HelpLinks className="mt-4">
        <Link href="/auth/login">Use a different email</Link>
      </HelpLinks>
    </div>
  </div>
</MfaVerifyPage>
```

### States

| State | Trigger | UI Change |
|-------|---------|-----------|
| Ready | Page load | Code input focused, 5 attempts available |
| Verifying | Code submitted | Button loading |
| Invalid code | 401 | Shake animation, error text, attempt counter decrements |
| Rate limited | 429 (5 failures) | Input disabled, "Account locked. Try again in 15 minutes." |
| Success | 200 | Brief green checkmark → role-based redirect |

### Data Sources
- POST `/api/auth/mfa/verify` — verify code
- GET `/api/auth/mfa/status` — check enrollment status

---

## Screen 1: Assessment List

### Route
`/assessments`

### Layout
Centered wide column (`max-w-4xl`, 896px). Top navigation bar.

### Component Hierarchy

```
<AssessmentListPage>
  <GlobalNav />                        // ≈ Bound logo left, user menu right

  <PageHeader>
    <h1 className="display">Assessments</h1>
    <p className="body text-gray-600">Manage SAP fit assessments</p>
    <CreateButton />                   // Primary, "New Assessment"
  </PageHeader>

  <FilterBar>                          // flex gap-3
    <StatusFilter />                   // Select: All, Draft, In Progress, Completed, Reviewed, Signed Off
    <SearchInput />                    // Search by company name
  </FilterBar>

  <AssessmentGrid>                     // flex flex-col gap-4
    {assessments.map(a => (
      <AssessmentCard key={a.id}>      // bg-white, rounded-lg, border, shadow-sm, hover:shadow-md
        <CardHeader>
          <CompanyName />              // title-2, gray-950
          <StatusBadge status={a.status} />  // Per DESIGN-SYSTEM.md
        </CardHeader>
        <CardBody>
          <MetadataRow>                // flex gap-6, footnote, text-gray-500
            <Industry />              // e.g., "Manufacturing"
            <Country />               // e.g., "Malaysia"
            <ScopeCount />            // e.g., "87 scope items"
            <StepProgress />          // e.g., "1,204 / 8,432 steps reviewed"
          </MetadataRow>
          <ProgressBar />             // h-2, bg-gray-200, fill bg-blue-500
        </CardBody>
        <CardFooter>
          <LastUpdated />             // footnote, text-gray-400
          <ContinueButton />          // Ghost, "Continue →"
        </CardFooter>
      </AssessmentCard>
    ))}
  </AssessmentGrid>

  <EmptyState>                         // Shown when no assessments
    <Icon name="FileText" size={48} /> // text-gray-300
    <h3 className="title-3">No assessments yet</h3>
    <p className="body text-gray-600">Create your first assessment to get started.</p>
    <CreateButton />
  </EmptyState>
</AssessmentListPage>
```

### Data Sources
- GET `/api/assessments` — paginated, filtered by user's organization
- Response: `{ assessments: Assessment[], total: number, cursor?: string }`

### States

| State | UI |
|-------|----|
| Loading | 3 skeleton cards (animate-pulse) |
| Empty | EmptyState component |
| Data | Assessment cards with progress |
| Error | Error banner with retry button |

### Interactions
- Click "New Assessment" → Navigate to `/assessment/new/profile`
- Click assessment card → Navigate to `/assessment/[id]/scope` (or last active screen)
- Status filter → Client-side filter (data already loaded)
- Search → Debounced 300ms client-side filter

---

## Screen 1.5: Company Dashboard

### Route
`/dashboard`

### Layout
Centered wide column (`max-w-5xl`, 1024px). Top navigation bar.

### When Shown
Default landing page for executives. Also accessible to all roles via nav bar.

### Component Hierarchy

```
<DashboardPage>
  <GlobalNav />

  <PageHeader>
    <h1 className="display">{organization.name}</h1>
    <p className="body text-gray-600">Assessment progress overview</p>
  </PageHeader>

  {assessments.map(assessment => (
    <AssessmentDashboard key={assessment.id}>
      <DashboardHeader>
        <h2 className="title-1">{assessment.companyName}</h2>
        <StatusBadge status={assessment.status} />
        <OverallProgress percent={assessment.progress.overallPercent} />
      </DashboardHeader>

      <!-- Progress by Functional Area -->
      <AreaProgressSection>
        <h3 className="title-3">Progress by Area</h3>
        <AreaGrid className="grid grid-cols-2 gap-4">
          {assessment.byArea.map(area => (
            <AreaCard key={area.functionalArea}>
              <AreaName className="headline">{area.functionalArea}</AreaName>
              <ProgressBar value={area.percent} />
              <AreaStats className="flex gap-4 footnote text-gray-500">
                <span>{area.stepsReviewed}/{area.stepsTotal} steps</span>
                <span className="text-green-600">{area.fitCount} FIT</span>
                <span className="text-amber-600">{area.gapCount} GAP</span>
              </AreaStats>
              <AssignedTo className="caption-1 text-gray-400">
                {area.assignedTo.join(", ")}
              </AssignedTo>
            </AreaCard>
          ))}
        </AreaGrid>
      </AreaProgressSection>

      <!-- Progress by Team Member -->
      <TeamProgressSection>
        <h3 className="title-3">Team Progress</h3>
        <TeamTable>
          <TableHeader>
            <Col>Name</Col>
            <Col>Role</Col>
            <Col>Areas</Col>
            <Col>Progress</Col>
            <Col>Last Active</Col>
          </TableHeader>
          {assessment.byPerson.map(person => (
            <TableRow>
              <Cell>{person.stakeholderName}</Cell>
              <Cell><RoleBadge role={person.role} /></Cell>
              <Cell>{person.assignedAreas.join(", ")}</Cell>
              <Cell>
                <ProgressBar value={person.percent} mini />
                <span className="caption-1">{person.stepsReviewed}/{person.stepsTotal}</span>
              </Cell>
              <Cell className="footnote text-gray-400">
                {person.lastActiveAt ? formatRelative(person.lastActiveAt) : "Never"}
              </Cell>
            </TableRow>
          ))}
        </TeamTable>
      </TeamProgressSection>

      <!-- Recent Activity Feed -->
      <ActivitySection>
        <h3 className="title-3">Recent Activity</h3>
        <ActivityFeed>
          {assessment.recentActivity.map(activity => (
            <ActivityRow>
              <Timestamp className="caption-1 text-gray-400">
                {formatRelative(activity.timestamp)}
              </Timestamp>
              <ActivityText className="callout">
                <strong>{activity.actor}</strong> {activity.summary}
              </ActivityText>
            </ActivityRow>
          ))}
        </ActivityFeed>
      </ActivitySection>
    </AssessmentDashboard>
  ))}
</DashboardPage>
```

### Data Sources
- GET `/api/dashboard` — per-company dashboard data

### Role-Based Visibility
- **Executive**: Sees dashboard only. No links to edit screens. Download report buttons visible.
- **Process Owner**: Sees dashboard + links to their assigned areas in review screen.
- **IT Lead**: Sees dashboard + links to review screen (read-only).
- **Consultant**: Sees all companies' dashboards. Can switch between organizations.
- **Admin**: Same as consultant + admin panel link.

### States
| State | UI |
|-------|----|
| Loading | Skeleton cards for areas and team table |
| No assessments | Empty state: "No active assessments for your organization" |
| Data loaded | Full dashboard with area grid, team table, activity feed |

---

## Screen 2: Company Profile (Assessment Creation/Edit)

### Route
- Create: `/assessment/new/profile`
- Edit: `/assessment/[id]/profile`

### Layout
Centered narrow wizard (`max-w-2xl`, 672px). Step indicator at top.

### Component Hierarchy

```
<CompanyProfilePage>
  <WizardHeader>
    <StepIndicator steps={["Company", "Scope", "Review", "Gaps", "Config", "Report"]} current={0} />
  </WizardHeader>

  <FormCard>                            // bg-white, rounded-lg, border, p-8
    <h1 className="title-1">Company Profile</h1>
    <p className="body text-gray-600 mb-8">Tell us about your organization</p>

    <FormSection label="Company Information">
      <FormField label="Company Name" required>
        <Input placeholder="e.g., Acme Corporation" />
      </FormField>

      <FormField label="Industry" required>
        <Select>
          // Options from IndustryProfile table
          <option>Manufacturing</option>
          <option>Retail</option>
          <option>Professional Services</option>
          <option>Distribution</option>
          // ... all industry profiles
        </Select>
      </FormField>

      <FormField label="Primary Country" required>
        <Select>
          <option>Malaysia</option>
          // Future: other countries
        </Select>
      </FormField>

      <FormField label="Operating Countries">
        <MultiSelect />                  // Tag-style, add/remove countries
      </FormField>
    </FormSection>

    <FormSection label="Organization Size">
      <FormField label="Company Size" required>
        <RadioGroup>
          <RadioOption value="small" label="Small" description="Under 100 employees" />
          <RadioOption value="midsize" label="Midsize" description="100–1,000 employees" />
          <RadioOption value="large" label="Large" description="1,000–10,000 employees" />
          <RadioOption value="enterprise" label="Enterprise" description="10,000+ employees" />
        </RadioGroup>
      </FormField>

      <FormField label="Annual Revenue Band">
        <Select>
          <option>Under $10M</option>
          <option>$10M – $50M</option>
          <option>$50M – $250M</option>
          <option>$250M – $1B</option>
          <option>Over $1B</option>
        </Select>
      </FormField>
    </FormSection>

    <FormSection label="Current ERP">
      <FormField label="Current ERP System">
        <RadioGroup>
          <RadioOption value="sap_ecc" label="SAP ECC" description="Existing SAP on-premise" />
          <RadioOption value="oracle" label="Oracle" description="Oracle ERP Cloud or E-Business Suite" />
          <RadioOption value="other" label="Other ERP" description="Microsoft, Infor, etc." />
          <RadioOption value="none" label="No ERP" description="Spreadsheets, manual processes" />
        </RadioGroup>
      </FormField>
    </FormSection>

    <FormSection label="Stakeholders" collapsible>
      <StakeholderList>
        {stakeholders.map(s => (
          <StakeholderRow>
            <NameInput />
            <EmailInput />
            <RoleSelect />           // Process Owner, IT Lead, Executive, Consultant
            <AreaAssignment />       // Multi-select of functional areas
            <RemoveButton />
          </StakeholderRow>
        ))}
        <AddStakeholderButton />     // Ghost, "Add stakeholder"
      </StakeholderList>
    </FormSection>
  </FormCard>

  <ActionBar>                           // sticky bottom, bg-white, border-t, py-4
    <CancelButton />                   // Secondary
    <SaveDraftButton />                // Secondary, "Save Draft"
    <ContinueButton />                // Primary, "Continue to Scope Selection →"
  </ActionBar>
</CompanyProfilePage>
```

### Data Sources
- GET `/api/assessments/[id]` — existing assessment data (edit mode)
- GET `/api/catalog/scope-items?fields=functionalArea&distinct=true` — for area assignment dropdown
- GET `/api/admin/intelligence/industries` — industry profiles for dropdown
- POST `/api/assessments` — create
- PATCH `/api/assessments/[id]` — update

### Validation (Zod)

```typescript
const companyProfileSchema = z.object({
  companyName: z.string().min(2).max(200),
  industry: z.string().min(1),
  country: z.string().length(2),           // ISO code
  operatingCountries: z.array(z.string()),
  companySize: z.enum(["small", "midsize", "large", "enterprise"]),
  revenueBand: z.string().optional(),
  currentErp: z.enum(["sap_ecc", "oracle", "other", "none"]).optional(),
})
```

### States

| State | Trigger | UI |
|-------|---------|-----|
| Create mode | `/assessment/new/profile` | Empty form |
| Edit mode | `/assessment/[id]/profile` | Pre-filled form |
| Saving | Submit | Button loading, fields disabled |
| Validation error | Invalid submit | Red borders on invalid fields, error messages |
| Saved | Success | Navigate to scope selection |

---

## Screen 3: Scope Selection

### Route
`/assessment/[id]/scope`

### Layout
Centered wide (`max-w-5xl`, 1024px). Step indicator at top. Grouped accordion layout.

### Component Hierarchy

```
<ScopeSelectionPage>
  <WizardHeader>
    <StepIndicator steps={[...]} current={1} />
    <ProgressSummary>               // Fixed top-right
      <span>Selected: {selectedCount} of {totalCount}</span>
      <span>Steps to review: {totalStepsInScope}</span>
    </ProgressSummary>
  </WizardHeader>

  <PageHeader>
    <h1 className="title-1">Select Your Scope</h1>
    <p className="body text-gray-600">
      Choose which SAP business processes are relevant to your organization.
      We've pre-selected items common for {assessment.industry}.
    </p>
  </PageHeader>

  <FilterBar>
    <SearchInput placeholder="Search scope items..." />
    <RelevanceFilter />              // All, Selected, Not Selected, Maybe
    <AreaFilter />                   // Dropdown: all functional areas
    <BulkActions>
      <SelectAllInArea />
      <DeselectAllInArea />
    </BulkActions>
  </FilterBar>

  <ScopeGroupList>                   // Accordion by functionalArea
    {functionalAreas.map(area => (
      <AreaAccordion key={area}>
        <AccordionHeader>
          <AreaName>{area}</AreaName>         // title-3
          <AreaCount>                         // footnote, text-gray-500
            {selectedInArea} / {totalInArea} selected
          </AreaCount>
          <AreaProgress />                    // mini progress bar
        </AccordionHeader>

        <AccordionContent>
          {scopeItems.filter(s => s.functionalArea === area).map(item => (
            <ScopeItemRow key={item.id}>     // flex, py-4, border-b
              <Checkbox checked={item.selected} />

              <ItemContent className="flex-1">
                <ItemHeader>
                  <ItemId className="caption-1 text-gray-400">{item.id}</ItemId>
                  <ItemName className="headline">{item.nameClean}</ItemName>
                </ItemHeader>
                <ItemMeta className="footnote text-gray-500">
                  <StepCount>{item.totalSteps} process steps</StepCount>
                  <SubArea>{item.subArea}</SubArea>
                  <ConfigCount>{item.configCount} configurations</ConfigCount>
                </ItemMeta>
              </ItemContent>

              <RelevanceSelector>            // 3-button group
                <Button variant={item.relevance === "YES" ? "selected" : "ghost"}>Yes</Button>
                <Button variant={item.relevance === "MAYBE" ? "selected" : "ghost"}>Maybe</Button>
                <Button variant={item.relevance === "NO" ? "selected" : "ghost"}>No</Button>
              </RelevanceSelector>

              <CurrentStateSelector>          // Dropdown, visible only if selected
                <option>Manual Process</option>
                <option>Existing System</option>
                <option>Outsourced</option>
                <option>Not Applicable</option>
              </CurrentStateSelector>

              <ExpandButton />               // Chevron to show purpose/overview
            </ScopeItemRow>
          ))}
        </AccordionContent>
      </AreaAccordion>
    ))}
  </ScopeGroupList>

  <ActionBar>
    <BackButton />                    // Secondary, "← Company Profile"
    <ScopeSummary>
      <span className="headline">{selectedCount} scope items selected</span>
      <span className="callout text-gray-600">{totalStepsInScope} process steps to review</span>
    </ScopeSummary>
    <ContinueButton />               // Primary, "Continue to Process Review →"
  </ActionBar>
</ScopeSelectionPage>
```

### Data Sources
- GET `/api/assessments/[id]/scope` — all 550 scope items with selection status
- PUT `/api/assessments/[id]/scope/[scopeItemId]` — toggle selection (debounced 500ms)
- POST `/api/assessments/[id]/scope/bulk` — bulk operations

### Scope Item Expansion (Detail Panel)

When user clicks the expand chevron on a scope item:

```
<ScopeItemDetail>                    // bg-gray-50, p-5, rounded-md, border-t
  <Tabs>
    <Tab label="Purpose">
      <div dangerouslySetInnerHTML={item.purposeHtml} />   // sanitized
    </Tab>
    <Tab label="Overview">
      <div dangerouslySetInnerHTML={item.overviewHtml} />   // sanitized
    </Tab>
    <Tab label="Prerequisites">
      <div dangerouslySetInnerHTML={item.prerequisitesHtml} />
    </Tab>
    <Tab label="Tutorial">
      {item.tutorialUrl && <ExternalLink href={item.tutorialUrl} />}
    </Tab>
  </Tabs>
  <NotesField>                        // textarea for client notes
    <textarea placeholder="Notes about this scope item..." />
  </NotesField>
</ScopeItemDetail>
```

### Industry Pre-Selection Logic

On page load:
1. Query IndustryProfile for assessment.industry
2. Pre-check all scope items in `IndustryProfile.applicableScopeItems`
3. Show banner: "We've pre-selected {n} items common for {industry} companies. Review and adjust."
4. Non-industry items are unchecked but NOT hidden — they're visually de-emphasized (opacity-60)

### States

| State | UI |
|-------|----|
| Loading | Skeleton accordion headers |
| Industry pre-selected | Banner + pre-checked items |
| Searching | Filtered list, non-matching items hidden |
| Expanded item | Detail panel slides open below item |
| Saving | Brief "Saved" toast on each change |

---

## Screen 4: Process Deep Dive (Core Experience)

### Route
`/assessment/[id]/review`

### Layout
Sidebar (280px fixed) + Main content (max-w-3xl, 720px, centered in remaining space).

### Sidebar Component

```
<ReviewSidebar>                       // w-[280px], bg-gray-50, border-r, fixed left, h-screen, overflow-y-auto
  <SidebarHeader>
    <BackLink href={`/assessment/${id}/scope`}>← Back to Scope</BackLink>
    <OverallProgress>
      <ProgressBar value={overallPercent} />
      <span className="subhead text-gray-600">{reviewedSteps} / {totalSteps} steps</span>
    </OverallProgress>
  </SidebarHeader>

  <ScopeItemList>
    {selectedScopeItems.map(item => (
      <ScopeItemNav key={item.id}
        active={item.id === currentScopeItemId}
        onClick={() => navigateToItem(item.id)}
      >
        <ItemName className="callout">{item.nameClean}</ItemName>
        <ItemProgress>
          <MiniProgressBar value={item.reviewedSteps / item.totalSteps} />
          <span className="caption-1 text-gray-400">
            {item.reviewedSteps}/{item.totalSteps}
          </span>
        </ItemProgress>
        <StatusSummary>               // tiny colored dots
          <Dot color="green" count={item.fitCount} />
          <Dot color="blue" count={item.configureCount} />
          <Dot color="amber" count={item.gapCount} />
          <Dot color="gray" count={item.pendingCount} />
        </StatusSummary>
      </ScopeItemNav>
    ))}
  </ScopeItemList>

  <SidebarFooter>
    <FilterToggle label="Hide login/access steps" />
    <CompletionStats>
      <StatRow label="FIT" count={fitTotal} color="green" />
      <StatRow label="CONFIGURE" count={configureTotal} color="blue" />
      <StatRow label="GAP" count={gapTotal} color="amber" />
      <StatRow label="N/A" count={naTotal} color="gray" />
      <StatRow label="PENDING" count={pendingTotal} color="gray" />
    </CompletionStats>
  </SidebarFooter>
</ReviewSidebar>
```

### Main Content — Process Flow View

When a scope item is selected in the sidebar, the main area shows its process flows:

```
<ReviewMain>
  <ScopeItemHeader>
    <Breadcrumb>
      <span>{currentItem.functionalArea}</span>
      <span>{currentItem.subArea}</span>
    </Breadcrumb>
    <h1 className="title-1">{currentItem.nameClean}</h1>
    <h2 className="subhead text-gray-500">{currentItem.id}</h2>
  </ScopeItemHeader>

  <ProcessFlowTabs>                   // horizontal scrollable tabs
    {processFlows.map(flow => (
      <FlowTab
        key={flow.name}
        active={flow.name === currentFlow}
        label={flow.name}
        progress={flow.reviewedCount / flow.totalCount}
      />
    ))}
  </ProcessFlowTabs>

  <StepNavigation>
    <StepCounter className="subhead text-gray-500">
      Step {currentStepIndex + 1} of {currentFlowSteps.length}
    </StepCounter>
    <StepPicker>                       // dropdown or number input
      <Select value={currentStepIndex}>
        {steps.map((s, i) => (
          <option>{i+1}. {s.actionTitle}</option>
        ))}
      </Select>
    </StepPicker>
  </StepNavigation>

  <StepReviewCard>                     // THE core component
    // See detailed spec below
  </StepReviewCard>

  <StepNavigationBar>                  // flex justify-between, py-4
    <PreviousButton disabled={isFirstStep}>
      ← Previous
    </PreviousButton>
    <StepDots>                         // visual indicator of reviewed/pending/gap
      {steps.map((s, i) => (
        <Dot
          color={s.fitStatus === "FIT" ? "green" : s.fitStatus === "GAP" ? "amber" : "gray"}
          active={i === currentStepIndex}
          onClick={() => goToStep(i)}
        />
      ))}
    </StepDots>
    <NextButton disabled={isLastStep}>
      Next →
    </NextButton>
  </StepNavigationBar>

  <BatchActions>                       // collapsed by default, expandable
    <Button variant="ghost" onClick={toggleBatch}>Batch Actions</Button>
    <BatchPanel>
      <MarkRemainingFit />            // "Mark all remaining steps as FIT"
      <MarkFlowFit />                 // "Mark all steps in this flow as FIT"
    </BatchPanel>
  </BatchActions>
</ReviewMain>
```

### Step Review Card (Detailed Spec)

This is the most important component. Per DESIGN-SYSTEM.md:

```
<StepReviewCard>                       // bg-white, rounded-lg, border, overflow-hidden

  <!-- HEADER -->
  <CardHeader className="px-5 py-4 border-b border-gray-100 flex justify-between items-start">
    <div>
      <span className="caption-1 text-gray-400">
        Step {step.sequence + 1} · {step.processFlowGroup}
      </span>
      <h3 className="title-3 text-gray-950 mt-1">{step.actionTitle}</h3>
    </div>
    <StepTypeBadge type={step.stepType} />  // e.g., "DATA_ENTRY", "VERIFICATION"
  </CardHeader>

  <!-- SAP BEST PRACTICE SECTION -->
  <SapContentSection className="px-5 py-4 bg-gray-50">
    <Label className="caption-1 text-gray-400 uppercase tracking-wider">
      What SAP Best Practice Says
    </Label>
    <SanitizedHtml
      html={step.actionInstructionsHtml}
      className="body text-gray-950 mt-2"
      allowedTags={["p","h1","h2","h3","h4","h5","h6","span","strong","em","ul","ol","li","table","tr","td","th","br","a"]}
    />
    {step.actionExpectedResult && (
      <ExpectedResult className="mt-3">
        <Label className="caption-1 text-gray-400 uppercase tracking-wider">
          Expected Result
        </Label>
        <SanitizedHtml
          html={step.actionExpectedResult}
          className="callout text-gray-600 italic mt-1"
        />
      </ExpectedResult>
    )}
  </SapContentSection>

  <!-- RELATED CONFIGURATIONS (if any for this scope item) -->
  {relatedConfigs.length > 0 && (
    <RelatedConfigSection className="px-5 py-3 bg-blue-50/30 border-t border-blue-100">
      <Label className="caption-1 text-blue-600 uppercase tracking-wider">
        Related Configuration Activities
      </Label>
      <ConfigList className="mt-2 flex flex-col gap-2">
        {relatedConfigs.map(config => (
          <ConfigRow className="flex items-center gap-2">
            <CategoryBadge category={config.category} />  // Mandatory=red, Recommended=amber, Optional=gray
            <span className="callout">{config.configItemName}</span>
            {config.selfService && <SelfServiceBadge />}
          </ConfigRow>
        ))}
      </ConfigList>
    </RelatedConfigSection>
  )}

  <!-- CLIENT RESPONSE SECTION -->
  <ClientResponseSection className="px-5 py-4">
    <Label className="caption-1 text-gray-400 uppercase tracking-wider">
      How Does Your Company Do This?
    </Label>

    <RadioGroup className="mt-3 flex flex-col gap-3">
      <RadioOption value="FIT"
        label="This matches our process"
        description="SAP best practice aligns with how we operate"
        selected={response.fitStatus === "FIT"}
        color="green"
      />
      <RadioOption value="CONFIGURE"
        label="We can work with this, with configuration"
        description="SAP can handle our variation with standard settings"
        selected={response.fitStatus === "CONFIGURE"}
        color="blue"
      />
      <RadioOption value="GAP"
        label="Our process is different"
        description="We need something SAP doesn't do out of the box"
        selected={response.fitStatus === "GAP"}
        color="amber"
      />
      <RadioOption value="NA"
        label="Not applicable to us"
        description="This step doesn't apply to our business"
        selected={response.fitStatus === "NA"}
        color="gray"
      />
    </RadioGroup>

    <!-- GAP DETAIL (shown when GAP selected) -->
    {response.fitStatus === "GAP" && (
      <GapDetailSection className="mt-4 p-4 bg-amber-50 rounded-md border border-amber-200">
        <Label className="caption-1 text-amber-600 uppercase tracking-wider">
          Tell Us How Your Process Differs
        </Label>
        <textarea
          className="mt-2 w-full min-h-[96px] body"
          placeholder="Describe your current process and what you need that differs from SAP's approach..."
          value={response.clientNote}
          minLength={10}
          required
        />
        <CharCount className="caption-2 text-gray-400 mt-1">
          {response.clientNote?.length || 0} / 10 minimum characters
        </CharCount>
      </GapDetailSection>
    )}

    <!-- CONFIGURE DETAIL (shown when CONFIGURE selected) -->
    {response.fitStatus === "CONFIGURE" && (
      <ConfigureDetailSection className="mt-4 p-4 bg-blue-50 rounded-md border border-blue-200">
        <Label className="caption-1 text-blue-600 uppercase tracking-wider">
          What Configuration Do You Need?
        </Label>
        <textarea
          className="mt-2 w-full min-h-[72px] body"
          placeholder="Describe the specific configuration needed (e.g., different payment terms, approval thresholds)..."
          value={response.clientNote}
        />
      </ConfigureDetailSection>
    )}
  </ClientResponseSection>

  <!-- ACTIVITY/NAVIGATION CONTEXT -->
  {step.activityTitle && (
    <ActivityContext className="px-5 py-3 bg-gray-50 border-t border-gray-100">
      <Label className="caption-1 text-gray-400">Activity</Label>
      <span className="callout text-gray-600">{step.activityTitle}</span>
      {step.activityTargetUrl && (
        <ExternalLink href={step.activityTargetUrl} className="caption-1 text-blue-500">
          Open in SAP
        </ExternalLink>
      )}
    </ActivityContext>
  )}

</StepReviewCard>
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `ArrowLeft` | Previous step |
| `→` / `ArrowRight` | Next step |
| `1` | Select FIT |
| `2` | Select CONFIGURE |
| `3` | Select GAP |
| `4` | Select N/A |
| `Escape` | Clear selection (back to PENDING) |

### Data Sources
- GET `/api/assessments/[id]/scope` — selected scope items for sidebar
- GET `/api/catalog/scope-items/[scopeItemId]` — scope item with process flows
- GET `/api/catalog/scope-items/[scopeItemId]/steps?page=1&limit=50` — paginated steps
- GET `/api/catalog/config-activities?scopeItemId=[id]` — related configs
- PUT `/api/assessments/[id]/steps/[processStepId]` — save response
- POST `/api/assessments/[id]/steps/bulk-fit` — batch mark as FIT

### Auto-Save Behavior
- Every response change saves immediately (no debounce — response is discrete, not text)
- Text fields (clientNote) debounce at 1000ms
- Visual confirmation: brief green checkmark icon next to saved field
- If save fails: red border + "Failed to save. Retrying..." with automatic retry (3 attempts)

### States

| State | UI |
|-------|----|
| Loading scope items | Sidebar skeleton |
| Loading steps | Main area skeleton cards |
| Step reviewed (FIT) | Green left border on card |
| Step reviewed (GAP) | Amber left border, gap detail expanded |
| Step pending | No colored border |
| All steps in flow reviewed | Flow tab shows green checkmark |
| All scope item steps reviewed | Sidebar item shows green checkmark |
| Save in progress | Subtle pulse on save indicator |
| Save failed | Red error banner with retry |

---

## Screen 5: Gap Resolution

### Route
`/assessment/[id]/gaps`

### Layout
Sidebar (280px) + Main content (max-w-4xl, 896px).

### Sidebar Component

```
<GapSidebar>
  <SummaryStats>
    <StatCard label="Total Gaps" value={gapCount} />
    <StatCard label="Resolved" value={resolvedCount} color="green" />
    <StatCard label="Unresolved" value={unresolvedCount} color="amber" />
  </SummaryStats>

  <ResolutionBreakdown>               // pie chart or stacked bar
    <BreakdownRow label="CONFIGURE" count={configureCount} color="blue" />
    <BreakdownRow label="Key User Ext" count={kueCount} color="teal" />
    <BreakdownRow label="BTP Extension" count={btpCount} color="amber" />
    <BreakdownRow label="ISV / 3rd Party" count={isvCount} color="orange" />
    <BreakdownRow label="Custom ABAP" count={abapCount} color="red" />
    <BreakdownRow label="Adapt Process" count={adaptCount} color="purple" />
    <BreakdownRow label="Out of Scope" count={oosCount} color="gray" />
  </ResolutionBreakdown>

  <EffortSummary>
    <StatRow label="Additional Effort" value={`${totalEffortDays} days`} />
    <StatRow label="Recurring Cost" value={`$${totalRecurring}/yr`} />
    <StatRow label="Confidence" value={`${confidencePercent}%`} />
  </EffortSummary>

  <ScopeItemFilter>                   // filter gaps by scope item
    {scopeItemsWithGaps.map(item => (
      <FilterOption>{item.nameClean} ({item.gapCount})</FilterOption>
    ))}
  </ScopeItemFilter>
</GapSidebar>
```

### Main Content

```
<GapResolutionMain>
  <PageHeader>
    <h1 className="title-1">Gap Resolution</h1>
    <p className="body text-gray-600">
      Review each gap and decide how to address it. Every gap needs a resolution.
    </p>
  </PageHeader>

  <GapList>
    {gaps.map(gap => (
      <GapCard key={gap.id}>          // bg-white, rounded-lg, border, overflow-hidden
        <GapHeader className="px-5 py-4 border-b bg-amber-50">
          <div>
            <span className="caption-1 text-gray-400">{gap.scopeItemId} · Step {gap.stepSequence}</span>
            <h3 className="headline">{gap.processStep.actionTitle}</h3>
          </div>
          <ResolutionBadge type={gap.resolutionType} />
        </GapHeader>

        <GapContext className="px-5 py-4">
          <Label className="caption-1 text-gray-400 uppercase">What the Client Needs</Label>
          <p className="body">{gap.gapDescription}</p>

          <Label className="caption-1 text-gray-400 uppercase mt-4">What SAP Does</Label>
          <SanitizedHtml html={gap.processStep.actionInstructionsHtml} className="callout text-gray-600" />
        </GapContext>

        <ResolutionOptions className="px-5 py-4 border-t">
          <Label className="caption-1 text-gray-400 uppercase">Resolution Options</Label>

          <OptionGrid className="mt-3 grid grid-cols-1 gap-3">
            <!-- CONFIGURE option -->
            <ResolutionOption
              type="CONFIGURE"
              label="SAP Configuration"
              description="Standard configuration can handle this"
              effort="0.5–2 days"
              risk="None"
              upgradeImpact="None"
              selected={gap.resolutionType === "CONFIGURE"}
            />

            <!-- KEY_USER_EXT option -->
            <ResolutionOption
              type="KEY_USER_EXT"
              label="Key User Extension"
              description="Custom field, validation, or CDS view"
              effort="2–5 days"
              risk="Low"
              upgradeImpact="SAP supported — upgrade safe"
              selected={gap.resolutionType === "KEY_USER_EXT"}
            />

            <!-- BTP_EXT option -->
            <ResolutionOption
              type="BTP_EXT"
              label="BTP Extension"
              description="Side-by-side application on SAP BTP"
              effort="5–20 days"
              risk="Medium"
              upgradeImpact="Separate lifecycle — retest after updates"
              warning={true}
              selected={gap.resolutionType === "BTP_EXT"}
            />

            <!-- ISV option -->
            <ResolutionOption
              type="ISV"
              label="ISV / 3rd Party"
              description="Third-party software solution"
              effort="Variable"
              risk="Medium"
              upgradeImpact="Integration must be maintained"
              warning={true}
              selected={gap.resolutionType === "ISV"}
            />

            <!-- CUSTOM_ABAP option -->
            <ResolutionOption
              type="CUSTOM_ABAP"
              label="Custom ABAP Cloud"
              description="Custom development in ABAP Cloud (RAP)"
              effort="5–30 days"
              risk="Medium"
              upgradeImpact="Must follow Clean Core — retest after updates"
              warning={true}
              cleanCoreNote="Custom ABAP in S/4HANA Cloud Public Edition must follow Clean Core principles (ABAP Cloud / RAP only). Classic ABAP modifications are NOT possible."
              selected={gap.resolutionType === "CUSTOM_ABAP"}
            />

            <!-- ADAPT_PROCESS option (always shown) -->
            <ResolutionOption
              type="ADAPT_PROCESS"
              label="Adapt Your Process"
              description="Change your business process to match SAP standard"
              effort="0.5 days (training)"
              risk="None"
              upgradeImpact="None"
              highlight={true}
              costDelta={`Saves ${extensionEffort - 0.5} days vs. extending`}
              selected={gap.resolutionType === "ADAPT_PROCESS"}
            />

            <!-- OUT_OF_SCOPE option -->
            <ResolutionOption
              type="OUT_OF_SCOPE"
              label="Out of Scope"
              description="Defer this gap to a later phase"
              effort="0 days"
              risk="Unresolved gap — flagged as risk"
              selected={gap.resolutionType === "OUT_OF_SCOPE"}
            />
          </OptionGrid>
        </ResolutionOptions>

        <!-- RATIONALE (required for any selection) -->
        {gap.resolutionType && gap.resolutionType !== "OUT_OF_SCOPE" && (
          <RationaleSection className="px-5 py-4 border-t bg-gray-50">
            <Label className="caption-1 text-gray-400 uppercase">
              Why This Resolution?
            </Label>
            <textarea
              className="mt-2 w-full min-h-[72px] body"
              placeholder="Explain the rationale for choosing this resolution..."
              value={gap.rationale}
              minLength={20}
              required
            />
            <CharCount>{gap.rationale?.length || 0} / 20 minimum</CharCount>
          </RationaleSection>
        )}

        <!-- COST COMPARISON (shown when extension selected) -->
        {isExtensionType(gap.resolutionType) && (
          <CostComparison className="px-5 py-4 border-t bg-purple-50/50">
            <Label className="caption-1 text-purple-600 uppercase">Cost Comparison</Label>
            <ComparisonTable>
              <Row label="Extend" effort={`${gap.effortDays} days`} cost={`$${gap.costEstimate?.onetime}`} recurring={`$${gap.costEstimate?.recurring}/yr`} />
              <Row label="Adapt" effort="0.5 days" cost="$0" recurring="$0/yr" />
              <DeltaRow delta={`${gap.effortDays - 0.5} days + $${gap.costEstimate?.recurring}/yr saved by adapting`} />
            </ComparisonTable>
          </CostComparison>
        )}
      </GapCard>
    ))}
  </GapList>

  <ActionBar>
    <BackButton>← Process Review</BackButton>
    <GapSummary>
      {unresolvedCount === 0
        ? <span className="headline text-green-600">All gaps resolved</span>
        : <span className="headline text-amber-600">{unresolvedCount} gaps remaining</span>
      }
    </GapSummary>
    <ContinueButton disabled={unresolvedCount > 0}>
      Continue to Configuration →
    </ContinueButton>
  </ActionBar>
</GapResolutionMain>
```

### Data Sources
- GET `/api/assessments/[id]/gaps` — all gaps with resolution data and summary stats
- PUT `/api/assessments/[id]/gaps/[processStepId]` — save resolution
- GET `/api/admin/intelligence/extensibility-patterns` — for resolution suggestions

### "What If" Calculator

Interactive toggle that lets users switch individual gaps between EXTEND and ADAPT to see total impact:

```
<WhatIfPanel>                          // Slide-out panel or modal
  <h3 className="title-3">What If Calculator</h3>
  <p className="callout text-gray-600">
    Toggle between extending and adapting to see the impact on total effort and cost.
  </p>

  <GapToggleList>
    {gaps.map(gap => (
      <ToggleRow>
        <GapTitle>{gap.processStep.actionTitle}</GapTitle>
        <SegmentedControl>
          <Segment value="extend" label={`Extend (${gap.effortDays}d)`} />
          <Segment value="adapt" label="Adapt (0.5d)" />
        </SegmentedControl>
      </ToggleRow>
    ))}
  </GapToggleList>

  <TotalImpact>                        // updates in real-time
    <Row label="Total Effort" current={currentEffort} whatIf={whatIfEffort} />
    <Row label="Annual Cost" current={currentRecurring} whatIf={whatIfRecurring} />
    <Row label="Upgrade Risk Items" current={currentRiskCount} whatIf={whatIfRiskCount} />
  </TotalImpact>
</WhatIfPanel>
```

---

## Screen 6: Configuration Matrix

### Route
`/assessment/[id]/config`

### Layout
Full width table (`max-w-6xl`, 1152px). Filterable, sortable data table.

### Component Hierarchy

```
<ConfigMatrixPage>
  <PageHeader>
    <h1 className="title-1">Configuration Matrix</h1>
    <p className="body text-gray-600">
      {totalConfigs} configuration activities for your {selectedScopeCount} selected scope items.
    </p>
  </PageHeader>

  <SummaryCards className="grid grid-cols-4 gap-4">
    <SummaryCard label="Mandatory" count={mandatoryCount} color="red"
      description="Always included — cannot be excluded" />
    <SummaryCard label="Recommended" count={recommendedCount} color="amber"
      description="Included by default — can exclude with reason" />
    <SummaryCard label="Optional" count={optionalCount} color="gray"
      description="Excluded by default — include if needed" />
    <SummaryCard label="Self-Service" count={selfServiceCount} color="green"
      description="Can be done without SAP support ticket" />
  </SummaryCards>

  <FilterBar className="flex gap-3 my-6">
    <CategoryFilter>                   // Multi-select: Mandatory, Recommended, Optional
      <Checkbox label="Mandatory" checked />
      <Checkbox label="Recommended" checked />
      <Checkbox label="Optional" />
    </CategoryFilter>
    <SelfServiceFilter>               // Toggle: All / Self-Service Only
    <AreaFilter />                     // Dropdown: Application Area
    <ScopeItemFilter />               // Dropdown: Scope Item
    <SearchInput placeholder="Search configurations..." />
  </FilterBar>

  <ConfigTable>                        // Sortable, paginated
    <TableHeader>
      <Col sortable>Scope Item</Col>
      <Col sortable>Activity</Col>
      <Col sortable>Category</Col>
      <Col>Self-Service</Col>
      <Col>Include</Col>
      <Col>Action</Col>
    </TableHeader>

    <TableBody>
      {configs.map(config => (
        <TableRow key={config.id}
          className={config.category === "Mandatory" ? "bg-red-50/30" : ""}
        >
          <Cell>
            <span className="caption-1 text-gray-400">{config.scopeItemId}</span>
            <span className="callout">{config.scopeItemDescription}</span>
          </Cell>
          <Cell>
            <span className="body">{config.configItemName}</span>
            <span className="footnote text-gray-500">{config.activityDescription}</span>
          </Cell>
          <Cell>
            <CategoryBadge category={config.category} />
          </Cell>
          <Cell>
            {config.selfService
              ? <Badge color="green">Self-Service</Badge>
              : <Badge color="gray">SAP Support</Badge>
            }
          </Cell>
          <Cell>
            {config.category === "Mandatory"
              ? <LockedCheckbox checked disabled label="Required" />
              : <Checkbox
                  checked={config.included}
                  onChange={() => toggleConfig(config.id)}
                />
            }
          </Cell>
          <Cell>
            <ExpandButton onClick={() => showConfigDetail(config.id)} />
            {config.scopeItem.setupPdfStored && (
              <SetupGuideLink scopeItemId={config.scopeItemId} />
            )}
          </Cell>
        </TableRow>
      ))}
    </TableBody>
  </ConfigTable>

  <Pagination />

  <ActionBar>
    <BackButton>← Gap Resolution</BackButton>
    <ConfigSummary>
      <span>{includedCount} configurations included</span>
      <span>{excludedRecommendedCount} recommended configs excluded</span>
    </ConfigSummary>
    <ContinueButton>Continue to Report →</ContinueButton>
  </ActionBar>
</ConfigMatrixPage>
```

### Config Detail Panel (Expandable)

```
<ConfigDetailPanel>                    // slide-down below the row
  <div className="p-5 bg-gray-50 border-t">
    <Grid cols={2} gap={4}>
      <Field label="Config Item ID">{config.configItemId}</Field>
      <Field label="Activity ID">{config.activityId}</Field>
      <Field label="Application Area">{config.applicationArea}</Field>
      <Field label="Application Subarea">{config.applicationSubarea}</Field>
      <Field label="Localization Scope">{config.localizationScope || "Global"}</Field>
      <Field label="Country Specific">{config.countrySpecific || "No"}</Field>
      <Field label="Redo in Production">{config.redoInProduction || "No"}</Field>
      <Field label="Component">{config.componentId}</Field>
    </Grid>

    {config.configApproach && (
      <Field label="Configuration Approach" fullWidth>
        <p className="callout text-gray-600">{config.configApproach}</p>
      </Field>
    )}

    {config.additionalInfo && (
      <Field label="Additional Information" fullWidth>
        <p className="callout text-gray-600">{config.additionalInfo}</p>
      </Field>
    )}

    {/* Reason required when excluding a Recommended config */}
    {config.category === "Recommended" && !config.included && (
      <ExclusionReason>
        <Label>Reason for Excluding (Required)</Label>
        <textarea placeholder="Why is this recommended configuration being excluded?" required />
      </ExclusionReason>
    )}
  </div>
</ConfigDetailPanel>
```

### Data Sources
- GET `/api/catalog/config-activities?scopeItemId=[ids]&page=1&limit=50` — paginated
- GET `/api/catalog/setup-guides/[scopeItemId]/pdf` — PDF binary for viewer
- Decision log entries created for include/exclude actions

---

## Screen 7: Executive Report

### Route
`/assessment/[id]/report`

### Layout
Full width, print-optimized (`max-w-5xl`, 1024px). Each section is a card.

### Component Hierarchy

```
<ReportPage>
  <ReportHeader>
    <BoundLogo />
    <h1 className="display">SAP Fit Assessment Report</h1>
    <ReportMeta>
      <Field label="Company">{assessment.companyName}</Field>
      <Field label="Industry">{assessment.industry}</Field>
      <Field label="Date">{formatDate(assessment.updatedAt)}</Field>
      <Field label="Status"><StatusBadge status={assessment.status} /></Field>
      <Field label="Confidence">{confidencePercent}%</Field>
    </ReportMeta>
  </ReportHeader>

  <DownloadBar className="sticky top-0 bg-white border-b py-3 z-10">
    <DownloadButton format="pdf" label="Executive Summary (PDF)" />
    <DownloadButton format="xlsx" section="scope" label="Scope Catalog" />
    <DownloadButton format="xlsx" section="steps" label="Step Detail" />
    <DownloadButton format="xlsx" section="gaps" label="Gap Register" />
    <DownloadButton format="xlsx" section="config" label="Config Workbook" />
    <DownloadButton format="xlsx" section="audit" label="Audit Trail" />
    <DownloadButton format="zip" label="Complete Package (ZIP)" />
  </DownloadBar>

  <!-- SECTION 1: Executive Summary -->
  <ReportSection id="executive-summary">
    <h2 className="title-1">Executive Summary</h2>

    <MetricGrid className="grid grid-cols-4 gap-4">
      <MetricCard label="Scope Items" value={selectedScopeCount} subtitle="of 550 available" />
      <MetricCard label="Process Steps" value={totalStepsInScope} subtitle="reviewed" />
      <MetricCard label="Fit Rate" value={`${fitPercent}%`} subtitle="steps match SAP" color="green" />
      <MetricCard label="Gaps Identified" value={gapCount} subtitle="requiring resolution" color="amber" />
    </MetricGrid>

    <FitDistribution>                  // Horizontal stacked bar chart
      <BarSegment label="FIT" percent={fitPercent} color="green" />
      <BarSegment label="CONFIGURE" percent={configurePercent} color="blue" />
      <BarSegment label="GAP" percent={gapPercent} color="amber" />
      <BarSegment label="N/A" percent={naPercent} color="gray" />
    </FitDistribution>
  </ReportSection>

  <!-- SECTION 2: Scope Overview -->
  <ReportSection id="scope-overview">
    <h2 className="title-1">Scope Overview</h2>
    <ScopeTable>
      <TableHeader>
        <Col>ID</Col>
        <Col>Scope Item</Col>
        <Col>Area</Col>
        <Col>Steps</Col>
        <Col>Fit</Col>
        <Col>Config</Col>
        <Col>Gap</Col>
        <Col>N/A</Col>
      </TableHeader>
      {selectedScopeItems.map(item => (
        <TableRow>
          <Cell>{item.id}</Cell>
          <Cell>{item.nameClean}</Cell>
          <Cell>{item.functionalArea}</Cell>
          <Cell>{item.totalSteps}</Cell>
          <Cell color="green">{item.fitCount}</Cell>
          <Cell color="blue">{item.configureCount}</Cell>
          <Cell color="amber">{item.gapCount}</Cell>
          <Cell color="gray">{item.naCount}</Cell>
        </TableRow>
      ))}
    </ScopeTable>
  </ReportSection>

  <!-- SECTION 3: Gap Register -->
  <ReportSection id="gap-register">
    <h2 className="title-1">Gap Register</h2>
    <p className="body text-gray-600 mb-4">
      {gapCount} gaps identified across {scopeItemsWithGapsCount} scope items.
    </p>

    <ResolutionSummary className="grid grid-cols-4 gap-4 mb-6">
      <MetricCard label="Configure" value={configureGapCount} color="blue" />
      <MetricCard label="Key User Ext" value={kueGapCount} color="teal" />
      <MetricCard label="BTP Extension" value={btpGapCount} color="amber" />
      <MetricCard label="Custom ABAP" value={abapGapCount} color="red" />
      <MetricCard label="ISV" value={isvGapCount} color="orange" />
      <MetricCard label="Adapt Process" value={adaptGapCount} color="purple" />
      <MetricCard label="Out of Scope" value={oosGapCount} color="gray" />
    </ResolutionSummary>

    <GapTable>
      {gaps.map(gap => (
        <GapRow>
          <Cell>{gap.scopeItemId}</Cell>
          <Cell>{gap.processStep.actionTitle}</Cell>
          <Cell>{gap.gapDescription}</Cell>
          <Cell><ResolutionBadge type={gap.resolutionType} /></Cell>
          <Cell>{gap.effortDays ? `${gap.effortDays}d` : "—"}</Cell>
          <Cell>{gap.rationale}</Cell>
        </GapRow>
      ))}
    </GapTable>
  </ReportSection>

  <!-- SECTION 4: Effort Estimate -->
  <ReportSection id="effort-estimate">
    <h2 className="title-1">Effort Estimate</h2>

    <EffortBreakdown>
      <BreakdownByPhase>
        <Row label="Implementation (base)" value={`${baseDays} days`} />
        <Row label="Configuration" value={`${configDays} days`} />
        <Row label="Extensions" value={`${extensionDays} days`} />
        <Row label="Testing" value={`${testDays} days`} />
        <Row label="Data Migration" value={`${migrationDays} days`} />
        <Row label="Training & Change Mgmt" value={`${trainingDays} days`} />
        <TotalRow label="Total Estimated Effort" value={`${totalDays} days`} />
      </BreakdownByPhase>

      <BreakdownByArea>
        {areas.map(area => (
          <Row label={area.name} value={`${area.totalDays} days`} />
        ))}
      </BreakdownByArea>
    </EffortBreakdown>

    <ConfidenceIndicator value={confidencePercent}>
      <p className="callout text-gray-600">
        Estimate confidence: {confidencePercent}%.
        {confidencePercent < 70 && " Low confidence — more steps need review."}
      </p>
    </ConfidenceIndicator>
  </ReportSection>

  <!-- SECTION 5: Configuration Summary -->
  <ReportSection id="config-summary">
    <h2 className="title-1">Configuration Summary</h2>
    <ConfigSummaryTable>
      <Row label="Mandatory" count={mandatoryCount} status="Included (required)" />
      <Row label="Recommended — Included" count={includedRecommendedCount} />
      <Row label="Recommended — Excluded" count={excludedRecommendedCount} flagged />
      <Row label="Optional — Included" count={includedOptionalCount} />
      <Row label="Total Config Activities" count={totalIncludedCount} />
    </ConfigSummaryTable>

    {excludedRecommendedCount > 0 && (
      <WarningBanner>
        {excludedRecommendedCount} recommended configurations were excluded.
        Review the reasons in the Configuration Workbook export.
      </WarningBanner>
    )}
  </ReportSection>

  <!-- SECTION 6: Risk Register -->
  <ReportSection id="risk-register">
    <h2 className="title-1">Risk Register</h2>
    <RiskTable>
      {risks.map(risk => (
        <RiskRow>
          <Cell><RiskLevelBadge level={risk.level} /></Cell>
          <Cell>{risk.description}</Cell>
          <Cell>{risk.source}</Cell>
          <Cell>{risk.mitigation}</Cell>
        </RiskRow>
      ))}
    </RiskTable>

    <!-- Auto-generated risks -->
    <!-- From: unresolved gaps, excluded recommended configs, extension upgrade risks -->
  </ReportSection>

  <!-- SECTION 7: Sign-Off -->
  <ReportSection id="sign-off">
    <h2 className="title-1">Assessment Sign-Off</h2>

    <SignOffGrid className="grid grid-cols-1 gap-6">
      <SignOffBlock role="Client Representative">
        <NameInput />
        <EmailInput />
        <TitleInput />
        <SignButton />
        <Timestamp />
      </SignOffBlock>

      <SignOffBlock role="Bound Consultant">
        <NameInput />
        <EmailInput />
        <SignButton />
        <Timestamp />
      </SignOffBlock>

      <SignOffBlock role="Bound Project Manager">
        <NameInput />
        <EmailInput />
        <SignButton />
        <Timestamp />
      </SignOffBlock>
    </SignOffGrid>

    <SignOffStatus>
      {allSigned
        ? <SuccessBanner>Assessment signed off by all parties</SuccessBanner>
        : <PendingBanner>{remainingSignatures} signatures remaining</PendingBanner>
      }
    </SignOffStatus>
  </ReportSection>
</ReportPage>
```

### Data Sources
- GET `/api/assessments/[id]/report/summary` — aggregated stats
- GET `/api/assessments/[id]/report/executive-summary.pdf` — PDF download
- GET `/api/assessments/[id]/report/scope-catalog.xlsx` — XLSX download
- GET `/api/assessments/[id]/report/step-detail.xlsx`
- GET `/api/assessments/[id]/report/gap-register.xlsx`
- GET `/api/assessments/[id]/report/config-workbook.xlsx`
- GET `/api/assessments/[id]/report/audit-trail.xlsx`
- POST `/api/assessments/[id]/report/sign-off` — digital signature

### Print Optimization
- `@media print` CSS: hide navigation, download bar, sign buttons
- Each ReportSection starts on a new page (`break-before: page`)
- Bound logo in print header
- Page numbers in print footer

---

## Screen 7.5: Process Flow Atlas

### Route
`/assessment/[id]/flows`

### Layout
Full width (`max-w-6xl`, 1152px). Sidebar with scope item list + main area with diagram viewer.

### Component Hierarchy

```
<FlowAtlasPage>
  <PageHeader>
    <h1 className="title-1">Process Flow Atlas</h1>
    <p className="body text-gray-600">
      Sequential process flow diagrams for all reviewed scope items, color-coded by fit status.
    </p>
    <DownloadAtlasButton>Download Complete Atlas (PDF)</DownloadAtlasButton>
    <GenerateButton variant="secondary">Regenerate Diagrams</GenerateButton>
  </PageHeader>

  <FlowAtlasLayout className="flex gap-6">
    <!-- Sidebar: Scope Item List -->
    <FlowSidebar className="w-[280px] flex-shrink-0">
      {scopeItemsWithFlows.map(item => (
        <FlowNavItem
          key={item.id}
          active={item.id === currentScopeItemId}
          onClick={() => selectScopeItem(item.id)}
        >
          <span className="callout">{item.nameClean}</span>
          <span className="caption-1 text-gray-400">{item.flowCount} flows</span>
          <MiniStatusBar fit={item.fitCount} gap={item.gapCount} pending={item.pendingCount} />
        </FlowNavItem>
      ))}
    </FlowSidebar>

    <!-- Main: Diagram Viewer -->
    <FlowViewerMain className="flex-1">
      {currentScopeItem && (
        <>
          <ScopeItemHeader>
            <h2 className="title-2">{currentScopeItem.nameClean}</h2>
            <span className="subhead text-gray-500">{currentScopeItem.id}</span>
          </ScopeItemHeader>

          <FlowTabs>
            {currentScopeItem.flows.map(flow => (
              <FlowTab key={flow.name} label={flow.name} active={flow.name === currentFlow} />
            ))}
          </FlowTabs>

          <FlowDiagramViewer>
            <InteractiveSvg
              svgContent={currentDiagram.svgContent}
              onStepClick={(stepId) => showStepDetail(stepId)}
              zoomable
              pannable
            />
          </FlowDiagramViewer>

          <FlowLegend>
            <LegendItem color="green" label="FIT — Matches SAP best practice" />
            <LegendItem color="blue" label="CONFIGURE — Standard configuration needed" />
            <LegendItem color="amber" label="GAP — Process differs from SAP" />
            <LegendItem color="gray" label="N/A or Pending review" />
          </FlowLegend>

          <FlowActions>
            <ExportSvgButton>Export SVG</ExportSvgButton>
            <ExportPdfButton>Export PDF</ExportPdfButton>
          </FlowActions>
        </>
      )}
    </FlowViewerMain>
  </FlowAtlasLayout>
</FlowAtlasPage>
```

### Data Sources
- GET `/api/assessments/[id]/flows` — list diagrams
- GET `/api/assessments/[id]/flows/[flowId]` — single SVG
- POST `/api/assessments/[id]/flows` — generate/regenerate
- GET `/api/assessments/[id]/report/flow-atlas` — PDF download

### States
| State | UI |
|-------|----|
| No diagrams | Empty state: "No flow diagrams generated yet. Click Generate to create them." |
| Generating | Progress bar with "Generating diagrams... X/Y" |
| Viewing | Interactive SVG with zoom/pan, click for step detail |
| Step detail modal | Overlay showing step info, fit status, client note |

---

## Screen 7.6: Remaining Items Register

### Route
`/assessment/[id]/remaining`

### Layout
Full width table (`max-w-6xl`, 1152px). Filterable, sortable.

### Component Hierarchy

```
<RemainingItemsPage>
  <PageHeader>
    <h1 className="title-1">Remaining Items Register</h1>
    <p className="body text-gray-600">
      Items requiring resolution after the assessment. Auto-generated from assessment data plus manually added items.
    </p>
    <div className="flex gap-3">
      <AutoGenerateButton variant="secondary">Auto-Detect Items</AutoGenerateButton>
      <AddItemButton>Add Manual Item</AddItemButton>
      <ExportButton>Export XLSX</ExportButton>
    </div>
  </PageHeader>

  <SummaryCards className="grid grid-cols-4 gap-4 mb-6">
    <SummaryCard label="Total Items" value={totalCount} />
    <SummaryCard label="Critical" value={criticalCount} color="red" />
    <SummaryCard label="High" value={highCount} color="amber" />
    <SummaryCard label="Resolved" value={resolvedCount} color="green" />
  </SummaryCards>

  <FilterBar>
    <CategoryFilter />
    <SeverityFilter />
    <AreaFilter />
    <ResolvedFilter />
    <SearchInput placeholder="Search items..." />
  </FilterBar>

  <RemainingItemsTable>
    <TableHeader>
      <Col sortable>#</Col>
      <Col sortable>Category</Col>
      <Col sortable>Title</Col>
      <Col sortable>Severity</Col>
      <Col>Functional Area</Col>
      <Col>Assigned To</Col>
      <Col sortable>Status</Col>
    </TableHeader>
    {items.map(item => (
      <TableRow key={item.id} expandable>
        <Cell>{item.id}</Cell>
        <Cell><CategoryBadge category={item.category} /></Cell>
        <Cell className="body">{item.title}</Cell>
        <Cell><SeverityBadge severity={item.severity} /></Cell>
        <Cell className="callout text-gray-600">{item.functionalArea || "—"}</Cell>
        <Cell className="callout text-gray-600">{item.assignedTo || "Unassigned"}</Cell>
        <Cell>{item.resolvedAt ? <Badge color="green">Resolved</Badge> : <Badge color="gray">Open</Badge>}</Cell>
      </TableRow>
    ))}
  </RemainingItemsTable>

  <!-- Expandable detail shows description, source reference, resolution notes -->
</RemainingItemsPage>
```

### Category Labels (User-Friendly)

| Category Code | Display Label | Color |
|---------------|--------------|-------|
| unreviewed_step | Unreviewed Process Step | gray |
| maybe_scope | Undecided Scope Item | amber |
| excluded_recommended_config | Excluded Configuration | amber |
| out_of_scope_gap | Deferred Gap | red |
| integration_point | Integration Requirement | blue |
| data_migration | Data Migration | blue |
| custom_requirement | Custom Requirement | purple |

### Data Sources
- GET `/api/assessments/[id]/remaining` — list with filters
- POST `/api/assessments/[id]/remaining` — add manual item
- POST `/api/assessments/[id]/remaining/auto-generate` — auto-detect
- GET `/api/assessments/[id]/report/remaining-register` — XLSX export

---

## Screen 8: Admin Dashboard

### Route
`/admin`

### Layout
Sidebar (280px) + Main content. Admin-only (role check).

### Sidebar Navigation

```
<AdminSidebar>
  <NavItem icon="BarChart" label="Overview" href="/admin" />
  <NavSection label="Intelligence">
    <NavItem icon="Building" label="Industries" href="/admin/industries" />
    <NavItem icon="Calculator" label="Effort Baselines" href="/admin/baselines" />
    <NavItem icon="Puzzle" label="Extensibility Patterns" href="/admin/patterns" />
    <NavItem icon="ArrowRightLeft" label="Adaptation Patterns" href="/admin/adaptations" />
  </NavSection>
  <NavSection label="Data">
    <NavItem icon="Database" label="SAP Catalog" href="/admin/catalog" />
    <NavItem icon="Upload" label="ZIP Ingestion" href="/admin/ingest" />
    <NavItem icon="Shield" label="Data Verification" href="/admin/verify" />
  </NavSection>
  <NavSection label="System">
    <NavItem icon="Users" label="Users" href="/admin/users" />
    <NavItem icon="FileText" label="All Assessments" href="/admin/assessments" />
  </NavSection>
</AdminSidebar>
```

### Sub-Pages

#### `/admin` — Overview Dashboard

```
<AdminOverview>
  <MetricGrid>
    <MetricCard label="Total Assessments" value={assessmentCount} />
    <MetricCard label="Active Assessments" value={activeCount} />
    <MetricCard label="Signed Off" value={signedOffCount} />
    <MetricCard label="SAP Version" value="2508" />
  </MetricGrid>

  <RecentActivity>                     // last 20 decision log entries across all assessments
    <ActivityRow timestamp actor action entity />
  </RecentActivity>

  <DataHealth>
    <HealthCheck label="Scope Items" count={550} expected={550} />
    <HealthCheck label="Process Steps" count={102261} expected={102261} />
    <HealthCheck label="Config Activities" count={4703} expected={4703} />
    <HealthCheck label="Last Ingestion" date={lastIngestDate} />
  </DataHealth>
</AdminOverview>
```

#### `/admin/industries` — Industry Profile CRUD

```
<IndustryAdmin>
  <IndustryList>
    {industries.map(ind => (
      <IndustryCard>
        <Name>{ind.name}</Name>
        <ScopeCount>{ind.applicableScopeItems.length} scope items</ScopeCount>
        <EditButton />
        <DeleteButton />
      </IndustryCard>
    ))}
    <AddButton />
  </IndustryList>

  <IndustryEditor>                     // modal or side panel
    <NameInput />
    <DescriptionTextarea />
    <ScopeItemSelector>               // checkbox list of all 550 scope items, grouped by area
      {areas.map(area => (
        <AreaGroup>
          <AreaHeader>{area} <SelectAllToggle /></AreaHeader>
          {itemsInArea.map(item => (
            <Checkbox label={`${item.id} — ${item.nameClean}`} />
          ))}
        </AreaGroup>
      ))}
    </ScopeItemSelector>
    <SaveButton />
  </IndustryEditor>
</IndustryAdmin>
```

#### `/admin/ingest` — ZIP Ingestion

```
<IngestAdmin>
  <CurrentStatus>
    <Field label="Current Version">2508</Field>
    <Field label="Last Ingestion">{formatDate(lastIngest)}</Field>
    <Field label="Scope Items">{scopeItemCount}</Field>
    <Field label="Process Steps">{processStepCount}</Field>
  </CurrentStatus>

  <IngestForm>
    <FileUpload accept=".zip" label="Upload SAP Best Practices ZIP" />
    <WarningBanner>
      Re-ingestion will REPLACE all SAP catalog data.
      Assessment data will NOT be affected.
    </WarningBanner>
    <IngestButton variant="danger">Start Ingestion</IngestButton>
  </IngestForm>

  <IngestProgress>                     // shown during ingestion
    <ProgressBar />
    <LogOutput>                        // scrollable log of ingestion steps
      <LogLine>Parsing TestScripts... 550/550</LogLine>
      <LogLine>Parsing Config XLSM... 4703 activities</LogLine>
      <LogLine>Running verification... 13/13 checks passed</LogLine>
    </LogOutput>
  </IngestProgress>
</IngestAdmin>
```

---

## Global Components

### GlobalNav

Present on all authenticated pages.

```
<GlobalNav className="h-14 bg-white border-b flex items-center px-6">
  <LogoLink href="/assessments">
    <BoundMark className="w-8 h-8" />    // ≈ in rounded square
    <span className="headline ml-2">Bound</span>
  </LogoLink>

  <NavLinks className="ml-8 flex gap-1">
    <NavLink href="/dashboard">Dashboard</NavLink>
    // Context-dependent: show assessment nav when inside an assessment
    {currentAssessment && (
      <>
        <NavLink href={`/assessment/${id}/profile`}>Profile</NavLink>
        <NavLink href={`/assessment/${id}/scope`}>Scope</NavLink>
        <NavLink href={`/assessment/${id}/review`}>Review</NavLink>
        <NavLink href={`/assessment/${id}/gaps`}>Gaps</NavLink>
        <NavLink href={`/assessment/${id}/config`}>Config</NavLink>
        <NavLink href={`/assessment/${id}/flows`}>Flows</NavLink>
        <NavLink href={`/assessment/${id}/remaining`}>Items</NavLink>
        <NavLink href={`/assessment/${id}/report`}>Report</NavLink>
      </>
    )}
  </NavLinks>

  <Spacer />

  <UserMenu>
    <UserAvatar />
    <DropdownMenu>
      <MenuItem>Settings</MenuItem>
      <MenuItem>Help</MenuItem>
      <Separator />
      <MenuItem onClick={logout}>Sign Out</MenuItem>
    </DropdownMenu>
  </UserMenu>
</GlobalNav>
```

### WizardHeader / StepIndicator

```
<StepIndicator steps={steps} current={currentIndex}>
  <div className="flex items-center justify-center gap-2">
    {steps.map((step, i) => (
      <>
        <StepDot
          active={i === currentIndex}
          completed={i < currentIndex}
          label={step}
        />
        {i < steps.length - 1 && <StepConnector completed={i < currentIndex} />}
      </>
    ))}
  </div>
</StepIndicator>
```

### EmptyState

```
<EmptyState icon={iconName} title={title} description={description}>
  <Icon name={iconName} size={48} className="text-gray-300" />
  <h3 className="title-3 text-gray-950 mt-4">{title}</h3>
  <p className="body text-gray-600 mt-2 max-w-md text-center">{description}</p>
  {action && <Button className="mt-6">{action.label}</Button>}
</EmptyState>
```

### ErrorBoundary

```
<ErrorBoundary>
  <ErrorState>
    <Icon name="AlertTriangle" size={48} className="text-red-400" />
    <h3 className="title-3">Something went wrong</h3>
    <p className="body text-gray-600">{error.message}</p>
    <Button onClick={retry}>Try Again</Button>
  </ErrorState>
</ErrorBoundary>
```

### SkeletonLoaders

Every data-loading component has a skeleton variant:

```
<SkeletonCard>
  <div className="bg-white rounded-lg border p-5 animate-pulse">
    <div className="h-4 w-1/3 bg-gray-200 rounded" />
    <div className="h-6 w-2/3 bg-gray-200 rounded mt-3" />
    <div className="h-4 w-full bg-gray-200 rounded mt-4" />
    <div className="h-4 w-4/5 bg-gray-200 rounded mt-2" />
  </div>
</SkeletonCard>

<SkeletonTable rows={5}>
  {Array(rows).fill(null).map((_, i) => (
    <div className="flex gap-4 py-3 animate-pulse">
      <div className="h-4 w-20 bg-gray-200 rounded" />
      <div className="h-4 flex-1 bg-gray-200 rounded" />
      <div className="h-4 w-24 bg-gray-200 rounded" />
      <div className="h-4 w-16 bg-gray-200 rounded" />
    </div>
  ))}
</SkeletonTable>
```

---

## Navigation Flow

```
Login → MFA Setup (first time) → MFA Verify → Dashboard
Dashboard → Assessment List → [Create] → Company Profile
                                              ↓
                                         Scope Selection
                                              ↓
                                         Process Deep Dive
                                              ↓
                                         Gap Resolution
                                              ↓
                                         Configuration Matrix
                                              ↓
                                         Process Flow Atlas
                                              ↓
                                         Remaining Items Register
                                              ↓
                                         Executive Report → Sign-Off
```

Users can navigate freely between any completed step. The wizard step indicator shows which steps are complete (green), current (blue), and upcoming (gray). Forward navigation requires the current step to have minimum completion:

| Step | Minimum to Proceed |
|------|--------------------|
| Company Profile | All required fields filled |
| Scope Selection | At least 1 scope item selected |
| Process Deep Dive | No minimum (can proceed with partial review) |
| Gap Resolution | No minimum (can proceed with unresolved gaps — flagged as risk) |
| Configuration Matrix | No minimum |
| Report | All prior steps accessible; sign-off requires all 3 signatures |

---

## Responsive Behavior

### Desktop (1024px+) — Primary Target
- Full sidebar + main content layout
- All features visible

### Tablet (768px–1023px)
- Collapsible sidebar (hamburger toggle)
- Main content takes full width when sidebar hidden
- Table columns may be prioritized (hide less important columns)

### Mobile (375px–767px)
- Bottom tab navigation replaces sidebar
- Single column layout
- Step review card takes full width
- Tables become card-based lists
- Download buttons stack vertically

**Note**: The primary design target is desktop (laptop during workshops). Mobile is read-only / review-focused — full data entry is desktop-only.
