import type { ComposerAttachment } from "@/components/shared/prompt-composer";
import type {
  Agent,
  AgentSpec,
  AgentVersion,
  BuilderThread,
  KnowledgeSource,
  LiveThread,
  OnboardingAnswers,
  Profile,
  PublishResult,
  Subscription,
  User,
  Workspace,
} from "@/lib/domain/types";
import type { ChatImagePayload } from "@/lib/chat/message-attachments";

/**
 * Repository abstractions.
 *
 * Phase 1 ships mock implementations backed by localStorage
 * (lib/repositories/mock). TODO(phase-2/3): add Supabase + agent-service
 * implementations and switch via lib/repositories/factory.ts without
 * touching UI components.
 */

export interface SignUpResult {
  user: User;
  /** True when the provider requires an email confirmation before login. */
  requiresEmailConfirmation: boolean;
}

/** Optional hCaptcha token for Supabase Auth bot protection. */
export type AuthCaptchaOptions = {
  captchaToken?: string;
};

export interface AuthRepository {
  getCurrentUser(): Promise<User | null>;
  signInWithPassword(
    email: string,
    password: string,
    options?: AuthCaptchaOptions,
  ): Promise<User>;
  signUpWithPassword(
    email: string,
    password: string,
    options?: AuthCaptchaOptions,
  ): Promise<SignUpResult>;
  /** Returns null when an OAuth redirect is in progress. */
  signInWithGoogle(): Promise<User | null>;
  /** Returns null when an OAuth redirect is in progress. */
  signInWithGithub(): Promise<User | null>;
  /** Verify the 6-digit email OTP sent after signup. */
  verifySignupOtp(email: string, token: string): Promise<User>;
  /** Resend the signup confirmation email / OTP. */
  resendSignupOtp(email: string, options?: AuthCaptchaOptions): Promise<void>;
  sendPasswordReset(email: string, options?: AuthCaptchaOptions): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  signOut(): Promise<void>;
  getProfile(): Promise<Profile | null>;
  completeOnboarding(answers: OnboardingAnswers): Promise<Profile>;
  setUsername(username: string): Promise<Profile>;
  checkUsernameAvailability(username: string): Promise<{
    normalizedUsername: string | null;
    available: boolean;
    valid: boolean;
    reason: string | null;
  }>;
}

export interface AgentRepository {
  listAgents(workspaceId?: string): Promise<Agent[]>;
  getAgent(agentId: string): Promise<Agent | null>;
  createAgent(input?: { name?: string; workspaceId?: string }): Promise<Agent>;
  renameAgent(agentId: string, name: string): Promise<Agent>;
  duplicateAgent(agentId: string): Promise<Agent>;
  deleteAgent(agentId: string): Promise<void>;
  publishAgent(agentId: string): Promise<PublishResult>;
  getCurrentVersion(agentId: string): Promise<AgentVersion | null>;
  getSpec(agentId: string): Promise<AgentSpec | null>;
}

export interface WorkspaceRepository {
  listWorkspaces(): Promise<Workspace[]>;
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  createWorkspace(name: string): Promise<Workspace>;
  renameWorkspace(workspaceId: string, name: string): Promise<Workspace>;
}

export interface BuilderRepository {
  getThread(agentId: string): Promise<BuilderThread>;
  sendMessage(
    agentId: string,
    content: string,
    attachments?: ComposerAttachment[],
    mode?: "build" | "chat",
  ): Promise<void>;
  /** "Fix automatically" action — mock repair until the real Builder Agent. */
  repairAgent(agentId: string): Promise<void>;
}

export interface LiveRepository {
  getThread(agentId: string): Promise<LiveThread>;
  sendMessage(
    agentId: string,
    content: string,
    attachments?: ComposerAttachment[],
  ): Promise<void>;
  clearThread(agentId: string): Promise<void>;
}

export type { ChatImagePayload };

export interface BillingRepository {
  getSubscription(): Promise<Subscription | null>;
  /** Returns a checkout URL. TODO(phase-7): real Whop checkout session. */
  createCheckout(planId: string): Promise<{ url: string }>;
}

export interface KnowledgeRepository {
  listSources(agentId: string): Promise<KnowledgeSource[]>;
  addSource(agentId: string, name: string, kind: KnowledgeSource["kind"]): Promise<KnowledgeSource>;
  removeSource(sourceId: string): Promise<void>;
}
