import type {
  SignOffProcess,
  SignatureRecord,
  AreaValidation,
  TechnicalValidation,
  CrossFunctionalValidation,
} from "@prisma/client";

let counter = 0;
const nextId = () => `test-${++counter}`;

type SignOffProcessOverrides = Partial<SignOffProcess>;
type SignatureRecordOverrides = Partial<SignatureRecord>;
type AreaValidationOverrides = Partial<AreaValidation>;
type TechnicalValidationOverrides = Partial<TechnicalValidation>;
type CrossFunctionalValidationOverrides = Partial<CrossFunctionalValidation>;

function createProcessBase(overrides: SignOffProcessOverrides = {}): SignOffProcess {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    assessmentId: overrides.assessmentId ?? nextId(),
    snapshotId: overrides.snapshotId ?? nextId(),
    status: overrides.status ?? "VALIDATION_NOT_STARTED",
    rejectedToStatus: overrides.rejectedToStatus ?? null,
    rejectionReason: overrides.rejectionReason ?? null,
    certificatePdfUrl: overrides.certificatePdfUrl ?? null,
    certificateHash: overrides.certificateHash ?? null,
    verificationToken: overrides.verificationToken ?? null,
    initiatedById: overrides.initiatedById ?? nextId(),
    createdAt: overrides.createdAt ?? now,
    completedAt: overrides.completedAt ?? null,
  };
}

function createSignatureBase(overrides: SignatureRecordOverrides = {}): SignatureRecord {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    signOffId: overrides.signOffId ?? nextId(),
    signatureType: overrides.signatureType ?? "EXECUTIVE",
    signerId: overrides.signerId ?? nextId(),
    signerName: overrides.signerName ?? `Signer ${id}`,
    signerEmail: overrides.signerEmail ?? `signer-${id}@example.com`,
    signerRole: overrides.signerRole ?? "client_sponsor",
    signerOrganization: overrides.signerOrganization ?? "Test Organization",
    signerTitle: overrides.signerTitle ?? null,
    authorityStatement:
      overrides.authorityStatement ??
      "I confirm that I have the authority to approve this assessment on behalf of my organization.",
    ipAddress: overrides.ipAddress ?? "127.0.0.1",
    userAgent: overrides.userAgent ?? "Mozilla/5.0 (Test Agent)",
    authMethod: overrides.authMethod ?? "session",
    mfaVerified: overrides.mfaVerified ?? false,
    documentHash: overrides.documentHash ?? `sha256_${nextId()}`,
    signedAt: overrides.signedAt ?? now,
    status: overrides.status ?? "PENDING",
    declineReason: overrides.declineReason ?? null,
  };
}

function createAreaValidationBase(overrides: AreaValidationOverrides = {}): AreaValidation {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    signOffId: overrides.signOffId ?? nextId(),
    functionalArea: overrides.functionalArea ?? "Finance",
    validatedById: overrides.validatedById ?? nextId(),
    validatorName: overrides.validatorName ?? `Validator ${id}`,
    validatorEmail: overrides.validatorEmail ?? `validator-${id}@example.com`,
    validatorRole: overrides.validatorRole ?? "process_owner",
    status: overrides.status ?? "PENDING",
    comments: overrides.comments ?? null,
    rejectionReason: overrides.rejectionReason ?? null,
    validatedAt: overrides.validatedAt ?? null,
    createdAt: overrides.createdAt ?? now,
  };
}

function createTechnicalValidationBase(
  overrides: TechnicalValidationOverrides = {},
): TechnicalValidation {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    signOffId: overrides.signOffId ?? nextId(),
    itLeadId: overrides.itLeadId ?? null,
    itLeadName: overrides.itLeadName ?? null,
    itLeadEmail: overrides.itLeadEmail ?? null,
    itLeadStatus: overrides.itLeadStatus ?? null,
    itLeadComments: overrides.itLeadComments ?? null,
    itLeadAt: overrides.itLeadAt ?? null,
    dmLeadId: overrides.dmLeadId ?? null,
    dmLeadName: overrides.dmLeadName ?? null,
    dmLeadEmail: overrides.dmLeadEmail ?? null,
    dmLeadStatus: overrides.dmLeadStatus ?? null,
    dmLeadComments: overrides.dmLeadComments ?? null,
    dmLeadAt: overrides.dmLeadAt ?? null,
    createdAt: overrides.createdAt ?? now,
  };
}

