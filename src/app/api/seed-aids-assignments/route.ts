import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const AIDS_ASSIGNMENTS = [
  { tutorName: 'BHAVESH C S', tutorEmail: 'bhavesh.25ads@sonatech.ac.in', studentName: 'DEEPESH K', studentEmail: 'deepesh.25ads@sonatech.ac.in', year: '2', section: 'A' },
  { tutorName: 'BHAVESH C S', tutorEmail: 'bhavesh.25ads@sonatech.ac.in', studentName: 'ANNESULLA S', studentEmail: 'annesulla.25ads@sonatech.ac.in', year: '2', section: 'A' },
  { tutorName: 'DHARUNIHA S', tutorEmail: 'dharuniha.25ads@sonatech.ac.in', studentName: 'HARMI A', studentEmail: 'harmi.25ads@sonatech.ac.in', year: '2', section: 'A' },
  { tutorName: 'DHARUNIHA S', tutorEmail: 'dharuniha.25ads@sonatech.ac.in', studentName: 'DEVAMAYOOKHA B R', studentEmail: 'brdevamayookha.25ads@sonatech.ac.in', year: '2', section: 'A' },
  { tutorName: 'DHIVITHA M', tutorEmail: 'dhivitha.25ads@sonatech.ac.in', studentName: 'HARIDHARSHINI S', studentEmail: 'haridharshini.25ads@sonatech.ac.in', year: '2', section: 'A' },
  { tutorName: 'DHIVITHA M', tutorEmail: 'dhivitha.25ads@sonatech.ac.in', studentName: 'BHARATH M', studentEmail: 'bharath.25ads@sonatech.ac.in', year: '2', section: 'A' },
  { tutorName: 'DHIVITHA M', tutorEmail: 'dhivitha.25ads@sonatech.ac.in', studentName: 'KAMALESH N', studentEmail: 'kamalesh.25ads@sonatech.ac.in', year: '2', section: 'A' },
  { tutorName: 'HARSHAVARDHAAN S', tutorEmail: 'harshavardhaan.25ads@sonatech.ac.in', studentName: 'JAGADEESWARAN U', studentEmail: 'jagadeeswaran.25@sonatech.ac.in', year: '2', section: 'A' },
  { tutorName: 'HARSHAVARDHAAN S', tutorEmail: 'harshavardhaan.25ads@sonatech.ac.in', studentName: 'HARSHIT G', studentEmail: 'harshit.25ads@sonatech.ac.in', year: '2', section: 'A' },
  { tutorName: 'HARSHAVARDHAAN S', tutorEmail: 'harshavardhaan.25ads@sonatech.ac.in', studentName: 'HARRISH M', studentEmail: 'harrish.25ads@sonatech.ac.in', year: '2', section: 'A' },
  { tutorName: 'KANISHA M', tutorEmail: 'kanisha.25ads@sonatech.ac.in', studentName: 'GOWTHAM R', studentEmail: 'gowtham.25ads@sonatech.ac.in', year: '2', section: 'A' },
  { tutorName: 'KANISHA M', tutorEmail: 'kanisha.25ads@sonatech.ac.in', studentName: 'MADHANKUMAR N', studentEmail: 'madankumar.25ads@sonatech.ac.in', year: '2', section: 'A' },
  { tutorName: 'NITHISH V', tutorEmail: 'nithish.25ads@sonatech.ac.in', studentName: 'MARUDHUPANDIAN V', studentEmail: 'marudhupandian.25ads@sonatech.ac.in', year: '2', section: 'B' },
  { tutorName: 'NITHISH V', tutorEmail: 'nithish.25ads@sonatech.ac.in', studentName: 'MOHAMED ARSATH A', studentEmail: 'mohamedarsath.25ads@sonatech.ac.in', year: '2', section: 'B' },
  { tutorName: 'NOHIN IPE KOCHUMON', tutorEmail: 'nohinipekochumon.25ads@sonatech.ac.in', studentName: 'MUKESH VELAN V', studentEmail: 'mukeshvelan.25ads@sonatech.ac.in', year: '2', section: 'B' },
  { tutorName: 'NOHIN IPE KOCHUMON', tutorEmail: 'nohinipekochumon.25ads@sonatech.ac.in', studentName: 'NAYEEM NOEMAN', studentEmail: 'noemannayeem.25ads@sonatech.ac.in', year: '2', section: 'B' },
  { tutorName: 'RUBASRI B', tutorEmail: 'rubasri.25ads@sonatech.ac.in', studentName: 'NAKSHATHRA A', studentEmail: 'nakshathra.25ads@sonatech.ac.in', year: '2', section: 'B' },
  { tutorName: 'RUBASRI B', tutorEmail: 'rubasri.25ads@sonatech.ac.in', studentName: 'NEETHU ANANYA L', studentEmail: 'neethuananya.25ads@sonatech.ac.in', year: '2', section: 'B' },
  { tutorName: 'RUBASRI B', tutorEmail: 'rubasri.25ads@sonatech.ac.in', studentName: 'POOJA M', studentEmail: 'pooja.25ads@sonatech.ac.in', year: '2', section: 'B' },
  { tutorName: 'VIGNESH S', tutorEmail: 'vignesh.25ads@sonatech.ac.in', studentName: 'SANJAY S', studentEmail: 'sanjay.25ads@sonatech.ac.in', year: '2', section: 'C' },
  { tutorName: 'VIGNESH S', tutorEmail: 'vignesh.25ads@sonatech.ac.in', studentName: 'YASWANTH S', studentEmail: 'yaswanth.25ads@sonatech.ac.in', year: '2', section: 'C' },
  { tutorName: 'VIGNESH S', tutorEmail: 'vignesh.25ads@sonatech.ac.in', studentName: 'VISHAL R R', studentEmail: 'vishalrr.25ads@sonatech.ac.in', year: '2', section: 'C' },
  { tutorName: 'VISHAL K R', tutorEmail: 'vishalkr.25ads@sonatech.ac.in', studentName: 'SURAJ KUMAR', studentEmail: 'surajkumar.25ads@sonatech.ac.in', year: '2', section: 'C' },
  { tutorName: 'VISHAL K R', tutorEmail: 'vishalkr.25ads@sonatech.ac.in', studentName: 'SRI PRAGADESH V', studentEmail: 'sripragadesh.25ads@sonatech.ac.in', year: '2', section: 'C' },
  { tutorName: 'YUGASRI C', tutorEmail: 'yugasri.25ads@sonatech.ac.in', studentName: 'YOGAMITHRA S', studentEmail: 'yogamithra.25ads@sonatech.ac.in', year: '2', section: 'C' },
  { tutorName: 'YUGASRI C', tutorEmail: 'yugasri.25ads@sonatech.ac.in', studentName: 'SUGISIVAM N', studentEmail: 'sugisivam.25ads@sonatech.ac.in', year: '2', section: 'C' }
]

