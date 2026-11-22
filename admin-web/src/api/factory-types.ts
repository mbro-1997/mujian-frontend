// B契约的明确传输类型；响应继续由统一AJV校验。
export type Id = string;
export type Time = string;
export type Context = {
  userId: Id;
  nickname: string;
  userStatus: "active" | "disabled";
  roleCode: "demander" | "supplier" | null;
  registrationStage:
    | "new"
    | "demander_bound"
    | "factory_invite_locked"
    | "factory_pending"
    | "factory_rejected"
    | "factory_bound";
  accessMode: "normal" | "restricted";
  nextAction:
    | "SELECT_IDENTITY"
    | "ENTER_DEMANDER_HOME"
    | "COMPLETE_FACTORY_PROFILE"
    | "WAIT_FACTORY_REVIEW"
    | "REVISE_FACTORY_APPLICATION"
    | "ENTER_FACTORY_HOME"
    | "ENTER_RESTRICTED_HOME";
};
export type DecimalCount = string;
export type Phone = string;
export type MaterialLocator = {
  sourceType:
    | "factory_onboarding_audit"
    | "factory_profile"
    | "factory_profile_change_audit";
  sourceId: Id;
  section: "source" | "before" | "proposed";
  field: "factoryAvatar" | "businessLicense" | "factoryPhotos" | "caseImages";
  imageIndex: number;
  caseIndex: number | null;
};
export type MaterialInput =
  | { kind: "upload"; uploadId: Id }
  | { kind: "existing"; locator: MaterialLocator };