function createCrossFunctionalValidationBase(
  overrides: CrossFunctionalValidationOverrides = {},
): CrossFunctionalValidation {
  const id = overrides.id ?? nextId();
  const now = new Date();
  return {
    id,
    signOffId: overrides.signOffId ?? nextId(),
    validatedById: overrides.validatedById ?? nextId(),
    validatorName: overrides.validatorName ?? `Cross-Func Validator ${id}`,
    validatorEmail: overrides.validatorEmail ?? `cf-validator-${id}@example.com`,
    status: overrides.status ?? "PENDING",
    comments: overrides.comments ?? null,
    conflictsReviewed: overrides.conflictsReviewed ?? false,
    conflictCount: overrides.conflictCount ?? 0,
    conflictsResolved: overrides.conflictsResolved ?? 0,
    validatedAt: overrides.validatedAt ?? null,
    createdAt: overrides.createdAt ?? now,
  };
}

export function createProcess(overrides: SignOffProcessOverrides = {}): SignOffProcess {
  return createProcessBase(overrides);
}

export function createSignature(overrides: SignatureRecordOverrides = {}): SignatureRecord {
  return createSignatureBase(overrides);
}

export function createAreaValidation(overrides: AreaValidationOverrides = {}): AreaValidation {
  return createAreaValidationBase(overrides);
}

export function createTechnicalValidation(
  overrides: TechnicalValidationOverrides = {},
): TechnicalValidation {
  return createTechnicalValidationBase(overrides);
}

export function createCrossFunctionalValidation(
  overrides: CrossFunctionalValidationOverrides = {},
): CrossFunctionalValidation {
  return createCrossFunctionalValidationBase(overrides);
}

export function createWithAreaValidations(
  areas: string[] = ["Finance", "Supply Chain", "Human Resources"],
  overrides: SignOffProcessOverrides = {},
): {
  process: SignOffProcess;
  areaValidations: AreaValidation[];
} {
  const process = createProcessBase({
    status: "AREA_VALIDATION_IN_PROGRESS",
    ...overrides,
  });

  const areaValidations = areas.map((area) =>
    createAreaValidationBase({
      signOffId: process.id,
      functionalArea: area,
      status: "PENDING",
    }),
  );

  return { process, areaValidations };
}

export function createFullyValidated(overrides: SignOffProcessOverrides = {}): {
  process: SignOffProcess;
  areaValidations: AreaValidation[];
  technicalValidation: TechnicalValidation;
  crossFuncValidation: CrossFunctionalValidation;
} {
  const now = new Date();
  const process = createProcessBase({
    status: "SIGNATURES_PENDING",
    ...overrides,
  });

  const areas = ["Finance", "Supply Chain", "Human Resources"];
  const areaValidations = areas.map((area) =>
    createAreaValidationBase({
      signOffId: process.id,
      functionalArea: area,
      status: "APPROVED",
      validatedAt: now,
      comments: `${area} area validated and approved`,
    }),
  );

  const itLeadId = nextId();
  const dmLeadId = nextId();
  const technicalValidation = createTechnicalValidationBase({
    signOffId: process.id,
    itLeadId,
    itLeadName: "IT Lead",
    itLeadEmail: "itlead@example.com",
    itLeadStatus: "APPROVED",
    itLeadComments: "Technical architecture approved",
    itLeadAt: now,
    dmLeadId,
    dmLeadName: "DM Lead",
    dmLeadEmail: "dmlead@example.com",
    dmLeadStatus: "APPROVED",
    dmLeadComments: "Data migration plan approved",
    dmLeadAt: now,
  });

  const crossFuncValidation = createCrossFunctionalValidationBase({
    signOffId: process.id,
    status: "APPROVED",
    conflictsReviewed: true,
    conflictCount: 3,
    conflictsResolved: 3,
    validatedAt: now,
    comments: "All cross-functional dependencies reviewed and validated",
  });

  return { process, areaValidations, technicalValidation, crossFuncValidation };
}

export function createWithSignatures(overrides: SignOffProcessOverrides = {}): {
  process: SignOffProcess;
  signatures: SignatureRecord[];
} {
  const now = new Date();
  const docHash = `sha256_doc_${nextId()}`;
  const process = createProcessBase({
    status: "COMPLETED",
    completedAt: now,
    certificateHash: docHash,
    verificationToken: `verify_${nextId()}`,
    ...overrides,
  });

  const signatures: SignatureRecord[] = [
    createSignatureBase({
      signOffId: process.id,
      signatureType: "EXECUTIVE",
      signerRole: "client_sponsor",
      signerName: "Executive Sponsor",
      signerEmail: "exec@client.example.com",
      signerOrganization: "Client Corp",
      signerTitle: "VP of Operations",
      mfaVerified: true,
      documentHash: docHash,
      signedAt: now,
      status: "COMPLETED",
    }),
    createSignatureBase({
      signOffId: process.id,
      signatureType: "PARTNER",
      signerRole: "partner_manager",
      signerName: "Partner Manager",
      signerEmail: "pm@partner.example.com",
      signerOrganization: "Partner Inc",
      signerTitle: "Engagement Manager",
      mfaVerified: true,
      documentHash: docHash,
      signedAt: now,
      status: "COMPLETED",
    }),
  ];

  return { process, signatures };
}
