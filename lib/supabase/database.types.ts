
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "attendance_events": {
                  Row: {
                    "camper_id": string,"corrects_event_id": string | null,"created_at": string,"device_label": string | null,"event_type": Database["public"]['Enums']["attendance_event_type"],"id": string,"method": Database["public"]['Enums']["attendance_method"],"note": string | null,"occurred_at": string,"recorded_by": string | null,"resulting_status": Database["public"]['Enums']["camper_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "camper_id": string,"corrects_event_id"?: string | null,"created_at"?: string,"device_label"?: string | null,"event_type": Database["public"]['Enums']["attendance_event_type"],"id"?: string,"method"?: Database["public"]['Enums']["attendance_method"],"note"?: string | null,"occurred_at"?: string,"recorded_by"?: string | null,"resulting_status": Database["public"]['Enums']["camper_status"]
                  }
                  Update: {
                    "camper_id"?: string,"corrects_event_id"?: string | null,"created_at"?: string,"device_label"?: string | null,"event_type"?: Database["public"]['Enums']["attendance_event_type"],"id"?: string,"method"?: Database["public"]['Enums']["attendance_method"],"note"?: string | null,"occurred_at"?: string,"recorded_by"?: string | null,"resulting_status"?: Database["public"]['Enums']["camper_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_events_camper_id_fkey"
      columns: ["camper_id"]
isOneToOne: false
      referencedRelation: "campers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_events_camper_id_fkey"
      columns: ["camper_id"]
isOneToOne: false
      referencedRelation: "campers_board"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_events_camper_id_fkey"
      columns: ["camper_id"]
isOneToOne: false
      referencedRelation: "campers_visible"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_events_corrects_event_id_fkey"
      columns: ["corrects_event_id"]
isOneToOne: false
      referencedRelation: "attendance_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_events_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"after": Json | null,"at": string,"before": Json | null,"diff": Json | null,"id": number,"row_id": string | null,"source": string,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"diff"?: Json | null,"id"?: never,"row_id"?: string | null,"source"?: string,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"diff"?: Json | null,"id"?: never,"row_id"?: string | null,"source"?: string,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"bunks": {
                  Row: {
                    "created_at": string,"division_id": string,"id": string,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"division_id": string,"id"?: string,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"division_id"?: string,"id"?: string,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "bunks_division_id_fkey"
      columns: ["division_id"]
isOneToOne: false
      referencedRelation: "divisions"
      referencedColumns: ["id"]
    }
                  ]
                },"buzzer_assignments": {
                  Row: {
                    "assigned_at": string,"assigned_by": string | null,"buzzer_number": number,"camper_id": string,"id": string,"released_at": string | null,"released_by": string | null,"session_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"buzzer_number": number,"camper_id": string,"id"?: string,"released_at"?: string | null,"released_by"?: string | null,"session_id": string
                  }
                  Update: {
                    "assigned_at"?: string,"assigned_by"?: string | null,"buzzer_number"?: number,"camper_id"?: string,"id"?: string,"released_at"?: string | null,"released_by"?: string | null,"session_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "buzzer_assignments_assigned_by_fkey"
      columns: ["assigned_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "buzzer_assignments_camper_id_fkey"
      columns: ["camper_id"]
isOneToOne: false
      referencedRelation: "campers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "buzzer_assignments_camper_id_fkey"
      columns: ["camper_id"]
isOneToOne: false
      referencedRelation: "campers_board"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "buzzer_assignments_camper_id_fkey"
      columns: ["camper_id"]
isOneToOne: false
      referencedRelation: "campers_visible"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "buzzer_assignments_released_by_fkey"
      columns: ["released_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "buzzer_assignments_session_id_buzzer_number_fkey"
      columns: ["session_id","buzzer_number"]
isOneToOne: false
      referencedRelation: "buzzers"
      referencedColumns: ["session_id","number"]
    },{
      foreignKeyName: "buzzer_assignments_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"buzzers": {
                  Row: {
                    "is_active": boolean,"label": string | null,"number": number,"session_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "is_active"?: boolean,"label"?: string | null,"number": number,"session_id": string
                  }
                  Update: {
                    "is_active"?: boolean,"label"?: string | null,"number"?: number,"session_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "buzzers_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"camper_followups": {
                  Row: {
                    "camper_id": string,"note": string | null,"until": string | null,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "camper_id": string,"note"?: string | null,"until"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "camper_id"?: string,"note"?: string | null,"until"?: string | null,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "camper_followups_camper_id_fkey"
      columns: ["camper_id"]
isOneToOne: true
      referencedRelation: "campers"
      referencedColumns: ["id"]
    },
    {
      foreignKeyName: "camper_followups_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"camper_contacts": {
                  Row: {
                    "camper_id": string,"can_pickup": boolean,"created_at": string,"email": string | null,"id": string,"is_primary": boolean,"name": string | null,"phone": string | null,"phone_e164": string | null,"role": Database["public"]['Enums']["contact_role"],"slot": number,"source": Database["public"]['Enums']["record_source"]
                  }
                  ComputedFields: never
                  Insert: {
                    "camper_id": string,"can_pickup"?: boolean,"created_at"?: string,"email"?: string | null,"id"?: string,"is_primary"?: boolean,"name"?: string | null,"phone"?: string | null,"phone_e164"?: string | null,"role": Database["public"]['Enums']["contact_role"],"slot"?: number,"source"?: Database["public"]['Enums']["record_source"]
                  }
                  Update: {
                    "camper_id"?: string,"can_pickup"?: boolean,"created_at"?: string,"email"?: string | null,"id"?: string,"is_primary"?: boolean,"name"?: string | null,"phone"?: string | null,"phone_e164"?: string | null,"role"?: Database["public"]['Enums']["contact_role"],"slot"?: number,"source"?: Database["public"]['Enums']["record_source"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "camper_contacts_camper_id_fkey"
      columns: ["camper_id"]
isOneToOne: false
      referencedRelation: "campers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "camper_contacts_camper_id_fkey"
      columns: ["camper_id"]
isOneToOne: false
      referencedRelation: "campers_board"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "camper_contacts_camper_id_fkey"
      columns: ["camper_id"]
isOneToOne: false
      referencedRelation: "campers_visible"
      referencedColumns: ["id"]
    }
                  ]
                },"campers": {
                  Row: {
                    "allergies": string | null,"archived_at": string | null,"bunk_id": string | null,"bunk_locked_by_staff": boolean,"bunk_preferences": (string)[],"camper_code": string,"created_at": string,"current_buzzer_number": number | null,"display_name": string | null,"division_id": string | null,"first_name": string,"grade": string | null,"has_allergies": boolean | null,"has_epipen": boolean | null,"has_medications": boolean | null,"id": string,"in_latest_import": boolean,"last_event_id": string | null,"last_name": string,"local_address": string | null,"local_address_cross_streets": string | null,"medical_notes": string | null,"name_normalized": string | null,"notes_from_parents": string | null,"session_id": string,"source_data": Json | null,"source_id": string | null,"staff_notes": string | null,"status": Database["public"]['Enums']["camper_status"],"tshirt_size": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allergies"?: string | null,"archived_at"?: string | null,"bunk_id"?: string | null,"bunk_locked_by_staff"?: boolean,"bunk_preferences"?: (string)[],"camper_code"?: string,"created_at"?: string,"current_buzzer_number"?: number | null,"display_name"?: never,"division_id"?: string | null,"first_name": string,"grade"?: string | null,"has_allergies"?: boolean | null,"has_epipen"?: boolean | null,"has_medications"?: boolean | null,"id"?: string,"in_latest_import"?: boolean,"last_event_id"?: string | null,"last_name": string,"local_address"?: string | null,"local_address_cross_streets"?: string | null,"medical_notes"?: string | null,"name_normalized"?: never,"notes_from_parents"?: string | null,"session_id": string,"source_data"?: Json | null,"source_id"?: string | null,"staff_notes"?: string | null,"status"?: Database["public"]['Enums']["camper_status"],"tshirt_size"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "allergies"?: string | null,"archived_at"?: string | null,"bunk_id"?: string | null,"bunk_locked_by_staff"?: boolean,"bunk_preferences"?: (string)[],"camper_code"?: string,"created_at"?: string,"current_buzzer_number"?: number | null,"display_name"?: never,"division_id"?: string | null,"first_name"?: string,"grade"?: string | null,"has_allergies"?: boolean | null,"has_epipen"?: boolean | null,"has_medications"?: boolean | null,"id"?: string,"in_latest_import"?: boolean,"last_event_id"?: string | null,"last_name"?: string,"local_address"?: string | null,"local_address_cross_streets"?: string | null,"medical_notes"?: string | null,"name_normalized"?: never,"notes_from_parents"?: string | null,"session_id"?: string,"source_data"?: Json | null,"source_id"?: string | null,"staff_notes"?: string | null,"status"?: Database["public"]['Enums']["camper_status"],"tshirt_size"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "campers_bunk_id_fkey"
      columns: ["bunk_id"]
isOneToOne: false
      referencedRelation: "bunks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campers_division_id_fkey"
      columns: ["division_id"]
isOneToOne: false
      referencedRelation: "divisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campers_last_event_fk"
      columns: ["last_event_id"]
isOneToOne: false
      referencedRelation: "attendance_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campers_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"division_groups": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"session_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"session_id": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"session_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "division_groups_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"divisions": {
                  Row: {
                    "color": string | null,"created_at": string,"group_id": string | null,"id": string,"language": Database["public"]['Enums']["division_language"],"name": string,"session_id": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string | null,"created_at"?: string,"group_id"?: string | null,"id"?: string,"language"?: Database["public"]['Enums']["division_language"],"name": string,"session_id": string,"sort_order"?: number
                  }
                  Update: {
                    "color"?: string | null,"created_at"?: string,"group_id"?: string | null,"id"?: string,"language"?: Database["public"]['Enums']["division_language"],"name"?: string,"session_id"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "divisions_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "division_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "divisions_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"field_visibility": {
                  Row: {
                    "field_group": string,"roles": (Database["public"]['Enums']["staff_role"])[]
                  }
                  ComputedFields: never
                  Insert: {
                    "field_group": string,"roles"?: (Database["public"]['Enums']["staff_role"])[]
                  }
                  Update: {
                    "field_group"?: string,"roles"?: (Database["public"]['Enums']["staff_role"])[]
                  }
                  Relationships: [
                    
                  ]
                },"import_mappings": {
                  Row: {
                    "column_map": NonNullable<Json>,"created_at": string,"created_by": string | null,"id": string,"is_default": boolean,"name": string,"options": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "column_map": NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_default"?: boolean,"name": string,"options"?: NonNullable<Json>
                  }
                  Update: {
                    "column_map"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_default"?: boolean,"name"?: string,"options"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_mappings_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"import_rows": {
                  Row: {
                    "action": Database["public"]['Enums']["import_row_action"],"applied": boolean,"changes": NonNullable<Json>,"id": string,"import_id": string,"match_method": string | null,"matched_camper_id": string | null,"parsed": Json | null,"raw": NonNullable<Json>,"row_number": number,"warnings": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "action"?: Database["public"]['Enums']["import_row_action"],"applied"?: boolean,"changes"?: NonNullable<Json>,"id"?: string,"import_id": string,"match_method"?: string | null,"matched_camper_id"?: string | null,"parsed"?: Json | null,"raw": NonNullable<Json>,"row_number": number,"warnings"?: (string)[]
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["import_row_action"],"applied"?: boolean,"changes"?: NonNullable<Json>,"id"?: string,"import_id"?: string,"match_method"?: string | null,"matched_camper_id"?: string | null,"parsed"?: Json | null,"raw"?: NonNullable<Json>,"row_number"?: number,"warnings"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_rows_import_id_fkey"
      columns: ["import_id"]
isOneToOne: false
      referencedRelation: "imports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_rows_matched_camper_id_fkey"
      columns: ["matched_camper_id"]
isOneToOne: false
      referencedRelation: "campers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_rows_matched_camper_id_fkey"
      columns: ["matched_camper_id"]
isOneToOne: false
      referencedRelation: "campers_board"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_rows_matched_camper_id_fkey"
      columns: ["matched_camper_id"]
isOneToOne: false
      referencedRelation: "campers_visible"
      referencedColumns: ["id"]
    }
                  ]
                },"imports": {
                  Row: {
                    "applied_at": string | null,"applied_by": string | null,"error": string | null,"file_hash": string | null,"file_name": string,"file_path": string,"id": string,"mapping_id": string | null,"options": NonNullable<Json>,"session_id": string,"status": Database["public"]['Enums']["import_status"],"summary": Json | null,"uploaded_at": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_at"?: string | null,"applied_by"?: string | null,"error"?: string | null,"file_hash"?: string | null,"file_name": string,"file_path": string,"id"?: string,"mapping_id"?: string | null,"options"?: NonNullable<Json>,"session_id": string,"status"?: Database["public"]['Enums']["import_status"],"summary"?: Json | null,"uploaded_at"?: string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "applied_at"?: string | null,"applied_by"?: string | null,"error"?: string | null,"file_hash"?: string | null,"file_name"?: string,"file_path"?: string,"id"?: string,"mapping_id"?: string | null,"options"?: NonNullable<Json>,"session_id"?: string,"status"?: Database["public"]['Enums']["import_status"],"summary"?: Json | null,"uploaded_at"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "imports_applied_by_fkey"
      columns: ["applied_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imports_mapping_id_fkey"
      columns: ["mapping_id"]
isOneToOne: false
      referencedRelation: "import_mappings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imports_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imports_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"list_presets": {
                  Row: {
                    "audience": string,"columns": NonNullable<Json>,"created_at": string,"created_by": string | null,"filters": NonNullable<Json>,"group_by": string | null,"id": string,"is_default": boolean,"name": string,"sort": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "audience": string,"columns": NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"filters"?: NonNullable<Json>,"group_by"?: string | null,"id"?: string,"is_default"?: boolean,"name": string,"sort"?: NonNullable<Json>
                  }
                  Update: {
                    "audience"?: string,"columns"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"filters"?: NonNullable<Json>,"group_by"?: string | null,"id"?: string,"is_default"?: boolean,"name"?: string,"sort"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "list_presets_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"merge_fields": {
                  Row: {
                    "created_at": string,"id": string,"key": string,"label": string,"sort_order": number,"source_field": string,"transforms": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"key": string,"label": string,"sort_order"?: number,"source_field": string,"transforms"?: NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"key"?: string,"label"?: string,"sort_order"?: number,"source_field"?: string,"transforms"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"page_requests": {
                  Row: {
                    "assignment_id": string,"bridge_id": string | null,"buzzer_number": number,"error": string | null,"id": string,"requested_at": string,"requested_by": string | null,"sent_at": string | null,"status": Database["public"]['Enums']["page_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "assignment_id": string,"bridge_id"?: string | null,"buzzer_number": number,"error"?: string | null,"id"?: string,"requested_at"?: string,"requested_by"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["page_status"]
                  }
                  Update: {
                    "assignment_id"?: string,"bridge_id"?: string | null,"buzzer_number"?: number,"error"?: string | null,"id"?: string,"requested_at"?: string,"requested_by"?: string | null,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["page_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "page_requests_assignment_id_fkey"
      columns: ["assignment_id"]
isOneToOne: false
      referencedRelation: "buzzer_assignments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "page_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"print_job_items": {
                  Row: {
                    "camper_id": string,"copies": number,"job_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "camper_id": string,"copies"?: number,"job_id": string
                  }
                  Update: {
                    "camper_id"?: string,"copies"?: number,"job_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_job_items_camper_id_fkey"
      columns: ["camper_id"]
isOneToOne: false
      referencedRelation: "campers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_job_items_camper_id_fkey"
      columns: ["camper_id"]
isOneToOne: false
      referencedRelation: "campers_board"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_job_items_camper_id_fkey"
      columns: ["camper_id"]
isOneToOne: false
      referencedRelation: "campers_visible"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_job_items_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "print_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"print_jobs": {
                  Row: {
                    "deliver_to": string,"email_message_id": string | null,"error": string | null,"id": string,"item_count": number,"kind": Database["public"]['Enums']["print_kind"],"note": string | null,"pdf_path": string | null,"printed_at": string | null,"printed_by": string | null,"requested_at": string,"requested_by": string | null,"session_id": string,"status": Database["public"]['Enums']["print_status"],"template_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "deliver_to": string,"email_message_id"?: string | null,"error"?: string | null,"id"?: string,"item_count"?: number,"kind": Database["public"]['Enums']["print_kind"],"note"?: string | null,"pdf_path"?: string | null,"printed_at"?: string | null,"printed_by"?: string | null,"requested_at"?: string,"requested_by"?: string | null,"session_id": string,"status"?: Database["public"]['Enums']["print_status"],"template_id"?: string | null
                  }
                  Update: {
                    "deliver_to"?: string,"email_message_id"?: string | null,"error"?: string | null,"id"?: string,"item_count"?: number,"kind"?: Database["public"]['Enums']["print_kind"],"note"?: string | null,"pdf_path"?: string | null,"printed_at"?: string | null,"printed_by"?: string | null,"requested_at"?: string,"requested_by"?: string | null,"session_id"?: string,"status"?: Database["public"]['Enums']["print_status"],"template_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_jobs_printed_by_fkey"
      columns: ["printed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_jobs_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_jobs_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "print_jobs_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "print_templates"
      referencedColumns: ["id"]
    }
                  ]
                },"print_templates": {
                  Row: {
                    "auto_on_first_checkin": boolean,"background_path": string | null,"created_at": string,"division_id": string | null,"id": string,"is_default": boolean,"kind": Database["public"]['Enums']["print_kind"],"layers": NonNullable<Json>,"name": string,"page_height_mm": number,"page_width_mm": number,"sheet_layout": Json | null,"show_on_card": boolean,"sort_order": number,"source_file_path": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auto_on_first_checkin"?: boolean,"background_path"?: string | null,"created_at"?: string,"division_id"?: string | null,"id"?: string,"is_default"?: boolean,"kind": Database["public"]['Enums']["print_kind"],"layers"?: NonNullable<Json>,"name": string,"page_height_mm": number,"page_width_mm": number,"sheet_layout"?: Json | null,"show_on_card"?: boolean,"sort_order"?: number,"source_file_path"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "auto_on_first_checkin"?: boolean,"background_path"?: string | null,"created_at"?: string,"division_id"?: string | null,"id"?: string,"is_default"?: boolean,"kind"?: Database["public"]['Enums']["print_kind"],"layers"?: NonNullable<Json>,"name"?: string,"page_height_mm"?: number,"page_width_mm"?: number,"sheet_layout"?: Json | null,"show_on_card"?: boolean,"sort_order"?: number,"source_file_path"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "print_templates_division_id_fkey"
      columns: ["division_id"]
isOneToOne: false
      referencedRelation: "divisions"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "access_level": Database["public"]['Enums']["access_level"],"all_areas": boolean,"created_at": string,"email": string,"full_name": string,"id": string,"is_active": boolean,"phone": string | null,"role": Database["public"]['Enums']["staff_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "access_level"?: Database["public"]['Enums']["access_level"],"all_areas"?: boolean,"created_at"?: string,"email": string,"full_name": string,"id": string,"is_active"?: boolean,"phone"?: string | null,"role"?: Database["public"]['Enums']["staff_role"]
                  }
                  Update: {
                    "access_level"?: Database["public"]['Enums']["access_level"],"all_areas"?: boolean,"created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"is_active"?: boolean,"phone"?: string | null,"role"?: Database["public"]['Enums']["staff_role"]
                  }
                  Relationships: [
                    
                  ]
                },"sessions": {
                  Row: {
                    "created_at": string,"ends_on": string | null,"id": string,"is_active": boolean,"name": string,"starts_on": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ends_on"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"starts_on"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"ends_on"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"starts_on"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_scopes": {
                  Row: {
                    "bunk_id": string | null,"created_at": string,"created_by": string | null,"division_id": string | null,"group_id": string | null,"id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bunk_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"division_id"?: string | null,"group_id"?: string | null,"id"?: string,"user_id": string
                  }
                  Update: {
                    "bunk_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"division_id"?: string | null,"group_id"?: string | null,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_scopes_bunk_id_fkey"
      columns: ["bunk_id"]
isOneToOne: false
      referencedRelation: "bunks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_scopes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_scopes_division_id_fkey"
      columns: ["division_id"]
isOneToOne: false
      referencedRelation: "divisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_scopes_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "division_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_scopes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"value_map_entries": {
                  Row: {
                    "map_id": string,"output_value": string,"source_value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "map_id": string,"output_value": string,"source_value": string
                  }
                  Update: {
                    "map_id"?: string,"output_value"?: string,"source_value"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "value_map_entries_map_id_fkey"
      columns: ["map_id"]
isOneToOne: false
      referencedRelation: "value_maps"
      referencedColumns: ["id"]
    }
                  ]
                },"value_maps": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"source_field": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"source_field": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"source_field"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "campers_board": {
                  Row: {
                    "allergies": string | null,"archived_at": string | null,"bunk_id": string | null,"bunk_preferences": (string)[] | null,"camper_code": string | null,"current_buzzer_number": number | null,"display_name": string | null,"division_id": string | null,"first_name": string | null,"grade": string | null,"has_allergies": boolean | null,"has_epipen": boolean | null,"has_medical_flag": boolean | null,"has_medications": boolean | null,"id": string | null,"in_latest_import": boolean | null,"last_event_at": string | null,"last_event_by": string | null,"last_event_id": string | null,"last_event_method": Database["public"]['Enums']["attendance_method"] | null,"last_event_note": string | null,"last_event_type": Database["public"]['Enums']["attendance_event_type"] | null,"last_name": string | null,"local_address": string | null,"local_address_cross_streets": string | null,"medical_notes": string | null,"notes_from_parents": string | null,"session_id": string | null,"source_id": string | null,"staff_notes": string | null,"status": Database["public"]['Enums']["camper_status"] | null,"tshirt_size": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "campers_bunk_id_fkey"
      columns: ["bunk_id"]
isOneToOne: false
      referencedRelation: "bunks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campers_division_id_fkey"
      columns: ["division_id"]
isOneToOne: false
      referencedRelation: "divisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campers_last_event_fk"
      columns: ["last_event_id"]
isOneToOne: false
      referencedRelation: "attendance_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campers_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                },"campers_visible": {
                  Row: {
                    "allergies": string | null,"archived_at": string | null,"bunk_id": string | null,"bunk_preferences": (string)[] | null,"camper_code": string | null,"current_buzzer_number": number | null,"display_name": string | null,"division_id": string | null,"first_name": string | null,"grade": string | null,"has_allergies": boolean | null,"has_epipen": boolean | null,"has_medical_flag": boolean | null,"has_medications": boolean | null,"id": string | null,"in_latest_import": boolean | null,"last_event_id": string | null,"last_name": string | null,"local_address": string | null,"local_address_cross_streets": string | null,"medical_notes": string | null,"notes_from_parents": string | null,"session_id": string | null,"source_id": string | null,"staff_notes": string | null,"status": Database["public"]['Enums']["camper_status"] | null,"tshirt_size": string | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "allergies"?: never,"archived_at"?: string | null,"bunk_id"?: string | null,"bunk_preferences"?: (string)[] | null,"camper_code"?: string | null,"current_buzzer_number"?: number | null,"display_name"?: string | null,"division_id"?: string | null,"first_name"?: string | null,"grade"?: string | null,"has_allergies"?: never,"has_epipen"?: never,"has_medical_flag"?: never,"has_medications"?: never,"id"?: string | null,"in_latest_import"?: boolean | null,"last_event_id"?: string | null,"last_name"?: string | null,"local_address"?: never,"local_address_cross_streets"?: never,"medical_notes"?: never,"notes_from_parents"?: never,"session_id"?: string | null,"source_id"?: string | null,"staff_notes"?: never,"status"?: Database["public"]['Enums']["camper_status"] | null,"tshirt_size"?: string | null,"updated_at"?: string | null
                         }
                        Update: {
                           "allergies"?: never,"archived_at"?: string | null,"bunk_id"?: string | null,"bunk_preferences"?: (string)[] | null,"camper_code"?: string | null,"current_buzzer_number"?: number | null,"display_name"?: string | null,"division_id"?: string | null,"first_name"?: string | null,"grade"?: string | null,"has_allergies"?: never,"has_epipen"?: never,"has_medical_flag"?: never,"has_medications"?: never,"id"?: string | null,"in_latest_import"?: boolean | null,"last_event_id"?: string | null,"last_name"?: string | null,"local_address"?: never,"local_address_cross_streets"?: never,"medical_notes"?: never,"notes_from_parents"?: never,"session_id"?: string | null,"source_id"?: string | null,"staff_notes"?: never,"status"?: Database["public"]['Enums']["camper_status"] | null,"tshirt_size"?: string | null,"updated_at"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "campers_bunk_id_fkey"
      columns: ["bunk_id"]
isOneToOne: false
      referencedRelation: "bunks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campers_division_id_fkey"
      columns: ["division_id"]
isOneToOne: false
      referencedRelation: "divisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campers_last_event_fk"
      columns: ["last_event_id"]
isOneToOne: false
      referencedRelation: "attendance_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "campers_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "apply_import":
{ Args: { "p_import_id": string }; Returns: Json
                           },
"area_covers":
{ Args: { "p_bunk_id": string,"p_division_id": string }; Returns: boolean
                           },
"assign_buzzer":
{ Args: { "p_camper_id": string,"p_number": number }; Returns: {
              "assigned_at": string,
"assigned_by": string | null,
"buzzer_number": number,
"camper_id": string,
"id": string,
"released_at": string | null,
"released_by": string | null,
"session_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "buzzer_assignments"
        isOneToOne: true
        isSetofReturn: false
      } },
"bulk_attendance":
{ Args: { "p_camper_ids": (string)[],"p_event_type": Database["public"]['Enums']["attendance_event_type"],"p_note"?: string }; Returns: Json
                           },
"camper_history":
{ Args: { "p_camper_id": string }; Returns: {
              "action": string,"actor_id": string,"at": string,"diff": Json,"source": string
            }[]
                           },
"camper_print_status":
{ Args: { "p_camper_id": string }; Returns: {
              "printed_at": string,"requested_at": string,"requested_by_name": string,"status": Database["public"]['Enums']["print_status"],"template_id": string
            }[]
                           },
"can_access_camper":
{ Args: { "p_camper_id": string,"p_needed": Database["public"]['Enums']["access_level"] }; Returns: boolean
                           },
"can_access_division":
{ Args: { "p_division_id": string,"p_needed": Database["public"]['Enums']["access_level"] }; Returns: boolean
                           },
"can_view_group":
{ Args: { "p_group": string }; Returns: boolean
                           },
"can_view_field_group":
{ Args: { "p_camper_id": string,"p_group": string }; Returns: boolean
                           },
"dearmor":
{ Args: { "": string }; Returns: string
                           },
"division_palette_color":
{ Args: { "p_index": number }; Returns: string
                           },
"ensure_bunk":
{ Args: { "p_division_id": string,"p_name": string }; Returns: string
                           },
"ensure_division":
{ Args: { "p_name": string,"p_session_id": string }; Returns: string
                           },
"gen_random_uuid":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"gen_salt":
{ Args: { "": string }; Returns: string
                           },
"has_all_areas":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"level_rank":
{ Args: { "l": Database["public"]['Enums']["access_level"] }; Returns: number
                           },
"my_bunks":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"my_level":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["access_level"]
                           },
"my_level_rank":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"my_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["staff_role"]
                           },
"my_whole_divisions":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"next_camper_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"normalize_name":
{ Args: { "t": string }; Returns: string
                           },
"pgp_armor_headers":
{ Args: { "": string }; Returns: Record<string, unknown>[]
                           },
"record_attendance":
{ Args: { "p_camper_id": string,"p_device_label"?: string,"p_event_type": Database["public"]['Enums']["attendance_event_type"],"p_force_status"?: Database["public"]['Enums']["camper_status"],"p_method"?: Database["public"]['Enums']["attendance_method"],"p_note"?: string,"p_occurred_at"?: string }; Returns: {
              "camper_id": string,
"corrects_event_id": string | null,
"created_at": string,
"device_label": string | null,
"event_type": Database["public"]['Enums']["attendance_event_type"],
"id": string,
"method": Database["public"]['Enums']["attendance_method"],
"note": string | null,
"occurred_at": string,
"recorded_by": string | null,
"resulting_status": Database["public"]['Enums']["camper_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "attendance_events"
        isOneToOne: true
        isSetofReturn: false
      } },
"release_buzzer":
{ Args: { "p_camper_id": string }; Returns: undefined
                           },
"request_page":
{ Args: { "p_camper_id": string }; Returns: {
              "assignment_id": string,
"bridge_id": string | null,
"buzzer_number": number,
"error": string | null,
"id": string,
"requested_at": string,
"requested_by": string | null,
"sent_at": string | null,
"status": Database["public"]['Enums']["page_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "page_requests"
        isOneToOne: true
        isSetofReturn: false
      } },
"restore_fields":
{ Args: { "p_diff": Json,"p_row_id": string,"p_table": string }; Returns: number
                           },
"revert_import":
{ Args: { "p_import_id": string }; Returns: Json
                           },
"search_campers":
{ Args: { "p_limit"?: number,"p_q": string,"p_session_id": string }; Returns: {
              "bunk_id": string,"camper_code": string,"display_name": string,"division_id": string,"id": string,"score": number,"status": Database["public"]['Enums']["camper_status"]
            }[]
                           },
"show_limit":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"show_trgm":
{ Args: { "": string }; Returns: (string)[]
                           },
"unaccent":
{ Args: { "": string }; Returns: string
                           },
"undo_attendance":
{ Args: { "p_event_id": string }; Returns: {
              "camper_id": string,
"corrects_event_id": string | null,
"created_at": string,
"device_label": string | null,
"event_type": Database["public"]['Enums']["attendance_event_type"],
"id": string,
"method": Database["public"]['Enums']["attendance_method"],
"note": string | null,
"occurred_at": string,
"recorded_by": string | null,
"resulting_status": Database["public"]['Enums']["camper_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "attendance_events"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "access_level": "view"|"scan"|"edit","attendance_event_type": "arrival"|"leave"|"return"|"pickup"|"no_show"|"correction","attendance_method": "scan"|"manual"|"bulk","camper_status": "expected"|"present"|"out"|"departed"|"no_show","contact_role": "mother"|"father"|"guardian"|"emergency"|"host"|"authorized_pickup","division_language": "he"|"fr"|"en","import_row_action": "add"|"update"|"unchanged"|"conflict"|"skip","import_status": "uploaded"|"previewed"|"applied"|"cancelled"|"failed"|"reverted","page_status": "queued"|"sent"|"failed"|"manual","print_kind": "name_tag"|"luggage_tag"|"other","print_status": "queued"|"rendering"|"sent"|"printed"|"failed"|"cancelled"|"ready","record_source": "import"|"manual","staff_role": "owner"|"director"|"division_head"|"head_counselor"|"counselor"|"scanner"|"office"|"logistics"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "access_level": ["view", "scan", "edit"],"attendance_event_type": ["arrival", "leave", "return", "pickup", "no_show", "correction"],"attendance_method": ["scan", "manual", "bulk"],"camper_status": ["expected", "present", "out", "departed", "no_show"],"contact_role": ["mother", "father", "guardian", "emergency", "host", "authorized_pickup"],"division_language": ["he", "fr", "en"],"import_row_action": ["add", "update", "unchanged", "conflict", "skip"],"import_status": ["uploaded", "previewed", "applied", "cancelled", "failed", "reverted"],"page_status": ["queued", "sent", "failed", "manual"],"print_kind": ["name_tag", "luggage_tag", "other"],"print_status": ["queued", "rendering", "sent", "printed", "failed", "cancelled", "ready"],"record_source": ["import", "manual"],"staff_role": ["owner", "director", "division_head", "head_counselor", "counselor", "scanner", "office", "logistics"]
          }
        }
} as const