export type CaseInput = {
  title: string;
  description: string;
  images: Array<MaterialInput>;
};
export type CaseRead = {
  title: string;
  description: string;
  images: Array<MaterialLocator>;
};
export type OnboardingFields = {
  factoryName: string;
  unifiedSocialCreditCode: string;
  factoryAvatar: MaterialInput;
  businessLicense: MaterialInput;
  factoryPhotos: Array<MaterialInput>;
  contactName: string;
  factoryAddress: string;
  mainBusiness: string | null;
  workerCount: number;
  specialtyCategoryIds: Array<Id>;
  cases: Array<CaseInput>;
  remark: string | null;
};
export type ChangeFields = {
  factoryName: string;
  unifiedSocialCreditCode: string;
  factoryAvatar: MaterialInput;
  businessLicense: MaterialInput;
  factoryPhotos: Array<MaterialInput>;
  contactName: string;
  factoryAddress: string;
  mainBusiness: string | null;
  workerCount: number;
  specialtyCategoryIds: Array<Id>;
  cases: Array<CaseInput>;
  remark: string | null;
  contactPhone: Phone;
};
export type Option = {
  id: Id;
  code: string;
  label: string;
  enabled: boolean;
  retained: boolean;
};
export type Options = { optionGroup: "prop_sku-type"; items: Array<Option> };
export type AcceptedRule = {
  documentId: Id;
  version: string;
  contentHash: string;
};
export type FactoryRule = {
  documentId: Id;
  code:
    | "factory_onboarding_fulfillment_rule"
    | "factory_logistics_outbound_rule";
  title: string;
  version: string;
  contentHash: string;
  effectiveAt: Time;
};
export type FactoryRuleDocument = {
  documentId: Id;
  code:
    | "factory_onboarding_fulfillment_rule"
    | "factory_logistics_outbound_rule";
  title: string;
  version: string;
  contentHash: string;
  effectiveAt: Time;
  contentType: "html";
  contentText: string;
  status: "active" | "archived";
};
export type FactoryRules = {
  scene: "supplier_apply";
  rules: Array<FactoryRule>;
};
export type OnboardingSubmit = {
  previousApplicationId: Id | null;
  acceptedRules: Array<AcceptedRule>;
  materials: OnboardingFields;
};
export type ChangeSubmit = {
  previousApplicationId: Id | null;
  baseProfileVersion: DecimalCount;
  phoneVerificationProof: string | null;
  proposed: ChangeFields;
};
export type OwnerFields = {
  factoryName: string;
  unifiedSocialCreditCode: string;
  factoryAvatar: MaterialLocator;
  businessLicense: MaterialLocator;
  factoryPhotos: Array<MaterialLocator>;
  contactName: string;
  factoryAddress: string;
  mainBusiness: string | null;
  workerCount: number;
  specialtyCategoryIds: Array<Id>;
  cases: Array<CaseRead>;
  remark: string | null;
  specialtyCategoryNames: Array<string>;
  contactPhone: Phone;
};
export type MaskedFields = {
  factoryName: string;
  unifiedSocialCreditCode: string;
  factoryAvatar: MaterialLocator;
  businessLicense: MaterialLocator;
  factoryPhotos: Array<MaterialLocator>;
  factoryAddress: string;
  mainBusiness: string | null;
  workerCount: number;
  specialtyCategoryIds: Array<Id>;
  cases: Array<CaseRead>;
  remark: string | null;
  specialtyCategoryNames: Array<string>;
  contactNameMasked: string;
  contactPhoneMasked: string;
};
export type OnboardingApplication = {
  id: Id;
  applicationNo: string;
  auditStatus: "pending" | "approved" | "rejected" | "cancelled";
  version: number;
  submittedAt: Time;
  reviewedAt: Time | null;
  rejectReason: string | null;
  previousApplicationId: Id | null;
  materials: OwnerFields;
  acceptedRules: Array<AcceptedRule>;
  createdFactoryId: Id | null;
};
export type ChangeApplication = {
  id: Id;
  applicationNo: string;
  auditStatus: "pending" | "approved" | "rejected" | "cancelled";
  version: number;
  submittedAt: Time;
  reviewedAt: Time | null;
  rejectReason: string | null;
  previousApplicationId: Id | null;
  factoryId: Id;
  baseProfileVersion: DecimalCount;
  before: OwnerFields;
  proposed: OwnerFields;
};
export type OnboardingCurrent = {
  application: OnboardingApplication | null;
  invitationId: Id | null;
  invitationStatus: "unused" | "locked" | "used" | "revoked" | "expired" | null;
  canSubmit: boolean;
  nextAction:
    | "ENTER_FACTORY_INVITE"
    | "COMPLETE_FACTORY_PROFILE"
    | "WAIT_FACTORY_REVIEW"
    | "REVISE_FACTORY_APPLICATION"
    | "ENTER_FACTORY_HOME"
    | "ENTER_RESTRICTED_HOME";
};
export type ChangeCurrent = {
  application: ChangeApplication | null;
  canSubmit: boolean;
  nextAction:
    | "EDIT_FACTORY_PROFILE"
    | "WAIT_FACTORY_PROFILE_REVIEW"
    | "REVISE_FACTORY_PROFILE"
    | "VIEW_FACTORY_PROFILE"
    | "ENTER_RESTRICTED_HOME";
};
export type OnboardingSubmitResult = {
  outcome: "submitted" | "replayed" | "existing_pending";
  application: OnboardingApplication;
};
export type ChangeSubmitResult = {
  outcome: "submitted" | "replayed" | "existing_pending";
  application: ChangeApplication;
};
export type PhoneCapability =
  | {
      available: false;
      reasonCode:
        | "PHONE_VERIFICATION_NOT_CONFIGURED"
        | "ACCOUNT_ACTION_RESTRICTED";
      captchaAppId: null;
    }
  | { available: true; reasonCode: null; captchaAppId: string };
