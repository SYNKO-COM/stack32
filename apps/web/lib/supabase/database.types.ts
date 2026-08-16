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
      agent_approval_requests: {
        Row: {
          action_summary: string
          agent_id: string
          created_at: string
          decided_at: string | null
          id: string
          installation_id: string | null
          payload: Json
          run_id: string | null
          status: string
          thread_id: string | null
          tool_id: string
          user_id: string
        }
        Insert: {
          action_summary: string
          agent_id: string
          created_at?: string
          decided_at?: string | null
          id?: string
          installation_id?: string | null
          payload?: Json
          run_id?: string | null
          status?: string
          thread_id?: string | null
          tool_id: string
          user_id: string
        }
        Update: {
          action_summary?: string
          agent_id?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          installation_id?: string | null
          payload?: Json
          run_id?: string | null
          status?: string
          thread_id?: string | null
          tool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_approval_requests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approval_requests_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "agent_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_approval_requests_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_connection_bindings: {
        Row: {
          agent_id: string
          connection_id: string
          created_at: string
          enabled: boolean
          id: string
          installation_id: string | null
          tool_ids: string[]
          user_id: string
        }
        Insert: {
          agent_id: string
          connection_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          installation_id?: string | null
          tool_ids?: string[]
          user_id: string
        }
        Update: {
          agent_id?: string
          connection_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          installation_id?: string | null
          tool_ids?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_connection_bindings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_connection_bindings_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "user_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_connection_bindings_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "agent_installations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_deployments: {
        Row: {
          agent_id: string
          agent_version_id: string
          created_at: string
          environment: string
          id: string
          public_slug: string | null
          published_at: string | null
          runtime_config: Json
          status: string
          unpublished_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          agent_version_id: string
          created_at?: string
          environment?: string
          id?: string
          public_slug?: string | null
          published_at?: string | null
          runtime_config?: Json
          status?: string
          unpublished_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          agent_version_id?: string
          created_at?: string
          environment?: string
          id?: string
          public_slug?: string | null
          published_at?: string | null
          runtime_config?: Json
          status?: string
          unpublished_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_deployments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_deployments_agent_version_id_fkey"
            columns: ["agent_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_favorites: {
        Row: {
          agent_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_favorites_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_installations: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          pinned_version_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          pinned_version_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          pinned_version_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_installations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_installations_pinned_version_id_fkey"
            columns: ["pinned_version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memories: {
        Row: {
          agent_id: string
          content: string
          created_at: string
          embedding: string | null
          embedding_dimension: number | null
          embedding_model: string | null
          expires_at: string | null
          id: string
          importance: number
          installation_id: string | null
          memory_type: string
          metadata: Json
          namespace: string
          summary: string | null
          thread_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          content: string
          created_at?: string
          embedding?: string | null
          embedding_dimension?: number | null
          embedding_model?: string | null
          expires_at?: string | null
          id?: string
          importance?: number
          installation_id?: string | null
          memory_type: string
          metadata?: Json
          namespace?: string
          summary?: string | null
          thread_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          content?: string
          created_at?: string
          embedding?: string | null
          embedding_dimension?: number | null
          embedding_model?: string | null
          expires_at?: string | null
          id?: string
          importance?: number
          installation_id?: string | null
          memory_type?: string
          metadata?: Json
          namespace?: string
          summary?: string | null
          thread_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_memories_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_memories_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "agent_installations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_project_files: {
        Row: {
          agent_id: string
          checksum: string
          content: string
          content_type: string
          created_at: string
          id: string
          path: string
          snapshot_id: string | null
          updated_at: string
          user_id: string
          version_id: string | null
        }
        Insert: {
          agent_id: string
          checksum: string
          content: string
          content_type?: string
          created_at?: string
          id?: string
          path: string
          snapshot_id?: string | null
          updated_at?: string
          user_id: string
          version_id?: string | null
        }
        Update: {
          agent_id?: string
          checksum?: string
          content?: string
          content_type?: string
          created_at?: string
          id?: string
          path?: string
          snapshot_id?: string | null
          updated_at?: string
          user_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_project_files_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_project_files_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "agent_project_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_project_files_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_project_snapshots: {
        Row: {
          agent_id: string
          checksum: string | null
          created_at: string
          files_count: number
          id: string
          lint_status: string
          manifest: Json
          project_id: string
          sandbox_snapshot_id: string | null
          snapshot_number: number
          test_status: string
          user_id: string
          version_id: string | null
        }
        Insert: {
          agent_id: string
          checksum?: string | null
          created_at?: string
          files_count?: number
          id?: string
          lint_status?: string
          manifest?: Json
          project_id: string
          sandbox_snapshot_id?: string | null
          snapshot_number: number
          test_status?: string
          user_id: string
          version_id?: string | null
        }
        Update: {
          agent_id?: string
          checksum?: string | null
          created_at?: string
          files_count?: number
          id?: string
          lint_status?: string
          manifest?: Json
          project_id?: string
          sandbox_snapshot_id?: string | null
          snapshot_number?: number
          test_status?: string
          user_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_project_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_project_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "agent_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_project_snapshots_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "agent_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_projects: {
        Row: {
          agent_id: string
          created_at: string
          current_snapshot_id: string | null
          id: string
          pattern: string | null
          runtime_package: string
          runtime_version: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          current_snapshot_id?: string | null
          id?: string
          pattern?: string | null
          runtime_package?: string
          runtime_version?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          current_snapshot_id?: string | null
          id?: string
          pattern?: string | null
          runtime_package?: string
          runtime_version?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_projects_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_projects_current_snapshot_fk"
            columns: ["current_snapshot_id"]
            isOneToOne: false
            referencedRelation: "agent_project_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_schedules: {
        Row: {
          agent_id: string
          config: Json
          created_at: string
          cron_expression: string | null
          enabled: boolean
          failure_count: number
          id: string
          installation_id: string | null
          instruction: string | null
          last_run_at: string | null
          last_success_at: string | null
          next_run_at: string | null
          notify_email: string | null
          recurrence: Json
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          config?: Json
          created_at?: string
          cron_expression?: string | null
          enabled?: boolean
          failure_count?: number
          id?: string
          installation_id?: string | null
          instruction?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          next_run_at?: string | null
          notify_email?: string | null
          recurrence?: Json
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          config?: Json
          created_at?: string
          cron_expression?: string | null
          enabled?: boolean
          failure_count?: number
          id?: string
          installation_id?: string | null
          instruction?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          next_run_at?: string | null
          notify_email?: string | null
          recurrence?: Json
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_schedules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_schedules_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "agent_installations"
            referencedColumns: ["id"]
          },
        ]
      }
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
      agent_tool_configurations: {
        Row: {
          agent_id: string
          config: Json
          connection_id: string | null
          created_at: string
          id: string
          installation_id: string | null
          last_validated_at: string | null
          provider: string
          provider_action_id: string | null
          schema_version: string | null
          status: string
          tool_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          config?: Json
          connection_id?: string | null
          created_at?: string
          id?: string
          installation_id?: string | null
          last_validated_at?: string | null
          provider?: string
          provider_action_id?: string | null
          schema_version?: string | null
          status?: string
          tool_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          config?: Json
          connection_id?: string | null
          created_at?: string
          id?: string
          installation_id?: string | null
          last_validated_at?: string | null
          provider?: string
          provider_action_id?: string | null
          schema_version?: string | null
          status?: string
          tool_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tool_configurations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tool_configurations_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "user_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tool_configurations_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "agent_installations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_triggers: {
        Row: {
          agent_id: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          provider: string
          trigger_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          provider: string
          trigger_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          provider?: string
          trigger_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_triggers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
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
          graph_spec: Json | null
          id: string
          model_name: string | null
          model_provider: string | null
          schema_compat: string
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
          graph_spec?: Json | null
          id?: string
          model_name?: string | null
          model_provider?: string | null
          schema_compat?: string
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
          graph_spec?: Json | null
          id?: string
          model_name?: string | null
          model_provider?: string | null
          schema_compat?: string
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
          first_ready_at: string | null
          first_ready_celebrated: boolean
          icon_key: string | null
          id: string
          last_opened_at: string | null
          name: string
          pre_suspension_status: string | null
          published_version_id: string | null
          slug: string
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          draft_version_id?: string | null
          first_ready_at?: string | null
          first_ready_celebrated?: boolean
          icon_key?: string | null
          id?: string
          last_opened_at?: string | null
          name: string
          pre_suspension_status?: string | null
          published_version_id?: string | null
          slug: string
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          draft_version_id?: string | null
          first_ready_at?: string | null
          first_ready_celebrated?: boolean
          icon_key?: string | null
          id?: string
          last_opened_at?: string | null
          name?: string
          pre_suspension_status?: string | null
          published_version_id?: string | null
          slug?: string
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
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
          {
            foreignKeyName: "agents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      builder_error_lessons: {
        Row: {
          context: Json
          created_at: string
          error_code: string | null
          error_signature: string
          id: string
          last_seen_at: string
          reason: string
          resolution: Json
          resolution_summary: string
          times_helped: number
          times_seen: number
          updated_at: string
        }
        Insert: {
          context?: Json
          created_at?: string
          error_code?: string | null
          error_signature: string
          id?: string
          last_seen_at?: string
          reason?: string
          resolution?: Json
          resolution_summary?: string
          times_helped?: number
          times_seen?: number
          updated_at?: string
        }
        Update: {
          context?: Json
          created_at?: string
          error_code?: string | null
          error_signature?: string
          id?: string
          last_seen_at?: string
          reason?: string
          resolution?: Json
          resolution_summary?: string
          times_helped?: number
          times_seen?: number
          updated_at?: string
        }
        Relationships: []
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
      builder_workspaces: {
        Row: {
          agent_id: string
          created_at: string
          expires_at: string | null
          id: string
          metadata: Json
          provider: string
          provider_workspace_id: string
          run_id: string | null
          snapshot_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          provider: string
          provider_workspace_id: string
          run_id?: string | null
          snapshot_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          provider?: string
          provider_workspace_id?: string
          run_id?: string | null
          snapshot_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_workspaces_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_workspaces_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_definitions: {
        Row: {
          auth_type: string
          created_at: string
          enabled: boolean
          id: string
          name: string
          provider: string
          scopes: string[]
          summary: string
        }
        Insert: {
          auth_type?: string
          created_at?: string
          enabled?: boolean
          id: string
          name: string
          provider: string
          scopes?: string[]
          summary?: string
        }
        Update: {
          auth_type?: string
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          provider?: string
          scopes?: string[]
          summary?: string
        }
        Relationships: []
      }
      conversation_summaries: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          installation_id: string | null
          source_message_count: number
          summary: string
          thread_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          installation_id?: string | null
          source_message_count?: number
          summary: string
          thread_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          installation_id?: string | null
          source_message_count?: number
          summary?: string
          thread_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_summaries_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_summaries_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "agent_installations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_deliveries: {
        Row: {
          agent_id: string | null
          created_at: string
          detail: string | null
          id: string
          run_id: string | null
          status: string
          subject: string | null
          to_email: string
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          run_id?: string | null
          status?: string
          subject?: string | null
          to_email: string
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          run_id?: string | null
          status?: string
          subject?: string | null
          to_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_deliveries_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_deliveries_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      external_connections: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          provider: string
          secret_ref: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          provider: string
          secret_ref?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          provider?: string
          secret_ref?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      external_memory_configs: {
        Row: {
          agent_id: string
          created_at: string
          db_type: string
          detail: string | null
          encrypted_conn_ref: string
          id: string
          installation_id: string | null
          namespace: string
          status: string
          updated_at: string
          user_id: string
          validated_at: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          db_type?: string
          detail?: string | null
          encrypted_conn_ref: string
          id?: string
          installation_id?: string | null
          namespace?: string
          status?: string
          updated_at?: string
          user_id: string
          validated_at?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          db_type?: string
          detail?: string | null
          encrypted_conn_ref?: string
          id?: string
          installation_id?: string | null
          namespace?: string
          status?: string
          updated_at?: string
          user_id?: string
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_memory_configs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_memory_configs_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "agent_installations"
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
          embedding_dimension: number | null
          embedding_model: string | null
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
          embedding_dimension?: number | null
          embedding_model?: string | null
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
          embedding_dimension?: number | null
          embedding_model?: string | null
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
          content_hash: string | null
          created_at: string
          error_message: string | null
          extraction_metadata: Json
          extraction_status: string | null
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
          content_hash?: string | null
          created_at?: string
          error_message?: string | null
          extraction_metadata?: Json
          extraction_status?: string | null
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
          content_hash?: string | null
          created_at?: string
          error_message?: string | null
          extraction_metadata?: Json
          extraction_status?: string | null
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
          installation_id: string | null
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
          installation_id?: string | null
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
          installation_id?: string | null
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
            foreignKeyName: "live_messages_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "agent_installations"
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
          installation_id: string | null
          is_archived: boolean
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          installation_id?: string | null
          is_archived?: boolean
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          installation_id?: string | null
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
          {
            foreignKeyName: "live_threads_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "agent_installations"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_validations: {
        Row: {
          agent_id: string | null
          checked_at: string
          created_at: string
          detail: string | null
          error_code: string | null
          id: string
          installation_id: string | null
          model_id: string
          provider: string
          status: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          checked_at?: string
          created_at?: string
          detail?: string | null
          error_code?: string | null
          id?: string
          installation_id?: string | null
          model_id: string
          provider: string
          status?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          checked_at?: string
          created_at?: string
          detail?: string | null
          error_code?: string | null
          id?: string
          installation_id?: string | null
          model_id?: string
          provider?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "llm_validations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_validations_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "agent_installations"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_connection_states: {
        Row: {
          agent_id: string | null
          code_verifier: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          installation_id: string | null
          provider: string
          redirect_uri: string
          scopes: string[]
          state: string
          tool_ids: string[]
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          code_verifier: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          installation_id?: string | null
          provider: string
          redirect_uri: string
          scopes?: string[]
          state: string
          tool_ids?: string[]
          user_id: string
        }
        Update: {
          agent_id?: string | null
          code_verifier?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          installation_id?: string | null
          provider?: string
          redirect_uri?: string
          scopes?: string[]
          state?: string
          tool_ids?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_connection_states_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_connection_states_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "agent_installations"
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
          username: string | null
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
          username?: string | null
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
          username?: string | null
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          bucket_key: string
          count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket_key: string
          count?: number
          updated_at?: string
          window_start: string
        }
        Update: {
          bucket_key?: string
          count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      reserved_usernames: {
        Row: {
          username: string
        }
        Insert: {
          username: string
        }
        Update: {
          username?: string
        }
        Relationships: []
      }
      run_events: {
        Row: {
          created_at: string
          event_type: string
          id: number
          installation_id: string | null
          label: string | null
          payload: Json
          run_id: string
          sequence: number
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: number
          installation_id?: string | null
          label?: string | null
          payload?: Json
          run_id: string
          sequence: number
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: number
          installation_id?: string | null
          label?: string | null
          payload?: Json
          run_id?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "run_events_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "agent_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      run_queue: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          heartbeat_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          run_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          heartbeat_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          run_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          heartbeat_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          run_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "run_queue_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
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
          installation_id: string | null
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
          installation_id?: string | null
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
          installation_id?: string | null
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
          {
            foreignKeyName: "runs_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "agent_installations"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_occurrences: {
        Row: {
          created_at: string
          id: string
          occurrence_key: string
          run_id: string | null
          schedule_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          occurrence_key: string
          run_id?: string | null
          schedule_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          occurrence_key?: string
          run_id?: string | null
          schedule_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_occurrences_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_occurrences_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "agent_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_events: {
        Row: {
          action: string
          agent_id: string | null
          created_at: string
          id: string
          ip_hash: string | null
          metadata: Json
          request_id: string | null
          resource_id: string | null
          resource_type: string
          result: string
          risk_level: string
          user_id: string | null
        }
        Insert: {
          action: string
          agent_id?: string | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          request_id?: string | null
          resource_id?: string | null
          resource_type: string
          result: string
          risk_level?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          agent_id?: string | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string
          result?: string
          risk_level?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_audit_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_interval: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          credits_monthly: number
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_key: string
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
          billing_interval?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          credits_monthly?: number
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_key?: string
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
          billing_interval?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          credits_monthly?: number
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_key?: string
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
          approval_mode: string
          category: string | null
          created_at: string
          description: string
          enabled: boolean
          id: string
          input_schema: Json
          is_internal: boolean
          max_response_bytes: number
          name: string
          output_schema: Json
          risk_level: string
          timeout_seconds: number
          updated_at: string
        }
        Insert: {
          approval_mode?: string
          category?: string | null
          created_at?: string
          description: string
          enabled?: boolean
          id: string
          input_schema?: Json
          is_internal?: boolean
          max_response_bytes?: number
          name: string
          output_schema?: Json
          risk_level?: string
          timeout_seconds?: number
          updated_at?: string
        }
        Update: {
          approval_mode?: string
          category?: string | null
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          input_schema?: Json
          is_internal?: boolean
          max_response_bytes?: number
          name?: string
          output_schema?: Json
          risk_level?: string
          timeout_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      tool_config_playbooks: {
        Row: {
          action_id: string
          app_id: string | null
          config_shape: Json
          created_at: string
          id: string
          last_succeeded_at: string | null
          notes: string
          signature: string
          status: string
          times_failed: number
          times_succeeded: number
          tool_id: string
          updated_at: string
        }
        Insert: {
          action_id: string
          app_id?: string | null
          config_shape?: Json
          created_at?: string
          id?: string
          last_succeeded_at?: string | null
          notes?: string
          signature: string
          status?: string
          times_failed?: number
          times_succeeded?: number
          tool_id: string
          updated_at?: string
        }
        Update: {
          action_id?: string
          app_id?: string | null
          config_shape?: Json
          created_at?: string
          id?: string
          last_succeeded_at?: string | null
          notes?: string
          signature?: string
          status?: string
          times_failed?: number
          times_succeeded?: number
          tool_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tool_definitions: {
        Row: {
          approval_mode: string
          auth_type: string
          cached_at: string | null
          categories: string[]
          connection_required: boolean
          connector_id: string | null
          created_at: string
          enabled: boolean
          id: string
          keywords: string[]
          latest_version: number
          max_response_bytes: number
          metadata: Json
          name: string
          namespace: string
          provider: string
          provider_app_id: string | null
          provider_tool_id: string | null
          provider_version: string | null
          risk: string
          side_effect: boolean
          source: string
          stale_after: string | null
          summary: string
          timeout_seconds: number
        }
        Insert: {
          approval_mode?: string
          auth_type?: string
          cached_at?: string | null
          categories?: string[]
          connection_required?: boolean
          connector_id?: string | null
          created_at?: string
          enabled?: boolean
          id: string
          keywords?: string[]
          latest_version?: number
          max_response_bytes?: number
          metadata?: Json
          name: string
          namespace: string
          provider?: string
          provider_app_id?: string | null
          provider_tool_id?: string | null
          provider_version?: string | null
          risk?: string
          side_effect?: boolean
          source?: string
          stale_after?: string | null
          summary?: string
          timeout_seconds?: number
        }
        Update: {
          approval_mode?: string
          auth_type?: string
          cached_at?: string | null
          categories?: string[]
          connection_required?: boolean
          connector_id?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          keywords?: string[]
          latest_version?: number
          max_response_bytes?: number
          metadata?: Json
          name?: string
          namespace?: string
          provider?: string
          provider_app_id?: string | null
          provider_tool_id?: string | null
          provider_version?: string | null
          risk?: string
          side_effect?: boolean
          source?: string
          stale_after?: string | null
          summary?: string
          timeout_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "tool_definitions_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "connector_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_versions: {
        Row: {
          created_at: string
          id: string
          input_schema: Json
          output_schema: Json
          tool_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          input_schema?: Json
          output_schema?: Json
          tool_id: string
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          input_schema?: Json
          output_schema?: Json
          tool_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tool_versions_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tool_definitions"
            referencedColumns: ["id"]
          },
        ]
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
      user_connections: {
        Row: {
          account_email: string | null
          account_label: string | null
          created_at: string
          external_account_id: string | null
          id: string
          last_validated_at: string | null
          metadata: Json
          provider: string
          provider_metadata: Json
          refresh_secret_ref: string | null
          scopes: string[]
          secret_ref: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          account_label?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          last_validated_at?: string | null
          metadata?: Json
          provider: string
          provider_metadata?: Json
          refresh_secret_ref?: string | null
          scopes?: string[]
          secret_ref?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          account_label?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          last_validated_at?: string | null
          metadata?: Json
          provider?: string
          provider_metadata?: Json
          refresh_secret_ref?: string | null
          scopes?: string[]
          secret_ref?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_secrets: {
        Row: {
          agent_id: string | null
          ciphertext: string
          created_at: string
          id: string
          installation_id: string | null
          key_hint: string
          label: string | null
          metadata: Json
          provider: string
          secret_kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          ciphertext: string
          created_at?: string
          id?: string
          installation_id?: string | null
          key_hint?: string
          label?: string | null
          metadata?: Json
          provider: string
          secret_kind?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          ciphertext?: string
          created_at?: string
          id?: string
          installation_id?: string | null
          key_hint?: string
          label?: string | null
          metadata?: Json
          provider?: string
          secret_kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_secrets_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_secrets_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "agent_installations"
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
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_agent_deployment: {
        Args: {
          p_agent_id: string
          p_agent_version_id: string
          p_deployment_id: string
          p_environment?: string
          p_idempotency_key?: string
          p_runtime_version?: string
          p_snapshot_id?: string
          p_user_id: string
        }
        Returns: {
          agent_id: string
          agent_version_id: string
          created_at: string
          environment: string
          id: string
          public_slug: string | null
          published_at: string | null
          runtime_config: Json
          status: string
          unpublished_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_deployments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_period_budget_available: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      check_username_availability: {
        Args: { p_username: string }
        Returns: Json
      }
      claim_due_schedules: {
        Args: { p_limit?: number }
        Returns: {
          agent_id: string
          config: Json
          created_at: string
          cron_expression: string | null
          enabled: boolean
          failure_count: number
          id: string
          installation_id: string | null
          instruction: string | null
          last_run_at: string | null
          last_success_at: string | null
          next_run_at: string | null
          notify_email: string | null
          recurrence: Json
          timezone: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_schedules"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_webhook_event: {
        Args: { p_provider: string; p_provider_event_id: string }
        Returns: boolean
      }
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
          p_username?: string
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
          username: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_rate_limit: {
        Args: {
          p_bucket_key: string
          p_limit: number
          p_window_seconds?: number
        }
        Returns: boolean
      }
      create_agent_workspace: {
        Args: {
          p_create_live_thread?: boolean
          p_name?: string
          p_prompt?: string
          p_workspace_id?: string
        }
        Returns: Json
      }
      create_workspace: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_credit_usage: { Args: never; Returns: Json }
      heartbeat_run_queue_job: {
        Args: { p_lease_seconds?: number; p_owner: string; p_run_id: string }
        Returns: boolean
      }
      lease_run_queue_job: {
        Args: { p_lease_seconds?: number; p_owner: string }
        Returns: {
          attempts: number
          available_at: string
          created_at: string
          heartbeat_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          run_id: string
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "run_queue"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      match_agent_memories: {
        Args: {
          p_agent_id: string
          p_match_count?: number
          p_min_similarity?: number
          p_query_embedding: string
          p_user_id: string
        }
        Returns: {
          content: string
          id: string
          memory_type: string
          metadata: Json
          similarity: number
        }[]
      }
      match_knowledge_chunks: {
        Args: {
          p_agent_id: string
          p_match_count?: number
          p_min_similarity?: number
          p_query_embedding: string
          p_user_id: string
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
          source_id: string
        }[]
      }
      resolve_published_agent: {
        Args: { p_agent_slug: string; p_username: string }
        Returns: Json
      }
      resolve_user_entitlements: {
        Args: { p_user_id: string }
        Returns: {
          billing_interval: string
          budget_usd: number
          credits_monthly: number
          period_credits: number
          period_end: string
          period_start: string
          plan_key: string
        }[]
      }
      restore_agents_after_billing: {
        Args: { p_user_id: string }
        Returns: number
      }
      set_username: {
        Args: { p_username: string }
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
          username: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      soft_delete_agent: { Args: { p_agent_id: string }; Returns: undefined }
      suspend_agents_for_billing: {
        Args: { p_user_id: string }
        Returns: number
      }
      user_monthly_usage_usd: { Args: { p_user_id: string }; Returns: number }
      user_period_budget_status: { Args: { p_user_id: string }; Returns: Json }
      user_period_usage_usd: { Args: { p_user_id: string }; Returns: number }
      validate_username: { Args: { p_username: string }; Returns: boolean }
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

