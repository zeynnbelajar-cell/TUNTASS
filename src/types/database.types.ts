export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      complaint_attachment_upload_tickets: {
        Row: {
          complaint_id: string
          created_at: string
          expires_at: string
          upload_token: string
        }
        Insert: {
          complaint_id: string
          created_at?: string
          expires_at: string
          upload_token: string
        }
        Update: {
          complaint_id?: string
          created_at?: string
          expires_at?: string
          upload_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_attachment_upload_tickets_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: true
            referencedRelation: "report_complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_attachments: {
        Row: {
          client_upload_id: string | null
          complaint_id: string
          content_type: string
          created_at: string
          file_name: string
          id: string
          ip_hash: string | null
          replacement_for: string | null
          size_bytes: number
          status: string
          storage_path: string
          updated_at: string
          updated_by: string | null
          uploaded_at: string | null
        }
        Insert: {
          client_upload_id?: string | null
          complaint_id: string
          content_type: string
          created_at?: string
          file_name: string
          id?: string
          ip_hash?: string | null
          replacement_for?: string | null
          size_bytes: number
          status?: string
          storage_path: string
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string | null
        }
        Update: {
          client_upload_id?: string | null
          complaint_id?: string
          content_type?: string
          created_at?: string
          file_name?: string
          id?: string
          ip_hash?: string | null
          replacement_for?: string | null
          size_bytes?: number
          status?: string
          storage_path?: string
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaint_attachments_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "report_complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_attachments_replacement_for_fkey"
            columns: ["replacement_for"]
            isOneToOne: false
            referencedRelation: "complaint_attachments"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_categories: {
        Row: {
          aliases: string[]
          code: string
          created_at: string
          description: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          code: string
          created_at?: string
          description: string
          is_active?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          code?: string
          created_at?: string
          description?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      report_assignments: {
        Row: {
          claimed_at: string
          created_at: string
          id: string
          report_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: string
          submitted_at: string | null
          volunteer_id: string
        }
        Insert: {
          claimed_at?: string
          created_at?: string
          id?: string
          report_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string | null
          volunteer_id: string
        }
        Update: {
          claimed_at?: string
          created_at?: string
          id?: string
          report_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string | null
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_assignments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_complaints: {
        Row: {
          category: string | null
          created_at: string
          description: string
          id: string
          is_initial: boolean
          latitude: number | null
          location: string
          longitude: number | null
          priority: string | null
          recommendation: string | null
          report_id: string
          summary: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description: string
          id?: string
          is_initial?: boolean
          latitude?: number | null
          location: string
          longitude?: number | null
          priority?: string | null
          recommendation?: string | null
          report_id: string
          summary?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          is_initial?: boolean
          latitude?: number | null
          location?: string
          longitude?: number | null
          priority?: string | null
          recommendation?: string | null
          report_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_complaints_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_evidence: {
        Row: {
          assignment_id: string
          created_at: string
          id: string
          note: string | null
          storage_path: string
          volunteer_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          id?: string
          note?: string | null
          storage_path: string
          volunteer_id: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          id?: string
          note?: string | null
          storage_path?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_evidence_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "report_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          category: string | null
          created_at: string | null
          description: string
          id: string
          latitude: number | null
          location: string
          longitude: number | null
          priority: string | null
          recommendation: string | null
          status: string | null
          summary: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description: string
          id?: string
          latitude?: number | null
          location: string
          longitude?: number | null
          priority?: string | null
          recommendation?: string | null
          status?: string | null
          summary?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string
          id?: string
          latitude?: number | null
          location?: string
          longitude?: number | null
          priority?: string | null
          recommendation?: string | null
          status?: string | null
          summary?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      volunteer_profiles: {
        Row: {
          created_at: string
          full_name: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          phone?: string | null
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
      cancel_report_assignment: {
        Args: { p_assignment_id: string }
        Returns: Json
      }
      claim_report: { Args: { p_report_id: string }; Returns: Json }
      is_tuntas_admin: { Args: never; Returns: boolean }
      review_report_assignment: {
        Args: {
          p_approved: boolean
          p_assignment_id: string
          p_review_note?: string
        }
        Returns: Json
      }
      submit_report_evidence: {
        Args: {
          p_assignment_id: string
          p_note?: string
          p_storage_paths: string[]
        }
        Returns: Json
      }
      submit_report_with_deduplication: {
        Args: {
          p_category: string
          p_description: string
          p_latitude: number
          p_location: string
          p_longitude: number
          p_priority: string
          p_radius_meters?: number
          p_recommendation: string
          p_summary: string
        }
        Returns: Json
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
