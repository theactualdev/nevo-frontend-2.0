/** Barrel for the API client + endpoint modules (FE Architecture §1 & §9). */
export {
  api,
  request,
  ApiError,
  apiErrorCode,
  incidentId,
  BASE_URL,
  type RequestOptions,
} from "./client";
export { authApi } from "./auth";
export {
  schoolApi,
  readOnboarding,
  ONBOARDING_PROFILE_KEY,
  type EnrolmentBand,
  type OnboardingProfile,
  type School,
  type SchoolAuthMethod,
} from "./school";
export {
  invitesApi,
  type BulkInviteResult,
  type Invitation,
  type InviteDraft,
  type InviteRole,
  type JoinLookup,
  type RejectedInvitation,
} from "./invites";
export {
  teamApi,
  roleForScopes,
  type AcceptInvitationResponse,
  type InvitedTeamMember,
  type TeamMember,
} from "./team";
export {
  signalsApi,
  type SignalEvent,
  type SignalSessionEnvelope,
  type SignalSessionType,
} from "./signals";
export { intelligenceApi, type AttentionFlag } from "./intelligence";
export {
  contentApi,
  awaitParseRun,
  type ParseContentRequest,
  type ParseAccepted,
  type ParseRunStatus,
} from "./content";
export { exportApi, type IepExport, type IepExportShare } from "./export";
export {
  classesApi,
  type AdminClass,
  type AssignedClass,
  type AssignedTeacher,
  type ClassStudent,
  type ProfileStatus,
} from "./classes";
export {
  type AdminStudentDetail,
  type AdminStudentRow,
  type ParentLink,
} from "./students";
export {
  teachersApi,
  type TeacherDetail,
  type TeacherSummary,
} from "./teachers";
export {
  lessonsApi,
  type LessonSummary,
  type LessonDetailResponse,
  type LessonSegment,
  type LessonParseStatus,
  type LessonSourceType,
} from "./lessons";
export { usersApi, type CurrentUser, type SchoolSummary } from "./users";
export {
  settingsApi,
  type SettingsBag,
  type TeacherNotificationSettings,
} from "./settings";
export { assignmentsApi, type Assignment } from "./assignments";
export { feedbackApi, type FeedbackType } from "./feedback";
export { messagesApi, type MessageThread, type ChatMessage } from "./messages";
export { permissionsApi, type PermissionsMe } from "./permissions";
export {
  schoolIntelligenceApi,
  type ComplianceAudit,
  type AdaptationLog,
  type AdaptationEventRow,
} from "./schoolIntelligence";
export {
  ssoApi,
  PROVIDER_LABELS,
  type SsoStatus,
  type SsoProvider,
  type RosterSyncHistory,
} from "./sso";
export {
  askNevoApi,
  asUuid,
  recentThreads,
  HISTORY_LIMIT,
  HISTORY_DAYS,
  type ThreadSummary,
  type ThreadTranscript,
  type ThreadMessage,
  type ThreadAuthor,
} from "./askNevo";
export { schedulerApi, type ConceptSchedule } from "./scheduler";
export { consentsApi, type ConsentGateStatus } from "./consents";
export { notificationsApi } from "./notifications";
export { analyticsApi } from "./analytics";
export { baselineApi } from "./baseline";
export {
  partnerInquiriesApi,
  INQUIRY_ROLES,
  type PartnerInquiry,
  type PartnerInquiryReceipt,
  type InquiryRoleLabel,
} from "./partner-inquiries";
export {
  tosseApi,
  tosseErrorMessage,
  TOSSE_INTENTS,
  TOSSE_ROLES,
  type TosseIntent,
  type TosseInterest,
  type TosseInterestReceipt,
  roleNote,
  type TosseRole,
  type TosseRoleLabel,
  type TosseRoleValue,
} from "./tosse";
