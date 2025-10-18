# Export Feature Documentation 📊

## Overview
The analytics dashboard now includes comprehensive export functionality with a **dropdown menu** that provides three export options to download peer tutor and student data in CSV format.

## Export Dropdown Menu

Click the **"Export Data"** button to reveal three export options:

## Export Options

### 1. **📘 Peer Tutors Only** (Blue Icon)
Downloads a CSV file containing only peer tutor information.

**Columns Included:**
- Name
- Email
- Department
- Year
- Section
- Faculty Name
- Students Assigned (count)

**Use Case:** Quick overview of all peer tutors and their basic information.

**File Name Format:** `peer-tutors-YYYY-MM-DD.csv`

---

### 2. **👥 Students Only** (Green Icon)
Downloads a CSV file containing only student information with their peer tutor reference.

**Columns Included:**
- Student Name
- Student Email
- Roll Number
- Year
- Section
- Department
- Assigned Peer Tutor
- Peer Tutor Email
- Faculty Name

**Use Case:** Student-focused reports, mail merge, student lists by peer tutor.

**File Name Format:** `students-YYYY-MM-DD.csv`

---

### 3. **📋 Complete Report** (Purple Icon - Recommended)
Downloads a CSV file with peer tutors and their assigned students in a relational format.

**Columns Included:**
- **Peer Tutor Columns:**
  - Peer Tutor Name
  - Peer Tutor Email
  - Peer Tutor Department
  - Peer Tutor Year
  - Peer Tutor Section
  - Faculty Name

- **Student Columns:**
  - Student Name
  - Student Email
  - Student Roll Number
  - Student Year
  - Student Section
  - Student Department

**Data Structure:**
- Each row represents one student assignment
- Peer tutor information is repeated for each of their students
- If a peer tutor has no students, shows "No students assigned"

**Use Case:** Complete data for analysis, reporting, and student-tutor relationship tracking.

**File Name Format:** `peer-tutors-and-students-YYYY-MM-DD.csv`

---

## Features

### ✅ **Respects Current Filters**
Both export functions respect active filters:
- Search query
- Department filter
- Faculty filter
- Year filter
- Section filter

**Example:** If you filter for "Computer Science Department, Year 2", only those peer tutors and their students will be exported.

### ✅ **Real-time Data**
- Fetches fresh data from Supabase at export time
- Ensures exported data is up-to-date
- No cached/stale data

### ✅ **CSV Format**
- Universal format compatible with:
  - Microsoft Excel
  - Google Sheets
  - Apple Numbers
  - Any spreadsheet application
- Properly escaped commas and quotes
- UTF-8 encoding for international characters

### ✅ **User-Friendly**
- Clear button labels with icons
- Disabled state when no data to export
- Automatic date stamping in filename
- Instant download (no page refresh)

---

## Usage Instructions

### Step 1: Navigate to Analytics Page
Go to Admin Dashboard → Analytics (from sidebar)

### Step 2: Apply Filters (Optional)
Use filters to narrow down data:
- Search by name/email
- Select department
- Select faculty
- Select year
- Select section

### Step 3: Click "Export Data" Button
Click the **"Export Data"** button in the top-right corner of the Peer Tutor Management section.

### Step 4: Choose Export Option
A dropdown menu will appear with three options:

1. **Peer Tutors Only** - Quick peer tutor summary
2. **Students Only** - Student-focused list with peer tutor reference
3. **Complete Report** - Full relational data (Recommended)

### Step 5: Open Downloaded File
1. File downloads automatically to your Downloads folder
2. Open with Excel, Google Sheets, or any spreadsheet application
3. Data is ready for analysis/reporting

---

## CSV Structure Examples

### Export Peer Tutors Only
```csv
Name,Email,Department,Year,Section,Faculty Name,Students Assigned
"John Doe","john@example.com","Computer Science","2","A","Dr. Smith","15"
"Jane Smith","jane@example.com","Information Technology","3","B","Dr. Johnson","12"
```

### Export with Students
```csv
Peer Tutor Name,Peer Tutor Email,Peer Tutor Department,Peer Tutor Year,Peer Tutor Section,Faculty Name,Student Name,Student Email,Student Roll Number,Student Year,Student Section,Student Department
"John Doe","john@example.com","Computer Science","2","A","Dr. Smith","Alice Brown","alice@example.com","2A001","2","A","Computer Science"
"John Doe","john@example.com","Computer Science","2","A","Dr. Smith","Bob Wilson","bob@example.com","2A002","2","A","Computer Science"
"Jane Smith","jane@example.com","Information Technology","3","B","Dr. Johnson","Carol Davis","carol@example.com","3B001","3","B","Information Technology"
```

---

## Technical Details

### Data Fetching
```typescript
// For each peer tutor in filtered list
const { data: students } = await supabase
  .from('peer_students')
  .select('*')
  .eq('assigned_peer_tutor_id', peerTutor.id)
  .order('name')
```

### CSV Generation
- Headers from first row keys
- Proper quote escaping: `"value"` → `"\"value\""`
- Comma handling: Values wrapped in quotes
- UTF-8 BOM for international characters

### Browser Compatibility
- Works in all modern browsers
- Uses Blob API for file creation
- Creates temporary download link
- Auto-cleanup after download

---

## Use Cases

### 1. **Administrative Reporting**
Export complete dataset for:
- Semester reports
- Faculty evaluations
- Resource allocation planning

### 2. **Data Analysis**
Import into:
- Excel for pivot tables
- Google Sheets for collaboration
- Data analysis tools (R, Python)

### 3. **Backup & Archive**
- Regular data backups
- Historical records
- Audit trails

### 4. **Communication**
- Share with faculty
- Send to departments
- Distribute to administration

### 5. **Mail Merge**
- Create personalized communications
- Generate certificates
- Send notifications

---

## Best Practices

### ✅ **DO:**
- Apply filters before exporting for focused data
- Use descriptive file names if renaming
- Keep exports organized by date
- Verify data after export

### ❌ **DON'T:**
- Export unnecessarily large datasets
- Share sensitive student data without authorization
- Modify CSV structure if re-importing
- Keep multiple identical exports

---

## Error Handling

The export functions include comprehensive error handling:

```typescript
try {
  // Export logic
} catch (error) {
  console.error('Error exporting:', error)
  alert('Failed to export data. Please try again.')
}
```

**Common Issues & Solutions:**
1. **No data to export** → Button is disabled
2. **Network error** → Retry export
3. **Browser blocks download** → Check browser settings
4. **File not opening** → Try different spreadsheet app

---

## Future Enhancements (Optional)

Potential additions:
1. **Export Formats:**
   - Excel (.xlsx) format
   - JSON format
   - PDF reports

2. **Advanced Options:**
   - Select specific columns
   - Custom date ranges
   - Email export directly

3. **Scheduling:**
   - Automated weekly exports
   - Email delivery
   - Cloud storage integration

---

## Summary

✅ **Two export options** - Summary and detailed  
✅ **Filter-aware** - Exports only filtered data  
✅ **Real-time** - Fresh data from database  
✅ **CSV format** - Universal compatibility  
✅ **Auto-download** - One-click operation  
✅ **Date-stamped** - Organized file names  
✅ **Error handling** - Graceful failure recovery  

**The export feature is fully functional and ready for production use!** 🎉