export type FactoryProfile = {
  id: Id;
  ownerUserId: Id;
  factoryStatus: "active" | "disabled" | "suspended";
  profileVersion: DecimalCount;
  canEdit: boolean;
  phoneChange: PhoneCapability;
  materials: OwnerFields;
};
export type ClaimRequest = { inviteCode: string };
export type ClaimResult = {
  invitationId: Id;
  expireAt: Time;
  context: Context;
};
export type InvitationCreate = { expireAt: Time | null; remark: string | null };
export type Invitation = {
  id: Id;
  suffix: string;
  inviteStatus: "unused" | "locked" | "used" | "revoked" | "expired";
  expireAt: Time;
  lockedByUserId: Id | null;
  hasSubmittedApplication: boolean;
  canRevoke: boolean;
  createdAt: Time;
  remark: string | null;
};
export type InvitationResult = {
  invitation: Invitation;
  codeAvailability: "available" | "unavailable";
  inviteCode: string | null;
  recoverUntil: Time;
};
export type RevokeRequest = { reason: string };
export type UploadRequest = {
  file: string;
  purpose:
    | "factory_avatar"
    | "business_license"
    | "factory_photo"
    | "service_case";
};
export type UploadResult = { uploadId: Id; expiresAt: Time };
export type MaterialView = { url: string; expiresAt: Time };
export type PhoneSend = { phone: Phone; ticket: string; randstr: string };
export type PhoneSendResult = {
  challengeId: Id;
  deliveryStatus: "accepted" | "unknown";
  expiresAt: Time;
  retryAfterSeconds: number;
};
export type PhoneVerify = { challengeId: Id; code: string };
export type PhoneProof = { proof: string; phone: Phone; expiresAt: Time };
export type Approve = { expectedVersion: number; remark: string | null };
export type ChangeApprove = {
  expectedVersion: number;
  baseProfileVersion: DecimalCount;
  sameLegalEntityConfirmed: boolean;
  remark: string | null;
};
export type Reject = { expectedVersion: number; reason: string };
export type ChangeReject = { expectedVersion: number; reason: string };
export type ReviewResult = {
  actionId: Id;
  applicationId: Id;
  auditStatus: "approved" | "rejected";
  version: number;
  factoryId: Id | null;
  profileVersion: DecimalCount | null;
  reviewedAt: Time;
};
export type ReviewRecovery = {
  sourceType: "factory_onboarding_audit" | "factory_profile_change_audit";
  result: ReviewResult;
};
export type AdminOnboarding = {
  id: Id;
  applicationNo: string;
  auditStatus: "pending" | "approved" | "rejected" | "cancelled";
  version: number;
  submittedAt: Time;
  reviewedAt: Time | null;
  rejectReason: string | null;
  previousApplicationId: Id | null;
  applicantUserId: Id;
  inviteCodeId: Id;
  materials: MaskedFields;
  acceptedRules: Array<AcceptedRule>;
  createdFactoryId: Id | null;
  caseId: Id | null;
  canReview: boolean;
};
export type AdminChange = {
  id: Id;
  applicationNo: string;
  auditStatus: "pending" | "approved" | "rejected" | "cancelled";
  version: number;
  submittedAt: Time;
  reviewedAt: Time | null;
  rejectReason: string | null;
  previousApplicationId: Id | null;
  factoryId: Id;
  applicantUserId: Id;
  baseProfileVersion: DecimalCount;
  currentProfileVersion: DecimalCount;
  before: MaskedFields;
  proposed: MaskedFields;
  current: MaskedFields;
  changedFields: Array<
    | "factoryName"
    | "unifiedSocialCreditCode"
    | "factoryAvatar"
    | "businessLicense"
    | "factoryPhotos"
    | "contactName"
    | "factoryAddress"
    | "mainBusiness"
    | "workerCount"
    | "specialtyCategoryIds"
    | "cases"
    | "remark"
    | "contactPhone"
  >;
  caseId: Id | null;
  canReview: boolean;
};
export type AdminFactory = {
  id: Id;
  ownerUserId: Id;
  factoryStatus: "active" | "disabled" | "suspended";
  profileVersion: DecimalCount;
  materials: MaskedFields;
  approvedAt: Time | null;
};
export type SensitiveResult = {
  contactName: string;
  contactPhone: Phone;
  auditId: Id;
};
export type ChangeSensitiveResult = {
  before: SensitiveResult;
  proposed: SensitiveResult;
  current: SensitiveResult;
};
export type QueueItem = {
  id: Id;
  applicationNo: string;
  factoryId: Id | null;
  factoryName: string;
  applicantUserId: Id;
  applicantNickname: string;
  creditCodeMasked: string;
  submittedAt: Time;
  auditStatus: "pending" | "approved" | "rejected" | "cancelled";
  changedFields: Array<string>;
};
export type InvitationPage = {
  items: Array<Invitation>;
  page: number;
  pageSize: number;
  total: DecimalCount;
};
export type QueuePage = {
  items: Array<QueueItem>;
  page: number;
  pageSize: number;
  total: DecimalCount;
};
export type FactoryPage = {
  items: Array<AdminFactory>;
  page: number;
  pageSize: number;
  total: DecimalCount;
};
