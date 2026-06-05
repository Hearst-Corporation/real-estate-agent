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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cockpit_chats: {
        Row: {
          created_at: string | null
          id: string
          tenant_id: string
          title: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          tenant_id?: string
          title?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          tenant_id?: string
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cockpit_messages: {
        Row: {
          chat_id: string | null
          content: string
          created_at: string | null
          id: string
          role: string
          tenant_id: string
        }
        Insert: {
          chat_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          role: string
          tenant_id?: string
        }
        Update: {
          chat_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cockpit_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "cockpit_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      estimation_messages: {
        Row: {
          block_index: number | null
          content: string | null
          created_at: string
          estimation_id: string | null
          id: string
          role: string
          tenant_id: string
          tool_input: Json | null
          user_id: string | null
        }
        Insert: {
          block_index?: number | null
          content?: string | null
          created_at?: string
          estimation_id?: string | null
          id?: string
          role: string
          tenant_id?: string
          tool_input?: Json | null
          user_id?: string | null
        }
        Update: {
          block_index?: number | null
          content?: string | null
          created_at?: string
          estimation_id?: string | null
          id?: string
          role?: string
          tenant_id?: string
          tool_input?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimation_messages_estimation_id_fkey"
            columns: ["estimation_id"]
            isOneToOne: false
            referencedRelation: "estimations"
            referencedColumns: ["id"]
          },
        ]
      }
      estimations: {
        Row: {
          branding: Json | null
          charges_estimees_eur: number | null
          city: string | null
          confirmed_blocks: Json
          created_at: string
          field_status: Json
          id: string
          insee_code: string | null
          market: Json | null
          market_value: number | null
          pdf_generated_at: string | null
          pdf_key: string | null
          pdf_url: string | null
          postal_code: string | null
          property: Json
          property_photo_key: string | null
          property_type: string | null
          recommended_price: number | null
          sale_strategies: Json | null
          sources_snapshot: Json | null
          status: string
          surface: number | null
          surface_carrez_m2: number | null
          tenant_id: string
          updated_at: string
          user_id: string | null
          valuation: Json | null
          vue_perenne: boolean | null
        }
        Insert: {
          branding?: Json | null
          charges_estimees_eur?: number | null
          city?: string | null
          confirmed_blocks?: Json
          created_at?: string
          field_status?: Json
          id?: string
          insee_code?: string | null
          market?: Json | null
          market_value?: number | null
          pdf_generated_at?: string | null
          pdf_key?: string | null
          pdf_url?: string | null
          postal_code?: string | null
          property?: Json
          property_photo_key?: string | null
          property_type?: string | null
          recommended_price?: number | null
          sale_strategies?: Json | null
          sources_snapshot?: Json | null
          status?: string
          surface?: number | null
          surface_carrez_m2?: number | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          valuation?: Json | null
          vue_perenne?: boolean | null
        }
        Update: {
          branding?: Json | null
          charges_estimees_eur?: number | null
          city?: string | null
          confirmed_blocks?: Json
          created_at?: string
          field_status?: Json
          id?: string
          insee_code?: string | null
          market?: Json | null
          market_value?: number | null
          pdf_generated_at?: string | null
          pdf_key?: string | null
          pdf_url?: string | null
          postal_code?: string | null
          property?: Json
          property_photo_key?: string | null
          property_type?: string | null
          recommended_price?: number | null
          sale_strategies?: Json | null
          sources_snapshot?: Json | null
          status?: string
          surface?: number | null
          surface_carrez_m2?: number | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          valuation?: Json | null
          vue_perenne?: boolean | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          kind: string
          notes: string | null
          phone: string | null
          property_id: string | null
          source: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          kind?: string
          notes?: string | null
          phone?: string | null
          property_id?: string | null
          source?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          kind?: string
          notes?: string | null
          phone?: string | null
          property_id?: string | null
          source?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      mandates: {
        Row: {
          asking_price: number | null
          commission_pct: number | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          notes: string | null
          property_id: string | null
          reference: string | null
          signed_at: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          asking_price?: number | null
          commission_pct?: number | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          property_id?: string | null
          reference?: string | null
          signed_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          asking_price?: number | null
          commission_pct?: number | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          property_id?: string | null
          reference?: string | null
          signed_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mandates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          asking_price: number | null
          bedrooms: number | null
          city: string | null
          created_at: string
          estimated_value: number | null
          estimation_id: string | null
          id: string
          notes: string | null
          postal_code: string | null
          property_type: string | null
          rooms: number | null
          status: string
          surface: number | null
          tenant_id: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          asking_price?: number | null
          bedrooms?: number | null
          city?: string | null
          created_at?: string
          estimated_value?: number | null
          estimation_id?: string | null
          id?: string
          notes?: string | null
          postal_code?: string | null
          property_type?: string | null
          rooms?: number | null
          status?: string
          surface?: number | null
          tenant_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          asking_price?: number | null
          bedrooms?: number | null
          city?: string | null
          created_at?: string
          estimated_value?: number | null
          estimation_id?: string | null
          id?: string
          notes?: string | null
          postal_code?: string | null
          property_type?: string | null
          rooms?: number | null
          status?: string
          surface?: number | null
          tenant_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_estimation_id_fkey"
            columns: ["estimation_id"]
            isOneToOne: false
            referencedRelation: "estimations"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_memory: {
        Row: {
          content: string
          created_at: string | null
          id: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          tenant_id?: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          tenant_id?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          tenant_id?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          created_at: string
          duration_min: number
          feedback: string | null
          id: string
          lead_id: string | null
          notes: string | null
          property_id: string | null
          scheduled_at: string
          status: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_min?: number
          feedback?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          property_id?: string | null
          scheduled_at: string
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_min?: number
          feedback?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          property_id?: string | null
          scheduled_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant_id: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
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
