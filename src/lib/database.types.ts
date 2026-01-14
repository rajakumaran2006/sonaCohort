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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      additional_class_attendance: {
        Row: {
          additional_class_id: string
          created_at: string | null
          id: string
          peer_tutor_id: string
          status: string
          student_id: string
          updated_at: string | null
        }
        Insert: {
          additional_class_id: string
          created_at?: string | null
          id?: string
          peer_tutor_id: string
          status: string
          student_id: string
          updated_at?: string | null
        }
        Update: {
          additional_class_id?: string
          created_at?: string | null
          id?: string
          peer_tutor_id?: string
          status?: string
          student_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_additional_class_attendance_class"
            columns: ["additional_class_id"]
            isOneToOne: false
            referencedRelation: "additional_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_additional_class_attendance_peer_tutor"
            columns: ["peer_tutor_id"]
            isOneToOne: false
            referencedRelation: "peer_tutors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_additional_class_attendance_student"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "peer_students"
            referencedColumns: ["id"]
          },
        ]
      }
      additional_classes: {
        Row: {
          class_date: string
          created_at: string | null
          id: string
          peer_tutor_id: string
          section: string
          status: string | null
          subject_name: string
          topic: string | null
          updated_at: string | null
          year: string
        }
        Insert: {
          class_date: string
          created_at?: string | null
          id?: string
          peer_tutor_id: string
          section: string
          status?: string | null
          subject_name: string
          topic?: string | null
          updated_at?: string | null
          year: string
        }
        Update: {
          class_date?: string
          created_at?: string | null
          id?: string
          peer_tutor_id?: string
          section?: string
          status?: string | null
          subject_name?: string
          topic?: string | null
          updated_at?: string | null
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_additional_classes_peer_tutor"
            columns: ["peer_tutor_id"]
            isOneToOne: false
            referencedRelation: "peer_tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          user_id: string
        }
        Insert: {
          user_id: string
        }
        Update: {
          user_id?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          class_id: string | null
          created_at: string
          id: string
          peer_tutor_id: string
          scheduled_class_id: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          id?: string
          peer_tutor_id: string
          scheduled_class_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          id?: string
          peer_tutor_id?: string
          scheduled_class_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_peer_tutor_id_fkey"
            columns: ["peer_tutor_id"]
            isOneToOne: false
            referencedRelation: "peer_tutors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_scheduled_class_id_fkey"
            columns: ["scheduled_class_id"]
            isOneToOne: false
            referencedRelation: "scheduled_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "peer_students"
            referencedColumns: ["id"]
          },
        ]
      }
      class_topics: {
        Row: {
          class_id: string | null
          created_at: string
          description: string | null
          id: string
          peer_tutor_id: string | null
          topic_name: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          peer_tutor_id?: string | null
          topic_name: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          peer_tutor_id?: string | null
          topic_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_topics_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_topics_peer_tutor_id_fkey"
            columns: ["peer_tutor_id"]
            isOneToOne: false
            referencedRelation: "peer_tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          dept: string
          faculty_id: string
          id: string
          schedule_day: string | null
          schedule_time: string | null
          section: string
          subject_name: string
          updated_at: string
          year: string
        }
        Insert: {
          created_at?: string
          dept: string
          faculty_id: string
          id?: string
          schedule_day?: string | null
          schedule_time?: string | null
          section: string
          subject_name: string
          updated_at?: string
          year: string
        }
        Update: {
          created_at?: string
          dept?: string
          faculty_id?: string
          id?: string
          schedule_day?: string | null
          schedule_time?: string | null
          section?: string
          subject_name?: string
          updated_at?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculties"
            referencedColumns: ["id"]
          },
        ]
      }
      faculties: {
        Row: {
          created_at: string
          department: string
          email: string
          id: string
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          department: string
          email: string
          id?: string
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          department?: string
          email?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      peer_students: {
        Row: {
          assigned_peer_tutor_id: string | null
          created_at: string
          dept: string
          email: string
          id: string
          name: string
          peer_tutor: boolean | null
          role: string | null
          section: string
          updated_at: string
          year: string
        }
        Insert: {
          assigned_peer_tutor_id?: string | null
          created_at?: string
          dept: string
          email: string
          id?: string
          name: string
          peer_tutor?: boolean | null
          role?: string | null
          section: string
          updated_at?: string
          year: string
        }
        Update: {
          assigned_peer_tutor_id?: string | null
          created_at?: string
          dept?: string
          email?: string
          id?: string
          name?: string
          peer_tutor?: boolean | null
          role?: string | null
          section?: string
          updated_at?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_students_assigned_peer_tutor_id_fkey"
            columns: ["assigned_peer_tutor_id"]
            isOneToOne: false
            referencedRelation: "peer_tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_tutor_exam_allocations: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          peer_tutor_id: string
          status: string
          student_id: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          peer_tutor_id: string
          status?: string
          student_id: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          peer_tutor_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_tutor_exam_allocations_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "peer_tutor_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_tutor_exam_allocations_peer_tutor_id_fkey"
            columns: ["peer_tutor_id"]
            isOneToOne: false
            referencedRelation: "peer_tutors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_tutor_exam_allocations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "peer_students"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_tutor_exam_marks: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          marks_obtained: number
          student_id: string
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          marks_obtained: number
          student_id: string
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          marks_obtained?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_tutor_exam_marks_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "peer_tutor_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "peer_tutor_exam_marks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "peer_students"
            referencedColumns: ["id"]
          },
        ]
      }
      peer_tutor_exams: {
        Row: {
          created_at: string
          date: string
          description: string | null
          id: string
          max_marks: number
          title: string
          year: string
        }
        Insert: {
          created_at?: string
          date: string
          description?: string | null
          id?: string
          max_marks: number
          title: string
          year: string
        }
        Update: {
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          max_marks?: number
          title?: string
          year?: string
        }
        Relationships: []
      }
      peer_tutors: {
        Row: {
          created_at: string
          dept: string
          email: string
          faculty_id: string | null
          id: string
          name: string
          section: string
          updated_at: string
          year: string
        }
        Insert: {
          created_at?: string
          dept: string
          email: string
          faculty_id?: string | null
          id?: string
          name: string
          section: string
          updated_at?: string
          year: string
        }
        Update: {
          created_at?: string
          dept?: string
          email?: string
          faculty_id?: string | null
          id?: string
          name?: string
          section?: string
          updated_at?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "peer_tutors_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculties"
            referencedColumns: ["id"]
          },
        ]
      }
      renumeration_forms: {
        Row: {
          account_number: string
          bank_name: string
          branch_name: string
          created_at: string
          date: string
          id: string
          ifsc_code: string
          number_of_hours: number
          peer_tutor_id: string
          status: string
          topic_taken: string
          updated_at: string
          year: string
        }
        Insert: {
          account_number: string
          bank_name: string
          branch_name: string
          created_at?: string
          date: string
          id?: string
          ifsc_code: string
          number_of_hours: number
          peer_tutor_id: string
          status?: string
          topic_taken: string
          updated_at?: string
          year: string
        }
        Update: {
          account_number?: string
          bank_name?: string
          branch_name?: string
          created_at?: string
          date?: string
          id?: string
          ifsc_code?: string
          number_of_hours?: number
          peer_tutor_id?: string
          status?: string
          topic_taken?: string
          updated_at?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_renumeration_peer_tutor"
            columns: ["peer_tutor_id"]
            isOneToOne: false
            referencedRelation: "peer_tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_classes: {
        Row: {
          attendance_completed: boolean | null
          class_id: string
          completion_status: string | null
          created_at: string
          dept: string
          faculty_id: string
          id: string
          image_link: string | null
          peer_tutor_id: string
          scheduled_date: string
          section: string
          topics: string | null
          topics_completed: boolean | null
          updated_at: string
          year: string
        }
        Insert: {
          attendance_completed?: boolean | null
          class_id: string
          completion_status?: string | null
          created_at?: string
          dept: string
          faculty_id: string
          id?: string
          image_link?: string | null
          peer_tutor_id: string
          scheduled_date: string
          section: string
          topics?: string | null
          topics_completed?: boolean | null
          updated_at?: string
          year: string
        }
        Update: {
          attendance_completed?: boolean | null
          class_id?: string
          completion_status?: string | null
          created_at?: string
          dept?: string
          faculty_id?: string
          id?: string
          image_link?: string | null
          peer_tutor_id?: string
          scheduled_date?: string
          section?: string
          topics?: string | null
          topics_completed?: boolean | null
          updated_at?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_classes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_classes_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_classes_peer_tutor_id_fkey"
            columns: ["peer_tutor_id"]
            isOneToOne: false
            referencedRelation: "peer_tutors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      attendance_status: "present" | "absent"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseSchemas = Exclude<keyof Database, "__InternalSupabase">
type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: DatabaseSchemas },
  TableName extends PublicTableNameOrOptions extends { schema: DatabaseSchemas }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: DatabaseSchemas }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: DatabaseSchemas },
  TableName extends PublicTableNameOrOptions extends { schema: DatabaseSchemas }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: DatabaseSchemas }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: DatabaseSchemas },
  TableName extends PublicTableNameOrOptions extends { schema: DatabaseSchemas }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: DatabaseSchemas }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: DatabaseSchemas },
  EnumName extends PublicEnumNameOrOptions extends { schema: DatabaseSchemas }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: DatabaseSchemas }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: DatabaseSchemas },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: DatabaseSchemas
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: DatabaseSchemas }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never