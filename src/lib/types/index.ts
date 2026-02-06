export interface Department {
  id: string
  name: string
  faculty_name: string
  faculty_email: string
  created_at: string
  updated_at: string
}

export interface MicrosoftUser {
  id: string
  displayName: string
  mail: string
  userPrincipalName: string
  givenName?: string
  surname?: string
}

export interface CreateDepartmentData {
  name: string
  faculty_name: string
  faculty_email: string
}
