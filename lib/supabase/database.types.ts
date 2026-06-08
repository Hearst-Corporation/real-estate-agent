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
          pdf_status: string | null
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
          pdf_status?: string | null
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
          pdf_status?: string | null
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
      inv_approvals: {
        Row: {
          action: string
          approver_1: string | null
          approver_1_at: string | null
          approver_2: string | null
          approver_2_at: string | null
          created_at: string
          id: string
          reason: string | null
          status: string
          subject_id: string
          subject_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action: string
          approver_1?: string | null
          approver_1_at?: string | null
          approver_2?: string | null
          approver_2_at?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          status?: string
          subject_id: string
          subject_type: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          action?: string
          approver_1?: string | null
          approver_1_at?: string | null
          approver_2?: string | null
          approver_2_at?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          status?: string
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      inv_audit_log: {
        Row: {
          action: string
          actor_role: string
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: unknown
          metadata: Json
          prev_hash: string | null
          record_hash: string
          request_id: string | null
          seq: number
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_role?: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json
          prev_hash?: string | null
          record_hash: string
          request_id?: string | null
          seq: number
          tenant_id?: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_role?: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json
          prev_hash?: string | null
          record_hash?: string
          request_id?: string | null
          seq?: number
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      inv_bond_register: {
        Row: {
          bond_tranche_id: string | null
          created_at: string
          deal_id: string
          holder_user_id: string | null
          id: string
          inscribed_at: string | null
          nominal_eur: number
          rank: string
          rate_or_index: string | null
          state: string
          subscription_id: string | null
          tenant_id: string
          units: number
          updated_at: string
        }
        Insert: {
          bond_tranche_id?: string | null
          created_at?: string
          deal_id: string
          holder_user_id?: string | null
          id?: string
          inscribed_at?: string | null
          nominal_eur: number
          rank?: string
          rate_or_index?: string | null
          state?: string
          subscription_id?: string | null
          tenant_id?: string
          units: number
          updated_at?: string
        }
        Update: {
          bond_tranche_id?: string | null
          created_at?: string
          deal_id?: string
          holder_user_id?: string | null
          id?: string
          inscribed_at?: string | null
          nominal_eur?: number
          rank?: string
          rate_or_index?: string | null
          state?: string
          subscription_id?: string | null
          tenant_id?: string
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_bond_register_bond_tranche_id_fkey"
            columns: ["bond_tranche_id"]
            isOneToOne: false
            referencedRelation: "inv_bond_tranches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_bond_register_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_bond_register_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "inv_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_bond_tranches: {
        Row: {
          chain: string | null
          chain_id: number | null
          compliance_address: string | null
          coupon_frequency: string
          coupon_rate_pct: number | null
          created_at: string
          deal_id: string
          deep_register_ref: string | null
          deep_registered_at: string | null
          excluded_countries: string[]
          id: string
          identity_registry_address: string | null
          is_variable_return: boolean
          isin: string | null
          lock_up_until: string | null
          maturity_date: string | null
          name: string
          nominal_unit_eur: number
          redemption_trigger: string
          seniority: string
          spv_id: string
          status: string
          tenant_id: string
          token_contract_address: string | null
          token_decimals: number
          token_standard: string
          total_nominal_eur: number
          units_issued: number
          units_total: number
          updated_at: string
          waterfall_rank: number
        }
        Insert: {
          chain?: string | null
          chain_id?: number | null
          compliance_address?: string | null
          coupon_frequency?: string
          coupon_rate_pct?: number | null
          created_at?: string
          deal_id: string
          deep_register_ref?: string | null
          deep_registered_at?: string | null
          excluded_countries?: string[]
          id?: string
          identity_registry_address?: string | null
          is_variable_return?: boolean
          isin?: string | null
          lock_up_until?: string | null
          maturity_date?: string | null
          name: string
          nominal_unit_eur?: number
          redemption_trigger?: string
          seniority?: string
          spv_id: string
          status?: string
          tenant_id?: string
          token_contract_address?: string | null
          token_decimals?: number
          token_standard?: string
          total_nominal_eur: number
          units_issued?: number
          units_total: number
          updated_at?: string
          waterfall_rank?: number
        }
        Update: {
          chain?: string | null
          chain_id?: number | null
          compliance_address?: string | null
          coupon_frequency?: string
          coupon_rate_pct?: number | null
          created_at?: string
          deal_id?: string
          deep_register_ref?: string | null
          deep_registered_at?: string | null
          excluded_countries?: string[]
          id?: string
          identity_registry_address?: string | null
          is_variable_return?: boolean
          isin?: string | null
          lock_up_until?: string | null
          maturity_date?: string | null
          name?: string
          nominal_unit_eur?: number
          redemption_trigger?: string
          seniority?: string
          spv_id?: string
          status?: string
          tenant_id?: string
          token_contract_address?: string | null
          token_decimals?: number
          token_standard?: string
          total_nominal_eur?: number
          units_issued?: number
          units_total?: number
          updated_at?: string
          waterfall_rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "inv_bond_tranches_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_bond_tranches_spv_id_fkey"
            columns: ["spv_id"]
            isOneToOne: false
            referencedRelation: "inv_spvs"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_bondholder_mass: {
        Row: {
          bond_tranche_id: string | null
          constituted_at: string | null
          created_at: string
          deal_id: string
          id: string
          representative_contact: string | null
          representative_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bond_tranche_id?: string | null
          constituted_at?: string | null
          created_at?: string
          deal_id: string
          id?: string
          representative_contact?: string | null
          representative_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          bond_tranche_id?: string | null
          constituted_at?: string | null
          created_at?: string
          deal_id?: string
          id?: string
          representative_contact?: string | null
          representative_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_bondholder_mass_bond_tranche_id_fkey"
            columns: ["bond_tranche_id"]
            isOneToOne: false
            referencedRelation: "inv_bond_tranches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_bondholder_mass_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_cap_table_entries: {
        Row: {
          balance_units_after: number
          bond_tranche_id: string
          created_at: string
          deal_id: string
          deep_register_ref: string | null
          entry_type: string
          holder_profile_id: string | null
          holder_user_id: string | null
          id: string
          legal_recorded_at: string
          nominal_eur: number
          notes: string | null
          reconciliation_status: string
          subscription_id: string | null
          tenant_id: string
          token_mint_id: string | null
          units: number
        }
        Insert: {
          balance_units_after: number
          bond_tranche_id: string
          created_at?: string
          deal_id: string
          deep_register_ref?: string | null
          entry_type: string
          holder_profile_id?: string | null
          holder_user_id?: string | null
          id?: string
          legal_recorded_at?: string
          nominal_eur: number
          notes?: string | null
          reconciliation_status?: string
          subscription_id?: string | null
          tenant_id?: string
          token_mint_id?: string | null
          units: number
        }
        Update: {
          balance_units_after?: number
          bond_tranche_id?: string
          created_at?: string
          deal_id?: string
          deep_register_ref?: string | null
          entry_type?: string
          holder_profile_id?: string | null
          holder_user_id?: string | null
          id?: string
          legal_recorded_at?: string
          nominal_eur?: number
          notes?: string | null
          reconciliation_status?: string
          subscription_id?: string | null
          tenant_id?: string
          token_mint_id?: string | null
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_inv_cap_table_token_mint"
            columns: ["token_mint_id"]
            isOneToOne: false
            referencedRelation: "inv_token_mints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_cap_table_entries_bond_tranche_id_fkey"
            columns: ["bond_tranche_id"]
            isOneToOne: false
            referencedRelation: "inv_bond_tranches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_cap_table_entries_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_cap_table_entries_holder_profile_id_fkey"
            columns: ["holder_profile_id"]
            isOneToOne: false
            referencedRelation: "inv_investor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_cap_table_entries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "inv_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_chain_events: {
        Row: {
          block_number: number | null
          bond_tranche_id: string | null
          chain: string | null
          chain_id: number | null
          confirmations: number
          contract_address: string | null
          created_at: string
          deal_id: string | null
          event_name: string
          from_wallet: string | null
          id: string
          log_index: number
          observed_at: string
          payload: Json | null
          tenant_id: string
          to_wallet: string | null
          tx_hash: string
          units: number | null
        }
        Insert: {
          block_number?: number | null
          bond_tranche_id?: string | null
          chain?: string | null
          chain_id?: number | null
          confirmations?: number
          contract_address?: string | null
          created_at?: string
          deal_id?: string | null
          event_name: string
          from_wallet?: string | null
          id?: string
          log_index?: number
          observed_at?: string
          payload?: Json | null
          tenant_id?: string
          to_wallet?: string | null
          tx_hash: string
          units?: number | null
        }
        Update: {
          block_number?: number | null
          bond_tranche_id?: string | null
          chain?: string | null
          chain_id?: number | null
          confirmations?: number
          contract_address?: string | null
          created_at?: string
          deal_id?: string | null
          event_name?: string
          from_wallet?: string | null
          id?: string
          log_index?: number
          observed_at?: string
          payload?: Json | null
          tenant_id?: string
          to_wallet?: string | null
          tx_hash?: string
          units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_chain_events_bond_tranche_id_fkey"
            columns: ["bond_tranche_id"]
            isOneToOne: false
            referencedRelation: "inv_bond_tranches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_chain_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_deal_closing_conditions: {
        Row: {
          code: string
          created_at: string
          deal_id: string
          evidence_document_id: string | null
          id: string
          is_met: boolean
          label: string
          met_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deal_id: string
          evidence_document_id?: string | null
          id?: string
          is_met?: boolean
          label: string
          met_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deal_id?: string
          evidence_document_id?: string | null
          id?: string
          is_met?: boolean
          label?: string
          met_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_deal_closing_conditions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_deal_closing_conditions_evidence_document_id_fkey"
            columns: ["evidence_document_id"]
            isOneToOne: false
            referencedRelation: "inv_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_deal_milestones: {
        Row: {
          actual_date: string | null
          created_at: string
          deal_id: string
          id: string
          label: string
          ltv_pct_snapshot: number | null
          milestone_type: string
          notes: string | null
          planned_date: string | null
          progress_pct: number | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          actual_date?: string | null
          created_at?: string
          deal_id: string
          id?: string
          label: string
          ltv_pct_snapshot?: number | null
          milestone_type?: string
          notes?: string | null
          planned_date?: string | null
          progress_pct?: number | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          actual_date?: string | null
          created_at?: string
          deal_id?: string
          id?: string
          label?: string
          ltv_pct_snapshot?: number | null
          milestone_type?: string
          notes?: string | null
          planned_date?: string | null
          progress_pct?: number | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_deal_milestones_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_deals: {
        Row: {
          acquisition_price_eur: number | null
          appraised_value_eur: number | null
          badges: string[]
          city: string | null
          closed_at: string | null
          closes_at: string | null
          country: string
          created_at: string
          deal_type: string
          duration_months: number | null
          fees: Json | null
          id: string
          ltv_pct: number | null
          max_ticket_eur: number | null
          min_ticket_eur: number
          name: string
          notary_fees_eur: number | null
          offering_regime: string
          opens_at: string | null
          operator_id: string
          other_costs_eur: number | null
          postal_code: string | null
          raised_eur: number
          restricted_to_sophisticated: boolean
          risk_factors: Json | null
          scenarios: Json | null
          senior_debt_eur: number | null
          settlement_currency: string
          slug: string
          sponsor_equity_eur: number | null
          spv_id: string
          stablecoin_enabled: boolean
          status: string
          target_irr_pct: number | null
          target_raise_eur: number
          tenant_id: string
          total_project_cost_eur: number | null
          updated_at: string
          waterfall: Json
          works_budget_eur: number | null
        }
        Insert: {
          acquisition_price_eur?: number | null
          appraised_value_eur?: number | null
          badges?: string[]
          city?: string | null
          closed_at?: string | null
          closes_at?: string | null
          country?: string
          created_at?: string
          deal_type?: string
          duration_months?: number | null
          fees?: Json | null
          id?: string
          ltv_pct?: number | null
          max_ticket_eur?: number | null
          min_ticket_eur?: number
          name: string
          notary_fees_eur?: number | null
          offering_regime?: string
          opens_at?: string | null
          operator_id: string
          other_costs_eur?: number | null
          postal_code?: string | null
          raised_eur?: number
          restricted_to_sophisticated?: boolean
          risk_factors?: Json | null
          scenarios?: Json | null
          senior_debt_eur?: number | null
          settlement_currency?: string
          slug: string
          sponsor_equity_eur?: number | null
          spv_id: string
          stablecoin_enabled?: boolean
          status?: string
          target_irr_pct?: number | null
          target_raise_eur: number
          tenant_id?: string
          total_project_cost_eur?: number | null
          updated_at?: string
          waterfall?: Json
          works_budget_eur?: number | null
        }
        Update: {
          acquisition_price_eur?: number | null
          appraised_value_eur?: number | null
          badges?: string[]
          city?: string | null
          closed_at?: string | null
          closes_at?: string | null
          country?: string
          created_at?: string
          deal_type?: string
          duration_months?: number | null
          fees?: Json | null
          id?: string
          ltv_pct?: number | null
          max_ticket_eur?: number | null
          min_ticket_eur?: number
          name?: string
          notary_fees_eur?: number | null
          offering_regime?: string
          opens_at?: string | null
          operator_id?: string
          other_costs_eur?: number | null
          postal_code?: string | null
          raised_eur?: number
          restricted_to_sophisticated?: boolean
          risk_factors?: Json | null
          scenarios?: Json | null
          senior_debt_eur?: number | null
          settlement_currency?: string
          slug?: string
          sponsor_equity_eur?: number | null
          spv_id?: string
          stablecoin_enabled?: boolean
          status?: string
          target_irr_pct?: number | null
          target_raise_eur?: number
          tenant_id?: string
          total_project_cost_eur?: number | null
          updated_at?: string
          waterfall?: Json
          works_budget_eur?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_deals_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "inv_operators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_deals_spv_id_fkey"
            columns: ["spv_id"]
            isOneToOne: true
            referencedRelation: "inv_spvs"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_deep_inscriptions: {
        Row: {
          bond_register_id: string
          created_at: string
          id: string
          inscribed_at: string | null
          inscription_ref: string | null
          onchain_chain: string | null
          onchain_contract: string | null
          onchain_token_units: number | null
          reconciled: boolean
          registrar: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bond_register_id: string
          created_at?: string
          id?: string
          inscribed_at?: string | null
          inscription_ref?: string | null
          onchain_chain?: string | null
          onchain_contract?: string | null
          onchain_token_units?: number | null
          reconciled?: boolean
          registrar: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          bond_register_id?: string
          created_at?: string
          id?: string
          inscribed_at?: string | null
          inscription_ref?: string | null
          onchain_chain?: string | null
          onchain_contract?: string | null
          onchain_token_units?: number | null
          reconciled?: boolean
          registrar?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_deep_inscriptions_bond_register_id_fkey"
            columns: ["bond_register_id"]
            isOneToOne: false
            referencedRelation: "inv_bond_register"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_distribution_payouts: {
        Row: {
          bond_tranche_id: string
          created_at: string
          currency: string
          distribution_id: string
          gross_amount_eur: number
          holder_profile_id: string
          holder_user_id: string
          id: string
          net_amount_eur: number
          onchain_tx_hash: string | null
          paid_at: string | null
          payment_reference: string | null
          status: string
          tenant_id: string
          units_held: number
          updated_at: string
          withholding_eur: number
        }
        Insert: {
          bond_tranche_id: string
          created_at?: string
          currency?: string
          distribution_id: string
          gross_amount_eur: number
          holder_profile_id: string
          holder_user_id: string
          id?: string
          net_amount_eur: number
          onchain_tx_hash?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          status?: string
          tenant_id?: string
          units_held: number
          updated_at?: string
          withholding_eur?: number
        }
        Update: {
          bond_tranche_id?: string
          created_at?: string
          currency?: string
          distribution_id?: string
          gross_amount_eur?: number
          holder_profile_id?: string
          holder_user_id?: string
          id?: string
          net_amount_eur?: number
          onchain_tx_hash?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          status?: string
          tenant_id?: string
          units_held?: number
          updated_at?: string
          withholding_eur?: number
        }
        Relationships: [
          {
            foreignKeyName: "inv_distribution_payouts_bond_tranche_id_fkey"
            columns: ["bond_tranche_id"]
            isOneToOne: false
            referencedRelation: "inv_bond_tranches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_distribution_payouts_distribution_id_fkey"
            columns: ["distribution_id"]
            isOneToOne: false
            referencedRelation: "inv_distributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_distribution_payouts_holder_profile_id_fkey"
            columns: ["holder_profile_id"]
            isOneToOne: false
            referencedRelation: "inv_investor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_distributions: {
        Row: {
          bond_tranche_id: string
          created_at: string
          currency: string
          deal_id: string
          distribution_type: string
          gross_amount_eur: number
          id: string
          notes: string | null
          payment_date: string | null
          period_end: string | null
          period_start: string | null
          record_date: string | null
          status: string
          tax_reportable: boolean
          tenant_id: string
          updated_at: string
          waterfall_rank: number | null
        }
        Insert: {
          bond_tranche_id: string
          created_at?: string
          currency?: string
          deal_id: string
          distribution_type: string
          gross_amount_eur: number
          id?: string
          notes?: string | null
          payment_date?: string | null
          period_end?: string | null
          period_start?: string | null
          record_date?: string | null
          status?: string
          tax_reportable?: boolean
          tenant_id?: string
          updated_at?: string
          waterfall_rank?: number | null
        }
        Update: {
          bond_tranche_id?: string
          created_at?: string
          currency?: string
          deal_id?: string
          distribution_type?: string
          gross_amount_eur?: number
          id?: string
          notes?: string | null
          payment_date?: string | null
          period_end?: string | null
          period_start?: string | null
          record_date?: string | null
          status?: string
          tax_reportable?: boolean
          tenant_id?: string
          updated_at?: string
          waterfall_rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_distributions_bond_tranche_id_fkey"
            columns: ["bond_tranche_id"]
            isOneToOne: false
            referencedRelation: "inv_bond_tranches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_distributions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_documents: {
        Row: {
          content_sha256: string | null
          created_at: string
          doc_type: string
          entity_id: string
          entity_type: string
          esign_envelope_id: string | null
          id: string
          is_signed: boolean
          mime_type: string | null
          signed_at: string | null
          size_bytes: number | null
          status: string
          storage_key: string
          tenant_id: string
          title: string
          updated_at: string
          user_id: string | null
          version: number
          visibility: string
        }
        Insert: {
          content_sha256?: string | null
          created_at?: string
          doc_type: string
          entity_id: string
          entity_type: string
          esign_envelope_id?: string | null
          id?: string
          is_signed?: boolean
          mime_type?: string | null
          signed_at?: string | null
          size_bytes?: number | null
          status?: string
          storage_key: string
          tenant_id?: string
          title: string
          updated_at?: string
          user_id?: string | null
          version?: number
          visibility?: string
        }
        Update: {
          content_sha256?: string | null
          created_at?: string
          doc_type?: string
          entity_id?: string
          entity_type?: string
          esign_envelope_id?: string | null
          id?: string
          is_signed?: boolean
          mime_type?: string | null
          signed_at?: string | null
          size_bytes?: number | null
          status?: string
          storage_key?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id?: string | null
          version?: number
          visibility?: string
        }
        Relationships: []
      }
      inv_escrow_movements: {
        Row: {
          amount_eur: number
          bank_reference: string | null
          created_at: string
          currency: string
          deal_id: string
          direction: string
          escrow_account_ref: string
          escrow_provider: string
          id: string
          movement_type: string
          notes: string | null
          onchain_tx_hash: string | null
          reconciled_at: string | null
          status: string
          subscription_id: string
          tenant_id: string
          travel_rule_ok: boolean | null
          updated_at: string
          user_id: string
          value_date: string | null
        }
        Insert: {
          amount_eur: number
          bank_reference?: string | null
          created_at?: string
          currency?: string
          deal_id: string
          direction: string
          escrow_account_ref: string
          escrow_provider: string
          id?: string
          movement_type: string
          notes?: string | null
          onchain_tx_hash?: string | null
          reconciled_at?: string | null
          status?: string
          subscription_id: string
          tenant_id?: string
          travel_rule_ok?: boolean | null
          updated_at?: string
          user_id: string
          value_date?: string | null
        }
        Update: {
          amount_eur?: number
          bank_reference?: string | null
          created_at?: string
          currency?: string
          deal_id?: string
          direction?: string
          escrow_account_ref?: string
          escrow_provider?: string
          id?: string
          movement_type?: string
          notes?: string | null
          onchain_tx_hash?: string | null
          reconciled_at?: string | null
          status?: string
          subscription_id?: string
          tenant_id?: string
          travel_rule_ok?: boolean | null
          updated_at?: string
          user_id?: string
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_escrow_movements_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_escrow_movements_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "inv_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_failed_operations: {
        Row: {
          attempts: number
          created_at: string
          deal_id: string | null
          id: string
          last_error: string | null
          op_kind: string
          payload: Json | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          subscription_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          deal_id?: string | null
          id?: string
          last_error?: string | null
          op_kind: string
          payload?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          deal_id?: string | null
          id?: string
          last_error?: string | null
          op_kind?: string
          payload?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_failed_operations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_failed_operations_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "inv_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_idempotency_keys: {
        Row: {
          body_hash: string | null
          created_at: string
          id: string
          idem_key: string
          response: Json | null
          scope: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          body_hash?: string | null
          created_at?: string
          id?: string
          idem_key: string
          response?: Json | null
          scope?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          body_hash?: string | null
          created_at?: string
          id?: string
          idem_key?: string
          response?: Json | null
          scope?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      inv_investor_assessments: {
        Row: {
          annual_income_eur: number | null
          classification: string | null
          classified_at: string | null
          created_at: string
          expires_at: string | null
          financial_commitments_eur: number | null
          id: string
          investor_profile_id: string | null
          knowledge_passed: boolean | null
          knowledge_score: number | null
          liquid_assets_eur: number | null
          net_worth_eur: number | null
          state: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          annual_income_eur?: number | null
          classification?: string | null
          classified_at?: string | null
          created_at?: string
          expires_at?: string | null
          financial_commitments_eur?: number | null
          id?: string
          investor_profile_id?: string | null
          knowledge_passed?: boolean | null
          knowledge_score?: number | null
          liquid_assets_eur?: number | null
          net_worth_eur?: number | null
          state?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          annual_income_eur?: number | null
          classification?: string | null
          classified_at?: string | null
          created_at?: string
          expires_at?: string | null
          financial_commitments_eur?: number | null
          id?: string
          investor_profile_id?: string | null
          knowledge_passed?: boolean | null
          knowledge_score?: number | null
          liquid_assets_eur?: number | null
          net_worth_eur?: number | null
          state?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_investor_assessments_investor_profile_id_fkey"
            columns: ["investor_profile_id"]
            isOneToOne: false
            referencedRelation: "inv_investor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_investor_profiles: {
        Row: {
          annual_investment_cap_eur: number | null
          appropriateness_test_at: string | null
          appropriateness_test_passed: boolean
          country: string
          created_at: string
          declared_net_worth_eur: number | null
          full_name: string | null
          id: string
          investor_class: string
          investor_kind: string
          kyc_approved_at: string | null
          kyc_expires_at: string | null
          kyc_status: string
          onchainid_address: string | null
          risk_disclosure_accepted_at: string | null
          status: string
          tenant_id: string
          tos_accepted_at: string | null
          updated_at: string
          user_id: string
          wallet_address: string | null
          wallet_kind: string
        }
        Insert: {
          annual_investment_cap_eur?: number | null
          appropriateness_test_at?: string | null
          appropriateness_test_passed?: boolean
          country?: string
          created_at?: string
          declared_net_worth_eur?: number | null
          full_name?: string | null
          id?: string
          investor_class?: string
          investor_kind?: string
          kyc_approved_at?: string | null
          kyc_expires_at?: string | null
          kyc_status?: string
          onchainid_address?: string | null
          risk_disclosure_accepted_at?: string | null
          status?: string
          tenant_id?: string
          tos_accepted_at?: string | null
          updated_at?: string
          user_id: string
          wallet_address?: string | null
          wallet_kind?: string
        }
        Update: {
          annual_investment_cap_eur?: number | null
          appropriateness_test_at?: string | null
          appropriateness_test_passed?: boolean
          country?: string
          created_at?: string
          declared_net_worth_eur?: number | null
          full_name?: string | null
          id?: string
          investor_class?: string
          investor_kind?: string
          kyc_approved_at?: string | null
          kyc_expires_at?: string | null
          kyc_status?: string
          onchainid_address?: string | null
          risk_disclosure_accepted_at?: string | null
          status?: string
          tenant_id?: string
          tos_accepted_at?: string | null
          updated_at?: string
          user_id?: string
          wallet_address?: string | null
          wallet_kind?: string
        }
        Relationships: []
      }
      inv_kiis_documents: {
        Row: {
          created_at: string
          current_version: number
          deal_id: string
          doc_type: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_version?: number
          deal_id: string
          doc_type?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_version?: number
          deal_id?: string
          doc_type?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_kiis_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_kiis_versions: {
        Row: {
          content: Json | null
          created_at: string
          id: string
          kiis_document_id: string
          pdf_sha256: string | null
          published_at: string | null
          review_notes: string | null
          state: string
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          content?: Json | null
          created_at?: string
          id?: string
          kiis_document_id: string
          pdf_sha256?: string | null
          published_at?: string | null
          review_notes?: string | null
          state?: string
          tenant_id?: string
          updated_at?: string
          version: number
        }
        Update: {
          content?: Json | null
          created_at?: string
          id?: string
          kiis_document_id?: string
          pdf_sha256?: string | null
          published_at?: string | null
          review_notes?: string | null
          state?: string
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inv_kiis_versions_kiis_document_id_fkey"
            columns: ["kiis_document_id"]
            isOneToOne: false
            referencedRelation: "inv_kiis_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_kyc_cases: {
        Row: {
          approved_at: string | null
          chain_screening_passed: boolean | null
          created_at: string
          expires_at: string | null
          id: string
          investor_profile_id: string
          level: string
          pep_screening_passed: boolean | null
          provider: string
          provider_applicant_id: string | null
          provider_check_id: string | null
          raw_result_hash: string | null
          rejection_reason: string | null
          risk_score: number | null
          sanctions_screening_passed: boolean | null
          source_of_funds_verified: boolean
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          chain_screening_passed?: boolean | null
          created_at?: string
          expires_at?: string | null
          id?: string
          investor_profile_id: string
          level?: string
          pep_screening_passed?: boolean | null
          provider?: string
          provider_applicant_id?: string | null
          provider_check_id?: string | null
          raw_result_hash?: string | null
          rejection_reason?: string | null
          risk_score?: number | null
          sanctions_screening_passed?: boolean | null
          source_of_funds_verified?: boolean
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          chain_screening_passed?: boolean | null
          created_at?: string
          expires_at?: string | null
          id?: string
          investor_profile_id?: string
          level?: string
          pep_screening_passed?: boolean | null
          provider?: string
          provider_applicant_id?: string | null
          provider_check_id?: string | null
          raw_result_hash?: string | null
          rejection_reason?: string | null
          risk_score?: number | null
          sanctions_screening_passed?: boolean | null
          source_of_funds_verified?: boolean
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_kyc_cases_investor_profile_id_fkey"
            columns: ["investor_profile_id"]
            isOneToOne: false
            referencedRelation: "inv_investor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_operators: {
        Row: {
          activity_type: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          hoguet_card_ref: string | null
          hoguet_card_t: boolean
          id: string
          legal_form: string
          legal_name: string
          notes: string | null
          siren: string | null
          status: string
          tenant_id: string
          track_record_deals: number
          track_record_volume_eur: number
          updated_at: string
          user_id: string | null
          website_url: string | null
        }
        Insert: {
          activity_type?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          hoguet_card_ref?: string | null
          hoguet_card_t?: boolean
          id?: string
          legal_form?: string
          legal_name: string
          notes?: string | null
          siren?: string | null
          status?: string
          tenant_id?: string
          track_record_deals?: number
          track_record_volume_eur?: number
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
        }
        Update: {
          activity_type?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          hoguet_card_ref?: string | null
          hoguet_card_t?: boolean
          id?: string
          legal_form?: string
          legal_name?: string
          notes?: string | null
          siren?: string | null
          status?: string
          tenant_id?: string
          track_record_deals?: number
          track_record_volume_eur?: number
          updated_at?: string
          user_id?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      inv_reconciliation_runs: {
        Row: {
          actions: Json | null
          bond_tranche_id: string | null
          created_at: string
          deal_id: string
          drift: Json | null
          error_message: string | null
          finished_at: string | null
          id: string
          result: string
          started_at: string
          status: string
          tenant_id: string
          triggered_pause: boolean
        }
        Insert: {
          actions?: Json | null
          bond_tranche_id?: string | null
          created_at?: string
          deal_id: string
          drift?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          result?: string
          started_at?: string
          status?: string
          tenant_id?: string
          triggered_pause?: boolean
        }
        Update: {
          actions?: Json | null
          bond_tranche_id?: string | null
          created_at?: string
          deal_id?: string
          drift?: Json | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          result?: string
          started_at?: string
          status?: string
          tenant_id?: string
          triggered_pause?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "inv_reconciliation_runs_bond_tranche_id_fkey"
            columns: ["bond_tranche_id"]
            isOneToOne: false
            referencedRelation: "inv_bond_tranches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_reconciliation_runs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_regulatory_reports: {
        Row: {
          created_at: string
          document_id: string | null
          id: string
          payload: Json | null
          period_end: string | null
          period_start: string | null
          report_type: string
          state: string
          submitted_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          id?: string
          payload?: Json | null
          period_end?: string | null
          period_start?: string | null
          report_type: string
          state?: string
          submitted_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          id?: string
          payload?: Json | null
          period_end?: string | null
          period_start?: string | null
          report_type?: string
          state?: string
          submitted_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_regulatory_reports_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "inv_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_reports: {
        Row: {
          created_at: string
          deal_id: string | null
          document_id: string | null
          id: string
          payload: Json | null
          period_end: string | null
          period_start: string | null
          published_at: string | null
          report_type: string
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_id?: string | null
          document_id?: string | null
          id?: string
          payload?: Json | null
          period_end?: string | null
          period_start?: string | null
          published_at?: string | null
          report_type: string
          status?: string
          tenant_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_id?: string | null
          document_id?: string | null
          id?: string
          payload?: Json | null
          period_end?: string | null
          period_start?: string | null
          published_at?: string | null
          report_type?: string
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_reports_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_reports_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "inv_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_secondary_orders: {
        Row: {
          bond_tranche_id: string
          counterparty_profile_id: string | null
          created_at: string
          deal_id: string
          expires_at: string | null
          id: string
          indicative_price_eur: number | null
          investor_profile_id: string
          notes: string | null
          settled_at: string | null
          settled_via_token_mint_id: string | null
          side: string
          status: string
          tenant_id: string
          units: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bond_tranche_id: string
          counterparty_profile_id?: string | null
          created_at?: string
          deal_id: string
          expires_at?: string | null
          id?: string
          indicative_price_eur?: number | null
          investor_profile_id: string
          notes?: string | null
          settled_at?: string | null
          settled_via_token_mint_id?: string | null
          side: string
          status?: string
          tenant_id?: string
          units: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bond_tranche_id?: string
          counterparty_profile_id?: string | null
          created_at?: string
          deal_id?: string
          expires_at?: string | null
          id?: string
          indicative_price_eur?: number | null
          investor_profile_id?: string
          notes?: string | null
          settled_at?: string | null
          settled_via_token_mint_id?: string | null
          side?: string
          status?: string
          tenant_id?: string
          units?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_secondary_orders_bond_tranche_id_fkey"
            columns: ["bond_tranche_id"]
            isOneToOne: false
            referencedRelation: "inv_bond_tranches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_secondary_orders_counterparty_profile_id_fkey"
            columns: ["counterparty_profile_id"]
            isOneToOne: false
            referencedRelation: "inv_investor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_secondary_orders_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_secondary_orders_investor_profile_id_fkey"
            columns: ["investor_profile_id"]
            isOneToOne: false
            referencedRelation: "inv_investor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_secondary_orders_settled_via_token_mint_id_fkey"
            columns: ["settled_via_token_mint_id"]
            isOneToOne: false
            referencedRelation: "inv_token_mints"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_signature_envelopes: {
        Row: {
          audit_trail: Json | null
          created_at: string
          doc_kind: string
          doc_sha256: string | null
          id: string
          provider: string
          provider_ref: string | null
          sealed_at: string | null
          signature_level: string
          signed_at: string | null
          state: string
          subscription_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          audit_trail?: Json | null
          created_at?: string
          doc_kind: string
          doc_sha256?: string | null
          id?: string
          provider?: string
          provider_ref?: string | null
          sealed_at?: string | null
          signature_level?: string
          signed_at?: string | null
          state?: string
          subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          audit_trail?: Json | null
          created_at?: string
          doc_kind?: string
          doc_sha256?: string | null
          id?: string
          provider?: string
          provider_ref?: string | null
          sealed_at?: string | null
          signature_level?: string
          signed_at?: string | null
          state?: string
          subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_signature_envelopes_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "inv_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_spvs: {
        Row: {
          asset_address: string | null
          asset_city: string | null
          asset_postal_code: string | null
          asset_type: string | null
          created_at: string
          id: string
          incorporated_at: string | null
          intercreditor_signed: boolean
          legal_form: string
          legal_name: string
          mortgage_registered: boolean
          notes: string | null
          operator_id: string
          rcs_city: string | null
          senior_debt_amount_eur: number | null
          senior_debt_lender: string | null
          senior_debt_rank: number
          share_capital_eur: number | null
          siren: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          asset_address?: string | null
          asset_city?: string | null
          asset_postal_code?: string | null
          asset_type?: string | null
          created_at?: string
          id?: string
          incorporated_at?: string | null
          intercreditor_signed?: boolean
          legal_form?: string
          legal_name: string
          mortgage_registered?: boolean
          notes?: string | null
          operator_id: string
          rcs_city?: string | null
          senior_debt_amount_eur?: number | null
          senior_debt_lender?: string | null
          senior_debt_rank?: number
          share_capital_eur?: number | null
          siren?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          asset_address?: string | null
          asset_city?: string | null
          asset_postal_code?: string | null
          asset_type?: string | null
          created_at?: string
          id?: string
          incorporated_at?: string | null
          intercreditor_signed?: boolean
          legal_form?: string
          legal_name?: string
          mortgage_registered?: boolean
          notes?: string | null
          operator_id?: string
          rcs_city?: string | null
          senior_debt_amount_eur?: number | null
          senior_debt_lender?: string | null
          senior_debt_rank?: number
          share_capital_eur?: number | null
          siren?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_spvs_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "inv_operators"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_subscriptions: {
        Row: {
          allocated_at: string | null
          amount_eur: number
          bond_tranche_id: string
          cooling_off_ends_at: string | null
          created_at: string
          deal_id: string
          esign_envelope_id: string | null
          esign_provider: string | null
          funded_at: string | null
          id: string
          investor_profile_id: string
          minted_at: string | null
          notes: string | null
          refunded_at: string | null
          reserved_at: string
          settlement_currency: string
          signed_at: string | null
          status: string
          tenant_id: string
          unit_price_eur: number
          units: number
          updated_at: string
          user_id: string
          withdrawn_at: string | null
        }
        Insert: {
          allocated_at?: string | null
          amount_eur: number
          bond_tranche_id: string
          cooling_off_ends_at?: string | null
          created_at?: string
          deal_id: string
          esign_envelope_id?: string | null
          esign_provider?: string | null
          funded_at?: string | null
          id?: string
          investor_profile_id: string
          minted_at?: string | null
          notes?: string | null
          refunded_at?: string | null
          reserved_at?: string
          settlement_currency?: string
          signed_at?: string | null
          status?: string
          tenant_id?: string
          unit_price_eur: number
          units: number
          updated_at?: string
          user_id: string
          withdrawn_at?: string | null
        }
        Update: {
          allocated_at?: string | null
          amount_eur?: number
          bond_tranche_id?: string
          cooling_off_ends_at?: string | null
          created_at?: string
          deal_id?: string
          esign_envelope_id?: string | null
          esign_provider?: string | null
          funded_at?: string | null
          id?: string
          investor_profile_id?: string
          minted_at?: string | null
          notes?: string | null
          refunded_at?: string | null
          reserved_at?: string
          settlement_currency?: string
          signed_at?: string | null
          status?: string
          tenant_id?: string
          unit_price_eur?: number
          units?: number
          updated_at?: string
          user_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_subscriptions_bond_tranche_id_fkey"
            columns: ["bond_tranche_id"]
            isOneToOne: false
            referencedRelation: "inv_bond_tranches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_subscriptions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_subscriptions_investor_profile_id_fkey"
            columns: ["investor_profile_id"]
            isOneToOne: false
            referencedRelation: "inv_investor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_tenants: {
        Row: {
          created_at: string
          distribution_regime: string
          id: string
          legal_entity_name: string | null
          legal_entity_siren: string | null
          name: string
          psfp_authorization_ref: string | null
          settings: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          distribution_regime?: string
          id: string
          legal_entity_name?: string | null
          legal_entity_siren?: string | null
          name: string
          psfp_authorization_ref?: string | null
          settings?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          distribution_regime?: string
          id?: string
          legal_entity_name?: string | null
          legal_entity_siren?: string | null
          name?: string
          psfp_authorization_ref?: string | null
          settings?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      inv_token_mints: {
        Row: {
          block_number: number | null
          bond_tranche_id: string
          cap_table_entry_id: string | null
          chain: string
          chain_id: number | null
          compliance_checked: boolean
          confirmed_at: string | null
          contract_address: string | null
          created_at: string
          deal_id: string
          error_message: string | null
          from_wallet_address: string | null
          holder_profile_id: string | null
          id: string
          log_index: number | null
          operation: string
          status: string
          tenant_id: string
          to_wallet_address: string | null
          tx_hash: string | null
          units: number
          updated_at: string
        }
        Insert: {
          block_number?: number | null
          bond_tranche_id: string
          cap_table_entry_id?: string | null
          chain: string
          chain_id?: number | null
          compliance_checked?: boolean
          confirmed_at?: string | null
          contract_address?: string | null
          created_at?: string
          deal_id: string
          error_message?: string | null
          from_wallet_address?: string | null
          holder_profile_id?: string | null
          id?: string
          log_index?: number | null
          operation: string
          status?: string
          tenant_id?: string
          to_wallet_address?: string | null
          tx_hash?: string | null
          units: number
          updated_at?: string
        }
        Update: {
          block_number?: number | null
          bond_tranche_id?: string
          cap_table_entry_id?: string | null
          chain?: string
          chain_id?: number | null
          compliance_checked?: boolean
          confirmed_at?: string | null
          contract_address?: string | null
          created_at?: string
          deal_id?: string
          error_message?: string | null
          from_wallet_address?: string | null
          holder_profile_id?: string | null
          id?: string
          log_index?: number | null
          operation?: string
          status?: string
          tenant_id?: string
          to_wallet_address?: string | null
          tx_hash?: string | null
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inv_token_mints_bond_tranche_id_fkey"
            columns: ["bond_tranche_id"]
            isOneToOne: false
            referencedRelation: "inv_bond_tranches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_token_mints_cap_table_entry_id_fkey"
            columns: ["cap_table_entry_id"]
            isOneToOne: false
            referencedRelation: "inv_cap_table_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_token_mints_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "inv_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_token_mints_holder_profile_id_fkey"
            columns: ["holder_profile_id"]
            isOneToOne: false
            referencedRelation: "inv_investor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_travel_rule_records: {
        Row: {
          amount_eur: number | null
          amount_token: number | null
          asset: string
          beneficiary_info: Json | null
          casp_provider: string
          chain: string
          created_at: string
          escrow_movement_id: string | null
          id: string
          originator_info: Json | null
          screening_result: string | null
          state: string
          subscription_id: string | null
          tenant_id: string
          tx_hash: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_eur?: number | null
          amount_token?: number | null
          asset: string
          beneficiary_info?: Json | null
          casp_provider: string
          chain: string
          created_at?: string
          escrow_movement_id?: string | null
          id?: string
          originator_info?: Json | null
          screening_result?: string | null
          state?: string
          subscription_id?: string | null
          tenant_id?: string
          tx_hash?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_eur?: number | null
          amount_token?: number | null
          asset?: string
          beneficiary_info?: Json | null
          casp_provider?: string
          chain?: string
          created_at?: string
          escrow_movement_id?: string | null
          id?: string
          originator_info?: Json | null
          screening_result?: string | null
          state?: string
          subscription_id?: string | null
          tenant_id?: string
          tx_hash?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inv_travel_rule_records_escrow_movement_id_fkey"
            columns: ["escrow_movement_id"]
            isOneToOne: false
            referencedRelation: "inv_escrow_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inv_travel_rule_records_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "inv_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      inv_webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string | null
          id: string
          payload: Json | null
          processed_at: string | null
          provider: string
          provider_event_id: string
          signature_valid: boolean
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          provider: string
          provider_event_id: string
          signature_valid?: boolean
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          signature_valid?: boolean
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          consent_at: string | null
          consent_source: string | null
          created_at: string
          email: string | null
          enriched_at: string | null
          enriched_data: Json | null
          enriched_source: string | null
          full_name: string
          id: string
          kind: string
          notes: string | null
          phone: string | null
          property_id: string | null
          source: string | null
          status: string
          tenant_id: string
          type_personne: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          consent_at?: string | null
          consent_source?: string | null
          created_at?: string
          email?: string | null
          enriched_at?: string | null
          enriched_data?: Json | null
          enriched_source?: string | null
          full_name: string
          id?: string
          kind?: string
          notes?: string | null
          phone?: string | null
          property_id?: string | null
          source?: string | null
          status?: string
          tenant_id?: string
          type_personne?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          consent_at?: string | null
          consent_source?: string | null
          created_at?: string
          email?: string | null
          enriched_at?: string | null
          enriched_data?: Json | null
          enriched_source?: string | null
          full_name?: string
          id?: string
          kind?: string
          notes?: string | null
          phone?: string | null
          property_id?: string | null
          source?: string | null
          status?: string
          tenant_id?: string
          type_personne?: string
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
      missions: {
        Row: {
          created_at: string
          decisions: Json
          entity_id: string | null
          entity_type: string | null
          error: string | null
          id: string
          input: Json
          objective: string
          plan: Json | null
          result: Json | null
          runs: Json
          status: string
          swarm_id: string | null
          tenant_id: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          decisions?: Json
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          input?: Json
          objective: string
          plan?: Json | null
          result?: Json | null
          runs?: Json
          status?: string
          swarm_id?: string | null
          tenant_id?: string
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          decisions?: Json
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          input?: Json
          objective?: string
          plan?: Json | null
          result?: Json | null
          runs?: Json
          status?: string
          swarm_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string | null
          asking_price: number | null
          bedrooms: number | null
          cellar: boolean
          charges_monthly: number | null
          city: string | null
          created_at: string
          dpe_letter: string | null
          estimated_value: number | null
          estimation_id: string | null
          floor: number | null
          floor_total: number | null
          ges_letter: string | null
          has_elevator: boolean
          has_garden: boolean
          has_parking: boolean
          has_pool: boolean
          has_terrace: boolean
          id: string
          notes: string | null
          orientation: string | null
          parking_count: number | null
          postal_code: string | null
          property_type: string | null
          rooms: number | null
          status: string
          surface: number | null
          taxe_fonciere: number | null
          tenant_id: string
          title: string | null
          updated_at: string
          user_id: string | null
          year_built: number | null
        }
        Insert: {
          address?: string | null
          asking_price?: number | null
          bedrooms?: number | null
          cellar?: boolean
          charges_monthly?: number | null
          city?: string | null
          created_at?: string
          dpe_letter?: string | null
          estimated_value?: number | null
          estimation_id?: string | null
          floor?: number | null
          floor_total?: number | null
          ges_letter?: string | null
          has_elevator?: boolean
          has_garden?: boolean
          has_parking?: boolean
          has_pool?: boolean
          has_terrace?: boolean
          id?: string
          notes?: string | null
          orientation?: string | null
          parking_count?: number | null
          postal_code?: string | null
          property_type?: string | null
          rooms?: number | null
          status?: string
          surface?: number | null
          taxe_fonciere?: number | null
          tenant_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
          year_built?: number | null
        }
        Update: {
          address?: string | null
          asking_price?: number | null
          bedrooms?: number | null
          cellar?: boolean
          charges_monthly?: number | null
          city?: string | null
          created_at?: string
          dpe_letter?: string | null
          estimated_value?: number | null
          estimation_id?: string | null
          floor?: number | null
          floor_total?: number | null
          ges_letter?: string | null
          has_elevator?: boolean
          has_garden?: boolean
          has_parking?: boolean
          has_pool?: boolean
          has_terrace?: boolean
          id?: string
          notes?: string | null
          orientation?: string | null
          parking_count?: number | null
          postal_code?: string | null
          property_type?: string | null
          rooms?: number | null
          status?: string
          surface?: number | null
          taxe_fonciere?: number | null
          tenant_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
          year_built?: number | null
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
      property_photos: {
        Row: {
          created_at: string
          id: string
          is_cover: boolean
          position: number
          property_id: string
          storage_key: string
          tenant_id: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_cover?: boolean
          position?: number
          property_id: string
          storage_key: string
          tenant_id?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_cover?: boolean
          position?: number
          property_id?: string
          storage_key?: string
          tenant_id?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_photos_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      prosp_annonces: {
        Row: {
          actif: boolean
          age_hours: number | null
          annee_construction: number | null
          ascenseur: boolean | null
          baisse_detectee_at: string | null
          charges_mensuelles: number | null
          code_postal: string | null
          commune: string | null
          conso_energie_kwh: number | null
          created_at: string
          date_collecte: string
          demarchage_bloque: boolean
          derniere_republication_at: string | null
          description: string | null
          dpe_note: string | null
          duplicate_count: number
          duplicate_sources: Json
          email_vendeur: string | null
          enriched_at: string | null
          etage: number | null
          first_seen_at: string
          ges_note: string | null
          hash_dedup: string
          id: string
          is_auction_sale: boolean
          is_under_mandate: boolean
          is_viager: boolean
          jardin: boolean | null
          latitude: number | null
          longitude: number | null
          mi_origin: string | null
          nb_chambres: number | null
          nb_pieces: number | null
          nom_annonceur: string | null
          opt_out_at: string | null
          parking: boolean | null
          phone_removed_at: string | null
          photos_urls: Json
          piscine: boolean | null
          premiere_parution_at: string | null
          prix: number | null
          prix_baisse_delta: number | null
          prix_gap_median: number | null
          prix_m2: number | null
          prix_original: number | null
          rentabilite_estimee: number | null
          scored_at: string | null
          siren_annonceur: string | null
          source_id: string | null
          source_platform: string
          source_url: string | null
          sous_compromis: boolean
          surface_m2: number | null
          surface_terrain_m2: number | null
          taxe_fonciere: number | null
          telephone_vendeur: string | null
          tenant_id: string
          terrasse: boolean | null
          title: string | null
          type_annonceur: string
          type_bien: string | null
          updated_at: string
        }
        Insert: {
          actif?: boolean
          age_hours?: number | null
          annee_construction?: number | null
          ascenseur?: boolean | null
          baisse_detectee_at?: string | null
          charges_mensuelles?: number | null
          code_postal?: string | null
          commune?: string | null
          conso_energie_kwh?: number | null
          created_at?: string
          date_collecte?: string
          demarchage_bloque?: boolean
          derniere_republication_at?: string | null
          description?: string | null
          dpe_note?: string | null
          duplicate_count?: number
          duplicate_sources?: Json
          email_vendeur?: string | null
          enriched_at?: string | null
          etage?: number | null
          first_seen_at?: string
          ges_note?: string | null
          hash_dedup: string
          id?: string
          is_auction_sale?: boolean
          is_under_mandate?: boolean
          is_viager?: boolean
          jardin?: boolean | null
          latitude?: number | null
          longitude?: number | null
          mi_origin?: string | null
          nb_chambres?: number | null
          nb_pieces?: number | null
          nom_annonceur?: string | null
          opt_out_at?: string | null
          parking?: boolean | null
          phone_removed_at?: string | null
          photos_urls?: Json
          piscine?: boolean | null
          premiere_parution_at?: string | null
          prix?: number | null
          prix_baisse_delta?: number | null
          prix_gap_median?: number | null
          prix_m2?: number | null
          prix_original?: number | null
          rentabilite_estimee?: number | null
          scored_at?: string | null
          siren_annonceur?: string | null
          source_id?: string | null
          source_platform: string
          source_url?: string | null
          sous_compromis?: boolean
          surface_m2?: number | null
          surface_terrain_m2?: number | null
          taxe_fonciere?: number | null
          telephone_vendeur?: string | null
          tenant_id?: string
          terrasse?: boolean | null
          title?: string | null
          type_annonceur?: string
          type_bien?: string | null
          updated_at?: string
        }
        Update: {
          actif?: boolean
          age_hours?: number | null
          annee_construction?: number | null
          ascenseur?: boolean | null
          baisse_detectee_at?: string | null
          charges_mensuelles?: number | null
          code_postal?: string | null
          commune?: string | null
          conso_energie_kwh?: number | null
          created_at?: string
          date_collecte?: string
          demarchage_bloque?: boolean
          derniere_republication_at?: string | null
          description?: string | null
          dpe_note?: string | null
          duplicate_count?: number
          duplicate_sources?: Json
          email_vendeur?: string | null
          enriched_at?: string | null
          etage?: number | null
          first_seen_at?: string
          ges_note?: string | null
          hash_dedup?: string
          id?: string
          is_auction_sale?: boolean
          is_under_mandate?: boolean
          is_viager?: boolean
          jardin?: boolean | null
          latitude?: number | null
          longitude?: number | null
          mi_origin?: string | null
          nb_chambres?: number | null
          nb_pieces?: number | null
          nom_annonceur?: string | null
          opt_out_at?: string | null
          parking?: boolean | null
          phone_removed_at?: string | null
          photos_urls?: Json
          piscine?: boolean | null
          premiere_parution_at?: string | null
          prix?: number | null
          prix_baisse_delta?: number | null
          prix_gap_median?: number | null
          prix_m2?: number | null
          prix_original?: number | null
          rentabilite_estimee?: number | null
          scored_at?: string | null
          siren_annonceur?: string | null
          source_id?: string | null
          source_platform?: string
          source_url?: string | null
          sous_compromis?: boolean
          surface_m2?: number | null
          surface_terrain_m2?: number | null
          taxe_fonciere?: number | null
          telephone_vendeur?: string | null
          tenant_id?: string
          terrasse?: boolean | null
          title?: string | null
          type_annonceur?: string
          type_bien?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      prosp_config: {
        Row: {
          bareme_match: Json
          created_at: string
          id: string
          mandat_poids: Json
          mandat_preset: string
          mandat_seuil: number
          pap_keywords: Json
          siren_blacklist: Json
          tenant_id: string
          updated_at: string
          user_id: string
          wa_cooldown_h: number
          wa_daily_cap: number
          zones_prioritaires: Json
        }
        Insert: {
          bareme_match?: Json
          created_at?: string
          id?: string
          mandat_poids?: Json
          mandat_preset?: string
          mandat_seuil?: number
          pap_keywords?: Json
          siren_blacklist?: Json
          tenant_id?: string
          updated_at?: string
          user_id: string
          wa_cooldown_h?: number
          wa_daily_cap?: number
          zones_prioritaires?: Json
        }
        Update: {
          bareme_match?: Json
          created_at?: string
          id?: string
          mandat_poids?: Json
          mandat_preset?: string
          mandat_seuil?: number
          pap_keywords?: Json
          siren_blacklist?: Json
          tenant_id?: string
          updated_at?: string
          user_id?: string
          wa_cooldown_h?: number
          wa_daily_cap?: number
          zones_prioritaires?: Json
        }
        Relationships: []
      }
      prosp_criteres: {
        Row: {
          accepte_travaux: boolean
          actif: boolean
          alert_canal: string
          alert_frequency: string
          chambres_min: number | null
          communes: Json
          created_at: string
          id: string
          label: string
          lead_id: string | null
          pieces_min: number | null
          poids: Json
          pref_ascenseur: string
          pref_jardin: string
          pref_parking: string
          pref_piscine: string
          pref_terrasse: string
          prix_max: number | null
          prix_min: number | null
          seuil_match: number
          source: string
          surface_min: number | null
          tenant_id: string
          type_bien: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accepte_travaux?: boolean
          actif?: boolean
          alert_canal?: string
          alert_frequency?: string
          chambres_min?: number | null
          communes?: Json
          created_at?: string
          id?: string
          label: string
          lead_id?: string | null
          pieces_min?: number | null
          poids?: Json
          pref_ascenseur?: string
          pref_jardin?: string
          pref_parking?: string
          pref_piscine?: string
          pref_terrasse?: string
          prix_max?: number | null
          prix_min?: number | null
          seuil_match?: number
          source?: string
          surface_min?: number | null
          tenant_id?: string
          type_bien?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accepte_travaux?: boolean
          actif?: boolean
          alert_canal?: string
          alert_frequency?: string
          chambres_min?: number | null
          communes?: Json
          created_at?: string
          id?: string
          label?: string
          lead_id?: string | null
          pieces_min?: number | null
          poids?: Json
          pref_ascenseur?: string
          pref_jardin?: string
          pref_parking?: string
          pref_piscine?: string
          pref_terrasse?: string
          prix_max?: number | null
          prix_min?: number | null
          seuil_match?: number
          source?: string
          surface_min?: number | null
          tenant_id?: string
          type_bien?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prosp_criteres_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      prosp_criteres_acquereur: {
        Row: {
          actif: boolean
          alerte_email: boolean
          alerte_whatsapp: boolean
          ascenseur: string
          budget_max: number | null
          budget_min: number | null
          created_at: string
          dpe_max: string | null
          id: string
          jardin: string
          lead_id: string | null
          nom: string
          parking: string
          pieces_max: number | null
          pieces_min: number | null
          piscine: string
          surface_max: number | null
          surface_min: number | null
          telephone: string | null
          tenant_id: string
          terrasse: string
          type_bien: string[] | null
          updated_at: string
          user_id: string
          zones: Json
        }
        Insert: {
          actif?: boolean
          alerte_email?: boolean
          alerte_whatsapp?: boolean
          ascenseur?: string
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          dpe_max?: string | null
          id?: string
          jardin?: string
          lead_id?: string | null
          nom: string
          parking?: string
          pieces_max?: number | null
          pieces_min?: number | null
          piscine?: string
          surface_max?: number | null
          surface_min?: number | null
          telephone?: string | null
          tenant_id: string
          terrasse?: string
          type_bien?: string[] | null
          updated_at?: string
          user_id: string
          zones?: Json
        }
        Update: {
          actif?: boolean
          alerte_email?: boolean
          alerte_whatsapp?: boolean
          ascenseur?: string
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          dpe_max?: string | null
          id?: string
          jardin?: string
          lead_id?: string | null
          nom?: string
          parking?: string
          pieces_max?: number | null
          pieces_min?: number | null
          piscine?: string
          surface_max?: number | null
          surface_min?: number | null
          telephone?: string | null
          tenant_id?: string
          terrasse?: string
          type_bien?: string[] | null
          updated_at?: string
          user_id?: string
          zones?: Json
        }
        Relationships: [
          {
            foreignKeyName: "prosp_criteres_acquereur_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      prosp_envois: {
        Row: {
          canal: string
          created_at: string
          critere_id: string
          destinataire: string | null
          error: string | null
          id: string
          match_ids: Json
          pdf_key: string | null
          pdf_url: string | null
          provider_ref: string | null
          sent_at: string | null
          statut: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          canal: string
          created_at?: string
          critere_id: string
          destinataire?: string | null
          error?: string | null
          id?: string
          match_ids?: Json
          pdf_key?: string | null
          pdf_url?: string | null
          provider_ref?: string | null
          sent_at?: string | null
          statut?: string
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          canal?: string
          created_at?: string
          critere_id?: string
          destinataire?: string | null
          error?: string | null
          id?: string
          match_ids?: Json
          pdf_key?: string | null
          pdf_url?: string | null
          provider_ref?: string | null
          sent_at?: string | null
          statut?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prosp_envois_critere_id_fkey"
            columns: ["critere_id"]
            isOneToOne: false
            referencedRelation: "prosp_criteres"
            referencedColumns: ["id"]
          },
        ]
      }
      prosp_failed_operations: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          op_kind: string
          payload: Json
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          op_kind: string
          payload?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          op_kind?: string
          payload?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      prosp_idempotency_keys: {
        Row: {
          body_hash: string | null
          created_at: string
          id: string
          idem_key: string
          response: Json | null
          status: string
          tenant_id: string
        }
        Insert: {
          body_hash?: string | null
          created_at?: string
          id?: string
          idem_key: string
          response?: Json | null
          status?: string
          tenant_id?: string
        }
        Update: {
          body_hash?: string | null
          created_at?: string
          id?: string
          idem_key?: string
          response?: Json | null
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      prosp_ingestion_runs: {
        Row: {
          alerts_sent: number
          cost_estimate: number
          error: string | null
          finished_at: string | null
          id: string
          inserted: number
          kind: string
          scanned: number
          skipped: number
          source: string | null
          started_at: string
          status: string
          tenant_id: string
          updated_count: number
        }
        Insert: {
          alerts_sent?: number
          cost_estimate?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          inserted?: number
          kind?: string
          scanned?: number
          skipped?: number
          source?: string | null
          started_at?: string
          status?: string
          tenant_id?: string
          updated_count?: number
        }
        Update: {
          alerts_sent?: number
          cost_estimate?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          inserted?: number
          kind?: string
          scanned?: number
          skipped?: number
          source?: string | null
          started_at?: string
          status?: string
          tenant_id?: string
          updated_count?: number
        }
        Relationships: []
      }
      prosp_match_feedback: {
        Row: {
          created_at: string
          critere_id: string | null
          features_snapshot: Json
          id: string
          match_id: string
          score_at_feedback: number | null
          tenant_id: string
          user_id: string
          verdict: string
        }
        Insert: {
          created_at?: string
          critere_id?: string | null
          features_snapshot?: Json
          id?: string
          match_id: string
          score_at_feedback?: number | null
          tenant_id?: string
          user_id: string
          verdict: string
        }
        Update: {
          created_at?: string
          critere_id?: string | null
          features_snapshot?: Json
          id?: string
          match_id?: string
          score_at_feedback?: number | null
          tenant_id?: string
          user_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "prosp_match_feedback_critere_id_fkey"
            columns: ["critere_id"]
            isOneToOne: false
            referencedRelation: "prosp_criteres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prosp_match_feedback_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "prosp_matchs"
            referencedColumns: ["id"]
          },
        ]
      }
      prosp_matchs: {
        Row: {
          alerted_at: string | null
          annonce_id: string
          bonus_breakdown: Json
          created_at: string
          critere_id: string
          date_match: string
          digest_sent_at: string | null
          features_snapshot: Json
          id: string
          proposed_to_others: Json
          score_match: number
          sent_at: string | null
          statut: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alerted_at?: string | null
          annonce_id: string
          bonus_breakdown?: Json
          created_at?: string
          critere_id: string
          date_match?: string
          digest_sent_at?: string | null
          features_snapshot?: Json
          id?: string
          proposed_to_others?: Json
          score_match?: number
          sent_at?: string | null
          statut?: string
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alerted_at?: string | null
          annonce_id?: string
          bonus_breakdown?: Json
          created_at?: string
          critere_id?: string
          date_match?: string
          digest_sent_at?: string | null
          features_snapshot?: Json
          id?: string
          proposed_to_others?: Json
          score_match?: number
          sent_at?: string | null
          statut?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prosp_matchs_annonce_id_fkey"
            columns: ["annonce_id"]
            isOneToOne: false
            referencedRelation: "prosp_annonces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prosp_matchs_critere_id_fkey"
            columns: ["critere_id"]
            isOneToOne: false
            referencedRelation: "prosp_criteres"
            referencedColumns: ["id"]
          },
        ]
      }
      prosp_optout: {
        Row: {
          created_at: string
          email_hash: string | null
          id: string
          raison: string
          source: string | null
          telephone_hash: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          email_hash?: string | null
          id?: string
          raison?: string
          source?: string | null
          telephone_hash?: string | null
          tenant_id?: string
        }
        Update: {
          created_at?: string
          email_hash?: string | null
          id?: string
          raison?: string
          source?: string | null
          telephone_hash?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      prosp_prospects: {
        Row: {
          alerted_at: string | null
          annonce_id: string
          created_at: string
          first_call_at: string | null
          id: string
          lead_id: string | null
          mandat_signed_at: string | null
          notes: string | null
          rappel_at: string | null
          score_breakdown: Json
          score_mandat: number
          seen_at: string | null
          statut: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alerted_at?: string | null
          annonce_id: string
          created_at?: string
          first_call_at?: string | null
          id?: string
          lead_id?: string | null
          mandat_signed_at?: string | null
          notes?: string | null
          rappel_at?: string | null
          score_breakdown?: Json
          score_mandat?: number
          seen_at?: string | null
          statut?: string
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alerted_at?: string | null
          annonce_id?: string
          created_at?: string
          first_call_at?: string | null
          id?: string
          lead_id?: string | null
          mandat_signed_at?: string | null
          notes?: string | null
          rappel_at?: string | null
          score_breakdown?: Json
          score_mandat?: number
          seen_at?: string | null
          statut?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prosp_prospects_annonce_id_fkey"
            columns: ["annonce_id"]
            isOneToOne: false
            referencedRelation: "prosp_annonces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prosp_prospects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      prosp_veille_agences: {
        Row: {
          actif: boolean
          created_at: string
          id: string
          last_seen_at: string | null
          nom_agence: string
          patterns_nom: Json
          siren: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actif?: boolean
          created_at?: string
          id?: string
          last_seen_at?: string | null
          nom_agence: string
          patterns_nom?: Json
          siren?: string | null
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actif?: boolean
          created_at?: string
          id?: string
          last_seen_at?: string | null
          nom_agence?: string
          patterns_nom?: Json
          siren?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prosp_zones: {
        Row: {
          actif: boolean
          code_postal: string
          commune: string | null
          created_at: string
          id: string
          last_run_at: string | null
          tenant_id: string
          type_bien: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actif?: boolean
          code_postal: string
          commune?: string | null
          created_at?: string
          id?: string
          last_run_at?: string | null
          tenant_id?: string
          type_bien?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actif?: boolean
          code_postal?: string
          commune?: string | null
          created_at?: string
          id?: string
          last_run_at?: string | null
          tenant_id?: string
          type_bien?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      revoked_sessions: {
        Row: {
          jti: string
          revoked_at: string | null
          token_iat: string | null
          user_id: string | null
        }
        Insert: {
          jti: string
          revoked_at?: string | null
          token_iat?: string | null
          user_id?: string | null
        }
        Update: {
          jti?: string
          revoked_at?: string | null
          token_iat?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revoked_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      swarm_runs: {
        Row: {
          created_at: string
          id: string
          result: Json | null
          run_id: string
          status: string
          steps: Json | null
          swarm_id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          result?: Json | null
          run_id: string
          status?: string
          steps?: Json | null
          swarm_id: string
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          result?: Json | null
          run_id?: string
          status?: string
          steps?: Json | null
          swarm_id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      inv_append_audit_log: {
        Args: {
          p_action: string
          p_actor_role?: string
          p_actor_user_id?: string
          p_after?: Json
          p_before?: Json
          p_entity_id?: string
          p_entity_type?: string
          p_ip?: unknown
          p_metadata?: Json
          p_request_id?: string
          p_tenant_id: string
          p_user_agent?: string
        }
        Returns: string
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
