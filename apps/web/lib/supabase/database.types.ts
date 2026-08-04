export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      agent_tests: {
        Row: {
          agent_id: string
          agent_version_id: string
          created_at: string
          expected: Json | null
          id: string
          input: Json
          name: string
          report: Json
          run_id: string | null
          score: number | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          agent_version_id: string
          created_at?: string
          expected?: Json | null
          id?: string
          input?: Json
          name: string
          report?: Json
          run_id?: string | null
          score?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          agent_version_id?: string
          created_at?: string
          expected?: Json | null
          id?: string
          input?: Json
          name?: string
          report?: Json
          run_id?: string | null
          score?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tests_agent_version_id_fkey"
            columns: ["agent_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tests_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tool_bindings: {
        Row: {
          agent_id: string
          agent_version_id: string | null
          approval_mode: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          tool_id: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          agent_version_id?: string | null
          approval_mode?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          tool_id: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          agent_version_id?: string | null
          approval_mode?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          tool_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tool_bindings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tool_bindings_agent_version_id_fkey"
            columns: ["agent_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tool_bindings_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tool_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_versions: {
        Row: {
          agent_id: string
          change_summary: string | null
          created_at: string
          created_by: string
          estimated_cost: number | null
          id: string
          model_name: string | null
          model_provider: string | null
          source_prompt: string | null
          spec: Json
          test_status: string
          validation_status: string
          version_number: number
        }
        Insert: {
          agent_id: string
          change_summary?: string | null
          created_at?: string
          created_by: string
          estimated_cost?: number | null
          id?: string
          model_name?: string | null
          model_provider?: string | null
          source_prompt?: string | null
          spec: Json
          test_status?: string
          validation_status?: string
          version_number: number
        }
        Update: {
          agent_id?: string
          change_summary?: string | null
          created_at?: string
          created_by?: string
          estimated_cost?: number | null
          id?: string
          model_name?: string | null
          model_provider?: string | null
          source_prompt?: string | null
          spec?: Json
          test_status?: string
          validation_status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          draft_version_id: string | null
          icon_key: string | null
          id: string
          last_opened_at: string | null
          name: string
          published_version_id: string | null
          slug: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          draft_version_id?: string | null
          icon_key?: string | null
          id?: string
          last_opened_at?: string | null
          name: string
          published_version_id?: string | null
          slug: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          draft_version_id?: string | null
          icon_key?: string | null
          id?: string
          last_opened_at?: string | null
          name?: string
          published_version_id?: string | null
          slug?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_draft_version_id_fkey"
            columns: ["draft_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_published_version_id_fkey"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      artifacts: {
        Row: {
          agent_id: string
          artifact_type: string
          content: Json | null
          created_at: string
          id: string
          live_message_id: string | null
          metadata: Json
          run_id: string | null
          storage_bucket: string | null
          storage_path: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          agent_id: string
          artifact_type: string
          content?: Json | null
          created_at?: string
          id?: string
          live_message_id?: string | null
          metadata?: Json
          run_id?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          artifact_type?: string
          content?: Json | null
          created_at?: string
          id?: string
          live_message_id?: string | null
          metadata?: Json
          run_id?: string | null
          storage_bucket?: string | null
          storage_path?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_live_message_id_fkey"
            columns: ["live_message_id"]
            isOneToOne: false
            referencedRelation: "live_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          agent_id: string | null
          builder_message_id: string | null
          builder_thread_id: string | null
          created_at: string
          id: string
          live_message_id: string | null
          live_thread_id: string | null
          metadata: Json
          mime_type: string | null
          original_name: string
          size_bytes: number | null
          status: string
          storage_bucket: string
          storage_path: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          builder_message_id?: string | null
          builder_thread_id?: string | null
          created_at?: string
          id?: string
          live_message_id?: string | null
          live_thread_id?: string | null
          metadata?: Json
          mime_type?: string | null
          original_name: string
          size_bytes?: number | null
          status?: string
          storage_bucket: string
          storage_path: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          builder_message_id?: string | null
          builder_thread_id?: string | null
          created_at?: string
          id?: string
          live_message_id?: string | null
          live_thread_id?: string | null
          metadata?: Json
          mime_type?: string | null
          original_name?: string
          size_bytes?: number | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_builder_message_id_fkey"
            columns: ["builder_message_id"]
            isOneToOne: false
            referencedRelation: "builder_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_builder_thread_id_fkey"
            columns: ["builder_thread_id"]
            isOneToOne: false
            referencedRelation: "builder_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_live_message_id_fkey"
            columns: ["live_message_id"]
            isOneToOne: false
            referencedRelation: "live_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_live_thread_id_fkey"
            columns: ["live_thread_id"]
            isOneToOne: false
            referencedRelation: "live_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_messages: {
        Row: {
          agent_id: string
          content: string
          created_at: string
          id: string
          metadata: Json
          role: string
          run_id: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          agent_id: string
          content: string
          created_at?: string
          id?: string
          metadata?: Json
          role: string
          run_id?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          agent_id?: string
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          role?: string
          run_id?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "builder_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_threads: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_threads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          agent_id: string
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json
          source_id: string
          token_count: number | null
          user_id: string
        }
        Insert: {
          agent_id: string
          chunk_index: number
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          source_id: string
          token_count?: number | null
          user_id: string
        }
        Update: {
          agent_id?: string
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          source_id?: string
          token_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "knowledge_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_sources: {
        Row: {
          agent_id: string
          created_at: string
          error_message: string | null
          id: string
          metadata: Json
          mime_type: string | null
          name: string
          size_bytes: number | null
          source_type: string
          source_url: string | null
          status: string
          storage_bucket: string | null
          storage_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          source_type: string
          source_url?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          source_type?: string
          source_url?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_sources_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      live_messages: {
        Row: {
          agent_id: string
          artifacts: Json
          citations: Json
          content: string
          created_at: string
          id: string
          metadata: Json
          role: string
          run_id: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          agent_id: string
          artifacts?: Json
          citations?: Json
          content: string
          created_at?: string
          id?: string
          metadata?: Json
          role: string
          run_id?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          agent_id?: string
          artifacts?: Json
          citations?: Json
          content?: string
          created_at?: string
          id?: string
          metadata?: Json
          role?: string
          run_id?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "live_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      live_threads: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          is_archived: boolean
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          is_archived?: boolean
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          is_archived?: boolean
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_threads_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_responses: {
        Row: {
          company_name: string | null
          company_size: string | null
          created_at: string
          discovery_other_detail: string | null
          discovery_source: string
          id: string
          intended_agent_type: string | null
          primary_goal: string | null
          role: string
          role_other_detail: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          company_size?: string | null
          created_at?: string
          discovery_other_detail?: string | null
          discovery_source: string
          id?: string
          intended_agent_type?: string | null
          primary_goal?: string | null
          role: string
          role_other_detail?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          company_size?: string | null
          created_at?: string
          discovery_other_detail?: string | null
          discovery_source?: string
          id?: string
          intended_agent_type?: string | null
          primary_goal?: string | null
          role?: string
          role_other_detail?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          first_name: string | null
          full_name: string | null
          id: string
          locale: string
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          phone: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          full_name?: string | null
          id: string
          locale?: string
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          phone?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          locale?: string
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          phone?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      run_events: {
        Row: {
          created_at: string
          event_type: string
          id: number
          label: string | null
          payload: Json
          run_id: string
          sequence: number
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: number
          label?: string | null
          payload?: Json
          run_id: string
          sequence: number
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: number
          label?: string | null
          payload?: Json
          run_id?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          agent_id: string
          agent_version_id: string | null
          completed_at: string | null
          completion_tokens: number | null
          created_at: string
          error_code: string | null
          error_message: string | null
          estimated_cost: number | null
          id: string
          input: Json
          model: string | null
          output: Json | null
          prompt_tokens: number | null
          provider: string | null
          run_type: string
          started_at: string | null
          status: string
          thread_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          agent_version_id?: string | null
          completed_at?: string | null
          completion_tokens?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input?: Json
          model?: string | null
          output?: Json | null
          prompt_tokens?: number | null
          provider?: string | null
          run_type: string
          started_at?: string | null
          status?: string
          thread_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          agent_version_id?: string | null
          completed_at?: string | null
          completion_tokens?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost?: number | null
          id?: string
          input?: Json
          model?: string | null
          output?: Json | null
          prompt_tokens?: number | null
          provider?: string | null
          run_type?: string
          started_at?: string | null
          status?: string
          thread_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_agent_version_id_fkey"
            columns: ["agent_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          provider: string
          provider_customer_id: string | null
          provider_membership_id: string | null
          provider_plan_id: string | null
          raw_payload: Json | null
          status: string
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          provider?: string
          provider_customer_id?: string | null
          provider_membership_id?: string | null
          provider_plan_id?: string | null
          raw_payload?: Json | null
          status?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          provider?: string
          provider_customer_id?: string | null
          provider_membership_id?: string | null
          provider_plan_id?: string | null
          raw_payload?: Json | null
          status?: string
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tool_catalog: {
        Row: {
          category: string | null
          created_at: string
          description: string
          enabled: boolean
          id: string
          input_schema: Json
          is_internal: boolean
          name: string
          output_schema: Json
          risk_level: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description: string
          enabled?: boolean
          id: string
          input_schema?: Json
          is_internal?: boolean
          name: string
          output_schema?: Json
          risk_level?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          input_schema?: Json
          is_internal?: boolean
          name?: string
          output_schema?: Json
          risk_level?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          agent_id: string | null
          created_at: string
          estimated_cost: number | null
          event_name: string
          id: string
          metadata: Json
          quantity: number
          run_id: string | null
          unit: string | null
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          estimated_cost?: number | null
          event_name: string
          id?: string
          metadata?: Json
          quantity?: number
          run_id?: string | null
          unit?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          estimated_cost?: number | null
          event_name?: string
          id?: string
          metadata?: Json
          quantity?: number
          run_id?: string | null
          unit?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          attempt_count: number
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          provider: string
          provider_event_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload: Json
          processed_at?: string | null
          provider: string
          provider_event_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_onboarding: {
        Args: {
          p_company_name?: string
          p_company_size?: string
          p_discovery_other_detail?: string
          p_discovery_source: string
          p_first_name?: string
          p_intended_agent_type?: string
          p_locale?: string
          p_phone?: string
          p_primary_goal?: string
          p_role: string
          p_role_other_detail?: string
        }
        Returns: {
          avatar_url: string | null
          created_at: string
          first_name: string | null
          full_name: string | null
          id: string
          locale: string
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          phone: string | null
          timezone: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_agent_workspace: {
        Args: {
          p_create_live_thread?: boolean
          p_name?: string
          p_prompt?: string
        }
        Returns: Json
      }
      soft_delete_agent: { Args: { p_agent_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