export async function GET() {
  return handleSeeding()
}

export async function POST() {
  return handleSeeding()
}

async function handleSeeding() {
  try {
    let supabase
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      supabase = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
    } else {
      supabase = await createServerClient()
    }

    // 1. Ensure department AIDS exists
    const { data: deptData, error: deptError } = await supabase
      .from('departments')
      .upsert({ name: 'AIDS' }, { onConflict: 'name' })
      .select()
      .single()

    if (deptError && deptError.code !== '23505') {
      console.error('Error upserting department:', deptError)
    }

    // 2. Extract unique peer tutors
    const tutorMap = new Map<string, { name: string; email: string; year: string; section: string }>()
    AIDS_ASSIGNMENTS.forEach(item => {
      if (!tutorMap.has(item.tutorEmail)) {
        tutorMap.set(item.tutorEmail, {
          name: item.tutorName,
          email: item.tutorEmail,
          year: item.year,
          section: item.section
        })
      }
    })

    const createdTutors: Record<string, string> = {} // email -> id

    // Upsert tutors in peer_tutors
    for (const tutor of Array.from(tutorMap.values())) {
      const { data, error } = await supabase
        .from('peer_tutors')
        .upsert(
          {
            name: tutor.name,
            email: tutor.email,
            dept: 'ADS',
            year: tutor.year,
            section: tutor.section
          },
          { onConflict: 'email' }
        )
        .select()
        .single()

      if (error) {
        // Fallback: try select if upsert returned error or conflict
        const { data: existing } = await supabase
          .from('peer_tutors')
          .select('id')
          .eq('email', tutor.email)
          .single()
        if (existing) createdTutors[tutor.email] = existing.id
      } else if (data) {
        createdTutors[tutor.email] = data.id
      }

      // Also upsert tutor into peer_students marked as peer_tutor=true
      await supabase
        .from('peer_students')
        .upsert(
          {
            name: tutor.name,
            email: tutor.email,
            dept: 'ADS',
            year: tutor.year,
            section: tutor.section,
            peer_tutor: true,
            role: 'peer_tutor'
          },
          { onConflict: 'email' }
        )
    }

    // 3. Upsert students and assign tutor IDs
    let assignedCount = 0
    const results = []

    for (const item of AIDS_ASSIGNMENTS) {
      const tutorId = createdTutors[item.tutorEmail]

      // Upsert student in peer_students
      const { data: student, error: studentError } = await supabase
        .from('peer_students')
        .upsert(
          {
            name: item.studentName,
            email: item.studentEmail,
            dept: 'ADS',
            year: item.year,
            section: item.section,
            peer_tutor: false,
            role: 'student',
            assigned_peer_tutor_id: tutorId || null
          },
          { onConflict: 'email' }
        )
        .select()
        .single()

      if (studentError) {
        // Try direct update if student exists
        if (tutorId) {
          await supabase
            .from('peer_students')
            .update({ assigned_peer_tutor_id: tutorId })
            .eq('email', item.studentEmail)
        }
      }

      assignedCount++
      results.push({
        tutor: item.tutorName,
        student: item.studentName,
        section: item.section,
        status: 'Assigned'
      })
    }

    return NextResponse.json({
      success: true,
      department: 'AIDS',
      year: '2',
      totalTutors: tutorMap.size,
      totalStudentsAssigned: assignedCount,
      assignments: results
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || String(error)
    }, { status: 500 })
  }
}
